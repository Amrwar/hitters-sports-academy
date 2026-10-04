/**
 * Giving money back.
 *
 * A refund is its own record, never an edited payment: it has its own authorisation, its own provider
 * call and its own lifecycle, and the books have to show both the money that came in and the money that
 * went out. Flipping a Payment row to REFUNDED would erase the first.
 *
 * Where it goes is a policy decision, not a technical one. ORIGINAL sends it back through the gateway
 * that took it, CREDIT keeps it on the player's account, CASH is handed over at the desk. A club sets a
 * default and staff may override it per refund.
 */
import { randomUUID } from "node:crypto";
import type { Prisma, RefundDestination } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, notFound, refundNotAllowed, validation } from "@/lib/errors";
import { requirePermission, type Actor } from "@/lib/auth/authorize";
import { getPaymentProvider, manualProvider } from "@/lib/payments/provider";
import { fieldErrors, refundSchema } from "@/lib/validation/schemas";
import { postCreditEntry } from "./credits";
import { recalculateInvoice, type InvoiceView } from "./invoices";
import { getPaymentPolicy } from "./payment-policy";
import { notify } from "./notifications";

const DESTINATION_LABEL: Record<RefundDestination, string> = {
  ORIGINAL: "back to the card you paid with",
  CREDIT: "to your HITTERS account",
  CASH: "in cash at the club",
};

/** What can still be refunded on an invoice: money that actually arrived, less what has gone back. */
export function refundableCents(invoice: { paidCents: number; refundedCents: number }): number {
  return Math.max(0, invoice.paidCents - invoice.refundedCents);
}

/**
 * Raises a refund and settles it.
 *
 * Credit and cash settle immediately: there is nobody to call. A card refund calls the provider, and a
 * provider that fails leaves the row FAILED with its message rather than pretending the money moved —
 * which is the difference between a club that chases one refund and a club whose books are wrong.
 *
 * The refund is written before the provider is called, so a call that times out after succeeding leaves
 * a PENDING row to reconcile rather than no record at all.
 */
export async function refundInvoice(actor: Actor | null, invoiceId: string, input: unknown, opts: { now?: Date; key?: string; system?: boolean } = {}): Promise<InvoiceView> {
  const parsed = refundSchema.safeParse(input ?? {});
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const now = opts.now ?? new Date();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      locationId: true,
      playerId: true,
      currency: true,
      paidCents: true,
      refundedCents: true,
      voidedAt: true,
      payments: { where: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, select: { id: true, amountCents: true, method: true, provider: true, providerRef: true }, orderBy: { paidAt: "desc" } },
    },
  });
  if (!invoice) throw notFound("Invoice");
  // A system refund (a cancellation policy giving money back) acts on the academy's behalf; a person
  // raising one by hand needs the permission at that club.
  const a = opts.system ? actor : await requirePermission(actor, "refund.issue", invoice.locationId ? { locationId: invoice.locationId } : undefined);

  const available = refundableCents(invoice);
  if (available === 0) throw refundNotAllowed("There is nothing to refund on this invoice.");
  const amountCents = parsed.data.amountCents ?? available;
  if (amountCents <= 0) throw validation("Enter an amount.", { amountCents: "Must be more than nothing." });
  if (amountCents > available) throw validation("That is more than was paid.", { amountCents: `At most ${(available / 100).toFixed(2)}.` });

  const policy = await getPaymentPolicy(invoice.locationId);
  let destination = parsed.data.destination ?? policy.refundDestination;
  // A guest has no account to hold credit, and a payment with no gateway behind it has nowhere to go
  // back to, so both fall to cash at the desk rather than failing.
  const source = invoice.payments[0] ?? null;
  if (destination === "CREDIT" && !invoice.playerId) destination = "CASH";
  if (destination === "ORIGINAL" && (!source || !source.providerRef || source.provider === manualProvider.key)) destination = source?.method === "CREDIT" ? "CREDIT" : "CASH";
  if (destination === "CREDIT" && !invoice.playerId) destination = "CASH";

  const key = opts.key ?? `refund:${invoiceId}:${randomUUID()}`;
  const existing = await db.refund.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
  if (existing) return reload(invoiceId);

  const refund = await db.refund.create({
    data: {
      invoiceId,
      paymentId: source?.id ?? null,
      amountCents,
      currency: invoice.currency,
      destination,
      status: "PENDING",
      reason: parsed.data.reason ?? null,
      provider: destination === "ORIGINAL" ? (source?.provider ?? null) : manualProvider.key,
      idempotencyKey: key,
      requestedById: a?.id ?? null,
    },
    select: { id: true },
  });

  if (destination === "ORIGINAL" && source?.providerRef) {
    const provider = getPaymentProvider(source.provider ?? manualProvider.key);
    if (!provider) throw conflict("The provider that took this payment is no longer configured.");
    try {
      const result = await provider.refund({ paymentRef: source.providerRef, amountCents, currency: invoice.currency, idempotencyKey: key, reason: parsed.data.reason ?? undefined });
      if (result.status !== "SUCCEEDED") {
        await db.refund.update({ where: { id: refund.id }, data: { status: result.status, providerRef: result.providerRef, failureMessage: result.failureMessage?.slice(0, 300) ?? null } });
        throw refundNotAllowed(result.failureMessage ?? "The provider refused the refund.");
      }
      await db.refund.update({ where: { id: refund.id }, data: { providerRef: result.providerRef } });
    } catch (e) {
      await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", failureMessage: e instanceof Error ? e.message.slice(0, 300) : "The provider could not be reached." } }).catch(() => undefined);
      throw e;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: refund.id }, data: { status: "SUCCEEDED", settledAt: now } });
    if (destination === "CREDIT" && invoice.playerId) {
      await postCreditEntry(tx, { playerId: invoice.playerId, kind: "REFUND", amountCents, reason: parsed.data.reason ?? `Refund on ${invoice.number}`, invoiceId, refundId: refund.id, createdById: a?.id ?? null });
    }
    if (source) {
      const paidBack = await tx.refund.aggregate({ where: { paymentId: source.id, status: "SUCCEEDED" }, _sum: { amountCents: true } });
      const back = paidBack._sum.amountCents ?? 0;
      await tx.payment.update({ where: { id: source.id }, data: { status: back >= source.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED", refundedAt: now } });
    }
    await recalculateInvoice(tx, invoiceId, now);
    await audit({
      actorId: a?.id ?? null,
      action: "refund.issued",
      entityType: "Invoice",
      entityId: invoiceId,
      locationId: invoice.locationId,
      metadata: { refundId: refund.id, amountCents, destination, reason: parsed.data.reason ?? null, system: !!opts.system },
    }, tx);
  });

  if (invoice.playerId) {
    await notify(invoice.playerId, {
      type: "refund.issued",
      data: {
        amount: `${invoice.currency} ${(amountCents / 100).toLocaleString("en")}`,
        what: invoice.number,
        destination: DESTINATION_LABEL[destination],
        reasonSuffix: parsed.data.reason ? ` ${parsed.data.reason}` : "",
      },
      url: `/app/billing/${invoice.number}`,
      dedupeKey: `refund.issued:${refund.id}`,
    }).catch(() => undefined);
  }
  return reload(invoiceId);
}

