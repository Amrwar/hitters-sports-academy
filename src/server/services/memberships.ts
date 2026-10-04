/**
 * Memberships.
 *
 * A membership is a dated term on a plan, not a subscription object. One bought at the desk for three
 * months and one that renews itself are the same record; `autoRenew` only decides whether the next term
 * is created when this one ends. That is deliberate: Egypt's gateways do not all support card-on-file
 * recurring billing, and a model that assumed they did would be unusable at a club that takes cash.
 *
 * The plan's `key` is the tier a MEMBERSHIP_DISCOUNT pricing rule matches, so what a membership saves on
 * court hire is configured on the pricing screen with every other price, not duplicated here.
 */
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, notFound, validation } from "@/lib/errors";
import { requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { buyMembershipSchema, cancelMembershipSchema, fieldErrors, membershipPlanSchema } from "@/lib/validation/schemas";
import { plainDate } from "@/lib/time";
import { createInvoice, recalculateInvoice } from "./invoices";
import { postCreditEntry } from "./credits";
import { notify } from "./notifications";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => `MB-${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;

export const PERIOD_MONTHS = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 } as const;
export const PERIOD_LABEL = { MONTHLY: "a month", QUARTERLY: "three months", ANNUAL: "a year" } as const;

export const planSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  priceCents: true,
  currency: true,
  period: true,
  benefits: true,
  periodCreditCents: true,
  freeAssessments: true,
  priorityBookingDays: true,
  locationId: true,
  active: true,
  sortOrder: true,
  location: { select: { id: true, name: true } },
  _count: { select: { memberships: { where: { status: "ACTIVE" } } } },
} satisfies Prisma.MembershipPlanSelect;

export type PlanView = Prisma.MembershipPlanGetPayload<{ select: typeof planSelect }>;

export const membershipSelect = {
  id: true,
  code: true,
  playerId: true,
  status: true,
  startsOn: true,
  endsOn: true,
  autoRenew: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  plan: { select: { id: true, key: true, name: true, priceCents: true, currency: true, period: true, benefits: true, periodCreditCents: true, priorityBookingDays: true } },
  player: { select: { id: true, name: true, email: true } },
  invoices: { select: { id: true, number: true, totalCents: true, paidCents: true, refundedCents: true, status: true }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.MembershipSelect;

export type MembershipView = Prisma.MembershipGetPayload<{ select: typeof membershipSelect }>;

/** Adds whole months without rolling 31 January into 3 March. The term ends the day before. */
function addMonths(from: Date, months: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const targetMonth = d.getUTCMonth() + months;
  const end = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0));
  const day = Math.min(d.getUTCDate(), end.getUTCDate());
  return new Date(Date.UTC(d.getUTCFullYear(), targetMonth, day));
}

/* ------------------------------------------------------------------ Plans */

export async function listPlans(actor: Actor | null, opts: { includeInactive?: boolean } = {}): Promise<PlanView[]> {
  if (opts.includeInactive) await requirePermission(actor, "finance.read");
  return db.membershipPlan.findMany({ where: opts.includeInactive ? {} : { active: true }, select: planSelect, orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }] });
}

export async function upsertPlan(actor: Actor | null, planId: string | null, input: unknown): Promise<PlanView> {
  const a = await requirePermission(actor, "finance.manage");
  const parsed = membershipPlanSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const d = parsed.data;
  const clash = await db.membershipPlan.findUnique({ where: { key: d.key }, select: { id: true } });
  if (clash && clash.id !== planId) throw validation("That tier key is already in use.", { key: "Already in use." });

  const data = {
    key: d.key,
    name: d.name,
    description: d.description ?? null,
    priceCents: d.priceCents,
    period: d.period,
    benefits: d.benefits,
    periodCreditCents: d.periodCreditCents,
    freeAssessments: d.freeAssessments,
    priorityBookingDays: d.priorityBookingDays,
    locationId: d.locationId ?? null,
    active: d.active,
    sortOrder: d.sortOrder,
  };
  return db.$transaction(async (tx) => {
    const saved = planId ? await tx.membershipPlan.update({ where: { id: planId }, data, select: planSelect }) : await tx.membershipPlan.create({ data, select: planSelect });
    await audit({ actorId: a.id, action: planId ? "membership.plan.updated" : "membership.plan.created", entityType: "MembershipPlan", entityId: saved.id, locationId: saved.locationId, metadata: { key: saved.key, priceCents: saved.priceCents } }, tx);
    return saved;
  });
}

/* ------------------------------------------------------------------ Terms */

/**
 * Starts a term and raises the invoice for it.
 *
 * PENDING until the invoice is settled: a membership that discounts every booking must not do so before
 * it has been paid for. `activateMembership` is what makes it live, and it runs from the payment path.
 *
 * A player who already holds a live term cannot start a second one; renewing extends from the end of the
 * current term instead, so nobody loses days by paying early.
 */
export async function buyMembership(actor: Actor | null, input: unknown, opts: { now?: Date } = {}): Promise<MembershipView> {
  const a = await requireActor(actor);
  const parsed = buyMembershipSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const now = opts.now ?? new Date();

  const playerId = parsed.data.playerId ?? a.id;
  if (playerId !== a.id) await requirePermission(a, "finance.manage");

  const plan = await db.membershipPlan.findUnique({ where: { id: parsed.data.planId }, select: { id: true, key: true, name: true, priceCents: true, currency: true, period: true, locationId: true, active: true, periodCreditCents: true } });
  if (!plan || !plan.active) throw notFound("Membership plan");

  const live = await db.membership.findFirst({ where: { playerId, status: { in: ["ACTIVE", "PENDING"] } }, orderBy: { endsOn: "desc" }, select: { id: true, status: true, endsOn: true } });
  if (live?.status === "PENDING") throw conflict("You already have a membership waiting to be paid for.");

  const requested = parsed.data.startsOn ? new Date(`${parsed.data.startsOn}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Renewing starts the day after the current term ends, so paying early never costs days.
  const startsOn = live && live.endsOn >= requested ? new Date(live.endsOn.getTime() + 86_400_000) : requested;
  const endsOn = new Date(addMonths(startsOn, PERIOD_MONTHS[plan.period]).getTime() - 86_400_000);

  const membership = await db.$transaction(async (tx) => {
    const created = await tx.membership.create({
      data: { code: code(), playerId, planId: plan.id, status: "PENDING", startsOn, endsOn, autoRenew: parsed.data.autoRenew, createdById: a.id },
      select: { id: true },
    });
    await createInvoice(
      tx,
      {
        playerId,
        locationId: plan.locationId,
        currency: plan.currency,
        membershipId: created.id,
        createdById: a.id,
        lines: [{ kind: "MEMBERSHIP", description: `${plan.name} membership · ${plainDate(startsOn)} to ${plainDate(endsOn)}`, unitCents: plan.priceCents }],
      },
      now,
    );
    await audit({ actorId: a.id, action: "membership.created", entityType: "Membership", entityId: created.id, locationId: plan.locationId, metadata: { planKey: plan.key, startsOn, endsOn, priceCents: plan.priceCents } }, tx);
    return created;
  });

  // A free plan has nothing to pay, so it is live the moment it is bought.
  if (plan.priceCents === 0) await activateMembership(membership.id, { now });
  return getMembership(a, membership.id);
}

