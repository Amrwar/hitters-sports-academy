import type { Prisma, PricingRule } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { forbidden, notFound, validation } from "@/lib/errors";
import { can, requireActor, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, pricingRuleSchema } from "@/lib/validation/schemas";

/* ------------------------------------------------------------------ Pure pricing engine */

export type QuoteInput = {
  rules: PricingRule[];
  courtId: string;
  /** Base hourly rate from the court's availability window. */
  baseHourlyCents: number;
  dateISO: string;
  dayOfWeek: number;
  /** Slot start, minutes from midnight in the location timezone. */
  startMinutes: number;
  durationMinutes: number;
  isMember?: boolean;
  membershipTier?: string | null;
};

export type QuoteAdjustment = { ruleId: string; name: string; kind: PricingRule["kind"]; deltaCents: number };
export type Quote = { baseCents: number; totalCents: number; adjustments: QuoteAdjustment[] };

export function ruleApplies(rule: PricingRule, input: Omit<QuoteInput, "rules" | "baseHourlyCents" | "durationMinutes">): boolean {
  if (!rule.active) return false;
  if (rule.courtId && rule.courtId !== input.courtId) return false;
  if (rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(input.dayOfWeek)) return false;
  if (rule.startsAt != null && rule.endsAt != null && !(input.startMinutes >= rule.startsAt && input.startMinutes < rule.endsAt)) return false;
  if (rule.validFrom && rule.validFrom.toISOString().slice(0, 10) > input.dateISO) return false;
  if (rule.validTo && rule.validTo.toISOString().slice(0, 10) < input.dateISO) return false;
  if (rule.kind === "MEMBERSHIP_DISCOUNT") {
    if (!input.isMember) return false;
    if (rule.membershipTier && rule.membershipTier !== input.membershipTier) return false;
  }
  return true;
}

/**
 * Applies matching rules in ascending priority. An absolute `priceCents` replaces the running hourly
 * rate; `adjustmentPercent` scales the running total. Deterministic and side-effect free.
 */
export function quotePrice(input: QuoteInput): Quote {
  const factor = input.durationMinutes / 60;
  const baseCents = Math.round(input.baseHourlyCents * factor);
  let running = baseCents;
  const adjustments: QuoteAdjustment[] = [];
  const applicable = input.rules.filter((r) => ruleApplies(r, input)).sort((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime());
  for (const rule of applicable) {
    let next = running;
    if (rule.priceCents != null) next = Math.round(rule.priceCents * factor);
    if (rule.adjustmentPercent != null) next = Math.round(next * (1 + rule.adjustmentPercent / 100));
    const deltaCents = next - running;
    if (deltaCents !== 0) adjustments.push({ ruleId: rule.id, name: rule.name, kind: rule.kind, deltaCents });
    running = next;
  }
  return { baseCents, totalCents: Math.max(0, running), adjustments };
}

/* ------------------------------------------------------------------ Rule management */

async function requirePricingAccess(actor: Actor | null, locationId: string): Promise<Actor> {
  const a = await requireActor(actor);
  if ((await can(a, "court.manage", { locationId })) || (await can(a, "finance.manage", { locationId }))) return a;
  throw forbidden();
}

export async function listPricingRules(actor: Actor | null, locationId: string, opts: { includeInactive?: boolean } = {}): Promise<PricingRule[]> {
  const a = await requireActor(actor);
  const loc = await db.location.findUnique({ where: { id: locationId }, select: { id: true, status: true } });
  if (!loc) throw notFound("Location");
  const staff = (await can(a, "court.read", { locationId })) && (actor?.globalRole || actor?.memberships.some((m) => m.locationId === locationId));
  if (!staff && loc.status === "INACTIVE") throw forbidden();
  return db.pricingRule.findMany({
    where: { locationId, ...(opts.includeInactive && staff ? {} : { active: true }) },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

export async function createPricingRule(actor: Actor | null, locationId: string, input: unknown): Promise<PricingRule> {
  const a = await requirePricingAccess(actor, locationId);
  const parsed = pricingRuleSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  if (parsed.data.courtId) {
    const court = await db.court.findUnique({ where: { id: parsed.data.courtId }, select: { locationId: true } });
    if (!court || court.locationId !== locationId) throw validation("Court does not belong to this location.", { courtId: "Court does not belong to this location." });
  }
  return db.$transaction(async (tx) => {
    const rule = await tx.pricingRule.create({ data: { ...parsed.data, locationId } as Prisma.PricingRuleUncheckedCreateInput });
    await audit({ actorId: a.id, action: "pricing.rule_created", entityType: "PricingRule", entityId: rule.id, locationId, metadata: { kind: rule.kind, name: rule.name } }, tx);
    return rule;
  });
}

export async function updatePricingRule(actor: Actor | null, ruleId: string, input: unknown): Promise<PricingRule> {
  const existing = await db.pricingRule.findUnique({ where: { id: ruleId } });
  if (!existing) throw notFound("Pricing rule");
  const a = await requirePricingAccess(actor, existing.locationId);
  const parsed = pricingRuleSchema.safeParse({ ...existing, ...(input as object) });
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  if (parsed.data.courtId) {
    const court = await db.court.findUnique({ where: { id: parsed.data.courtId }, select: { locationId: true } });
    if (!court || court.locationId !== existing.locationId) throw validation("Court does not belong to this location.", { courtId: "Court does not belong to this location." });
  }
  return db.$transaction(async (tx) => {
    const rule = await tx.pricingRule.update({ where: { id: ruleId }, data: parsed.data as Prisma.PricingRuleUncheckedUpdateInput });
    await audit({ actorId: a.id, action: "pricing.rule_updated", entityType: "PricingRule", entityId: ruleId, locationId: existing.locationId, metadata: { fields: Object.keys(input as object) } }, tx);
    return rule;
  });
}

export async function deletePricingRule(actor: Actor | null, ruleId: string): Promise<{ ok: true }> {
  const existing = await db.pricingRule.findUnique({ where: { id: ruleId } });
  if (!existing) throw notFound("Pricing rule");
  const a = await requirePricingAccess(actor, existing.locationId);
  await db.$transaction(async (tx) => {
    await tx.pricingRule.delete({ where: { id: ruleId } });
    await audit({ actorId: a.id, action: "pricing.rule_deleted", entityType: "PricingRule", entityId: ruleId, locationId: existing.locationId, metadata: { name: existing.name } }, tx);
  });
  return { ok: true };
}
