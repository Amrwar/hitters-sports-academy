import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, pairProposalSchema } from "@/lib/validation/schemas";
import { notify } from "./notifications";

export const pairSelect = {
  id: true,
  name: true,
  status: true,
  playerAId: true,
  playerBId: true,
  createdById: true,
  createdAt: true,
  playerA: { select: { id: true, name: true, playerProfile: { select: { level: true, side: true, photoUrl: true } } } },
  playerB: { select: { id: true, name: true, playerProfile: { select: { level: true, side: true, photoUrl: true } } } },
} satisfies Prisma.PairSelect;

export type PairView = Prisma.PairGetPayload<{ select: typeof pairSelect }>;

export function pairLabel(p: PairView): string {
  return p.name?.trim() || `${p.playerA.name.split(" ")[0]} & ${p.playerB.name.split(" ")[0]}`;
}

export function partnerOf(p: PairView, userId: string) {
  return p.playerAId === userId ? p.playerB : p.playerA;
}

async function loadPair(id: string, tx: Prisma.TransactionClient | typeof db = db): Promise<PairView> {
  const p = await tx.pair.findUnique({ where: { id }, select: pairSelect });
  if (!p) throw notFound("Pair");
  return p;
}

/** One player proposes a pair; the partner must accept before the pair can request games. */
export async function proposePair(actor: Actor | null, input: unknown): Promise<PairView> {
  const a = await requirePermission(actor, "session.participate.own");
  const parsed = pairProposalSchema.safeParse(input);
  if (!parsed.success) throw validation("Choose a partner.", fieldErrors(parsed.error));
  const { partnerUserId, name } = parsed.data;
  if (partnerUserId === a.id) throw validation("Pick someone else as your partner.");
  const partner = await db.user.findUnique({ where: { id: partnerUserId }, select: { id: true, status: true, name: true } });
  if (!partner || partner.status !== "ACTIVE") throw notFound("Player");
  const [playerAId, playerBId] = [a.id, partnerUserId].sort();
  const existing = await db.pair.findUnique({ where: { playerAId_playerBId: { playerAId, playerBId } }, select: pairSelect });
  if (existing) throw conflict(existing.status === "ACTIVE" ? `You already play as a pair with ${partner.name}.` : `A pair with ${partner.name} is waiting for confirmation.`);
  const pair = await db.$transaction(async (tx) => {
    const p = await tx.pair.create({ data: { playerAId, playerBId, createdById: a.id, name, status: "PENDING" }, select: pairSelect });
    await audit({ actorId: a.id, action: "pair.proposed", entityType: "Pair", entityId: p.id, metadata: { partnerUserId } }, tx);
    return p;
  });
  await notify(partnerUserId, { type: "pair.proposed", title: `${a.name} wants to play as a pair`, body: "Confirm the pair to request games together.", data: { pairId: pair.id } });
  return pair;
}

export async function respondToPair(actor: Actor | null, pairId: string, response: "ACCEPT" | "DECLINE"): Promise<PairView | null> {
  const a = await requirePermission(actor, "session.participate.own");
  const pair = await loadPair(pairId);
  if (pair.createdById === a.id || (pair.playerAId !== a.id && pair.playerBId !== a.id)) throw forbidden("Only the invited partner can answer.");
  if (pair.status !== "PENDING") throw validation("This pair is already confirmed.");
  if (response === "DECLINE") {
    await db.$transaction(async (tx) => {
      await tx.pair.delete({ where: { id: pairId } });
      await audit({ actorId: a.id, action: "pair.declined", entityType: "Pair", entityId: pairId }, tx);
    });
    await notify(pair.createdById, { type: "pair.declined", title: `${a.name} declined the pair`, body: "You can propose again later.", data: {} });
    return null;
  }
  const updated = await db.$transaction(async (tx) => {
    const p = await tx.pair.update({ where: { id: pairId }, data: { status: "ACTIVE" }, select: pairSelect });
    await audit({ actorId: a.id, action: "pair.confirmed", entityType: "Pair", entityId: pairId }, tx);
    return p;
  });
  await notify(pair.createdById, { type: "pair.confirmed", title: `${a.name} confirmed your pair`, body: "Find a match together or open a challenge.", data: { pairId } });
  return updated;
}

/** Either member ends the pair. Games already joined are untouched. */
export async function dissolvePair(actor: Actor | null, pairId: string): Promise<{ ok: true }> {
  const a = await requireActor(actor);
  const pair = await loadPair(pairId);
  if (pair.playerAId !== a.id && pair.playerBId !== a.id) throw forbidden();
  const other = partnerOf(pair, a.id);
  await db.$transaction(async (tx) => {
    await tx.gameJoinRequest.updateMany({ where: { pairId, status: { in: ["PENDING", "WAITLISTED"] } }, data: { status: "WITHDRAWN" } });
    await tx.pair.delete({ where: { id: pairId } });
    await audit({ actorId: a.id, action: "pair.dissolved", entityType: "Pair", entityId: pairId }, tx);
  });
  await notify(other.id, { type: "pair.dissolved", title: `${a.name} ended your pair`, body: "Pending pair requests were withdrawn.", data: {} });
  return { ok: true };
}

export async function listMyPairs(actor: Actor | null): Promise<PairView[]> {
  const a = await requireActor(actor);
  return db.pair.findMany({ where: { OR: [{ playerAId: a.id }, { playerBId: a.id }] }, select: pairSelect, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
}

/** An ACTIVE pair the actor belongs to, or an error. Used by requests and challenges. */
export async function requireActivePair(actor: Actor, pairId: string, tx: Prisma.TransactionClient | typeof db = db): Promise<PairView> {
  const pair = await loadPair(pairId, tx);
  if (pair.playerAId !== actor.id && pair.playerBId !== actor.id) throw forbidden("That is not your pair.");
  if (pair.status !== "ACTIVE") throw validation("Your partner has not confirmed the pair yet.");
  return pair;
}
