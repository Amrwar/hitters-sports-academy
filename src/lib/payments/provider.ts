/**
 * The payment provider abstraction.
 *
 * HITTERS has not committed to a gateway. Egypt's realistic options (Paymob, Fawry, Kashier, Geidea, Tap)
 * differ in their APIs but agree on the shape of the problem: you create an attempt, you send the player
 * somewhere, and some time later the provider tells your server what happened. Everything above this file
 * is written against that shape, so adding a gateway means writing one adapter and nothing else.
 *
 * Three rules this file exists to enforce:
 *
 * 1. **The browser is never believed.** `createIntent` returns somewhere to send the player and nothing
 *    more. An intent reaches SUCCEEDED only through `parseEvent` on a signature-verified webhook, or
 *    through `fetchIntent`, which asks the provider's API directly. A page that says "payment complete"
 *    is a claim, not a fact.
 * 2. **Nothing here ever sees a card.** An adapter may hold API keys and handles; a PAN, a CVV or an
 *    expiry date must never be passed to, stored by, or logged from any of these functions. Every
 *    supported provider collects the instrument on its own page or in its own iframe, which is also what
 *    keeps the academy out of PCI scope.
 * 3. **Every call carries an idempotency key.** Networks retry, players double-tap, and webhooks arrive
 *    twice. The key is generated once per attempt, sent to the provider, and stored on the row, so the
 *    second call resolves to the first attempt instead of taking the money again.
 */
import type { PaymentIntentStatus, RefundStatus } from "@prisma/client";

/** Short, stable identifier stored in `Payment.provider`. Lower case, no spaces. */
export type ProviderKey = string;

export type IntentRequest = {
  /** The invoice being collected. Used for reconciliation on the provider's side. */
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  /** Generated once per attempt and replayed on every retry of the same attempt. */
  idempotencyKey: string;
  /** Where the provider returns the player. The outcome it reports there is never trusted. */
  returnUrl?: string;
  description: string;
  /** Only what a provider needs to raise a receipt. Never a card, never a password. */
  customer: { id?: string; name?: string; email?: string; phone?: string };
};

export type IntentResult = {
  providerRef: string;
  /** An adapter may return SUCCEEDED only when the provider's API has confirmed it server-side. */
  status: PaymentIntentStatus;
  checkoutUrl?: string;
  expiresAt?: Date;
  failureCode?: string;
  failureMessage?: string;
  /** Provider handles only: order ids, hosted-page tokens. Never instrument data. */
  metadata?: Record<string, unknown>;
};

export type RefundRequest = {
  /** The provider's reference for the original payment. */
  paymentRef: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  reason?: string;
};

export type RefundResult = {
  providerRef: string;
  status: RefundStatus;
  failureMessage?: string;
};

/** What an adapter makes of one inbound callback. `ignored` covers the events we do not act on. */
export type ProviderEvent = {
  /** The provider's own id for this event, used to make processing idempotent. */
  eventId: string;
  type: string;
  outcome: "succeeded" | "failed" | "cancelled" | "expired" | "refunded" | "ignored";
  /** The intent this event is about, as the provider refers to it. */
  intentRef?: string;
  refundRef?: string;
  amountCents?: number;
  currency?: string;
  failureCode?: string;
  failureMessage?: string;
};

/**
 * One inbound callback, as it arrived.
 *
 * The URL is part of it because not every gateway puts its signature in a header: Paymob passes an HMAC
 * as a query parameter. The raw body is the exact bytes received, never a re-serialised object, because
 * every signature scheme signs the bytes.
 */
export type WebhookRequest = { rawBody: string; headers: Headers; url: URL };

export interface PaymentProvider {
  readonly key: ProviderKey;
  readonly label: string;
  /** Currencies the adapter is configured for. The service refuses anything else rather than guessing. */
  readonly currencies: readonly string[];
  /** False when the adapter collects nothing online, as with paying at the desk. */
  readonly online: boolean;

  createIntent(req: IntentRequest): Promise<IntentResult>;
  /** Asks the provider what actually happened. The fallback when a webhook is late, lost or replayed. */
  fetchIntent(providerRef: string): Promise<IntentResult>;
  refund(req: RefundRequest): Promise<RefundResult>;
  /** Verifies the signature over exactly what arrived, before the body is parsed or trusted. */
  verifyWebhook(req: WebhookRequest): boolean;
  /** Only called once `verifyWebhook` has passed. */
  parseEvent(req: WebhookRequest): ProviderEvent;
}

/**
 * Taking the money at the club.
 *
 * Not a gateway: it exists so that every Payment row names how it was collected, and so the rest of the
 * system has one code path whether or not a gateway is ever connected. Asking it for an online checkout
 * is a programming error, not a runtime condition, so it throws.
 */
export const manualProvider: PaymentProvider = {
  key: "manual",
  label: "At the club",
  currencies: ["EGP"],
  online: false,
  async createIntent() {
    throw new Error("The manual provider collects nothing online; record the payment at the desk instead.");
  },
  async fetchIntent() {
    throw new Error("The manual provider has no intents to fetch.");
  },
  async refund(req) {
    // A desk refund is handed over in person. The record is the truth; there is no third party to call.
    return { providerRef: `manual:${req.idempotencyKey}`, status: "SUCCEEDED" };
  },
  verifyWebhook() {
    return false;
  },
  parseEvent() {
    throw new Error("The manual provider receives no webhooks.");
  },
};

const registry = new Map<ProviderKey, PaymentProvider>([[manualProvider.key, manualProvider]]);

/** Adapters register themselves at import time. Re-registering a key replaces it, which tests rely on. */
export function registerPaymentProvider(provider: PaymentProvider): void {
  registry.set(provider.key, provider);
}

export function unregisterPaymentProvider(key: ProviderKey): void {
  if (key !== manualProvider.key) registry.delete(key);
}

export function getPaymentProvider(key: ProviderKey): PaymentProvider | null {
  return registry.get(key) ?? null;
}

export function listPaymentProviders(): PaymentProvider[] {
  return [...registry.values()];
}

/**
 * The gateway this deployment uses, named by `PAYMENT_PROVIDER`.
 *
 * Deliberately returns null rather than falling back to something: a club whose gateway is misconfigured
 * must be told that online payment is unavailable, not quietly switched to a different one.
 */
export function onlineProvider(): PaymentProvider | null {
  const key = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (!key || key === manualProvider.key) return null;
  const provider = registry.get(key);
  return provider?.online ? provider : null;
}

/** True when this deployment can take money online at all. Screens use it to hide what cannot work. */
export const onlinePaymentsConfigured = (): boolean => onlineProvider() !== null;