/**
 * Makes a paid-for term live and hands over its benefits.
 *
 * Called from the payment path rather than by a person, and safe to call twice: a webhook redelivery
 * must not grant the period's credit a second time.
 */
export async function activateMembership(membershipId: string, opts: { now?: Date } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const result = await db.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({
      where: { id: membershipId },
      select: { id: true, status: true, playerId: true, startsOn: true, endsOn: true, plan: { select: { key: true, name: true, periodCreditCents: true, benefits: true, locationId: true } } },
    });
    if (!membership || membership.status !== "PENDING") return null;

    await tx.membership.update({ where: { id: membershipId }, data: { status: "ACTIVE" } });
    if (membership.plan.periodCreditCents > 0) {
      await postCreditEntry(tx, { playerId: membership.playerId, kind: "TOPUP", amountCents: membership.plan.periodCreditCents, reason: `${membership.plan.name} membership credit`, createdById: null });
    }
    await audit({ actorId: null, action: "membership.activated", entityType: "Membership", entityId: membershipId, locationId: membership.plan.locationId, metadata: { planKey: membership.plan.key } }, tx);
    return membership;
  });
  if (!result) return;

  await notify(result.playerId, {
    type: "membership.activated",
    data: { plan: result.plan.name, endsOn: plainDate(result.endsOn), benefitSuffix: result.plan.benefits.length ? ` ${result.plan.benefits[0]}.` : "" },
    url: "/app/membership",
    dedupeKey: `membership.activated:${membershipId}`,
  }).catch(() => undefined);
}

