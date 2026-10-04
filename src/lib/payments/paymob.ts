/**
 * Paymob adapter.
 *
 * Paymob is Egypt's most developer-documented gateway and the one with an explicit split-payments
 * product, which matters here because dividing a game's cost between four players is a HITTERS feature
 * rather than an afterthought.
 *
 * The flow this implements is the current Unified Intention API:
 *
 *   1. `POST {base}/v1/intention/` with `Authorization: Token <secret key>` creates an intention and
 *      returns a `client_secret` and an `intention_order_id`.
 *   2. The player is sent to `{base}/unifiedcheckout/?publicKey=<public key>&clientSecret=<secret>`.
 *   3. Paymob calls `notification_url` with the transaction callback. That call, and only that call,
 *      settles the invoice.
 *
 * Two things about Paymob's webhooks are unlike most gateways and are the reason this file exists rather
 * than a generic HMAC helper:
 *
 * - **The signature is not over the raw body, and it is not in a header.** Paymob computes HMAC-SHA512
 *   over a specific ordered concatenation of twenty named fields and passes it as a `?hmac=` query
 *   parameter. Re-serialising the body or looking in the headers both fail.
 * - **There is no event id.** The transaction id is unique per transaction, including the separate
 *   transaction a refund creates, so it serves as one.
 *
 * Refunds still use the older Accept endpoint, which authenticates with a token obtained from the API
 * key rather than with the secret key, so this adapter holds both credentials.
 *
 * Configuration (all required before the adapter will register itself):
 *   PAYMENT_PROVIDER=paymob
 *   PAYMOB_SECRET_KEY        secret key, for creating intentions
 *   PAYMOB_PUBLIC_KEY        public key, for the checkout URL
 *   PAYMOB_API_KEY           API key, exchanged for the auth token refunds need
 *   PAYMOB_HMAC_SECRET       HMAC secret, for verifying callbacks
 *   PAYMOB_INTEGRATION_IDS   comma-separated integration ids (card, wallet, …)
 *   PAYMOB_BASE_URL          optional; defaults to Egypt. Other markets have their own hosts.
 *
 * Not yet exercised against a live merchant account. Run the sandbox end to end before switching a club
 * to ONLINE: the shapes here follow Paymob's documentation, and a gateway's documentation and a
 * gateway's behaviour are not always the same thing.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { registerPaymentProvider, type IntentRequest, type IntentResult, type PaymentProvider, type ProviderEvent, type RefundRequest, type RefundResult, type WebhookRequest } from "./provider";

const DEFAULT_BASE = "https://accept.paymob.com";

/**
 * The exact fields Paymob concatenates, in the exact order, to produce the transaction HMAC.
 *
 * Not alphabetical, despite looking close to it — `obj.id` sits between `has_parent_transaction` and
 * `integration_id`. Taken verbatim from their documentation; reordering a single entry silently makes
 * every callback fail verification.
 */
const HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

type Json = Record<string, unknown>;

const cfg = () => ({
  base: (process.env.PAYMOB_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, ""),
  secretKey: process.env.PAYMOB_SECRET_KEY ?? "",
  publicKey: process.env.PAYMOB_PUBLIC_KEY ?? "",
  apiKey: process.env.PAYMOB_API_KEY ?? "",
  hmacSecret: process.env.PAYMOB_HMAC_SECRET ?? "",
  integrationIds: (process.env.PAYMOB_INTEGRATION_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s)),
});

/** Reads a dotted path out of the callback object, which is how Paymob names its HMAC fields. */
function at(obj: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Json)[key] : undefined), obj);
}

/**
 * Paymob's own string form, which is what the HMAC is computed over.
 *
 * Booleans are lower case, null and undefined are the empty string. Guessing differently here produces
 * a signature that never matches and a club whose payments all look forged.
 */
function hmacValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function computeHmac(obj: Json, secret: string): string {
  const concatenated = HMAC_FIELDS.map((field) => hmacValue(at(obj, field))).join("");
  return createHmac("sha512", secret).update(concatenated, "utf8").digest("hex");
}

/** Constant-time compare, so a wrong signature cannot be found a byte at a time. */
function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

async function post(url: string, body: Json, headers: Record<string, string> = {}): Promise<Json> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    // A gateway that has not answered in fifteen seconds is not going to; failing fast leaves a FAILED
    // intent the player can retry rather than a request hanging until the platform kills it.
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: Json = {};
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) throw new Error(`Paymob ${res.status}: ${typeof json.message === "string" ? json.message : text.slice(0, 200)}`);
  return json;
}

/** The older Accept endpoints authenticate with a token exchanged for the API key, not the secret key. */
async function authToken(): Promise<string> {
  const { base, apiKey } = cfg();
  const json = await post(`${base}/api/auth/tokens`, { api_key: apiKey });
  const token = json.token;
  if (typeof token !== "string") throw new Error("Paymob did not return an auth token.");
  return token;
}

export const paymobProvider: PaymentProvider = {
  key: "paymob",
  label: "Paymob",
  currencies: ["EGP"],
  online: true,

  async createIntent(req: IntentRequest): Promise<IntentResult> {
    const { base, secretKey, publicKey, integrationIds } = cfg();
    const json = await post(
      `${base}/v1/intention/`,
      {
        amount: req.amountCents,
        currency: req.currency,
        payment_methods: integrationIds,
        items: [{ name: req.description.slice(0, 50), amount: req.amountCents, quantity: 1 }],
        // Paymob requires a phone number; the rest it treats as optional. Nothing sensitive goes here.
        billing_data: {
          first_name: (req.customer.name ?? "HITTERS").split(" ")[0]?.slice(0, 40) || "HITTERS",
          last_name: (req.customer.name ?? "Member").split(" ").slice(1).join(" ").slice(0, 40) || "Member",
          email: req.customer.email ?? "noreply@hitters.academy",
          phone_number: req.customer.phone ?? "+200000000000",
        },
        // Our own reference, echoed back on the callback, so a transaction can be tied to an invoice by
        // hand if it ever has to be.
        special_reference: `${req.invoiceNumber}-${req.idempotencyKey.slice(-12)}`,
        notification_url: process.env.APP_URL ? `${process.env.APP_URL.replace(/\/+$/, "")}/api/payments/webhook/paymob` : undefined,
        redirection_url: req.returnUrl,
        extras: { invoice: req.invoiceNumber },
      },
      { authorization: `Token ${secretKey}` },
    );

    const clientSecret = typeof json.client_secret === "string" ? json.client_secret : null;
    const orderId = json.intention_order_id ?? (json.intention_detail as Json | undefined)?.order_id;
    if (!clientSecret || orderId === undefined || orderId === null) throw new Error("Paymob did not return a client secret and order id.");

    return {
      // The order id is what comes back on the callback as obj.order.id, so that is what we correlate on.
      providerRef: String(orderId),
      status: "REQUIRES_ACTION",
      checkoutUrl: `${base}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(clientSecret)}`,
      // Intention ids and our own reference only. No instrument data is stored here, ever.
      metadata: { intentionId: json.id, specialReference: json.special_reference },
    };
  },

  /**
   * Asks Paymob what happened to an order, for when a callback never arrived.
   *
   * An inquiry that cannot be completed returns PROCESSING, never SUCCEEDED: a reconciliation that
   * cannot confirm a payment must leave it open, not guess in the club's favour.
   */
  async fetchIntent(providerRef: string): Promise<IntentResult> {
    const { base } = cfg();
    try {
      const token = await authToken();
      const json = await post(`${base}/api/ecommerce/orders/transaction_inquiry`, { auth_token: token, order_id: Number(providerRef) });
      const success = json.success === true;
      const pending = json.pending === true;
      if (success && !pending) return { providerRef, status: "SUCCEEDED" };
      if (pending) return { providerRef, status: "PROCESSING" };
      return { providerRef, status: "FAILED", failureMessage: typeof json.data === "object" && json.data ? String((json.data as Json).message ?? "Declined") : "Declined" };
    } catch (e) {
      return { providerRef, status: "PROCESSING", failureMessage: e instanceof Error ? e.message : "Could not reach Paymob." };
    }
  },

  async refund(req: RefundRequest): Promise<RefundResult> {
    const { base } = cfg();
    try {
      const token = await authToken();
      // The refund takes the transaction id, not the order id, which is why the payment stores it.
      const json = await post(`${base}/api/acceptance/void_refund/refund`, { auth_token: token, transaction_id: Number(req.paymentRef), amount_cents: req.amountCents });
      const ok = json.success === true || json.pending === true;
      return ok
        ? { providerRef: String(json.id ?? req.idempotencyKey), status: "SUCCEEDED" }
        : { providerRef: String(json.id ?? ""), status: "FAILED", failureMessage: String(json.message ?? "Paymob refused the refund.") };
    } catch (e) {
      return { providerRef: "", status: "FAILED", failureMessage: e instanceof Error ? e.message : "Could not reach Paymob." };
    }
  },

  verifyWebhook(req: WebhookRequest): boolean {
    const { hmacSecret } = cfg();
    if (!hmacSecret) return false;
    const given = req.url.searchParams.get("hmac");
    if (!given) return false;
    try {
      const body = JSON.parse(req.rawBody) as Json;
      const obj = body.obj;
      if (!obj || typeof obj !== "object") return false;
      return sameSignature(computeHmac(obj as Json, hmacSecret), given.toLowerCase());
    } catch {
      return false;
    }
  },

  parseEvent(req: WebhookRequest): ProviderEvent {
    const body = JSON.parse(req.rawBody) as Json;
    const obj = (body.obj ?? {}) as Json;
    const type = String(body.type ?? "TRANSACTION");
    const transactionId = String(obj.id ?? "");
    const orderId = String((obj.order as Json | undefined)?.id ?? "");
    const success = obj.success === true;
    const pending = obj.pending === true;
    const refunded = obj.is_refunded === true;
    const voided = obj.is_voided === true;

    // Paymob has no event id of its own; a transaction id is unique, including for the separate
    // transaction a refund creates, so it stands in for one.
    const eventId = `${type}:${transactionId}`;

    if (type !== "TRANSACTION") return { eventId, type, outcome: "ignored" };
    if (refunded || voided) return { eventId, type, outcome: "refunded", intentRef: orderId, refundRef: transactionId, amountCents: Number(obj.amount_cents ?? 0) };
    if (pending) return { eventId, type, outcome: "ignored", intentRef: orderId };
    if (!success) {
      const data = (obj.data ?? {}) as Json;
      return {
        eventId,
        type,
        outcome: "failed",
        intentRef: orderId,
        failureCode: data.txn_response_code === undefined ? undefined : String(data.txn_response_code),
        failureMessage: typeof data.message === "string" ? data.message : "The payment was declined.",
      };
    }
    return {
      eventId,
      type,
      outcome: "succeeded",
      intentRef: orderId,
      // The transaction id, which is what a refund will need later.
      refundRef: transactionId,
      amountCents: Number(obj.amount_cents ?? 0),
      currency: String(obj.currency ?? "EGP"),
    };
  },
};

/**
 * Registers the adapter only when it is fully configured.
 *
 * A half-configured gateway is worse than none: the finance screen would report it as connected and the
 * first player to tap Pay would meet an error. Missing credentials mean the club stays on pay-at-club,
 * which works.
 */
export function registerPaymob(): boolean {
  const c = cfg();
  const ready = !!(c.secretKey && c.publicKey && c.apiKey && c.hmacSecret && c.integrationIds.length > 0);
  if (ready) registerPaymentProvider(paymobProvider);
  return ready;
}
