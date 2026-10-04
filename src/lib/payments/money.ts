/**
 * Pure money helpers. No database, no clock of their own, no rounding surprises.
 *
 * Everything is in minor units (piastres for EGP) as integers, because a float is a wrong answer waiting
 * to happen: 0.1 + 0.2 is not 0.3, and a club that reconciles a till at the end of the night will find it.
 */
import type { CouponKind, InvoiceLineKind, InvoiceStatus } from "@prisma/client";

/** Lines that add to what is owed. DISCOUNT and CREDIT are the two that subtract. */
export const CHARGE_LINE_KINDS: readonly InvoiceLineKind[] = ["COURT", "LESSON", "PROGRAM", "PACKAGE", "MEMBERSHIP", "FEE"];

export const isChargeLine = (kind: InvoiceLineKind): boolean => CHARGE_LINE_KINDS.includes(kind);

export type LineLike = { kind: InvoiceLineKind; amountCents: number };

export type InvoiceTotals = {
  subtotalCents: number;
  discountCents: number;
  creditCents: number;
  totalCents: number;
};

/**
 * Adds up an invoice's lines.
 *
 * Discounts and credits are stored negative so a receipt prints straight from the lines, but they are
 * reported positive, because "Discount -200" twice over reads as a bug on a till receipt.
 * The total never goes below zero: a coupon worth more than the basket is a free basket, not a payout.
 */
export function sumLines(lines: readonly LineLike[]): InvoiceTotals {
  let subtotalCents = 0;
  let discountCents = 0;
  let creditCents = 0;
  for (const line of lines) {
    if (line.kind === "DISCOUNT") discountCents += Math.abs(line.amountCents);
    else if (line.kind === "CREDIT") creditCents += Math.abs(line.amountCents);
    else subtotalCents += line.amountCents;
  }
  const totalCents = Math.max(0, subtotalCents - discountCents - creditCents);
  return { subtotalCents, discountCents, creditCents, totalCents };
}

/**
 * What an invoice's status should be, given its total and what has been settled against it.
 *
 * A zero-total invoice is PAID the moment it is issued: a fully discounted booking is not "awaiting
 * payment" forever, and nobody should have to take a payment of nothing to close it.
 */
export function deriveInvoiceStatus(input: { totalCents: number; paidCents: number; refundedCents: number; issued: boolean; voided: boolean }): InvoiceStatus {
  if (input.voided) return "VOID";
  if (!input.issued) return "DRAFT";
  if (input.refundedCents > 0 && input.refundedCents >= input.paidCents && input.paidCents > 0) return "REFUNDED";
  if (input.paidCents - input.refundedCents >= input.totalCents) return "PAID";
  if (input.paidCents > 0) return "PART_PAID";
  return "ISSUED";
}

/** What is still owed. Never negative: an overpayment is a refund to arrange, not a negative balance. */
export const amountDue = (input: { totalCents: number; paidCents: number; refundedCents: number }): number =>
  Math.max(0, input.totalCents - (input.paidCents - input.refundedCents));

/**
 * The part of a total due before a booking is confirmed.
 *
 * Rounded up to the nearest minor unit, so a 30% deposit on an odd amount never leaves a club collecting
 * one piastre less than its policy says.
 */
export function depositFor(totalCents: number, depositPercent: number): number {
  if (depositPercent <= 0 || depositPercent >= 100) return totalCents;
  return Math.min(totalCents, Math.ceil((totalCents * depositPercent) / 100));
}

/**
 * What a coupon takes off.
 *
 * `eligibleCents` is the part of the invoice the coupon applies to, which is not always the whole of it:
 * a coupon restricted to lessons must not discount the court hire on the same invoice. A percentage can
 * be capped; neither kind can ever exceed what is eligible.
 */
export function couponDiscount(input: { kind: CouponKind; value: number; maxDiscountCents?: number | null; eligibleCents: number }): number {
  if (input.eligibleCents <= 0) return 0;
  const raw = input.kind === "PERCENT" ? Math.round((input.eligibleCents * input.value) / 100) : input.value;
  const capped = input.maxDiscountCents != null ? Math.min(raw, input.maxDiscountCents) : raw;
  return Math.max(0, Math.min(capped, input.eligibleCents));
}

/**
 * Divides a cost between players so the shares add up exactly.
 *
 * EGP 175 across four players is 43.75 each, which does not exist. The remainder goes to the earliest
 * shares one minor unit at a time, so four players pay 44, 44, 44 and 43 and the court is paid in full.
 * Giving everyone the rounded-up figure would quietly overcharge the group by three piastres a game.
 */
export function splitEvenly(totalCents: number, ways: number): number[] {
  if (ways <= 0) return [];
  const base = Math.floor(totalCents / ways);
  const remainder = totalCents - base * ways;
  return Array.from({ length: ways }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** "EGP 1,250" from 125000. The app's one money formatter lives in components; this is for logs and text. */
export const formatMinor = (cents: number, currency = "EGP"): string => `${currency} ${(cents / 100).toLocaleString("en", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
