import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as bookings from "@/server/services/bookings";
import * as courts from "@/server/services/courts";
import * as invoices from "@/server/services/invoices";
import * as payments from "@/server/services/payments";
import * as refunds from "@/server/services/refunds";
import * as credits from "@/server/services/credits";
import * as coupons from "@/server/services/coupons";
import * as memberships from "@/server/services/memberships";
import * as policy from "@/server/services/payment-policy";
import * as finance from "@/server/services/finance";
import { couponDiscount, depositFor, deriveInvoiceStatus, splitEvenly, sumLines } from "@/lib/payments/money";
import { registerPaymentProvider, unregisterPaymentProvider, type PaymentProvider, type ProviderEvent, type WebhookRequest } from "@/lib/payments/provider";
import { expectCode, makeLocation, makeUser } from "./helpers";

const NOW = new Date("2026-11-09T08:00:00Z"); // Monday 10:00 Cairo
const DAY = "2026-11-10";
const ALL_WEEK = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt: 7 * 60, closesAt: 24 * 60, slotMinutes: 60, priceCents: 40000 }));

/**
 * A gateway that does exactly what we tell it to, so the tests can cover the cases a real one only
 * produces occasionally: a refusal, a timeout, a webhook that arrives twice, a webhook that arrives
 * before the browser does, and a signature that does not check out.
 */
const fake = {
  mode: "ok" as "ok" | "fail" | "throw" | "instant",
  refundMode: "ok" as "ok" | "fail",
  events: [] as ProviderEvent[],
  secret: "test-secret",
  calls: { createIntent: 0, refund: 0, fetchIntent: 0 },
  reset() {
    this.mode = "ok";
    this.refundMode = "ok";
    this.events = [];
    this.calls = { createIntent: 0, refund: 0, fetchIntent: 0 };
  },
};

const fakeProvider: PaymentProvider = {
  key: "fake",
  label: "Fake gateway",
  currencies: ["EGP"],
  online: true,
  async createIntent(req) {
    fake.calls.createIntent++;
    if (fake.mode === "throw") throw new Error("gateway unreachable");
    if (fake.mode === "fail") return { providerRef: `ref_${req.idempotencyKey}`, status: "FAILED", failureMessage: "Card declined" };
    if (fake.mode === "instant") return { providerRef: `ref_${req.idempotencyKey}`, status: "SUCCEEDED" };
    return { providerRef: `ref_${req.idempotencyKey}`, status: "REQUIRES_ACTION", checkoutUrl: `https://pay.example/${req.idempotencyKey}` };
  },
  async fetchIntent(providerRef) {
    fake.calls.fetchIntent++;
    return { providerRef, status: fake.mode === "fail" ? "FAILED" : "SUCCEEDED" };
  },
  async refund(req) {
    fake.calls.refund++;
    if (fake.refundMode === "fail") return { providerRef: "", status: "FAILED", failureMessage: "Refund window closed" };
    return { providerRef: `rfnd_${req.idempotencyKey}`, status: "SUCCEEDED" };
  },
  verifyWebhook(req) {
    return req.headers.get("x-signature") === `${fake.secret}:${req.rawBody.length}`;
  },
  parseEvent(req) {
    return JSON.parse(req.rawBody) as ProviderEvent;
  },
};

const WEBHOOK_URL = new URL("https://hitters.test/api/payments/webhook/fake");

/** A correctly signed callback, as the route would hand it over. */
const signed = (body: unknown): WebhookRequest => {
  const rawBody = JSON.stringify(body);
  return { rawBody, headers: new Headers({ "x-signature": `${fake.secret}:${rawBody.length}` }), url: WEBHOOK_URL };
};

async function world() {
  const A = await makeLocation("alpha");
  const owner = await makeUser({ globalRole: "ACADEMY_OWNER" });
  const manager = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }] });
  const reception = await makeUser({ staff: [{ locationId: A.id, role: "RECEPTIONIST" }], name: "Rana Reception" });
  const p1 = await makeUser({ homeLocationId: A.id, name: "Player One" });
  const p2 = await makeUser({ homeLocationId: A.id, name: "Player Two" });
  const c1 = await courts.createCourt(manager.actor, { locationId: A.id, name: "Court 1", type: "INDOOR" });
  await courts.setCourtAvailability(manager.actor, c1.id, ALL_WEEK);
  return { A, owner, manager, reception, p1, p2, c1 };
}
type World = Awaited<ReturnType<typeof world>>;

const book = async (w: World, who = w.p1, startMinutes = 10 * 60, durationMinutes = 60) =>
  bookings.createBooking(who.actor, { courtId: w.c1.id, dateISO: DAY, startMinutes, durationMinutes }, { now: NOW });

const invoiceFor = async (bookingId: string) => db.invoice.findFirstOrThrow({ where: { bookingId, voidedAt: null } });

/* ================================================================== Pure arithmetic */

