/**
 * Taking money.
 *
 * Four ways in, one record out:
 *
 * - `takePayment` — cash, card or transfer at the desk, recorded by staff.
 * - `payWithCredit` — settled from the player's academy credit balance.
 * - `startOnlinePayment` / `settleIntent` — a gateway, where the player leaves and a webhook comes back.
 * - `waive` — the balance is written off rather than collected. Still a Payment row, so the invoice
 *   closes and the books say who decided it.
 *
 * Three rules hold everywhere:
 *
 * 1. **The browser is never believed.** `startOnlinePayment` returns somewhere to send the player and
 *    nothing else. Only `settleIntent` — called from a verified webhook or a server-side status fetch —
 *    writes a PAID payment. A "success" page is a claim.
 * 2. **Every write is idempotent.** Each payment carries a unique key. A retried request, a double-tapped
 *    button and a webhook delivered three times all resolve to the same single row.
 * 3. **No card data, ever.** `provider` and `providerRef` are the only link to the gateway; the
 *    instrument stays with the provider, which is also what keeps the academy out of PCI scope.
 */
import { createHash, randomUUID } from "node:crypto";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { alreadyPaid, conflict, notFound, paymentFailed, providerUnavailable, validation } from "@/lib/errors";
import { requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { amountDue, depositFor } from "@/lib/payments/money";
import { getPaymentProvider, manualProvider, onlineProvider, type ProviderEvent } from "@/lib/payments/provider";
import { fieldErrors, startOnlinePaymentSchema, takePaymentSchema } from "@/lib/validation/schemas";
import { getPaymentPolicy } from "./payment-policy";
import { postCreditEntry } from "./credits";
import { recalculateInvoice, type InvoiceView } from "./invoices";
import { notify } from "./notifications";

/** Stable key for a payment that must happen at most once. Shape only matters to us. */
export const idempotencyKey = (scope: string, ...parts: (string | number)[]): string => `${scope}:${parts.join(":")}`;

type Settleable = {
  id: string;
  locationId: string | null;
  playerId: string | null;
  currency: string;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  voidedAt: Date | null;
  bookingId: string | null;
  lessonId: string | null;
  enrollmentId: string | null;
  purchaseId: string | null;
  membershipId: string | null;
};

const settleableSelect = {
  id: true,
  locationId: true,
  playerId: true,
  currency: true,
  totalCents: true,
  paidCents: true,
  refundedCents: true,
  voidedAt: true,
  bookingId: true,
  lessonId: true,
  enrollmentId: true,
  purchaseId: true,
  membershipId: true,
} satisfies Prisma.InvoiceSelect;

/** The entity columns a Payment copies from its invoice, so both views of the money agree. */
const subjectOf = (inv: Settleable) => ({
  bookingId: inv.bookingId,
  lessonId: inv.lessonId,
  enrollmentId: inv.enrollmentId,
  purchaseId: inv.purchaseId,
  membershipId: inv.membershipId,
});

/**
 * Writes one payment, or returns the one already written under this key.
 *
 * The idempotency check and the write are in the same transaction as the recalculation, so a second
 * caller either sees the first row or waits for it — never writes a duplicate.
 */
async function writePayment(
  tx: Prisma.TransactionClient,
  input: {
    invoice: Settleable;
    amountCents: number;
    method: PaymentMethod;
    status: "PAID" | "WAIVED";
    provider: string;
    providerRef?: string | null;
    intentId?: string | null;
    idempotencyKey: string;
    reference?: string | null;
    note?: string | null;
    receivedById?: string | null;
    now: Date;
  },
): Promise<{ id: string; duplicate: boolean }> {
  const existing = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } });
  if (existing) return { id: existing.id, duplicate: true };

  const payment = await tx.payment.create({
    data: {
      invoiceId: input.invoice.id,
      intentId: input.intentId ?? null,
      ...subjectOf(input.invoice),
      payerId: input.invoice.playerId,
      locationId: input.invoice.locationId,
      amountCents: input.amountCents,
      currency: input.invoice.currency,
      status: input.status,
      method: input.method,
      provider: input.provider,
      providerRef: input.providerRef ?? null,
      idempotencyKey: input.idempotencyKey,
      reference: input.reference ?? null,
      note: input.note ?? null,
      receivedById: input.receivedById ?? null,
      paidAt: input.now,
    },
    select: { id: true },
  });
  return { id: payment.id, duplicate: false };
}

async function loadInvoiceForSettlement(tx: Prisma.TransactionClient, invoiceId: string): Promise<Settleable> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: settleableSelect });
  if (!invoice) throw notFound("Invoice");
  if (invoice.voidedAt) throw conflict("That invoice has been voided.");
  return invoice;
}

