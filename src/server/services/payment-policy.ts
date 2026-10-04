/**
 * When and how a club takes money.
 *
 * One row with a null locationId is the academy default; a row per club overrides it. A club that has
 * never been configured inherits the academy's answer rather than a hardcoded one, so changing the
 * academy policy changes every club that has not opted out — which is what an operator expects when they
 * edit a setting called "the academy's policy".
 *
 * Read on every quote and every cancellation, so it is cached briefly and never throws: a policy lookup
 * failing must not stop someone booking a court.
 */
import type { PaymentPolicy, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { validation } from "@/lib/errors";
import { requirePermission, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, paymentPolicySchema } from "@/lib/validation/schemas";
import { onlinePaymentsConfigured } from "@/lib/payments/provider";

export type EffectivePolicy = {
  /** Null when this is the academy default rather than a club's own row. */
  locationId: string | null;
  /** True when the figures come from a row for this club rather than the academy default. */
  overridden: boolean;
  timing: PaymentPolicy["timing"];
  depositPercent: number;
  lateCancellationPercent: number;
  noShowPercent: number;
  refundDestination: PaymentPolicy["refundDestination"];
  refundCutoffHours: number;
  defaultGameCostMode: PaymentPolicy["defaultGameCostMode"];
  allowCredit: boolean;
};

/**
 * Used when no policy row exists at all. Deliberately the most conservative setting: money is taken at the
 * desk, nothing is kept on a cancellation, and refunds go back the way they came. A club that wants to
 * keep a late-cancellation fee has to say so.
 */
export const POLICY_DEFAULTS: EffectivePolicy = {
  locationId: null,
  overridden: false,
  timing: "AT_CLUB",
  depositPercent: 0,
  lateCancellationPercent: 0,
  noShowPercent: 0,
  refundDestination: "ORIGINAL",
  refundCutoffHours: 0,
  defaultGameCostMode: "SPLIT_EVENLY",
  allowCredit: true,
};

const TTL_MS = 30_000;
const cache = new Map<string, { value: EffectivePolicy; at: number }>();

export function invalidatePaymentPolicyCache(): void {
  cache.clear();
}

const toEffective = (row: PaymentPolicy, overridden: boolean): EffectivePolicy => ({
  locationId: row.locationId,
  overridden,
  timing: row.timing,
  depositPercent: row.depositPercent,
  lateCancellationPercent: row.lateCancellationPercent,
  noShowPercent: row.noShowPercent,
  refundDestination: row.refundDestination,
  refundCutoffHours: row.refundCutoffHours,
  defaultGameCostMode: row.defaultGameCostMode,
  allowCredit: row.allowCredit,
});

/**
 * The policy in force at a club. Never throws: callers are in the middle of quoting or cancelling.
 *
 * A policy that says ONLINE on a deployment with no gateway configured is downgraded to AT_CLUB, because
 * the alternative is a club that cannot take money at all until an environment variable is set.
 */
export async function getPaymentPolicy(locationId?: string | null, opts: { tx?: Prisma.TransactionClient } = {}): Promise<EffectivePolicy> {
  const key = locationId ?? "__academy__";
  const hit = cache.get(key);
  if (!opts.tx && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value = POLICY_DEFAULTS;
  try {
    const client = opts.tx ?? db;
    const rows = await client.paymentPolicy.findMany({ where: { OR: [{ locationId: null }, ...(locationId ? [{ locationId }] : [])] } });
    const own = locationId ? rows.find((r) => r.locationId === locationId) : undefined;
    const academy = rows.find((r) => r.locationId === null);
    if (own) value = toEffective(own, true);
    else if (academy) value = toEffective(academy, false);
  } catch {
    value = POLICY_DEFAULTS;
  }

  if (value.timing !== "AT_CLUB" && !onlinePaymentsConfigured()) {
    value = { ...value, timing: "AT_CLUB", depositPercent: 0 };
  }
  if (!opts.tx) cache.set(key, { value, at: Date.now() });
  return value;
}

/** The academy default and every club override, for the settings screen. */
export async function listPaymentPolicies(actor: Actor | null): Promise<{ academy: EffectivePolicy; byLocation: { locationId: string; name: string; policy: EffectivePolicy }[] }> {
  await requirePermission(actor, "finance.read");
  const [rows, locations] = await Promise.all([
    db.paymentPolicy.findMany(),
    db.location.findMany({ where: { status: { not: "INACTIVE" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const academyRow = rows.find((r) => r.locationId === null);
  const academy = academyRow ? toEffective(academyRow, false) : POLICY_DEFAULTS;
  return {
    academy,
    byLocation: locations.map((l) => {
      const own = rows.find((r) => r.locationId === l.id);
      return { locationId: l.id, name: l.name, policy: own ? toEffective(own, true) : { ...academy, locationId: l.id, overridden: false } };
    }),
  };
}

/**
 * Writes the academy default (locationId null) or one club's override.
 *
 * Editing the academy default is an academy-wide act, so it needs an unscoped permission; editing one
 * club's row only needs finance.manage at that club.
 */
export async function updatePaymentPolicy(actor: Actor | null, locationId: string | null, input: unknown): Promise<EffectivePolicy> {
  const a = await requirePermission(actor, "finance.manage", locationId ? { locationId } : undefined);
  const parsed = paymentPolicySchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const data = parsed.data;
  if (data.timing !== "AT_CLUB" && !onlinePaymentsConfigured()) {
    throw validation("No payment provider is configured for this deployment, so online payment cannot be switched on yet.", { timing: "Set PAYMENT_PROVIDER first." });
  }

  const row = await db.$transaction(async (tx) => {
    const existing = await tx.paymentPolicy.findFirst({ where: { locationId } });
    const saved = existing
      ? await tx.paymentPolicy.update({ where: { id: existing.id }, data: { ...data, updatedById: a.id } })
      : await tx.paymentPolicy.create({ data: { ...data, locationId, updatedById: a.id } });
    await audit({ actorId: a.id, action: "payment.policy.updated", entityType: "PaymentPolicy", entityId: saved.id, locationId, metadata: { ...data } }, tx);
    return saved;
  });
  invalidatePaymentPolicyCache();
  return toEffective(row, locationId !== null);
}

/**
 * What a club keeps when a booking that has been paid for is cancelled or missed.
 *
 * Inside the cutoff a late-cancellation percentage applies; past `refundCutoffHours` before the start
 * nothing is refunded at all, which is a different rule from the fee and is why both exist.
 */
export function cancellationCharge(input: { policy: EffectivePolicy; totalCents: number; hoursBeforeStart: number; cancellationCutoffHours: number; noShow?: boolean }): { chargeCents: number; refundCents: number; reason: string | null } {
  const { policy, totalCents } = input;
  if (input.noShow) {
    const chargeCents = Math.min(totalCents, Math.round((totalCents * policy.noShowPercent) / 100));
    return { chargeCents, refundCents: totalCents - chargeCents, reason: chargeCents > 0 ? "No-show fee" : null };
  }
  if (input.hoursBeforeStart <= policy.refundCutoffHours && policy.refundCutoffHours > 0) {
    return { chargeCents: totalCents, refundCents: 0, reason: "Cancelled inside the no-refund window" };
  }
  if (input.hoursBeforeStart >= input.cancellationCutoffHours) {
    return { chargeCents: 0, refundCents: totalCents, reason: null };
  }
  const chargeCents = Math.min(totalCents, Math.round((totalCents * policy.lateCancellationPercent) / 100));
  return { chargeCents, refundCents: totalCents - chargeCents, reason: chargeCents > 0 ? "Late cancellation fee" : null };
}