describe("money arithmetic", () => {
  it("splits a cost so the shares add up to the whole, never more", () => {
    expect(splitEvenly(17500, 4)).toEqual([4375, 4375, 4375, 4375]);
    // 43.75 each does not exist in piastres: three pay a piastre more so the court is paid exactly.
    expect(splitEvenly(17501, 4)).toEqual([4376, 4375, 4375, 4375]);
    expect(splitEvenly(17501, 4).reduce((a, b) => a + b, 0)).toBe(17501);
    expect(splitEvenly(10, 3)).toEqual([4, 3, 3]);
    expect(splitEvenly(0, 4)).toEqual([0, 0, 0, 0]);
    expect(splitEvenly(100, 0)).toEqual([]);
  });

  it("totals an invoice with discounts and credit subtracting, and never goes negative", () => {
    const totals = sumLines([
      { kind: "COURT", amountCents: 40000 },
      { kind: "FEE", amountCents: 5000 },
      { kind: "DISCOUNT", amountCents: -10000 },
      { kind: "CREDIT", amountCents: -5000 },
    ]);
    expect(totals).toEqual({ subtotalCents: 45000, discountCents: 10000, creditCents: 5000, totalCents: 30000 });
    // A coupon worth more than the basket is a free basket, not a payout.
    expect(sumLines([{ kind: "COURT", amountCents: 1000 }, { kind: "DISCOUNT", amountCents: -5000 }]).totalCents).toBe(0);
  });

  it("derives invoice status from what is owed and what has settled", () => {
    const base = { issued: true, voided: false };
    expect(deriveInvoiceStatus({ ...base, issued: false, totalCents: 100, paidCents: 0, refundedCents: 0 })).toBe("DRAFT");
    expect(deriveInvoiceStatus({ ...base, totalCents: 100, paidCents: 0, refundedCents: 0 })).toBe("ISSUED");
    expect(deriveInvoiceStatus({ ...base, totalCents: 100, paidCents: 40, refundedCents: 0 })).toBe("PART_PAID");
    expect(deriveInvoiceStatus({ ...base, totalCents: 100, paidCents: 100, refundedCents: 0 })).toBe("PAID");
    expect(deriveInvoiceStatus({ ...base, totalCents: 100, paidCents: 100, refundedCents: 100 })).toBe("REFUNDED");
    expect(deriveInvoiceStatus({ ...base, voided: true, totalCents: 100, paidCents: 0, refundedCents: 0 })).toBe("VOID");
    // A fully discounted booking closes itself rather than waiting forever for a payment of nothing.
    expect(deriveInvoiceStatus({ ...base, totalCents: 0, paidCents: 0, refundedCents: 0 })).toBe("PAID");
  });

  it("rounds a deposit up and caps a coupon", () => {
    expect(depositFor(40001, 30)).toBe(12001);
    expect(depositFor(40000, 0)).toBe(40000);
    expect(depositFor(40000, 100)).toBe(40000);
    expect(couponDiscount({ kind: "PERCENT", value: 25, eligibleCents: 40000 })).toBe(10000);
    expect(couponDiscount({ kind: "PERCENT", value: 25, maxDiscountCents: 5000, eligibleCents: 40000 })).toBe(5000);
    expect(couponDiscount({ kind: "FIXED", value: 99999, eligibleCents: 40000 })).toBe(40000);
    expect(couponDiscount({ kind: "FIXED", value: 1000, eligibleCents: 0 })).toBe(0);
  });
});

/* ================================================================== Invoices from bookings */

describe("invoices", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("raises an invoice with the booking, priced from the same quote", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    expect(inv.totalCents).toBe(b.priceCents);
    expect(inv.status).toBe("ISSUED");
    expect(inv.number).toMatch(/^HT-\d{4}-\d{6}$/);
    expect(inv.playerId).toBe(w.p1.user.id);
    const lines = await db.invoiceLine.findMany({ where: { invoiceId: inv.id } });
    expect(lines.some((l) => l.kind === "COURT")).toBe(true);
  });

  it("numbers invoices without collisions under concurrency", async () => {
    const made = await Promise.all([book(w, w.p1, 11 * 60), book(w, w.p1, 12 * 60), book(w, w.p1, 13 * 60), book(w, w.p1, 14 * 60)]);
    const numbers = await db.invoice.findMany({ where: { bookingId: { in: made.map((b) => b.id) } }, select: { number: true } });
    expect(new Set(numbers.map((n) => n.number)).size).toBe(4);
  });

  it("shows an owner their own invoice and hides it from another player", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expect(invoices.getInvoice(w.p1.actor, inv.number)).resolves.toMatchObject({ id: inv.id });
    await expectCode(invoices.getInvoice(w.p2.actor, inv.id), "FORBIDDEN");
    await expect(invoices.getInvoice(w.manager.actor, inv.id)).resolves.toMatchObject({ id: inv.id });
  });

  it("refuses to void an invoice that has money against it", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await expectCode(invoices.voidInvoice(w.manager.actor, inv.id, "mistake"), "CONFLICT");
  });
});

/* ================================================================== Taking money at the desk */

