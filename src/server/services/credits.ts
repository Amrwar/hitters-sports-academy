/**
 * Academy credit: money the club holds on a player's behalf.
 *
 * Distinct from a package's lesson credits, which are counted in lessons and only spend with that
 * package's coach. This is cash value — a refund the player chose to keep on account, a membership
 * benefit, a goodwill gesture — and it spends on anything the club invoices.
 *
 * The ledger is append-only and authoritative. `CreditAccount.balanceCents` is a cache written in the
 * same transaction as each entry, and `balanceAfterCents` on every entry means a statement can be read
 * back line by line and checked against it. An entry is never edited or deleted: a mistake is corrected
 * with an opposing ADJUSTMENT, so the history shows both what happened and what was done about it.
 */
import type { CreditEntryKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, notFound, validation } from "@/lib/errors";
import { requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { creditAdjustmentSchema, fieldErrors } from "@/lib/validation/schemas";

export type CreditEntryView = {
  id: string;
  kind: CreditEntryKind;
  amountCents: number;
  balanceAfterCents: number;
  reason: string | null;
  invoiceId: string | null;
  createdAt: Date;
  invoice: { id: string; number: string } | null;
};

export type CreditStatement = {
  balanceCents: number;
  currency: string;
  entries: CreditEntryView[];
};

/**
 * Reads the account, creating it on first use.
 *
 * Done inside the caller's transaction so a credit payment and the account it spends from cannot end up
 * in different states if something later in the transaction fails.
 */
export async function ensureCreditAccount(tx: Prisma.TransactionClient, playerId: string, currency = "EGP"): Promise<{ id: string; balanceCents: number; currency: string }> {
  const existing = await tx.creditAccount.findUnique({ where: { playerId }, select: { id: true, balanceCents: true, currency: true } });
  if (existing) return existing;
  return tx.creditAccount.create({ data: { playerId, currency }, select: { id: true, balanceCents: true, currency: true } });
}

/**
 * Writes one ledger entry and moves the balance with it.
 *
 * The balance is re-read inside the transaction rather than taken from the caller, because two refunds
 * settling at once would otherwise both compute from the same stale figure and one would be lost.
 * A spend that would take the balance below zero is refused: credit is not an overdraft.
 */
export async function postCreditEntry(
  tx: Prisma.TransactionClient,
  input: { playerId: string; kind: CreditEntryKind; amountCents: number; reason?: string | null; invoiceId?: string | null; refundId?: string | null; createdById?: string | null; currency?: string },
): Promise<{ id: string; balanceAfterCents: number }> {
  if (input.amountCents === 0) throw validation("A credit entry of nothing is not an entry.");
  const account = await ensureCreditAccount(tx, input.playerId, input.currency);
  const balanceAfterCents = account.balanceCents + input.amountCents;
  if (balanceAfterCents < 0) throw conflict("That is more than the player has on account.");

  const entry = await tx.creditEntry.create({
    data: {
      accountId: account.id,
      kind: input.kind,
      amountCents: input.amountCents,
      balanceAfterCents,
      reason: input.reason ?? null,
      invoiceId: input.invoiceId ?? null,
      refundId: input.refundId ?? null,
      createdById: input.createdById ?? null,
    },
    select: { id: true, balanceAfterCents: true },
  });
  await tx.creditAccount.update({ where: { id: account.id }, data: { balanceCents: balanceAfterCents } });
  return entry;
}

/** What a player has on account. Zero for a player who has never had any; no row is not an error. */
export async function creditBalance(playerId: string, tx?: Prisma.TransactionClient): Promise<number> {
  const row = await (tx ?? db).creditAccount.findUnique({ where: { playerId }, select: { balanceCents: true } });
  return row?.balanceCents ?? 0;
}

/** A player's own statement, or a staff member's view of a player they may read. */
export async function getCreditStatement(actor: Actor | null, playerId?: string, take = 50): Promise<CreditStatement> {
  const a = await requireActor(actor);
  const subject = playerId ?? a.id;
  if (subject !== a.id) await requirePermission(a, "finance.read");

  const account = await db.creditAccount.findUnique({
    where: { playerId: subject },
    select: {
      balanceCents: true,
      currency: true,
      entries: {
        select: { id: true, kind: true, amountCents: true, balanceAfterCents: true, reason: true, invoiceId: true, createdAt: true, invoice: { select: { id: true, number: true } } },
        orderBy: { createdAt: "desc" },
        take,
      },
    },
  });
  if (!account) return { balanceCents: 0, currency: "EGP", entries: [] };
  return { balanceCents: account.balanceCents, currency: account.currency, entries: account.entries };
}

/**
 * A staff adjustment: a goodwill credit, or taking back credit granted in error.
 *
 * Requires a reason because the reason is what the player reads on their statement, and because an
 * unexplained movement of money is exactly what an audit trail exists to prevent.
 */
export async function adjustCredit(actor: Actor | null, playerId: string, input: unknown): Promise<CreditStatement> {
  const a = await requirePermission(actor, "finance.manage");
  const parsed = creditAdjustmentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const player = await db.user.findUnique({ where: { id: playerId }, select: { id: true } });
  if (!player) throw notFound("Player");

  await db.$transaction(async (tx) => {
    const entry = await postCreditEntry(tx, {
      playerId,
      kind: "ADJUSTMENT",
      amountCents: parsed.data.amountCents,
      reason: parsed.data.reason,
      createdById: a.id,
    });
    await audit({
      actorId: a.id,
      action: "credit.adjusted",
      entityType: "CreditAccount",
      entityId: playerId,
      metadata: { amountCents: parsed.data.amountCents, reason: parsed.data.reason, balanceAfterCents: entry.balanceAfterCents },
    }, tx);
  });
  return getCreditStatement(a, playerId);
}

/** Total credit the academy is holding, which is a liability and belongs on the finance dashboard. */
export async function outstandingCreditCents(): Promise<number> {
  const agg = await db.creditAccount.aggregate({ _sum: { balanceCents: true } });
  return agg._sum.balanceCents ?? 0;
}
