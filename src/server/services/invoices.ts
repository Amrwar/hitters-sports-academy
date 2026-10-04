/**
 * Invoices: what is owed, and the only place "outstanding" is computed.
 *
 * A booking, a lesson, an enrolment, a package, a membership and a player's share of a split game all
 * become the same thing here — an invoice with lines. That is what lets one finance screen report on all
 * of them, and one refund path work for all of them.
 *
 * The cached figures on the row (subtotal, discount, credit, total, paid, refunded, status) are derived.
 * `recalculateInvoice` is the only function that writes them, and it is called inside the same
 * transaction as every change that could move them. Nothing else may set them: a figure written by hand
 * is a figure that will disagree with the ledger by the end of the month.
 */
import type { InvoiceLineKind, InvoiceStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { amountDue, deriveInvoiceStatus, sumLines } from "@/lib/payments/money";
import { fieldErrors, invoiceListSchema } from "@/lib/validation/schemas";

export const invoiceSelect = {
  id: true,
  number: true,
  playerId: true,
  guestName: true,
  guestPhone: true,
  locationId: true,
  currency: true,
  subtotalCents: true,
  discountCents: true,
  creditCents: true,
  totalCents: true,
  paidCents: true,
  refundedCents: true,
  depositCents: true,
  status: true,
  dueAt: true,
  issuedAt: true,
  paidAt: true,
  voidedAt: true,
  voidReason: true,
  note: true,
  bookingId: true,
  lessonId: true,
  enrollmentId: true,
  purchaseId: true,
  membershipId: true,
  gameParticipantId: true,
  couponId: true,
  createdAt: true,
  player: { select: { id: true, name: true, email: true } },
  location: { select: { id: true, name: true, timezone: true } },
  coupon: { select: { id: true, code: true, name: true } },
  lines: { select: { id: true, kind: true, description: true, quantity: true, unitCents: true, amountCents: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } },
  payments: { select: { id: true, amountCents: true, currency: true, status: true, method: true, provider: true, providerRef: true, reference: true, paidAt: true, createdAt: true, receivedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
  refunds: { select: { id: true, amountCents: true, status: true, destination: true, reason: true, settledAt: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.InvoiceSelect;

export type InvoiceView = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }> & { amountDueCents: number };

/** A voided invoice is owed nothing, whatever its lines still say it was for. */
const decorate = <T extends { totalCents: number; paidCents: number; refundedCents: number; voidedAt?: Date | null; status?: InvoiceStatus }>(row: T): T & { amountDueCents: number } => ({
  ...row,
  amountDueCents: row.voidedAt || row.status === "VOID" ? 0 : amountDue(row),
});

/* ------------------------------------------------------------------ Numbering */

/**
 * Human-readable invoice numbers, HT-2610-000123.
 *
 * The counter is the row count for the month plus one, read inside the caller's transaction. Two invoices
 * raised in the same millisecond could collide on the unique index, so `createInvoice` retries; a
 * sequence would avoid that, but it would also leave gaps on every rolled-back transaction, and a club
 * reconciling a numbered book would rather have a retry than a hole.
 */
async function nextInvoiceNumber(tx: Prisma.TransactionClient, now: Date, attempt = 0): Promise<string> {
  const prefix = `HT-${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const count = await tx.invoice.count({ where: { number: { startsWith: prefix } } });
  return `${prefix}-${String(count + 1 + attempt).padStart(6, "0")}`;
}

/* ------------------------------------------------------------------ Writing */

export type NewLine = { kind: InvoiceLineKind; description: string; quantity?: number; unitCents: number; sortOrder?: number };

export type NewInvoice = {
  playerId?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  locationId?: string | null;
  currency?: string;
  lines: NewLine[];
  note?: string | null;
  dueAt?: Date | null;
  depositCents?: number;
  /** Exactly one of these names what the invoice is for. */
  bookingId?: string;
  lessonId?: string;
  enrollmentId?: string;
  purchaseId?: string;
  membershipId?: string;
  gameParticipantId?: string;
  createdById?: string | null;
  /** DRAFT stays editable; ISSUED is owed from this moment and is what a player sees. */
  issue?: boolean;
};

/**
 * Raises an invoice. Always called inside the transaction that creates the thing being paid for, so a
 * booking never exists without the money record that goes with it.
 */
export async function createInvoice(tx: Prisma.TransactionClient, input: NewInvoice, now = new Date()): Promise<{ id: string; number: string; totalCents: number }> {
  if (input.lines.length === 0) throw validation("An invoice needs at least one line.");
  const lines = input.lines.map((l, i) => ({
    kind: l.kind,
    description: l.description,
    quantity: l.quantity ?? 1,
    unitCents: l.unitCents,
    amountCents: (l.quantity ?? 1) * l.unitCents,
    sortOrder: l.sortOrder ?? i,
  }));
  const totals = sumLines(lines);

  // Retried on a number collision only: two invoices raised in the same instant pick the same count.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const number = await nextInvoiceNumber(tx, now, attempt);
      const invoice = await tx.invoice.create({
        data: {
          number,
          playerId: input.playerId ?? null,
          guestName: input.guestName ?? null,
          guestPhone: input.guestPhone ?? null,
          locationId: input.locationId ?? null,
          currency: input.currency ?? "EGP",
          ...totals,
          depositCents: input.depositCents ?? 0,
          status: input.issue === false ? "DRAFT" : deriveInvoiceStatus({ ...totals, paidCents: 0, refundedCents: 0, issued: true, voided: false }),
          issuedAt: input.issue === false ? null : now,
          paidAt: input.issue !== false && totals.totalCents === 0 ? now : null,
          createdAt: now,
          dueAt: input.dueAt ?? null,
          note: input.note ?? null,
          bookingId: input.bookingId ?? null,
          lessonId: input.lessonId ?? null,
          enrollmentId: input.enrollmentId ?? null,
          purchaseId: input.purchaseId ?? null,
          membershipId: input.membershipId ?? null,
          gameParticipantId: input.gameParticipantId ?? null,
          createdById: input.createdById ?? null,
          lines: { create: lines },
        },
        select: { id: true, number: true, totalCents: true },
      });
      return invoice;
    } catch (e) {
      if (attempt === 4 || !isUniqueNumberError(e)) throw e;
    }
  }
  throw conflict("Could not allocate an invoice number.");
}

const isUniqueNumberError = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002" && JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("number");

/**
 * Recomputes an invoice's cached figures from its lines, payments and refunds.
 *
 * Called after every change that can move them, inside the same transaction. Returns the row so callers
 * can act on the new status without reading again.
 */
export async function recalculateInvoice(tx: Prisma.TransactionClient, invoiceId: string, now = new Date()): Promise<{ id: string; status: InvoiceStatus; totalCents: number; paidCents: number; refundedCents: number; amountDueCents: number }> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      issuedAt: true,
      voidedAt: true,
      paidAt: true,
      lines: { select: { kind: true, amountCents: true } },
      payments: { select: { amountCents: true, status: true } },
      refunds: { select: { amountCents: true, status: true } },
    },
  });
  if (!invoice) throw notFound("Invoice");

  const totals = sumLines(invoice.lines);
  // What arrived, whatever became of it afterwards. REFUNDED is included on purpose: the money did come
  // in, and the refund is counted separately, so leaving it out would make a fully refunded invoice read
  // as though it had never been paid. WAIVED counts too, because a comped booking is settled and should
  // not sit in "outstanding" forever.
  const paidCents = invoice.payments.filter((p) => ["PAID", "WAIVED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status)).reduce((n, p) => n + p.amountCents, 0);
  const refundedCents = invoice.refunds.filter((r) => r.status === "SUCCEEDED").reduce((n, r) => n + r.amountCents, 0);
  const status = deriveInvoiceStatus({ totalCents: totals.totalCents, paidCents, refundedCents, issued: invoice.issuedAt !== null, voided: invoice.voidedAt !== null });

  const row = await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      ...totals,
      paidCents,
      refundedCents,
      status,
      paidAt: status === "PAID" ? (invoice.paidAt ?? now) : null,
    },
    select: { id: true, status: true, totalCents: true, paidCents: true, refundedCents: true },
  });
  return { ...row, amountDueCents: amountDue(row) };
}

/** Moves a draft to issued. A draft is editable; an issued invoice is owed and only changes through money. */
export async function issueInvoice(tx: Prisma.TransactionClient, invoiceId: string, now = new Date()): Promise<void> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { issuedAt: true, voidedAt: true } });
  if (!invoice) throw notFound("Invoice");
  if (invoice.voidedAt) throw conflict("That invoice has been voided.");
  if (invoice.issuedAt) return;
  await tx.invoice.update({ where: { id: invoiceId }, data: { issuedAt: now } });
  await recalculateInvoice(tx, invoiceId, now);
}

/**
 * Cancels what is owed.
 *
 * An invoice with money against it is never voided: that money has to be refunded first, or the books
 * will show a payment with nothing to explain it.
 */
export async function voidInvoice(actor: Actor | null, invoiceId: string, reason: string, opts: { now?: Date; tx?: Prisma.TransactionClient } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const run = async (tx: Prisma.TransactionClient) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, locationId: true, voidedAt: true, paidCents: true, refundedCents: true } });
    if (!invoice) throw notFound("Invoice");
    if (invoice.voidedAt) return;
    if (invoice.paidCents - invoice.refundedCents > 0) throw conflict("Refund the payments on this invoice before voiding it.");
    await tx.invoice.update({ where: { id: invoiceId }, data: { voidedAt: now, voidReason: reason, status: "VOID" } });
    await tx.payment.updateMany({ where: { invoiceId, status: "PENDING" }, data: { status: "CANCELLED" } });
    await audit({ actorId: actor?.id ?? null, action: "invoice.voided", entityType: "Invoice", entityId: invoiceId, locationId: invoice.locationId, metadata: { reason } }, tx);
  };
  if (opts.tx) await run(opts.tx);
  else await db.$transaction(run);
}

/* ------------------------------------------------------------------ Reading */

/** A player reads their own invoices; staff read the ones at the clubs they may see. */
export async function getInvoice(actor: Actor | null, idOrNumber: string): Promise<InvoiceView> {
  const a = await requireActor(actor);
  const invoice = await db.invoice.findFirst({ where: { OR: [{ id: idOrNumber }, { number: idOrNumber.toUpperCase() }] }, select: invoiceSelect });
  if (!invoice) throw notFound("Invoice");
  if (invoice.playerId === a.id) return decorate(invoice);
  await requirePermission(a, "finance.read", invoice.locationId ? { locationId: invoice.locationId } : undefined);
  return decorate(invoice);
}

export async function listMyInvoices(actor: Actor | null, take = 50): Promise<InvoiceView[]> {
  const a = await requireActor(actor);
  const rows = await db.invoice.findMany({ where: { playerId: a.id, status: { not: "DRAFT" } }, select: invoiceSelect, orderBy: { createdAt: "desc" }, take });
  return rows.map(decorate);
}

export async function listInvoices(actor: Actor | null, input: unknown): Promise<{ rows: InvoiceView[]; total: number }> {
  const a = await requirePermission(actor, "finance.read");
  const parsed = invoiceListSchema.safeParse(input ?? {});
  if (!parsed.success) throw validation("Check the filters.", fieldErrors(parsed.error));
  const f = parsed.data;

  const scope = await accessibleLocationIds(a, "finance.read");
  if (scope !== "all" && scope.length === 0) return { rows: [], total: 0 };
  if (f.locationId && scope !== "all" && !scope.includes(f.locationId)) return { rows: [], total: 0 };

  const where: Prisma.InvoiceWhereInput = {
    status: f.status ?? { not: "DRAFT" },
    ...(f.locationId ? { locationId: f.locationId } : scope === "all" ? {} : { OR: [{ locationId: { in: scope } }, { locationId: null }] }),
    ...(f.playerId ? { playerId: f.playerId } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.q
      ? {
          OR: [
            { number: { contains: f.q.toUpperCase() } },
            { guestName: { contains: f.q, mode: "insensitive" as const } },
            { player: { is: { name: { contains: f.q, mode: "insensitive" as const } } } },
            { player: { is: { email: { contains: f.q.toLowerCase() } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.invoice.findMany({ where, select: invoiceSelect, orderBy: { createdAt: "desc" }, take: f.take, skip: f.skip }),
    db.invoice.count({ where }),
  ]);
  const decorated = rows.map(decorate);
  return { rows: f.outstandingOnly ? decorated.filter((r) => r.amountDueCents > 0) : decorated, total };
}

/** Whether this actor may take money or raise a refund at a club. */
export async function canHandleMoney(actor: Actor | null, locationId: string | null): Promise<boolean> {
  if (!actor) return false;
  return (await can(actor, "payment.manage", locationId ? { locationId } : undefined)) || (await can(actor, "finance.manage", locationId ? { locationId } : undefined));
}