describe("taking payment", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("settles an invoice in full and will not take a second payment", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const after = await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    expect(after.status).toBe("PAID");
    expect(after.amountDueCents).toBe(0);
    await expectCode(payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW }), "ALREADY_PAID");
  });

  it("takes a part payment and leaves the rest owing", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const after = await payments.takePayment(w.reception.actor, inv.id, { method: "CASH", amountCents: 10000 }, { now: NOW });
    expect(after.status).toBe("PART_PAID");
    expect(after.amountDueCents).toBe(inv.totalCents - 10000);
    const done = await payments.takePayment(w.reception.actor, inv.id, { method: "CARD" }, { now: new Date(NOW.getTime() + 1000) });
    expect(done.status).toBe("PAID");
    expect(done.payments).toHaveLength(2);
  });

  it("refuses more than is owed, and refuses nothing", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expectCode(payments.takePayment(w.reception.actor, inv.id, { method: "CASH", amountCents: inv.totalCents + 1 }, { now: NOW }), "VALIDATION");
    await expectCode(payments.takePayment(w.reception.actor, inv.id, { method: "CASH", amountCents: 0 }, { now: NOW }), "VALIDATION");
  });

  it("is idempotent under the same key, however many times it is called", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const key = "till-slip-42";
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH", amountCents: 10000 }, { now: NOW, key });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH", amountCents: 10000 }, { now: NOW, key });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH", amountCents: 10000 }, { now: NOW, key });
    const rows = await db.payment.findMany({ where: { invoiceId: inv.id } });
    expect(rows.filter((r) => r.status === "PAID")).toHaveLength(1);
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.paidCents).toBe(10000);
  });

  it("waives a balance without pretending money arrived", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const after = await payments.takePayment(w.reception.actor, inv.id, { method: "CASH", waive: true }, { now: NOW });
    expect(after.status).toBe("PAID");
    expect(after.payments[0].status).toBe("WAIVED");
    expect(after.payments[0].method).toBe("NONE");
  });

  it("lets a player pay nothing themselves", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expectCode(payments.takePayment(w.p1.actor, inv.id, { method: "CASH" }, { now: NOW }), "FORBIDDEN");
  });

  it("records who took the money and what it was for", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH", reference: "till-7" }, { now: NOW });
    const payment = await db.payment.findFirstOrThrow({ where: { invoiceId: inv.id, status: "PAID" } });
    expect(payment.receivedById).toBe(w.reception.user.id);
    expect(payment.bookingId).toBe(b.id);
    expect(payment.reference).toBe("till-7");
    const log = await db.auditLog.findFirst({ where: { action: "payment.recorded", entityId: inv.id } });
    expect(log).not.toBeNull();
  });
});

/* ================================================================== Academy credit */

describe("academy credit", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("pays from a balance and writes both halves of the record", async () => {
    await credits.adjustCredit(w.owner.actor, w.p1.user.id, { amountCents: 50000, reason: "Goodwill" });
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const after = await payments.payWithCredit(w.p1.actor, inv.id, { now: NOW });
    expect(after.status).toBe("PAID");
    expect(await credits.creditBalance(w.p1.user.id)).toBe(50000 - inv.totalCents);
    const statement = await credits.getCreditStatement(w.p1.actor);
    expect(statement.entries[0].kind).toBe("SPEND");
    expect(statement.entries[0].balanceAfterCents).toBe(50000 - inv.totalCents);
  });

  it("spends only what is there, leaving the rest owing", async () => {
    await credits.adjustCredit(w.owner.actor, w.p1.user.id, { amountCents: 10000, reason: "Partial" });
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const after = await payments.payWithCredit(w.p1.actor, inv.id, { now: NOW });
    expect(after.status).toBe("PART_PAID");
    expect(after.amountDueCents).toBe(inv.totalCents - 10000);
    expect(await credits.creditBalance(w.p1.user.id)).toBe(0);
  });

  it("refuses to pay with credit nobody has", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expectCode(payments.payWithCredit(w.p1.actor, inv.id, { now: NOW }), "CONFLICT");
  });

  it("never lets a balance go negative, even from two spends at once", async () => {
    await credits.adjustCredit(w.owner.actor, w.p1.user.id, { amountCents: 40000, reason: "Seed" });
    const b1 = await book(w, w.p1, 10 * 60);
    const b2 = await book(w, w.p1, 12 * 60);
    const [i1, i2] = [await invoiceFor(b1.id), await invoiceFor(b2.id)];
    const results = await Promise.allSettled([payments.payWithCredit(w.p1.actor, i1.id, { now: NOW }), payments.payWithCredit(w.p1.actor, i2.id, { now: NOW })]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await credits.creditBalance(w.p1.user.id)).toBeGreaterThanOrEqual(0);
  });

  it("refuses an adjustment with no reason, because the reason is what the player reads", async () => {
    await expectCode(credits.adjustCredit(w.owner.actor, w.p1.user.id, { amountCents: 1000, reason: "" }), "VALIDATION");
    await expectCode(credits.adjustCredit(w.owner.actor, w.p1.user.id, { amountCents: 0, reason: "Nothing" }), "VALIDATION");
  });

  it("keeps a player out of another player's statement", async () => {
    await expectCode(credits.getCreditStatement(w.p1.actor, w.p2.user.id), "FORBIDDEN");
  });
});

/* ================================================================== Online payment */

