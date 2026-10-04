import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paymobProvider } from "@/lib/payments/paymob";
import { registerPaymob } from "@/lib/payments/paymob";
import { getPaymentProvider, unregisterPaymentProvider, type WebhookRequest } from "@/lib/payments/provider";

/**
 * The adapter's two unforgiving parts.
 *
 * Creating an intention and issuing a refund are HTTP calls that only a sandbox can really prove. The
 * HMAC and the event parsing are pure, and they are where a mistake is silent: a field in the wrong
 * order makes every genuine callback look forged, and a mis-parsed outcome marks a declined card as
 * paid. Those are tested here against Paymob's documented field order.
 */

const SECRET = "hmac-secret-for-tests";

/** A transaction callback shaped the way Paymob sends one. */
const callback = (over: Record<string, unknown> = {}) => ({
  type: "TRANSACTION",
  obj: {
    id: 1234567,
    amount_cents: 60000,
    created_at: "2026-10-05T12:00:00.000000",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 998877,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 55443322 },
    owner: 4455,
    pending: false,
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
    success: true,
    data: {},
    ...over,
  },
});

/**
 * Paymob's own recipe, written out independently of the adapter: HMAC-SHA512 over twenty named values
 * concatenated in a fixed order with no separator. If the adapter and this disagree, one of them is
 * wrong, which is the point of not sharing the implementation.
 */
function expectedHmac(obj: Record<string, unknown>): string {
  const o = obj as Record<string, never> & { order: { id: unknown }; source_data: { pan: unknown; sub_type: unknown; type: unknown } };
  const value = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "true" : "false") : String(v));
  const concatenated = [
    o.amount_cents,
    o.created_at,
    o.currency,
    o.error_occured,
    o.has_parent_transaction,
    o.id,
    o.integration_id,
    o.is_3d_secure,
    o.is_auth,
    o.is_capture,
    o.is_refunded,
    o.is_standalone_payment,
    o.is_voided,
    o.order.id,
    o.owner,
    o.pending,
    o.source_data.pan,
    o.source_data.sub_type,
    o.source_data.type,
    o.success,
  ]
    .map(value)
    .join("");
  return createHmac("sha512", SECRET).update(concatenated, "utf8").digest("hex");
}

const request = (body: unknown, hmac?: string): WebhookRequest => {
  const rawBody = JSON.stringify(body);
  const url = new URL("https://hitters.test/api/payments/webhook/paymob");
  if (hmac) url.searchParams.set("hmac", hmac);
  return { rawBody, headers: new Headers(), url };
};

describe("paymob webhook verification", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    process.env.PAYMOB_HMAC_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  it("accepts a callback signed the way Paymob signs one", () => {
    const body = callback();
    expect(paymobProvider.verifyWebhook(request(body, expectedHmac(body.obj)))).toBe(true);
  });

  it("is case-insensitive about the hex, as providers vary", () => {
    const body = callback();
    expect(paymobProvider.verifyWebhook(request(body, expectedHmac(body.obj).toUpperCase()))).toBe(true);
  });

  it("refuses a callback with no signature at all", () => {
    expect(paymobProvider.verifyWebhook(request(callback()))).toBe(false);
  });

  it("refuses a signature computed over tampered fields", () => {
    const body = callback();
    const signature = expectedHmac(body.obj);
    // The classic attack: a real signature replayed over a body with the amount raised.
    const tampered = callback({ amount_cents: 1 });
    expect(paymobProvider.verifyWebhook(request(tampered, signature))).toBe(false);
  });

  it("refuses everything when no secret is configured, rather than waving it through", () => {
    delete process.env.PAYMOB_HMAC_SECRET;
    const body = callback();
    expect(paymobProvider.verifyWebhook(request(body, expectedHmac(body.obj)))).toBe(false);
  });

  it("refuses a body that is not a Paymob callback", () => {
    expect(paymobProvider.verifyWebhook(request({ hello: "world" }, "deadbeef"))).toBe(false);
    expect(paymobProvider.verifyWebhook({ rawBody: "not json", headers: new Headers(), url: new URL("https://x.test/?hmac=a") })).toBe(false);
  });
});

describe("paymob event parsing", () => {
  it("reads a successful payment, and correlates on the order id", () => {
    const event = paymobProvider.parseEvent(request(callback()));
    expect(event).toMatchObject({ outcome: "succeeded", intentRef: "55443322", refundRef: "1234567", amountCents: 60000, currency: "EGP" });
    // No event id of Paymob's own, so the transaction id stands in for one.
    expect(event.eventId).toBe("TRANSACTION:1234567");
  });

  it("reads a decline as a failure, with the reason", () => {
    const event = paymobProvider.parseEvent(request(callback({ success: false, data: { message: "Insufficient Funds", txn_response_code: "51" } })));
    expect(event).toMatchObject({ outcome: "failed", failureMessage: "Insufficient Funds", failureCode: "51" });
  });

  it("does not settle anything on a pending transaction", () => {
    const event = paymobProvider.parseEvent(request(callback({ pending: true })));
    expect(event.outcome).toBe("ignored");
  });

  it("reads a refund and a void as refunds, not as new payments", () => {
    expect(paymobProvider.parseEvent(request(callback({ is_refunded: true }))).outcome).toBe("refunded");
    expect(paymobProvider.parseEvent(request(callback({ is_voided: true }))).outcome).toBe("refunded");
  });

  it("ignores callbacks that are not transactions", () => {
    expect(paymobProvider.parseEvent(request({ type: "TOKEN", obj: { id: 9 } })).outcome).toBe("ignored");
  });

  it("gives a refund its own event id, so it is not mistaken for the payment", () => {
    const payment = paymobProvider.parseEvent(request(callback()));
    const refund = paymobProvider.parseEvent(request(callback({ id: 7654321, is_refunded: true })));
    expect(refund.eventId).not.toBe(payment.eventId);
  });
});

describe("paymob registration", () => {
  const previous = { ...process.env };
  afterEach(() => {
    process.env = { ...previous };
    unregisterPaymentProvider("paymob");
  });

  it("stays out of the registry until every credential is present", () => {
    for (const key of ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_API_KEY", "PAYMOB_HMAC_SECRET", "PAYMOB_INTEGRATION_IDS"]) delete process.env[key];
    expect(registerPaymob()).toBe(false);
    expect(getPaymentProvider("paymob")).toBeNull();

    // Half configured is still not configured: a club would be told it is connected and the first
    // player to tap Pay would meet an error.
    process.env.PAYMOB_SECRET_KEY = "sk";
    process.env.PAYMOB_PUBLIC_KEY = "pk";
    expect(registerPaymob()).toBe(false);
    expect(getPaymentProvider("paymob")).toBeNull();

    process.env.PAYMOB_API_KEY = "ak";
    process.env.PAYMOB_HMAC_SECRET = "hs";
    process.env.PAYMOB_INTEGRATION_IDS = "1,2";
    expect(registerPaymob()).toBe(true);
    expect(getPaymentProvider("paymob")?.key).toBe("paymob");
  });
});