/* ------------------------------------------------------------------ At the desk */

/**
 * Records money taken in person.
 *
 * The amount is optional: left out, it settles whatever is still due, which is what a receptionist
 * almost always means. A part payment is allowed; paying more than is owed is not, because the excess
 * would have nowhere to live but a refund nobody asked for.
 */
export async function takePayment(actor: Actor | null, invoiceId: string, input: unknown, opts: { now?: Date; key?: string } = {}): Promise<InvoiceView> {
  const parsed = takePaymentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const now = opts.now ?? new Date();
  const head = await db.invoice.findUnique({ where: { id: invoiceId }, select: { locationId: true } });
  if (!head) throw notFound("Invoice");
  const a = await requirePermission(actor, "payment.manage", head.locationId ? { locationId: head.locationId } : undefined);

  await db.$transaction(async (tx) => {
    const invoice = await loadInvoiceForSettlement(tx, invoiceId);
    const due = amountDue(invoice);
    if (due === 0) throw alreadyPaid("That invoice has nothing left to pay.");
    const amountCents = parsed.data.amountCents ?? due;
    if (amountCents <= 0) throw validation("Enter an amount.", { amountCents: "Must be more than nothing." });
    if (amountCents > due) throw validation("That is more than is owed on this invoice.", { amountCents: "At most the amount due." });

    const result = await writePayment(tx, {
      invoice,
      amountCents,
      method: parsed.data.waive ? "NONE" : parsed.data.method,
      status: parsed.data.waive ? "WAIVED" : "PAID",
      provider: manualProvider.key,
      idempotencyKey: opts.key ?? idempotencyKey("desk", invoiceId, now.getTime(), amountCents),
      reference: parsed.data.reference,
      note: parsed.data.note,
      receivedById: a.id,
      now,
    });
    if (result.duplicate) return;

    await recalculateInvoice(tx, invoiceId, now);
    await audit({
      actorId: a.id,
      action: parsed.data.waive ? "payment.waived" : "payment.recorded",
      entityType: "Invoice",
      entityId: invoiceId,
      locationId: invoice.locationId,
      metadata: { paymentId: result.id, amountCents, method: parsed.data.method, waived: parsed.data.waive, reference: parsed.data.reference ?? null },
    }, tx);
  });
  await onInvoiceSettled(invoiceId, { now });
  return reloadInvoice(invoiceId);
}

/* ------------------------------------------------------------------ Academy credit */

/**
 * Settles an invoice, or part of it, from the player's credit balance.
 *
 * Writes two records that must agree: a CREDIT payment against the invoice and a SPEND entry on the
 * ledger. They are written in one transaction, and the ledger refuses to go below zero, so a balance
 * cannot be spent twice by two requests arriving together.
 */
export async function payWithCredit(actor: Actor | null, invoiceId: string, opts: { amountCents?: number; now?: Date; key?: string } = {}): Promise<InvoiceView> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();

  await db.$transaction(async (tx) => {
    const invoice = await loadInvoiceForSettlement(tx, invoiceId);
    if (!invoice.playerId) throw validation("A guest booking has no account to draw credit from.");
    if (invoice.playerId !== a.id) await requirePermission(a, "payment.manage", invoice.locationId ? { locationId: invoice.locationId } : undefined);

    const policy = await getPaymentPolicy(invoice.locationId, { tx });
    if (!policy.allowCredit) throw conflict("This club does not accept payment from account credit.");

    const due = amountDue(invoice);
    if (due === 0) throw alreadyPaid("That invoice has nothing left to pay.");
    const account = await tx.creditAccount.findUnique({ where: { playerId: invoice.playerId }, select: { balanceCents: true } });
    const balance = account?.balanceCents ?? 0;
    if (balance <= 0) throw conflict("There is nothing on account to pay with.");
    const amountCents = Math.min(opts.amountCents ?? due, due, balance);

    const key = opts.key ?? idempotencyKey("credit", invoiceId, now.getTime(), amountCents);
    const result = await writePayment(tx, { invoice, amountCents, method: "CREDIT", status: "PAID", provider: manualProvider.key, idempotencyKey: key, receivedById: a.id, now });
    if (result.duplicate) return;

    await postCreditEntry(tx, { playerId: invoice.playerId, kind: "SPEND", amountCents: -amountCents, reason: "Paid an invoice", invoiceId, createdById: a.id });
    await recalculateInvoice(tx, invoiceId, now);
    await audit({ actorId: a.id, action: "payment.credit", entityType: "Invoice", entityId: invoiceId, locationId: invoice.locationId, metadata: { paymentId: result.id, amountCents } }, tx);
  });
  await onInvoiceSettled(invoiceId, { now });
  return reloadInvoice(invoiceId);
}