describe("online payment", () => {
  let w: World;
  const previous = process.env.PAYMENT_PROVIDER;

  beforeEach(async () => {
    w = await world();
    fake.reset();
    registerPaymentProvider(fakeProvider);
    process.env.PAYMENT_PROVIDER = "fake";
    policy.invalidatePaymentPolicyCache();
    await db.paymentPolicy.create({ data: { locationId: null, timing: "BOTH", depositPercent: 25 } });
    policy.invalidatePaymentPolicyCache();
  });
  afterEach(() => {
    unregisterPaymentProvider("fake");
    if (previous === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previous;
    policy.invalidatePaymentPolicyCache();
  });

  it("hands back a checkout and marks nothing as paid", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, { portion: "FULL" }, { now: NOW });
    expect(handoff.checkoutUrl).toContain("https://pay.example/");
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("ISSUED");
    expect(after.paidCents).toBe(0);
  });

  it("takes only the deposit when that is what was asked for", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, { portion: "DEPOSIT" }, { now: NOW });
    expect(handoff.amountCents).toBe(depositFor(inv.totalCents, 25));
  });

  it("reuses an open attempt rather than opening a second checkout", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const first = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    const second = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    expect(second.intentId).toBe(first.intentId);
    expect(fake.calls.createIntent).toBe(1);
  });

  it("leaves nothing charged when the gateway cannot be reached", async () => {
    fake.mode = "throw";
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expectCode(payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW }), "PAYMENT_FAILED");
    const intent = await db.paymentIntent.findFirstOrThrow({ where: { invoiceId: inv.id } });
    expect(intent.status).toBe("FAILED");
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.paidCents).toBe(0);
  });

  it("settles only from a verified webhook, and only once however often it is delivered", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } });

    const body = { eventId: "evt_1", type: "payment.succeeded", outcome: "succeeded", intentRef: intent.providerRef, amountCents: handoff.amountCents };
    const { rawBody: raw, headers } = signed(body);

    const first = await payments.handleWebhook("fake", { rawBody: raw, headers, url: WEBHOOK_URL }, { now: NOW });
    expect(first.status).toBe(200);
    const second = await payments.handleWebhook("fake", { rawBody: raw, headers, url: WEBHOOK_URL }, { now: NOW });
    expect(second.body).toBe("duplicate");
    const third = await payments.handleWebhook("fake", { rawBody: raw, headers, url: WEBHOOK_URL }, { now: NOW });
    expect(third.body).toBe("duplicate");

    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("PAID");
    expect(after.paidCents).toBe(handoff.amountCents);
    expect(await db.payment.count({ where: { invoiceId: inv.id, status: "PAID" } })).toBe(1);
  });

  it("refuses a webhook whose signature does not check out, and keeps the attempt", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } });
    const raw = JSON.stringify({ eventId: "evt_forged", type: "payment.succeeded", outcome: "succeeded", intentRef: intent.providerRef });

    const result = await payments.handleWebhook("fake", { rawBody: raw, headers: new Headers({ "x-signature": "nope" }), url: WEBHOOK_URL }, { now: NOW });
    expect(result.status).toBe(400);
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.paidCents).toBe(0);
    // The attempt is still on record, which is how a forged callback is noticed at all.
    expect(await db.webhookEvent.count({ where: { signatureOk: false } })).toBe(1);
  });

  it("ignores a webhook for an attempt it has never heard of", async () => {
    const { rawBody: raw, headers } = signed({ eventId: "evt_unknown", type: "payment.succeeded", outcome: "succeeded", intentRef: "ref_nothing" });
    const result = await payments.handleWebhook("fake", { rawBody: raw, headers, url: WEBHOOK_URL }, { now: NOW });
    expect(result.status).toBe(200);
    expect(await db.payment.count({ where: { status: "PAID" } })).toBe(0);
  });

  it("records a failure without charging, and leaves the invoice owing", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } });
    const { rawBody: raw, headers } = signed({ eventId: "evt_fail", type: "payment.failed", outcome: "failed", intentRef: intent.providerRef, failureMessage: "Insufficient funds" });

    await payments.handleWebhook("fake", { rawBody: raw, headers, url: WEBHOOK_URL }, { now: NOW });
    const after = await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } });
    expect(after.status).toBe("FAILED");
    expect(after.failureMessage).toBe("Insufficient funds");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("ISSUED");
  });

  it("asks the provider directly when the webhook never arrives", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    const result = await payments.reconcileIntent(handoff.intentId, { now: NOW });
    expect(result.status).toBe("SUCCEEDED");
    expect(fake.calls.fetchIntent).toBe(1);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
  });

  it("does not double-pay when a webhook and a reconciliation race", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } });
    const { rawBody: raw, headers } = signed({ eventId: "evt_race", type: "payment.succeeded", outcome: "succeeded", intentRef: intent.providerRef });

    await Promise.allSettled([payments.handleWebhook("fake", { rawBody: raw, headers, url: WEBHOOK_URL }, { now: NOW }), payments.reconcileIntent(handoff.intentId, { now: NOW })]);
    expect(await db.payment.count({ where: { invoiceId: inv.id, status: "PAID" } })).toBe(1);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paidCents).toBe(handoff.amountCents);
  });

  it("stores the reference a refund will need, not the one the intent correlates on", async () => {
    // Some gateways, Paymob among them, correlate an intent on an order id but refund by transaction id.
    // Keeping the order id on the payment would make every refund against them fail.
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } });
    const { rawBody: raw, headers } = signed({ eventId: "evt_refs", type: "payment.succeeded", outcome: "succeeded", intentRef: intent.providerRef, refundRef: "txn_9988", amountCents: handoff.amountCents });

    await payments.handleWebhook("fake", { rawBody: raw, headers, url: WEBHOOK_URL }, { now: NOW });
    const payment = await db.payment.findFirstOrThrow({ where: { invoiceId: inv.id, status: "PAID" } });
    expect(payment.providerRef).toBe("txn_9988");
  });

  it("ignores a refund callback rather than reopening the payment", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } });
    const paid = signed({ eventId: "evt_paid", type: "payment.succeeded", outcome: "succeeded", intentRef: intent.providerRef, amountCents: handoff.amountCents });
    await payments.handleWebhook("fake", { rawBody: paid.rawBody, headers: paid.headers, url: WEBHOOK_URL }, { now: NOW });

    // We record refunds ourselves; a provider telling us about one must not mark the intent failed.
    const refunded = signed({ eventId: "evt_refunded", type: "payment.refunded", outcome: "refunded", intentRef: intent.providerRef, amountCents: handoff.amountCents });
    await payments.handleWebhook("fake", { rawBody: refunded.rawBody, headers: refunded.headers, url: WEBHOOK_URL }, { now: NOW });
    expect((await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } })).status).toBe("SUCCEEDED");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
  });

  it("refuses online payment when no gateway is configured", async () => {
    delete process.env.PAYMENT_PROVIDER;
    policy.invalidatePaymentPolicyCache();
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expectCode(payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW }), "PROVIDER_UNAVAILABLE");
  });

  it("downgrades a club to paying at the desk when its gateway disappears", async () => {
    delete process.env.PAYMENT_PROVIDER;
    policy.invalidatePaymentPolicyCache();
    const effective = await policy.getPaymentPolicy(w.A.id);
    expect(effective.timing).toBe("AT_CLUB");
    expect(effective.depositPercent).toBe(0);
  });
});

