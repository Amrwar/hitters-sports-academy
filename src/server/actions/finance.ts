"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import * as invoices from "@/server/services/invoices";
import * as payments from "@/server/services/payments";
import * as refunds from "@/server/services/refunds";
import * as credits from "@/server/services/credits";
import * as coupons from "@/server/services/coupons";
import * as memberships from "@/server/services/memberships";
import * as policy from "@/server/services/payment-policy";

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

const PLAYER = ["/app", "/app/billing", "/app/membership", "/app/bookings", "/app/profile"];
const ADMIN = ["/admin", "/admin/finance", "/admin/finance/invoices", "/admin/memberships", "/admin/coupons", "/admin/bookings"];
const ALL = [...PLAYER, ...ADMIN];

/* ------------------------------------------------------------------ Taking money */

export async function takePaymentAction(invoiceId: string, input: Record<string, unknown>) {
  return run(async () => payments.takePayment(await getActor(), invoiceId, input), ALL);
}

export async function payWithCreditAction(invoiceId: string) {
  return run(async () => payments.payWithCredit(await getActor(), invoiceId), ALL);
}

/**
 * Opens a checkout and returns somewhere to send the player.
 *
 * Deliberately returns a URL and nothing resembling a result: whatever the player sees on the provider's
 * page, this application learns the outcome from the webhook.
 */
export async function startOnlinePaymentAction(invoiceId: string, input: Record<string, unknown> = {}) {
  return run(async () => payments.startOnlinePayment(await getActor(), invoiceId, input));
}

/** Asks the provider directly, for when the player is back but the webhook has not arrived yet. */
export async function reconcileIntentAction(intentId: string) {
  return run(async () => payments.reconcileIntent(intentId), ALL);
}

/* ------------------------------------------------------------------ Giving it back */

export async function refundAction(invoiceId: string, input: Record<string, unknown>) {
  return run(async () => refunds.refundInvoice(await getActor(), invoiceId, input), ALL);
}

export async function voidInvoiceAction(invoiceId: string, reason: string) {
  return run(async () => invoices.voidInvoice(await getActor(), invoiceId, reason), ADMIN);
}

/* ------------------------------------------------------------------ Credit */

export async function adjustCreditAction(playerId: string, input: Record<string, unknown>) {
  return run(async () => credits.adjustCredit(await getActor(), playerId, input), ALL);
}

/* ------------------------------------------------------------------ Coupons */

export async function previewCouponAction(invoiceId: string, code: string) {
  return run(async () => coupons.previewCoupon(code, invoiceId));
}

export async function applyCouponAction(invoiceId: string, code: string) {
  return run(async () => coupons.applyCoupon(await getActor(), invoiceId, code), ALL);
}

export async function removeCouponAction(invoiceId: string) {
  return run(async () => coupons.removeCoupon(await getActor(), invoiceId), ALL);
}

export async function createCouponAction(input: Record<string, unknown>) {
  return run(async () => coupons.createCoupon(await getActor(), input), ADMIN);
}

export async function updateCouponAction(couponId: string, input: Record<string, unknown>) {
  return run(async () => coupons.updateCoupon(await getActor(), couponId, input), ADMIN);
}

/* ------------------------------------------------------------------ Memberships */

export async function buyMembershipAction(input: Record<string, unknown>) {
  return run(async () => memberships.buyMembership(await getActor(), input), ALL);
}

export async function cancelMembershipAction(membershipId: string, input: Record<string, unknown> = {}) {
  return run(async () => memberships.cancelMembership(await getActor(), membershipId, input), ALL);
}

export async function upsertMembershipPlanAction(planId: string | null, input: Record<string, unknown>) {
  return run(async () => memberships.upsertPlan(await getActor(), planId, input), ALL);
}

/* ------------------------------------------------------------------ Policy */

export async function updatePaymentPolicyAction(locationId: string | null, input: Record<string, unknown>) {
  return run(async () => policy.updatePaymentPolicy(await getActor(), locationId, input), ALL);
}

/* ------------------------------------------------------------------ Reads used by client components */

export async function listInvoicesAction(input: Record<string, unknown>) {
  return run(async () => invoices.listInvoices(await getActor(), input));
}

export async function getInvoiceAction(idOrNumber: string) {
  return run(async () => invoices.getInvoice(await getActor(), idOrNumber));
}

export async function creditStatementAction(playerId?: string) {
  return run(async () => credits.getCreditStatement(await getActor(), playerId));
}
