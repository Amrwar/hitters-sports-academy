/**
 * Discount codes.
 *
 * A coupon never edits the price of the thing being bought; it adds a negative DISCOUNT line to the
 * invoice. That keeps the original price visible on the receipt, lets the finance screen report what
 * discounting actually costs, and means removing a coupon is deleting a line rather than recomputing a
 * quote from scratch.
 *
 * One coupon per invoice, enforced by the unique index on CouponRedemption.invoiceId. Limits are checked
 * and the redemption written inside the same transaction, so two tabs racing the last use of a code
 * cannot both win.
 */
import type { Coupon, InvoiceLineKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { couponInvalid, notFound, validation } from "@/lib/errors";
import { requirePermission, type Actor } from "@/lib/auth/authorize";
import { couponDiscount, isChargeLine } from "@/lib/payments/money";
import { couponSchema, fieldErrors } from "@/lib/validation/schemas";
import { recalculateInvoice } from "./invoices";

export type CouponView = Coupon & { redemptionCount: number };

/* ------------------------------------------------------------------ Management */

export async function listCoupons(actor: Actor | null, opts: { includeInactive?: boolean } = {}): Promise<CouponView[]> {
  await requirePermission(actor, "finance.read");
  const rows = await db.coupon.findMany({
    where: opts.includeInactive ? {} : { active: true },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { redemptions: true } } },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, redemptionCount: _count.redemptions }));
}

export async function createCoupon(actor: Actor | null, input: unknown): Promise<CouponView> {
  const a = await requirePermission(actor, "finance.manage");
  const data = parseCoupon(input);
  const existing = await db.coupon.findUnique({ where: { code: data.code }, select: { id: true } });
  if (existing) throw validation("That code is already in use.", { code: "Already in use." });

  const row = await db.$transaction(async (tx) => {
    const created = await tx.coupon.create({ data: { ...data, createdById: a.id } });
    await audit({ actorId: a.id, action: "coupon.created", entityType: "Coupon", entityId: created.id, locationId: created.locationId, metadata: { code: created.code, kind: created.kind, value: created.value } }, tx);
    return created;
  });
  return { ...row, redemptionCount: 0 };
}

export async function updateCoupon(actor: Actor | null, couponId: string, input: unknown): Promise<CouponView> {
  const a = await requirePermission(actor, "finance.manage");
  const existing = await db.coupon.findUnique({ where: { id: couponId }, include: { _count: { select: { redemptions: true } } } });
  if (!existing) throw notFound("Coupon");
  const data = parseCoupon(input);
  if (data.code !== existing.code) {
    const clash = await db.coupon.findUnique({ where: { code: data.code }, select: { id: true } });
    if (clash) throw validation("That code is already in use.", { code: "Already in use." });
  }

  const row = await db.$transaction(async (tx) => {
    const saved = await tx.coupon.update({ where: { id: couponId }, data });
    await audit({ actorId: a.id, action: "coupon.updated", entityType: "Coupon", entityId: couponId, locationId: saved.locationId, metadata: { fields: Object.keys(data) } }, tx);
    return saved;
  });
  return { ...row, redemptionCount: existing._count.redemptions };
}

function parseCoupon(input: unknown) {
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const d = parsed.data;
  if (d.kind === "PERCENT" && d.value > 100) throw validation("A percentage discount cannot be more than 100%.", { value: "At most 100." });
  if (d.validFrom && d.validTo && d.validFrom > d.validTo) throw validation("The end date is before the start date.", { validTo: "After the start date." });
  return {
    code: d.code,
    name: d.name,
    kind: d.kind,
    value: d.value,
    maxDiscountCents: d.maxDiscountCents ?? null,
    minSpendCents: d.minSpendCents ?? null,
    appliesTo: d.appliesTo as InvoiceLineKind[],
    locationId: d.locationId ?? null,
    validFrom: d.validFrom ?? null,
    validTo: d.validTo ?? null,
    maxRedemptions: d.maxRedemptions ?? null,
    maxPerPlayer: d.maxPerPlayer,
    active: d.active,
  };
}

/* ------------------------------------------------------------------ Redemption */

type Eligibility = { coupon: Coupon; discountCents: number; eligibleCents: number };

/**
 * Checks a code against an invoice and works out what it would take off.
 *
 * Every refusal says which rule failed, because "that code is not valid" sends a player to the front desk
 * and a receptionist to the database.
 */