/* ================================================================== Refunds */

describe("refunds", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
    fake.reset();
  });

  it("gives money back and leaves both records standing", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    const after = await refunds.refundInvoice(w.manager.actor, inv.id, { reason: "Court flooded" }, { now: NOW });

    expect(after.status).toBe("REFUNDED");
    expect(after.refundedCents).toBe(inv.totalCents);
    // The payment is still there: the books must show the money in and the money out.
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0].status).toBe("REFUNDED");
    expect(after.refunds[0].reason).toBe("Court flooded");
  });

  it("refunds part and marks the payment as partly refunded", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    const after = await refunds.refundInvoice(w.manager.actor, inv.id, { amountCents: 10000 }, { now: NOW });
    expect(after.payments[0].status).toBe("PARTIALLY_REFUNDED");
    expect(after.refundedCents).toBe(10000);
    expect(after.status).toBe("PART_PAID");
  });

  it("refuses to refund more than was paid, or to refund nothing", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expectCode(refunds.refundInvoice(w.manager.actor, inv.id, {}, { now: NOW }), "REFUND_NOT_ALLOWED");
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH", amountCents: 10000 }, { now: NOW });
    await expectCode(refunds.refundInvoice(w.manager.actor, inv.id, { amountCents: 20000 }, { now: NOW }), "VALIDATION");
  });

  it("sends a refund to credit when the club asks for that, and the ledger agrees", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await refunds.refundInvoice(w.manager.actor, inv.id, { destination: "CREDIT", reason: "Rained off" }, { now: NOW });
    expect(await credits.creditBalance(w.p1.user.id)).toBe(inv.totalCents);
    const statement = await credits.getCreditStatement(w.p1.actor);
    expect(statement.entries[0].kind).toBe("REFUND");
  });

  it("is idempotent under the same key", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await refunds.refundInvoice(w.manager.actor, inv.id, { amountCents: 5000 }, { now: NOW, key: "once" });
    await refunds.refundInvoice(w.manager.actor, inv.id, { amountCents: 5000 }, { now: NOW, key: "once" });
    expect(await db.refund.count({ where: { invoiceId: inv.id } })).toBe(1);
  });

  it("will not let a receptionist decide a refund", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await expectCode(refunds.refundInvoice(w.reception.actor, inv.id, {}, { now: NOW }), "FORBIDDEN");
  });

  it("records a gateway refusal rather than pretending the money moved", async () => {
    registerPaymentProvider(fakeProvider);
    process.env.PAYMENT_PROVIDER = "fake";
    await db.paymentPolicy.create({ data: { locationId: null, timing: "BOTH" } });
    policy.invalidatePaymentPolicyCache();
    try {
      const b = await book(w);
      const inv = await invoiceFor(b.id);
      const handoff = await payments.startOnlinePayment(w.p1.actor, inv.id, {}, { now: NOW });
      const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: handoff.intentId } });
      const { rawBody: raw, headers } = signed({ eventId: "evt_ok", type: "payment.succeeded", outcome: "succeeded", intentRef: intent.providerRef });
      await payments.handleWebhook("fake", { rawBody: raw, headers, url: WEBHOOK_URL }, { now: NOW });

      fake.refundMode = "fail";
      await expectCode(refunds.refundInvoice(w.manager.actor, inv.id, {}, { now: NOW }), "REFUND_NOT_ALLOWED");
      const refund = await db.refund.findFirstOrThrow({ where: { invoiceId: inv.id } });
      expect(refund.status).toBe("FAILED");
      expect(refund.failureMessage).toBe("Refund window closed");
      // Nothing was given back, so the invoice is still settled.
      expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).refundedCents).toBe(0);
    } finally {
      unregisterPaymentProvider("fake");
      delete process.env.PAYMENT_PROVIDER;
      policy.invalidatePaymentPolicyCache();
    }
  });
});

/* ================================================================== Cancellation policy */