/**
 * Ends a term.
 *
 * By default it simply stops renewing and runs to its end date, which is what "cancel my membership"
 * almost always means. `immediate` ends it today and refunds the unused days, pro-rated — a player who
 * cancels two days into a year should not be told the whole year is spent.
 */
export async function cancelMembership(actor: Actor | null, membershipId: string, input: unknown, opts: { now?: Date } = {}): Promise<MembershipView> {
  const a = await requireActor(actor);
  const parsed = cancelMembershipSchema.safeParse(input ?? {});
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const now = opts.now ?? new Date();

  const membership = await db.membership.findUnique({
    where: { id: membershipId },
    select: { id: true, playerId: true, status: true, startsOn: true, endsOn: true, plan: { select: { name: true, locationId: true } }, invoices: { select: { id: true, paidCents: true, refundedCents: true, totalCents: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!membership) throw notFound("Membership");
  if (membership.playerId !== a.id) await requirePermission(a, "finance.manage");
  if (membership.status === "CANCELLED" || membership.status === "EXPIRED") throw conflict("That membership has already ended.");

  let refundedCents = 0;
  if (parsed.data.immediate) {
    const invoice = membership.invoices[0];
    const paid = invoice ? invoice.paidCents - invoice.refundedCents : 0;
    if (invoice && paid > 0) {
      const totalDays = Math.max(1, Math.round((membership.endsOn.getTime() - membership.startsOn.getTime()) / 86_400_000) + 1);
      const usedDays = Math.min(totalDays, Math.max(0, Math.round((now.getTime() - membership.startsOn.getTime()) / 86_400_000)));
      refundedCents = Math.max(0, Math.round((paid * (totalDays - usedDays)) / totalDays));
      if (refundedCents > 0) {
        const { refundInvoice } = await import("./refunds");
        await refundInvoice(a, invoice.id, { amountCents: refundedCents, reason: "Membership cancelled early" }, { now, key: `membership-cancel:${membershipId}`, system: true });
      }
    }
  }

  await db.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: membershipId },
      data: { status: parsed.data.immediate ? "CANCELLED" : membership.status, autoRenew: false, cancelledAt: now, cancelReason: parsed.data.reason ?? null, ...(parsed.data.immediate ? { endsOn: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } : {}) },
    });
    await audit({ actorId: a.id, action: "membership.cancelled", entityType: "Membership", entityId: membershipId, locationId: membership.plan.locationId, metadata: { immediate: parsed.data.immediate, refundedCents, reason: parsed.data.reason ?? null } }, tx);
  });

  await notify(membership.playerId, {
    type: "membership.cancelled",
    data: { plan: membership.plan.name, refundSuffix: refundedCents > 0 ? ` EGP ${(refundedCents / 100).toLocaleString("en")} has been refunded.` : parsed.data.immediate ? "" : ` It runs to ${plainDate(membership.endsOn)}.` },
    url: "/app/membership",
    dedupeKey: `membership.cancelled:${membershipId}`,
  }).catch(() => undefined);
  return getMembership(a, membershipId);
}

/* ------------------------------------------------------------------ Reading */

export async function getMembership(actor: Actor | null, membershipId: string): Promise<MembershipView> {
  const a = await requireActor(actor);
  const row = await db.membership.findUnique({ where: { id: membershipId }, select: membershipSelect });
  if (!row) throw notFound("Membership");
  if (row.playerId !== a.id) await requirePermission(a, "finance.read");
  return row;
}

/** The player's live term, if any. Null is the common answer and is not an error. */
export async function myMembership(actor: Actor | null, opts: { now?: Date } = {}): Promise<MembershipView | null> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();
  return db.membership.findFirst({
    where: { playerId: a.id, status: { in: ["ACTIVE", "PENDING"] }, endsOn: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } },
    select: membershipSelect,
    orderBy: { endsOn: "desc" },
  });
}

export type MemberTier = { isMember: boolean; tier: string | null; priorityBookingDays: number };

/**
 * The tier the pricing engine asks about, and the extra booking window that comes with it.
 *
 * Looked up on every quote, so it is one indexed query and it never throws: a membership lookup failing
 * must not stop someone seeing prices. The honest fallback is "not a member", which charges full price
 * rather than giving away a discount nobody can prove.
 */