/**
 * Refunds everything still refundable, keeping a fee.
 *
 * Used by cancellation policy: the fee stays on the invoice as a FEE line so the receipt explains the
 * difference, and only the rest goes back. A club that keeps money without saying why on the document
 * will be asked about it at the desk.
 */
export async function refundWithFee(
  actor: Actor | null,
  invoiceId: string,
  input: { feeCents: number; feeDescription: string; reason?: string; destination?: RefundDestination; now?: Date; key?: string },
): Promise<InvoiceView> {
  const now = input.now ?? new Date();
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, paidCents: true, refundedCents: true, lines: { select: { sortOrder: true } } } });
  if (!invoice) throw notFound("Invoice");

  if (input.feeCents > 0) {
    const sortOrder = Math.max(0, ...invoice.lines.map((l) => l.sortOrder)) + 1;
    await db.$transaction(async (tx) => {
      await tx.invoiceLine.create({ data: { invoiceId, kind: "FEE", description: input.feeDescription, quantity: 1, unitCents: input.feeCents, amountCents: input.feeCents, sortOrder } });
      await recalculateInvoice(tx, invoiceId, now);
    });
  }

  const after = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { totalCents: true, paidCents: true, refundedCents: true } });
  const giveBack = Math.max(0, after.paidCents - after.refundedCents - after.totalCents);
  if (giveBack === 0) return reload(invoiceId);
  return refundInvoice(actor, invoiceId, { amountCents: giveBack, destination: input.destination, reason: input.reason }, { now, key: input.key, system: true });
}

/** A club's refund history, for the finance screen. */
export async function listRefunds(actor: Actor | null, opts: { locationId?: string; take?: number } = {}): Promise<Prisma.RefundGetPayload<{ include: { invoice: { select: { number: true; locationId: true; player: { select: { id: true; name: true } } } }; requestedBy: { select: { id: true; name: true } } } }>[]> {
  await requirePermission(actor, "finance.read", opts.locationId ? { locationId: opts.locationId } : undefined);
  return db.refund.findMany({
    where: opts.locationId ? { invoice: { locationId: opts.locationId } } : {},
    include: { invoice: { select: { number: true, locationId: true, player: { select: { id: true, name: true } } } }, requestedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
  });
}

async function reload(invoiceId: string): Promise<InvoiceView> {
  const { invoiceSelect } = await import("./invoices");
  const { amountDue } = await import("@/lib/payments/money");
  const row = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: invoiceSelect });
  return { ...row, amountDueCents: amountDue(row) };
}