/* ------------------------------------------------------------------ Online */

export type CheckoutHandoff = {
  intentId: string;
  provider: string;
  amountCents: number;
  /** Where to send the player. What they see there is never the outcome. */
  checkoutUrl: string | null;
  expiresAt: Date | null;
};

/**
 * Opens an attempt with the gateway and hands back somewhere to send the player.
 *
 * An intent that is already open for the same amount is reused rather than replaced: a player who taps
 * "pay" twice should land on the same checkout, not open a second one the club then has to reconcile.
 *
 * Nothing here marks anything paid. The function returns a URL and stops.
 */
export async function startOnlinePayment(actor: Actor | null, invoiceId: string, input: unknown, opts: { now?: Date } = {}): Promise<CheckoutHandoff> {
  const a = await requireActor(actor);
  const parsed = startOnlinePaymentSchema.safeParse(input ?? {});
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const now = opts.now ?? new Date();

  const provider = onlineProvider();
  if (!provider) throw providerUnavailable("Online payment is not set up for this academy yet.");

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { ...settleableSelect, number: true, depositCents: true, player: { select: { id: true, name: true, email: true, phone: true } }, guestName: true, guestPhone: true },
  });
  if (!invoice) throw notFound("Invoice");
  if (invoice.voidedAt) throw conflict("That invoice has been voided.");
  if (invoice.playerId !== a.id) await requirePermission(a, "payment.manage", invoice.locationId ? { locationId: invoice.locationId } : undefined);
  if (!provider.currencies.includes(invoice.currency)) throw providerUnavailable(`${provider.label} does not accept ${invoice.currency}.`);

  const policy = await getPaymentPolicy(invoice.locationId);
  if (policy.timing === "AT_CLUB") throw conflict("This club takes payment at the desk.");

  const due = amountDue(invoice);
  if (due === 0) throw alreadyPaid("That invoice has nothing left to pay.");
  const wanted = parsed.data.portion === "DEPOSIT" ? Math.min(due, invoice.depositCents || depositFor(invoice.totalCents, policy.depositPercent)) : due;
  const amountCents = Math.max(1, Math.min(wanted, due));

  const open = await db.paymentIntent.findFirst({
    where: { invoiceId, status: { in: ["REQUIRES_ACTION", "PROCESSING"] }, amountCents, provider: provider.key, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
  });
  if (open?.checkoutUrl) return { intentId: open.id, provider: open.provider, amountCents: open.amountCents, checkoutUrl: open.checkoutUrl, expiresAt: open.expiresAt };

  const key = idempotencyKey("intent", invoiceId, amountCents, randomUUID());
  const intent = await db.paymentIntent.create({
    data: { invoiceId, provider: provider.key, amountCents, currency: invoice.currency, status: "REQUIRES_ACTION", idempotencyKey: key, returnUrl: parsed.data.returnUrl ?? null, createdById: a.id },
    select: { id: true },
  });

  try {
    const result = await provider.createIntent({
      invoiceNumber: invoice.number,
      amountCents,
      currency: invoice.currency,
      idempotencyKey: key,
      returnUrl: parsed.data.returnUrl,
      description: `HITTERS ${invoice.number}`,
      customer: { id: invoice.player?.id, name: invoice.player?.name ?? invoice.guestName ?? undefined, email: invoice.player?.email, phone: invoice.player?.phone ?? invoice.guestPhone ?? undefined },
    });
    const saved = await db.paymentIntent.update({
      where: { id: intent.id },
      // A provider that reports SUCCEEDED from its own API is believed; the browser is not the provider.
      data: { providerRef: result.providerRef, status: result.status, checkoutUrl: result.checkoutUrl ?? null, expiresAt: result.expiresAt ?? null, metadata: (result.metadata ?? {}) as Prisma.InputJsonValue },
      select: { id: true, provider: true, amountCents: true, checkoutUrl: true, expiresAt: true, status: true, providerRef: true },
    });
    await audit({ actorId: a.id, action: "payment.intent.created", entityType: "Invoice", entityId: invoiceId, locationId: invoice.locationId, metadata: { intentId: saved.id, provider: saved.provider, amountCents } });
    if (saved.status === "SUCCEEDED" && saved.providerRef) await settleIntent({ provider: provider.key, providerRef: saved.providerRef, outcome: "succeeded", amountCents }, { now });
    return { intentId: saved.id, provider: saved.provider, amountCents: saved.amountCents, checkoutUrl: saved.checkoutUrl, expiresAt: saved.expiresAt };
  } catch (e) {
    await db.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED", failureMessage: e instanceof Error ? e.message.slice(0, 300) : "The provider could not be reached." } });
    throw paymentFailed("The payment could not be started. Nothing has been charged.");
  }
}