describe("cancellation policy", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
    policy.invalidatePaymentPolicyCache();
  });

  it("voids an unpaid booking and charges nothing", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await bookings.cancelBooking(w.p1.actor, b.id, {}, { now: NOW });
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("VOID");
    expect(after.paidCents).toBe(0);
  });

  it("refunds a paid booking cancelled in good time, in full", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await bookings.cancelBooking(w.p1.actor, b.id, {}, { now: NOW });
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.refundedCents).toBe(inv.totalCents);
  });

  it("keeps a late-cancellation fee and says so on the invoice", async () => {
    await db.paymentPolicy.create({ data: { locationId: w.A.id, lateCancellationPercent: 50 } });
    policy.invalidatePaymentPolicyCache();
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });

    // Six hours before the start, inside the twelve-hour cutoff. Staff cancel, because a player cannot.
    const late = new Date(b.startsAt.getTime() - 6 * 3_600_000);
    await bookings.cancelBooking(w.manager.actor, b.id, { reason: "Player called" }, { now: late });

    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: true } });
    const fee = after.lines.find((l) => l.kind === "FEE");
    expect(fee?.amountCents).toBe(Math.round(inv.totalCents * 0.5));
    // The court line stays, with a line beside it saying it was not used, so the receipt still explains
    // what was booked and what was kept.
    expect(after.lines.find((l) => l.kind === "COURT")?.amountCents).toBe(inv.totalCents);
    expect(after.totalCents).toBe(Math.round(inv.totalCents * 0.5));
    expect(after.refundedCents).toBe(inv.totalCents - Math.round(inv.totalCents * 0.5));
    expect(after.status).toBe("PAID");
  });

  it("never charges a player when the club is the one cancelling", async () => {
    await db.paymentPolicy.create({ data: { locationId: w.A.id, lateCancellationPercent: 100 } });
    policy.invalidatePaymentPolicyCache();
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    const late = new Date(b.startsAt.getTime() - 1 * 3_600_000);
    await bookings.cancelBooking(w.manager.actor, b.id, { reason: "Court damaged", waiveFee: true }, { now: late });
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: true } });
    expect(after.lines.some((l) => l.kind === "FEE")).toBe(false);
    expect(after.refundedCents).toBe(inv.totalCents);
  });

  it("works out the charge from the policy without touching the database", () => {
    const base = { ...policy.POLICY_DEFAULTS, lateCancellationPercent: 30, noShowPercent: 100, refundCutoffHours: 2 };
    expect(policy.cancellationCharge({ policy: base, totalCents: 10000, hoursBeforeStart: 48, cancellationCutoffHours: 12 })).toMatchObject({ chargeCents: 0, refundCents: 10000 });
    expect(policy.cancellationCharge({ policy: base, totalCents: 10000, hoursBeforeStart: 6, cancellationCutoffHours: 12 })).toMatchObject({ chargeCents: 3000, refundCents: 7000 });
    expect(policy.cancellationCharge({ policy: base, totalCents: 10000, hoursBeforeStart: 1, cancellationCutoffHours: 12 })).toMatchObject({ chargeCents: 10000, refundCents: 0 });
    expect(policy.cancellationCharge({ policy: base, totalCents: 10000, hoursBeforeStart: 0, cancellationCutoffHours: 12, noShow: true })).toMatchObject({ chargeCents: 10000 });
  });
});

/* ================================================================== Coupons */