async function evaluate(tx: Prisma.TransactionClient, code: string, invoiceId: string, now: Date): Promise<Eligibility> {
  const coupon = await tx.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon || !coupon.active) throw couponInvalid("That code is not valid.");
  if (coupon.validFrom && coupon.validFrom > now) throw couponInvalid("That code is not active yet.");
  if (coupon.validTo && coupon.validTo < now) throw couponInvalid("That code has expired.");
  if (coupon.maxRedemptions != null && coupon.redeemedCount >= coupon.maxRedemptions) throw couponInvalid("That code has been fully redeemed.");

  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, playerId: true, locationId: true, couponId: true, voidedAt: true, paidCents: true, lines: { select: { kind: true, amountCents: true } } },
  });
  if (!invoice) throw notFound("Invoice");
  if (invoice.voidedAt) throw couponInvalid("That invoice has been voided.");
  if (invoice.couponId) throw couponInvalid("A code has already been applied to this invoice.");
  if (invoice.paidCents > 0) throw couponInvalid("This has already been paid, so a code cannot be applied.");
  if (coupon.locationId && coupon.locationId !== invoice.locationId) throw couponInvalid("That code is for a different club.");

  if (invoice.playerId) {
    const used = await tx.couponRedemption.count({ where: { couponId: coupon.id, playerId: invoice.playerId } });
    if (used >= coupon.maxPerPlayer) throw couponInvalid(coupon.maxPerPlayer === 1 ? "You have already used that code." : `That code can only be used ${coupon.maxPerPlayer} times.`);
  }

  // Only the charge lines a restricted coupon names are discountable; a lessons-only code must not take
  // money off the court hire sitting on the same invoice.
  const scope = coupon.appliesTo.length > 0 ? coupon.appliesTo : null;
  const eligibleCents = invoice.lines.filter((l) => isChargeLine(l.kind) && (!scope || scope.includes(l.kind))).reduce((n, l) => n + l.amountCents, 0);
  if (eligibleCents <= 0) throw couponInvalid("That code does not apply to anything on this invoice.");
  if (coupon.minSpendCents != null && eligibleCents < coupon.minSpendCents) throw couponInvalid("The total is below this code's minimum spend.");

  const discountCents = couponDiscount({ kind: coupon.kind, value: coupon.value, maxDiscountCents: coupon.maxDiscountCents, eligibleCents });
  if (discountCents <= 0) throw couponInvalid("That code would take nothing off this invoice.");
  return { coupon, discountCents, eligibleCents };
}

/** What a code would do, without committing to it. Used to show the saving before someone confirms. */
export async function previewCoupon(code: string, invoiceId: string, now = new Date()): Promise<{ code: string; name: string; discountCents: number }> {
  const { coupon, discountCents } = await db.$transaction((tx) => evaluate(tx, code, invoiceId, now));
  return { code: coupon.code, name: coupon.name, discountCents };
}

/** Applies a code: one DISCOUNT line, one redemption row, one recalculation. */
export async function applyCoupon(actor: Actor | null, invoiceId: string, code: string, opts: { now?: Date } = {}): Promise<{ discountCents: number; totalCents: number }> {
  const now = opts.now ?? new Date();
  return db.$transaction(async (tx) => {
    const { coupon, discountCents } = await evaluate(tx, code, invoiceId, now);
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { playerId: true, locationId: true, lines: { select: { sortOrder: true } } } });
    const sortOrder = Math.max(0, ...invoice.lines.map((l) => l.sortOrder)) + 1;

    await tx.invoiceLine.create({
      data: { invoiceId, kind: "DISCOUNT", description: `${coupon.name} (${coupon.code})`, quantity: 1, unitCents: -discountCents, amountCents: -discountCents, sortOrder },
    });
    await tx.invoice.update({ where: { id: invoiceId }, data: { couponId: coupon.id } });
    await tx.couponRedemption.create({ data: { couponId: coupon.id, playerId: invoice.playerId, invoiceId, amountCents: discountCents } });
    await tx.coupon.update({ where: { id: coupon.id }, data: { redeemedCount: { increment: 1 } } });
    const after = await recalculateInvoice(tx, invoiceId, now);
    await audit({ actorId: actor?.id ?? invoice.playerId ?? null, action: "coupon.redeemed", entityType: "Invoice", entityId: invoiceId, locationId: invoice.locationId, metadata: { code: coupon.code, discountCents } }, tx);
    return { discountCents, totalCents: after.totalCents };
  });
}

/** Takes a code back off an unpaid invoice and frees the redemption. */
export async function removeCoupon(actor: Actor | null, invoiceId: string, opts: { now?: Date } = {}): Promise<{ totalCents: number }> {
  const now = opts.now ?? new Date();
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, couponId: true, locationId: true, paidCents: true } });
    if (!invoice) throw notFound("Invoice");
    if (!invoice.couponId) throw validation("No code is applied to this invoice.");
    if (invoice.paidCents > 0) throw couponInvalid("This has already been paid, so the code cannot be removed.");

    await tx.invoiceLine.deleteMany({ where: { invoiceId, kind: "DISCOUNT" } });
    await tx.couponRedemption.deleteMany({ where: { invoiceId } });
    await tx.coupon.update({ where: { id: invoice.couponId }, data: { redeemedCount: { decrement: 1 } } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { couponId: null } });
    const after = await recalculateInvoice(tx, invoiceId, now);
    await audit({ actorId: actor?.id ?? null, action: "coupon.removed", entityType: "Invoice", entityId: invoiceId, locationId: invoice.locationId }, tx);
    return { totalCents: after.totalCents };
  });
}