/**
 * The only path that marks an online payment as taken.
 *
 * Called from a verified webhook, or from `reconcileIntent` when a webhook never arrived. Identified by
 * the provider's own reference rather than anything the browser sends, and idempotent on that reference:
 * a provider that delivers the same event five times pays the invoice once.
 */
export async function settleIntent(event: Pick<ProviderEvent, "intentRef" | "outcome" | "amountCents" | "failureCode" | "failureMessage"> & { provider: string; providerRef?: string }, opts: { now?: Date } = {}): Promise<{ settled: boolean; invoiceId: string | null }> {
  const now = opts.now ?? new Date();
  const ref = event.providerRef ?? event.intentRef;
  if (!ref) return { settled: false, invoiceId: null };

  return db.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUnique({
      where: { provider_providerRef: { provider: event.provider, providerRef: ref } },
      select: { id: true, invoiceId: true, amountCents: true, status: true, idempotencyKey: true },
    });
    if (!intent) return { settled: false, invoiceId: null };

    if (event.outcome !== "succeeded") {
      const status = event.outcome === "cancelled" ? "CANCELLED" : event.outcome === "expired" ? "EXPIRED" : "FAILED";
      if (intent.status !== "SUCCEEDED") {
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status, failureCode: event.failureCode ?? null, failureMessage: event.failureMessage?.slice(0, 300) ?? null } });
      }
      return { settled: false, invoiceId: intent.invoiceId };
    }

    const invoice = await loadInvoiceForSettlement(tx, intent.invoiceId);
    // Trust the provider's figure over our own: a gateway that captured a different amount is the
    // authority on what was taken, and a mismatch belongs in the books, not hidden behind our number.
    const amountCents = Math.min(event.amountCents ?? intent.amountCents, amountDue(invoice) || intent.amountCents);

    const result = await writePayment(tx, {
      invoice,
      amountCents,
      method: "CARD",
      status: "PAID",
      provider: event.provider,
      providerRef: ref,
      intentId: intent.id,
      idempotencyKey: `settle:${event.provider}:${ref}`,
      now,
    });
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "SUCCEEDED", confirmedAt: now } });
    if (result.duplicate) return { settled: false, invoiceId: intent.invoiceId };

    await recalculateInvoice(tx, intent.invoiceId, now);
    await audit({ actorId: null, action: "payment.settled", entityType: "Invoice", entityId: intent.invoiceId, locationId: invoice.locationId, metadata: { provider: event.provider, providerRef: ref, amountCents, paymentId: result.id } }, tx);
    return { settled: true, invoiceId: intent.invoiceId };
  })
    .then(async (outcome) => {
      if (outcome.settled && outcome.invoiceId) await onInvoiceSettled(outcome.invoiceId, { now });
      return outcome;
    });
}

/**
 * Asks the provider what happened to an intent we never heard back about.
 *
 * Webhooks are lost, delayed and fired before the redirect lands. A club should never have to ring a
 * gateway to find out whether a player paid, so anything still open past its expiry is resolved from the
 * provider's own API, which is the same authority the webhook speaks for.
 */
export async function reconcileIntent(intentId: string, opts: { now?: Date } = {}): Promise<{ status: string }> {
  const now = opts.now ?? new Date();
  const intent = await db.paymentIntent.findUnique({ where: { id: intentId }, select: { id: true, provider: true, providerRef: true, status: true, amountCents: true } });
  if (!intent) throw notFound("Payment attempt");
  if (intent.status === "SUCCEEDED" || !intent.providerRef) return { status: intent.status };

  const provider = getPaymentProvider(intent.provider);
  if (!provider) throw providerUnavailable();

  const result = await provider.fetchIntent(intent.providerRef);
  if (result.status === "SUCCEEDED") {
    await settleIntent({ provider: intent.provider, providerRef: intent.providerRef, outcome: "succeeded", amountCents: intent.amountCents }, { now });
    return { status: "SUCCEEDED" };
  }
  await db.paymentIntent.update({ where: { id: intent.id }, data: { status: result.status, failureCode: result.failureCode ?? null, failureMessage: result.failureMessage ?? null } });
  return { status: result.status };
}