describe("coupons", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  const makeCoupon = (input: Record<string, unknown>) => coupons.createCoupon(w.owner.actor, { code: "SAVE20", name: "Twenty off", kind: "PERCENT", value: 20, ...input });

  it("takes a percentage off as a line, leaving the original price visible", async () => {
    await makeCoupon({});
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    const result = await coupons.applyCoupon(w.p1.actor, inv.id, "save20", { now: NOW });
    expect(result.discountCents).toBe(Math.round(inv.totalCents * 0.2));
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: true } });
    expect(after.lines.find((l) => l.kind === "COURT")?.amountCents).toBe(40000);
    expect(after.discountCents).toBe(result.discountCents);
    expect(after.totalCents).toBe(inv.totalCents - result.discountCents);
  });

  it("refuses a second code on the same invoice", async () => {
    await makeCoupon({});
    await coupons.createCoupon(w.owner.actor, { code: "SAVE10", name: "Ten off", kind: "PERCENT", value: 10 });
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await coupons.applyCoupon(w.p1.actor, inv.id, "SAVE20", { now: NOW });
    await expectCode(coupons.applyCoupon(w.p1.actor, inv.id, "SAVE10", { now: NOW }), "COUPON_INVALID");
  });

  it("enforces expiry, minimum spend and the per-player limit", async () => {
    await makeCoupon({ validTo: new Date("2026-01-01") });
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expectCode(coupons.applyCoupon(w.p1.actor, inv.id, "SAVE20", { now: NOW }), "COUPON_INVALID");

    await coupons.createCoupon(w.owner.actor, { code: "BIG", name: "Big spend", kind: "FIXED", value: 5000, minSpendCents: 999999 });
    await expectCode(coupons.applyCoupon(w.p1.actor, inv.id, "BIG", { now: NOW }), "COUPON_INVALID");

    await coupons.createCoupon(w.owner.actor, { code: "ONCE", name: "One use", kind: "FIXED", value: 1000, maxPerPlayer: 1 });
    await coupons.applyCoupon(w.p1.actor, inv.id, "ONCE", { now: NOW });
    const b2 = await book(w, w.p1, 12 * 60);
    const inv2 = await invoiceFor(b2.id);
    await expectCode(coupons.applyCoupon(w.p1.actor, inv2.id, "ONCE", { now: NOW }), "COUPON_INVALID");
  });

  it("stops at the total redemption limit", async () => {
    await coupons.createCoupon(w.owner.actor, { code: "LIMITED", name: "Two only", kind: "FIXED", value: 1000, maxRedemptions: 2, maxPerPlayer: 5 });
    const made = await Promise.all([book(w, w.p1, 10 * 60), book(w, w.p1, 12 * 60), book(w, w.p1, 14 * 60)]);
    const invs = await Promise.all(made.map((b) => invoiceFor(b.id)));
    await coupons.applyCoupon(w.p1.actor, invs[0].id, "LIMITED", { now: NOW });
    await coupons.applyCoupon(w.p1.actor, invs[1].id, "LIMITED", { now: NOW });
    await expectCode(coupons.applyCoupon(w.p1.actor, invs[2].id, "LIMITED", { now: NOW }), "COUPON_INVALID");
  });

  it("only discounts what it applies to", async () => {
    await coupons.createCoupon(w.owner.actor, { code: "LESSONS", name: "Lessons only", kind: "PERCENT", value: 50, appliesTo: ["LESSON"] });
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await expectCode(coupons.applyCoupon(w.p1.actor, inv.id, "LESSONS", { now: NOW }), "COUPON_INVALID");
  });

  it("refuses a code on something already paid, and lets an unpaid one be removed", async () => {
    await makeCoupon({});
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await coupons.applyCoupon(w.p1.actor, inv.id, "SAVE20", { now: NOW });
    const removed = await coupons.removeCoupon(w.p1.actor, inv.id, { now: NOW });
    expect(removed.totalCents).toBe(inv.totalCents);
    expect((await db.coupon.findFirstOrThrow({ where: { code: "SAVE20" } })).redeemedCount).toBe(0);

    await coupons.applyCoupon(w.p1.actor, inv.id, "SAVE20", { now: NOW });
    const discounted = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await expectCode(coupons.removeCoupon(w.p1.actor, inv.id, { now: NOW }), "COUPON_INVALID");
    expect(discounted.totalCents).toBeLessThan(inv.totalCents);
  });

  it("refuses a percentage over 100 and a backwards date range", async () => {
    await expectCode(coupons.createCoupon(w.owner.actor, { code: "TOOMUCH", name: "No", kind: "PERCENT", value: 150 }), "VALIDATION");
    await expectCode(coupons.createCoupon(w.owner.actor, { code: "BACKWARDS", name: "No", kind: "FIXED", value: 100, validFrom: new Date("2026-06-01"), validTo: new Date("2026-01-01") }), "VALIDATION");
  });
});

/* ================================================================== Memberships */

describe("memberships", () => {
  let w: World;
  let planId: string;
  beforeEach(async () => {
    w = await world();
    const plan = await memberships.upsertPlan(w.owner.actor, null, { key: "PRO", name: "Pro", priceCents: 120000, period: "MONTHLY", periodCreditCents: 20000, priorityBookingDays: 7, benefits: ["Member rates"] });
    planId = plan.id;
  });

  it("is pending until it is paid for, then live with its credit granted", async () => {
    const m = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    expect(m.status).toBe("PENDING");
    expect(await memberships.memberTier(w.p1.user.id, { now: NOW })).toMatchObject({ isMember: false });

    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: m.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });

    const after = await memberships.getMembership(w.p1.actor, m.id);
    expect(after.status).toBe("ACTIVE");
    expect(await credits.creditBalance(w.p1.user.id)).toBe(20000);
    expect(await memberships.memberTier(w.p1.user.id, { now: NOW })).toMatchObject({ isMember: true, tier: "PRO", priorityBookingDays: 7 });
  });

  it("prices a member's booking through the membership rule", async () => {
    await db.pricingRule.create({ data: { locationId: w.A.id, name: "Member rate", kind: "MEMBERSHIP_DISCOUNT", adjustmentPercent: -20, membershipTier: "PRO" } });
    const before = await bookings.quoteBooking(w.p1.actor, { courtId: w.c1.id, dateISO: DAY, startMinutes: 10 * 60, durationMinutes: 60 }, { now: NOW });
    expect(before.quote.totalCents).toBe(40000);

    const m = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: m.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });

    const after = await bookings.quoteBooking(w.p1.actor, { courtId: w.c1.id, dateISO: DAY, startMinutes: 10 * 60, durationMinutes: 60 }, { now: NOW });
    expect(after.quote.totalCents).toBe(32000);
    expect(after.quote.adjustments.some((x) => x.kind === "MEMBERSHIP_DISCOUNT")).toBe(true);
  });

  it("grants its credit once, however often activation is retried", async () => {
    const m = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: m.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await memberships.activateMembership(m.id, { now: NOW });
    await memberships.activateMembership(m.id, { now: NOW });
    expect(await credits.creditBalance(w.p1.user.id)).toBe(20000);
  });

  it("refuses a second term while one is waiting to be paid for", async () => {
    await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    await expectCode(memberships.buyMembership(w.p1.actor, { planId }, { now: NOW }), "CONFLICT");
  });

  it("renews from the end of the current term, so paying early costs no days", async () => {
    const first = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: first.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });

    const second = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    expect(second.startsOn.getTime()).toBe(first.endsOn.getTime() + 86_400_000);
  });

  it("refunds the unused part when a term is ended early", async () => {
    const m = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: m.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });

    // One day into a thirty-day term.
    const next = new Date(NOW.getTime() + 86_400_000);
    await memberships.cancelMembership(w.p1.actor, m.id, { immediate: true }, { now: next });
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.refundedCents).toBeGreaterThan(100000);
    expect(after.refundedCents).toBeLessThan(120000);
    expect((await memberships.getMembership(w.owner.actor, m.id)).status).toBe("CANCELLED");
  });

  it("leaves a term running when cancellation is not immediate", async () => {
    const m = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: m.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await memberships.cancelMembership(w.p1.actor, m.id, {}, { now: NOW });
    const after = await memberships.getMembership(w.p1.actor, m.id);
    expect(after.status).toBe("ACTIVE");
    expect(after.autoRenew).toBe(false);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).refundedCents).toBe(0);
  });

  it("expires terms past their end date and renews the ones set to renew", async () => {
    const m = await memberships.buyMembership(w.p1.actor, { planId, autoRenew: true }, { now: NOW });
    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: m.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });

    const later = new Date(NOW.getTime() + 60 * 86_400_000);
    const swept = await memberships.sweepMemberships({ now: later });
    expect(swept.expired).toBe(1);
    expect(swept.renewed).toBe(1);
    expect((await memberships.getMembership(w.owner.actor, m.id)).status).toBe("EXPIRED");
    expect(await db.membership.count({ where: { playerId: w.p1.user.id, status: "PENDING" } })).toBe(1);
  });

  it("is not a member once the term has ended", async () => {
    const m = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    const inv = await db.invoice.findFirstOrThrow({ where: { membershipId: m.id } });
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    const later = new Date(NOW.getTime() + 60 * 86_400_000);
    expect(await memberships.memberTier(w.p1.user.id, { now: later })).toMatchObject({ isMember: false });
  });

  it("keeps a player out of someone else's membership", async () => {
    const m = await memberships.buyMembership(w.p1.actor, { planId }, { now: NOW });
    await expectCode(memberships.getMembership(w.p2.actor, m.id), "FORBIDDEN");
    await expectCode(memberships.buyMembership(w.p1.actor, { planId, playerId: w.p2.user.id }, { now: NOW }), "FORBIDDEN");
  });
});