export async function memberTier(playerId: string | null | undefined, opts: { now?: Date } = {}): Promise<MemberTier> {
  if (!playerId) return { isMember: false, tier: null, priorityBookingDays: 0 };
  const now = opts.now ?? new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  try {
    const row = await db.membership.findFirst({
      where: { playerId, status: "ACTIVE", startsOn: { lte: today }, endsOn: { gte: today } },
      select: { plan: { select: { key: true, priorityBookingDays: true } } },
      orderBy: { endsOn: "desc" },
    });
    if (!row) return { isMember: false, tier: null, priorityBookingDays: 0 };
    return { isMember: true, tier: row.plan.key, priorityBookingDays: row.plan.priorityBookingDays };
  } catch {
    return { isMember: false, tier: null, priorityBookingDays: 0 };
  }
}

export async function listMemberships(actor: Actor | null, opts: { status?: "ACTIVE" | "PENDING" | "EXPIRED" | "CANCELLED"; take?: number } = {}): Promise<MembershipView[]> {
  await requirePermission(actor, "finance.read");
  return db.membership.findMany({ where: opts.status ? { status: opts.status } : {}, select: membershipSelect, orderBy: { createdAt: "desc" }, take: opts.take ?? 100 });
}

/**
 * Moves terms past their end date to EXPIRED, renews the ones set to renew, and warns the ones about to
 * lapse. Idempotent, so it is safe to run from a cron as often as anyone likes.
 */
export async function sweepMemberships(opts: { now?: Date; warnDays?: number } = {}): Promise<{ expired: number; renewed: number; warned: number }> {
  const now = opts.now ?? new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const warnDays = opts.warnDays ?? 7;

  const ended = await db.membership.findMany({
    where: { status: "ACTIVE", endsOn: { lt: today } },
    select: { id: true, playerId: true, planId: true, autoRenew: true, endsOn: true, plan: { select: { id: true, name: true, period: true, priceCents: true, currency: true, locationId: true, active: true } } },
  });

  let renewed = 0;
  for (const m of ended) {
    await db.membership.update({ where: { id: m.id }, data: { status: "EXPIRED" } });
    await notify(m.playerId, { type: "membership.expired", data: { plan: m.plan.name, endsOn: plainDate(m.endsOn) }, url: "/app/membership", dedupeKey: `membership.expired:${m.id}` }).catch(() => undefined);
    if (!m.autoRenew || !m.plan.active) continue;
    const startsOn = new Date(m.endsOn.getTime() + 86_400_000);
    const endsOn = new Date(addMonths(startsOn, PERIOD_MONTHS[m.plan.period]).getTime() - 86_400_000);
    await db.$transaction(async (tx) => {
      const next = await tx.membership.create({ data: { code: code(), playerId: m.playerId, planId: m.planId, status: "PENDING", startsOn, endsOn, autoRenew: true }, select: { id: true } });
      await createInvoice(tx, {
        playerId: m.playerId,
        locationId: m.plan.locationId,
        currency: m.plan.currency,
        membershipId: next.id,
        lines: [{ kind: "MEMBERSHIP", description: `${m.plan.name} membership · ${plainDate(startsOn)} to ${plainDate(endsOn)}`, unitCents: m.plan.priceCents }],
      }, now);
    });
    renewed++;
  }

  const soon = new Date(today.getTime() + warnDays * 86_400_000);
  const expiring = await db.membership.findMany({ where: { status: "ACTIVE", autoRenew: false, endsOn: { gte: today, lte: soon } }, select: { id: true, playerId: true, endsOn: true, plan: { select: { name: true } } } });
  for (const m of expiring) {
    await notify(m.playerId, { type: "membership.expiring", data: { plan: m.plan.name, endsOn: plainDate(m.endsOn) }, url: "/app/membership", dedupeKey: `membership.expiring:${m.id}` }).catch(() => undefined);
  }
  return { expired: ended.length, renewed, warned: expiring.length };
}

/** Called by the payment path when a membership invoice is settled. */
export async function onMembershipInvoicePaid(invoiceId: string, opts: { now?: Date } = {}): Promise<void> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { membershipId: true, status: true } });
  if (invoice?.membershipId && invoice.status === "PAID") await activateMembership(invoice.membershipId, opts);
}

/** Keeps the invoice's cached figures honest after a membership price change. Rarely needed; kept explicit. */
export async function refreshMembershipInvoice(invoiceId: string, now = new Date()): Promise<void> {
  await db.$transaction((tx) => recalculateInvoice(tx, invoiceId, now));
}
