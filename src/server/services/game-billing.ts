/**
 * Dividing the cost of a game between the people playing it.
 *
 * A game sits on a court booking, and the booking has one invoice in the organizer's name. What the
 * players owe each other is a separate question, and the club settles it at the desk, so this turns the
 * organizer's single bill into one invoice per player when the lineup is confirmed.
 *
 * Four modes, three of which produce money:
 *
 * - ORGANIZER_PAYS — nothing happens here; the booking invoice stands as it is.
 * - FREE — nothing is charged to anyone, and the booking invoice is settled as waived if it had a price.
 * - SPLIT_EVENLY — the booking price is divided between the accepted players, to the piastre.
 * - FIXED_PER_PLAYER — each player pays the organizer's stated amount, whatever the court cost.
 *
 * Splitting is done once, at confirmation, and is idempotent: a lineup confirmed twice does not bill
 * anyone twice. Reversing it (a cancelled game) voids the shares and leaves the booking invoice standing,
 * because the court was still reserved and the club still has a decision to make about it.
 */
import type { GameCostMode, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { splitEvenly } from "@/lib/payments/money";
import { createInvoice } from "./invoices";
import { getPaymentPolicy } from "./payment-policy";

export type ShareBreakdown = {
  costMode: GameCostMode;
  /** One row per accepted player, in lineup order. Empty when nobody owes anything. */
  shares: { userId: string; name: string; amountCents: number }[];
  totalCents: number;
};

/**
 * What each player owes, without writing anything.
 *
 * SPLIT_EVENLY divides between the players who actually accepted, not the maximum the game allows: a
 * doubles game that went ahead with three should cost those three the whole court, because that is what
 * the club charged for it.
 */
export function shareBreakdown(input: {
  costMode: GameCostMode;
  costPerPlayerCents: number | null;
  bookingPriceCents: number;
  players: { userId: string; name: string }[];
}): ShareBreakdown {
  const { costMode, players } = input;
  if (costMode === "ORGANIZER_PAYS" || costMode === "FREE" || players.length === 0) {
    return { costMode, shares: [], totalCents: 0 };
  }
  if (costMode === "FIXED_PER_PLAYER") {
    const each = Math.max(0, input.costPerPlayerCents ?? 0);
    return { costMode, shares: players.map((p) => ({ ...p, amountCents: each })), totalCents: each * players.length };
  }
  // The remainder goes to the earliest shares a piastre at a time, so the shares add up to the court
  // price exactly rather than the group collectively overpaying by a rounding.
  const amounts = splitEvenly(input.bookingPriceCents, players.length);
  return { costMode, shares: players.map((p, i) => ({ ...p, amountCents: amounts[i] })), totalCents: input.bookingPriceCents };
}

/**
 * Raises one invoice per player for their share, when a game is confirmed.
 *
 * The organizer's booking invoice is voided first if it is unpaid: leaving it standing would bill the
 * court twice, once to the organizer and once across the group. If the organizer has already paid it,
 * it stays and only the other players are invoiced, because the money is already in the till and the
 * group can settle up between themselves.
 */
export async function billGameShares(
  sessionId: string,
  actorId: string | null,
  opts: { now?: Date } = {},
): Promise<{ invoiced: number; totalCents: number }> {
  const now = opts.now ?? new Date();
  const game = await db.gameSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      code: true,
      locationId: true,
      organizerId: true,
      costMode: true,
      costPerPlayerCents: true,
      currency: true,
      startsAt: true,
      booking: { select: { id: true, priceCents: true } },
      location: { select: { name: true, timezone: true } },
      court: { select: { name: true } },
      participants: {
        where: { status: "ACCEPTED" },
        orderBy: { invitedAt: "asc" },
        select: { id: true, userId: true, user: { select: { id: true, name: true } }, invoices: { select: { id: true } } },
      },
    },
  });
  if (!game) return { invoiced: 0, totalCents: 0 };

  const breakdown = shareBreakdown({
    costMode: game.costMode,
    costPerPlayerCents: game.costPerPlayerCents,
    bookingPriceCents: game.booking.priceCents,
    players: game.participants.map((p) => ({ userId: p.userId, name: p.user.name })),
  });
  if (breakdown.shares.length === 0) return { invoiced: 0, totalCents: 0 };

  const { formatInZone } = await import("@/lib/time");
  const when = formatInZone(game.startsAt, game.location.timezone);
  let invoiced = 0;

  await db.$transaction(async (tx) => {
    const bookingInvoice = await tx.invoice.findFirst({ where: { bookingId: game.booking.id, voidedAt: null }, select: { id: true, paidCents: true, refundedCents: true } });
    const organizerAlreadyPaid = bookingInvoice ? bookingInvoice.paidCents - bookingInvoice.refundedCents > 0 : false;

    if (bookingInvoice && !organizerAlreadyPaid) {
      await tx.invoice.update({ where: { id: bookingInvoice.id }, data: { voidedAt: now, voidReason: `Split between ${breakdown.shares.length} players`, status: "VOID" } });
      await tx.payment.updateMany({ where: { invoiceId: bookingInvoice.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    }

    for (const [i, share] of breakdown.shares.entries()) {
      const participant = game.participants[i];
      // Already billed: a lineup confirmed twice must not cost anyone twice.
      if (participant.invoices.length > 0) continue;
      // The organizer who has already paid the whole court does not get a second bill for their share.
      if (organizerAlreadyPaid && share.userId === game.organizerId) continue;
      if (share.amountCents <= 0) continue;

      await createInvoice(
        tx,
        {
          playerId: share.userId,
          locationId: game.locationId,
          currency: game.currency,
          gameParticipantId: participant.id,
          createdById: actorId,
          lines: [{ kind: "COURT", description: `Your share of ${game.code} · ${game.court.name} · ${game.location.name} · ${when}`, unitCents: share.amountCents }],
        },
        now,
      );
      invoiced++;
    }

    await audit({
      actorId,
      action: "game.billed",
      entityType: "GameSession",
      entityId: game.id,
      locationId: game.locationId,
      metadata: { costMode: game.costMode, players: breakdown.shares.length, invoiced, totalCents: breakdown.totalCents },
    }, tx);
  });

  return { invoiced, totalCents: breakdown.totalCents };
}

/**
 * Cancels the shares when a game is called off.
 *
 * Unpaid shares are voided. Paid ones are refunded, because a player paid for a game that is not
 * happening. The court booking is deliberately untouched: it may still be going ahead, and whether the
 * club charges for it is the booking's own cancellation policy to decide.
 */
export async function unbillGameShares(sessionId: string, actorId: string | null, opts: { now?: Date } = {}): Promise<{ voided: number; refundedCents: number }> {
  const now = opts.now ?? new Date();
  const invoices = await db.invoice.findMany({
    where: { gameParticipant: { is: { sessionId } }, voidedAt: null },
    select: { id: true, paidCents: true, refundedCents: true },
  });
  if (invoices.length === 0) return { voided: 0, refundedCents: 0 };

  const { voidInvoice } = await import("./invoices");
  const { refundInvoice } = await import("./refunds");
  let voided = 0;
  let refundedCents = 0;

  for (const invoice of invoices) {
    const paid = invoice.paidCents - invoice.refundedCents;
    if (paid > 0) {
      await refundInvoice(actorId ? ({ id: actorId } as never) : null, invoice.id, { reason: "Game cancelled" }, { now, key: `game-cancel:${invoice.id}`, system: true }).catch(() => undefined);
      refundedCents += paid;
    } else {
      await voidInvoice(actorId ? ({ id: actorId } as never) : null, invoice.id, "Game cancelled", { now }).catch(() => undefined);
      voided++;
    }
  }
  return { voided, refundedCents };
}

/** The cost mode a new game starts on, which the club sets and the organizer may change. */
export async function defaultCostMode(locationId: string): Promise<GameCostMode> {
  return (await getPaymentPolicy(locationId)).defaultGameCostMode;
}

/** Shares with what each player has actually paid, for the game screen. */
export async function gameShareStatus(sessionId: string): Promise<{ userId: string; name: string; amountCents: number; paidCents: number; invoiceId: string | null; number: string | null }[]> {
  const participants = await db.gameParticipant.findMany({
    where: { sessionId, status: "ACCEPTED" },
    orderBy: { invitedAt: "asc" },
    select: {
      userId: true,
      user: { select: { name: true } },
      invoices: { where: { voidedAt: null }, select: { id: true, number: true, totalCents: true, paidCents: true, refundedCents: true } },
    },
  });
  return participants.map((p) => {
    const invoice = p.invoices[0] ?? null;
    return {
      userId: p.userId,
      name: p.user.name,
      amountCents: invoice?.totalCents ?? 0,
      paidCents: invoice ? invoice.paidCents - invoice.refundedCents : 0,
      invoiceId: invoice?.id ?? null,
      number: invoice?.number ?? null,
    };
  });
}

/** Used by the reports: what a game's split is worth, without loading the game. */
export async function gameBilledCents(sessionId: string, tx?: Prisma.TransactionClient): Promise<number> {
  const agg = await (tx ?? db).invoice.aggregate({ where: { gameParticipant: { is: { sessionId } }, voidedAt: null }, _sum: { totalCents: true } });
  return agg._sum.totalCents ?? 0;
}