/**
 * Takes one inbound provider callback.
 *
 * Order matters and is the whole point: store the raw bytes first, check the signature, refuse a replay
 * on the provider's own event id, and only then act. A provider that retries ten times pays the invoice
 * once; a forged body never gets past the signature; and an event we failed to process is still on disk
 * to be replayed by hand.
 */
export async function handleWebhook(providerKey: string, rawBody: string, headers: Headers, opts: { now?: Date } = {}): Promise<{ status: number; body: string }> {
  const now = opts.now ?? new Date();
  const provider = getPaymentProvider(providerKey);
  if (!provider || !provider.online) return { status: 404, body: "unknown provider" };

  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const signatureOk = provider.verifyWebhook(rawBody, headers);
  if (!signatureOk) {
    await db.webhookEvent
      .create({ data: { provider: providerKey, eventId: `unsigned:${payloadHash}`, type: "signature.invalid", payloadHash, payload: safeJson(rawBody), signatureOk: false, processedAt: now, error: "Signature did not verify" } })
      .catch(() => undefined);
    return { status: 400, body: "bad signature" };
  }

  let event: ProviderEvent;
  try {
    event = provider.parseEvent(rawBody, headers);
  } catch {
    await db.webhookEvent.create({ data: { provider: providerKey, eventId: `unparsed:${payloadHash}`, type: "parse.failed", payloadHash, payload: safeJson(rawBody), signatureOk: true, processedAt: now, error: "Could not be parsed" } }).catch(() => undefined);
    return { status: 400, body: "unparseable" };
  }

  try {
    await db.webhookEvent.create({ data: { provider: providerKey, eventId: event.eventId, type: event.type, payloadHash, payload: safeJson(rawBody), signatureOk: true } });
  } catch {
    // The unique index on (provider, eventId) caught a redelivery. Already handled; say so and stop.
    return { status: 200, body: "duplicate" };
  }

  try {
    if (event.outcome !== "ignored") await settleIntent({ ...event, provider: providerKey }, { now });
    await db.webhookEvent.update({ where: { provider_eventId: { provider: providerKey, eventId: event.eventId } }, data: { processedAt: now } });
    return { status: 200, body: "ok" };
  } catch (e) {
    // Left unprocessed on purpose: the provider will retry, and the row is the record of what arrived.
    await db.webhookEvent.update({ where: { provider_eventId: { provider: providerKey, eventId: event.eventId } }, data: { error: e instanceof Error ? e.message.slice(0, 500) : "failed" } }).catch(() => undefined);
    return { status: 500, body: "retry" };
  }
}

const safeJson = (raw: string): Prisma.InputJsonValue => {
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    return { raw: raw.slice(0, 4000) };
  }
};

/* ------------------------------------------------------------------ Reading */

async function reloadInvoice(invoiceId: string): Promise<InvoiceView> {
  const { invoiceSelect } = await import("./invoices");
  const row = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: invoiceSelect });
  return { ...row, amountDueCents: amountDue(row) };
}

/** Tells a player what they still owe, so a reminder can say a number rather than "you have a balance". */
export async function outstandingForPlayer(playerId: string): Promise<{ invoices: number; amountCents: number }> {
  const rows = await db.invoice.findMany({
    where: { playerId, status: { in: ["ISSUED", "PART_PAID"] }, voidedAt: null },
    select: { totalCents: true, paidCents: true, refundedCents: true },
  });
  const amountCents = rows.reduce((n, r) => n + amountDue(r), 0);
  return { invoices: rows.filter((r) => amountDue(r) > 0).length, amountCents };
}

/**
 * What happens once an invoice is settled, whichever way the money arrived.
 *
 * Deliberately outside the transaction that took the payment: a notification that fails to send, or a
 * membership activation that throws, must not roll back money that has already left a player's card.
 * Everything here is idempotent, so the webhook that arrives twice runs it twice and changes nothing.
 */
export async function onInvoiceSettled(invoiceId: string, opts: { now?: Date } = {}): Promise<void> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, playerId: true, totalCents: true, currency: true, status: true, membershipId: true, bookingId: true } });
  if (!invoice || invoice.status !== "PAID") return;

  if (invoice.membershipId) {
    const { activateMembership } = await import("./memberships");
    await activateMembership(invoice.membershipId, opts).catch(() => undefined);
  }
  if (!invoice.playerId) return;
  await notify(invoice.playerId, {
    type: "payment.received",
    data: { number: invoice.number, amount: `${invoice.currency} ${(invoice.totalCents / 100).toLocaleString("en")}` },
    url: `/app/billing/${invoice.number}`,
    dedupeKey: `payment.received:${invoiceId}`,
  }).catch(() => undefined);
}