/* ================================================================== The dashboard */

describe("finance reporting", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("reports invoiced, collected, refunded and outstanding as different numbers", async () => {
    const paid = await book(w, w.p1, 10 * 60);
    const owed = await book(w, w.p2, 12 * 60);
    const refundedBooking = await book(w, w.p1, 14 * 60);

    const paidInv = await invoiceFor(paid.id);
    const refundedInv = await invoiceFor(refundedBooking.id);
    await payments.takePayment(w.reception.actor, paidInv.id, { method: "CASH" }, { now: NOW });
    await payments.takePayment(w.reception.actor, refundedInv.id, { method: "CARD" }, { now: NOW });
    await refunds.refundInvoice(w.manager.actor, refundedInv.id, { amountCents: 10000 }, { now: NOW });

    const report = await finance.getFinanceReport(w.owner.actor, { weeks: 4 }, { now: NOW });
    expect(report.totals.invoicedCents).toBe(paidInv.totalCents * 3);
    expect(report.totals.collectedCents).toBe(paidInv.totalCents * 2);
    expect(report.totals.refundedCents).toBe(10000);
    expect(report.totals.netCents).toBe(paidInv.totalCents * 2 - 10000);
    expect(report.totals.outstandingCents).toBe((await invoiceFor(owed.id)).totalCents + 10000);
    expect(report.outstanding.some((o) => o.who === "Player Two")).toBe(true);
    expect(report.byMethod.map((m) => m.method).sort()).toEqual(["CARD", "CASH"]);
  });

  it("scopes a manager to their own club", async () => {
    const B = await makeLocation("beta");
    const managerB = await makeUser({ staff: [{ locationId: B.id, role: "LOCATION_MANAGER" }] });
    const b = await book(w);
    await payments.takePayment(w.reception.actor, (await invoiceFor(b.id)).id, { method: "CASH" }, { now: NOW });

    const theirs = await finance.getFinanceReport(w.manager.actor, {}, { now: NOW });
    expect(theirs.totals.collectedCents).toBeGreaterThan(0);
    const other = await finance.getFinanceReport(managerB.actor, {}, { now: NOW });
    expect(other.totals.collectedCents).toBe(0);
  });

  it("will not show a player the books", async () => {
    await expectCode(finance.getFinanceReport(w.p1.actor, {}, { now: NOW }), "FORBIDDEN");
    await expectCode(invoices.listInvoices(w.p1.actor, {}), "FORBIDDEN");
  });

  it("lists a movement history for one invoice", async () => {
    const b = await book(w);
    const inv = await invoiceFor(b.id);
    await payments.takePayment(w.reception.actor, inv.id, { method: "CASH" }, { now: NOW });
    await refunds.refundInvoice(w.manager.actor, inv.id, { amountCents: 5000 }, { now: new Date(NOW.getTime() + 60_000) });
    const ledger = await finance.invoiceLedger(w.manager.actor, inv.id);
    expect(ledger.map((r) => r.kind)).toEqual(["Invoice", "Payment", "Refund"]);
    expect(ledger[2].amountCents).toBe(-5000);
    expect(ledger[1].by).toBe("Rana Reception");
  });
});
