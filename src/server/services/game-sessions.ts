import type { GameStatus, Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { GAME_FORMATS } from "@/lib/catalog";
import { formatInZone, utcToZoned } from "@/lib/time";
import { cancelGameSchema, createGameSessionSchema, fieldErrors, gameDiscoverSchema, gameListSchema, inviteToGameSchema, updateGameSessionSchema } from "@/lib/validation/schemas";
import { notify, notifyMany } from "./notifications";
import { billGameShares, unbillGameShares } from "./game-billing";
import { plural, suffix } from "@/lib/notifications";
import { requireActivePair } from "./pairs";

/* ------------------------------------------------------------------ Shared select and view */

export const gameSelect = {
  id: true,
  code: true,
  organizerId: true,
  bookingId: true,
  locationId: true,
  courtId: true,
  startsAt: true,
  endsAt: true,
  format: true,
  maxPlayers: true,
  levels: true,
  matchType: true,
  visibility: true,
  status: true,
  openToRequests: true,
  joinPolicy: true,
  levelPolicy: true,
  pairId: true,
  pair: { select: { id: true, name: true, playerAId: true, playerBId: true } },
  costMode: true,
  costPerPlayerCents: true,
  currency: true,
  description: true,
  notes: true,
  publishedAt: true,
  confirmedAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  organizer: { select: { id: true, name: true } },
  location: { select: { id: true, slug: true, name: true, timezone: true, address: true } },
  court: { select: { id: true, name: true, type: true } },
  booking: { select: { id: true, confirmationCode: true, status: true, priceCents: true, currency: true, durationMinutes: true } },
  participants: {
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      invitedAt: true,
      respondedAt: true,
      pairId: true,
      user: { select: { id: true, name: true, playerProfile: { select: { level: true, photoUrl: true, side: true } } } },
    },
    orderBy: [{ role: "asc" as const }, { createdAt: "asc" as const }],
  },
  /** Open requests only; the full history is read through matchmaking.listSessionRequests. */
  requests: { where: { status: { in: ["PENDING", "WAITLISTED"] } }, select: { id: true, userId: true, kind: true, pairId: true, spots: true, status: true, pair: { select: { playerAId: true, playerBId: true } } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.GameSessionSelect;

type GameRow = Prisma.GameSessionGetPayload<{ select: typeof gameSelect }>;

/** A session plus the derived numbers every screen needs. */
export type GameView = GameRow & {
  /** Players who accepted, organizer included. */
  acceptedCount: number;
  invitedCount: number;
  spotsLeft: number;
  /** What each player pays under the chosen cost mode; null when the organizer covers it or it is free. */
  sharePerPlayerCents: number | null;
  pendingRequests: number;
  waitlistedRequests: number;
};

const LIVE: GameStatus[] = ["DRAFT", "OPEN", "FULL", "CONFIRMED", "IN_PROGRESS"];
const EDITABLE: GameStatus[] = ["DRAFT", "OPEN", "FULL"];
const JOINABLE: GameStatus[] = ["DRAFT", "OPEN"];

export function decorate(row: GameRow): GameView {
  const acceptedCount = row.participants.filter((p) => p.status === "ACCEPTED").length;
  const invitedCount = row.participants.filter((p) => p.status === "INVITED").length;
  const spotsLeft = Math.max(0, row.maxPlayers - acceptedCount);
  let sharePerPlayerCents: number | null = null;
  if (row.costMode === "SPLIT_EVENLY") sharePerPlayerCents = Math.ceil(row.booking.priceCents / row.maxPlayers);
  else if (row.costMode === "FIXED_PER_PLAYER") sharePerPlayerCents = row.costPerPlayerCents ?? 0;
  else if (row.costMode === "FREE") sharePerPlayerCents = 0;
  const pendingRequests = row.requests.filter((r) => r.status === "PENDING").length;
  const waitlistedRequests = row.requests.filter((r) => r.status === "WAITLISTED").length;
  return { ...row, acceptedCount, invitedCount, spotsLeft, sharePerPlayerCents, pendingRequests, waitlistedRequests };
}

/* ------------------------------------------------------------------ Helpers */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function gameCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `GM-${s}`;
}

function playersFor(format: "SINGLES" | "DOUBLES" | "OPEN", requested?: number): number {
  const def = GAME_FORMATS.find((f) => f.value === format)!;
  if (format === "OPEN") return requested ?? def.players;
  if (requested !== undefined && requested !== def.players) throw validation(`${def.label} is played by ${def.players} players.`, { maxPlayers: `Fixed at ${def.players} for ${def.label.toLowerCase()}.` });
  return def.players;
}

async function load(idOrCode: string, tx: Prisma.TransactionClient | typeof db = db): Promise<GameView> {
  const row = await tx.gameSession.findFirst({ where: idOrCode.startsWith("GM-") ? { code: idOrCode } : { id: idOrCode }, select: gameSelect });
  if (!row) throw notFound("Game");
  return decorate(row);
}

function isOrganizer(a: Actor, g: GameView) {
  return g.organizerId === a.id;
}

function participantOf(a: Actor, g: GameView) {
  return g.participants.find((p) => p.userId === a.id) ?? null;
}

async function requireOrganizer(actor: Actor | null, g: GameView): Promise<Actor> {
  const a = await requireActor(actor);
  if (!isOrganizer(a, g)) throw forbidden("Only the organizer can do that.");
  return a;
}

function requireStatus(g: GameView, allowed: GameStatus[], what: string) {
  if (!allowed.includes(g.status)) throw new AppError("INVALID_TRANSITION", `A ${label(g.status)} game cannot be ${what}.`);
}

function label(s: GameStatus) {
  return s.toLowerCase().replace("_", " ");
}

/** The placeholder values every game notification shares. */
function whenData(g: GameView) {
  return { when: formatInZone(g.startsAt, g.location.timezone), club: g.location.name, court: g.court.name };
}

/** Tells waitlisted requesters they are pending again, once the transaction that promoted them has committed. */
async function announcePromotions(g: GameView, promoted: WaitlistPromotion[]): Promise<void> {
  await Promise.all(
    promoted.map((p) => notify(p.userId, { type: "game.waitlist_moved", url: `/app/play/${g.code}`, groupKey: g.id, data: { position: p.position, code: g.code, ...whenData(g) } })),
  );
}

/** Status after the lineup changes. DRAFT and terminal states are never touched here. */
function fillStatus(status: GameStatus, acceptedCount: number, maxPlayers: number): GameStatus {
  if (status === "OPEN" && acceptedCount >= maxPlayers) return "FULL";
  if ((status === "FULL" || status === "CONFIRMED") && acceptedCount < maxPlayers) return "OPEN";
  return status;
}

/* ------------------------------------------------------------------ Create */

/**
 * Creates a DRAFT game on one of the organizer's own active bookings. Invitees are added as INVITED and must
 * accept themselves; nothing joins a player automatically.
 */
export async function createGameSession(actor: Actor | null, input: unknown, opts: { now?: Date } = {}): Promise<GameView> {
  const a = await requirePermission(actor, "session.create.own");
  const parsed = createGameSessionSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { bookingId, inviteUserIds, maxPlayers: requestedMax, pairId, ...details } = parsed.data;
  const now = opts.now ?? new Date();
  // Playing as a pair: the partner is invited (and must accept) and the game records the pair as team A.
  const pair = pairId ? await requireActivePair(a, pairId) : null;
  const partnerId = pair ? (pair.playerAId === a.id ? pair.playerBId : pair.playerAId) : null;

  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, playerId: true, locationId: true, courtId: true, startsAt: true, endsAt: true, status: true, gameSession: { select: { id: true, code: true } } } });
  if (!booking) throw notFound("Booking");
  if (booking.playerId !== a.id) throw forbidden("You can only organize a game on your own booking.");
  if (booking.status !== "CONFIRMED" && booking.status !== "PENDING") throw validation("That booking is no longer active.");
  if (booking.startsAt <= now) throw validation("That booking has already started.");
  if (booking.gameSession) throw new AppError("CONFLICT", `A game (${booking.gameSession.code}) already exists for this booking.`);

  const maxPlayers = playersFor(details.format, requestedMax);
  if (pair && maxPlayers < 4) throw validation("A pair needs a game of at least four players.");
  if (!pair && details.joinPolicy === "PAIRS_ONLY") throw validation("A pair challenge is opened by a pair. Confirm a pair first.", { joinPolicy: "Needs a pair" });
  const invitees = [...new Set([...(partnerId ? [partnerId] : []), ...inviteUserIds])].filter((id) => id !== a.id);
  if (invitees.length > maxPlayers - 1) throw validation(`You can invite at most ${maxPlayers - 1} players for this format.`, { inviteUserIds: `Max ${maxPlayers - 1}` });
  if (invitees.length) {
    const found = await db.user.count({ where: { id: { in: invitees }, status: "ACTIVE" } });
    if (found !== invitees.length) throw validation("One of the invited players could not be found.");
  }
  if (details.costMode !== "FIXED_PER_PLAYER") details.costPerPlayerCents = null;

  const created = await db.$transaction(async (tx) => {
    let code = gameCode();
    for (let i = 0; i < 5 && (await tx.gameSession.findUnique({ where: { code }, select: { id: true } })); i++) code = gameCode();
    const g = await tx.gameSession.create({
      data: {
        code,
        organizerId: a.id,
        bookingId,
        locationId: booking.locationId,
        courtId: booking.courtId,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        maxPlayers,
        pairId: pair?.id ?? null,
        ...details,
        participants: {
          create: [
            { userId: a.id, role: "ORGANIZER", status: "ACCEPTED", invitedById: a.id, respondedAt: now, pairId: pair?.id ?? null },
            ...invitees.map((userId) => ({ userId, role: "PLAYER" as const, status: "INVITED" as const, invitedById: a.id, pairId: pair && userId === partnerId ? pair.id : null })),
          ],
        },
      },
      select: gameSelect,
    });
    await audit({ actorId: a.id, action: "game.created", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { code, bookingId, format: g.format, maxPlayers, invited: invitees.length } }, tx);
    return decorate(g);
  });
  await notifyMany(invitees, { type: "game.invited", url: `/app/play/${created.code}`, groupKey: created.id, data: { organizer: a.name, ...whenData(created), code: created.code, gameId: created.id } });
  return created;
}

/* ------------------------------------------------------------------ Read */

async function canView(a: Actor, g: GameView): Promise<boolean> {
  if (isOrganizer(a, g) || participantOf(a, g)) return true;
  if (g.visibility === "PUBLIC" && g.status !== "DRAFT") return true;
  return can(a, "session.read", { locationId: g.locationId });
}

export async function getGameSession(actor: Actor | null, idOrCode: string, opts: { now?: Date } = {}): Promise<GameView> {
  const a = await requireActor(actor);
  await advanceElapsedGames(opts.now);
  const g = await load(idOrCode);
  if (!(await canView(a, g))) throw forbidden();
  // Notes are for the lineup: organizer, invited or accepted players, and staff who may read games here.
  const inLineup = isOrganizer(a, g) || ["INVITED", "ACCEPTED"].includes(participantOf(a, g)?.status ?? "");
  if (!inLineup && !(await can(a, "session.read", { locationId: g.locationId }))) return { ...g, notes: null };
  return g;
}

/** Games the actor organizes or was invited to / accepted. */
export async function listMyGames(actor: Actor | null, scope: "upcoming" | "past", now = new Date()): Promise<GameView[]> {
  const a = await requireActor(actor);
  await advanceElapsedGames(now);
  const mine: Prisma.GameSessionWhereInput = { OR: [{ organizerId: a.id }, { participants: { some: { userId: a.id, status: { in: ["INVITED", "ACCEPTED"] } } } }] };
  const rows = await db.gameSession.findMany({
    where: scope === "upcoming" ? { AND: [mine, { status: { in: LIVE } }, { endsAt: { gte: now } }] } : { AND: [mine, { OR: [{ status: { in: ["COMPLETED", "CANCELLED"] } }, { endsAt: { lt: now } }] }] },
    select: gameSelect,
    orderBy: { startsAt: scope === "upcoming" ? "asc" : "desc" },
    take: 100,
  });
  return rows.map(decorate);
}

/** Discoverable games: PUBLIC, OPEN, in the future, with a free spot. Level and day filters are optional. */
export async function discoverGames(actor: Actor | null, input: unknown = {}, now = new Date()): Promise<GameView[]> {
  await requireActor(actor);
  const parsed = gameDiscoverSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the filters.", fieldErrors(parsed.error));
  const { locationId, level, dateISO, take } = parsed.data;
  await advanceElapsedGames(now);
  const rows = await db.gameSession.findMany({
    where: {
      visibility: "PUBLIC",
      status: "OPEN",
      startsAt: { gt: now },
      ...(locationId ? { locationId } : {}),
      ...(level ? { OR: [{ levels: { isEmpty: true } }, { levels: { has: level } }] } : {}),
    },
    select: gameSelect,
    orderBy: { startsAt: "asc" },
    take: take * 2,
  });
  return rows
    .map(decorate)
    .filter((g) => g.spotsLeft > 0 && (!dateISO || utcToZoned(g.startsAt, g.location.timezone).dateISO === dateISO))
    .slice(0, take);
}

/** Staff listing across the locations the actor may read. */
export async function listGamesInScope(actor: Actor | null, input: unknown = {}, now = new Date()) {
  const a = await requireActor(actor);
  const parsed = gameListSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the filters.", fieldErrors(parsed.error));
  const { locationId, status, scope, page, pageSize } = parsed.data;
  const ids = await accessibleLocationIds(a, "session.read");
  if (ids !== "all" && ids.length === 0) throw forbidden();
  if (locationId && ids !== "all" && !ids.includes(locationId)) throw forbidden();
  await advanceElapsedGames(now);
  const where: Prisma.GameSessionWhereInput = {
    ...(locationId ? { locationId } : ids === "all" ? {} : { locationId: { in: ids } }),
    ...(status ? { status } : {}),
    ...(scope === "upcoming" ? { endsAt: { gte: now } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.gameSession.findMany({ where, select: gameSelect, orderBy: { startsAt: scope === "upcoming" ? "asc" : "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.gameSession.count({ where }),
  ]);
  return { items: rows.map(decorate), total, page, pageSize };
}

/* ------------------------------------------------------------------ Lineup: invites, responses, leaving, removal */

/** Organizer invites players. Accepted + pending invites never exceed the player count, so spots stay honest. */
export async function inviteToGame(actor: Actor | null, sessionId: string, input: unknown): Promise<GameView> {
  const g = await load(sessionId);
  const a = await requireOrganizer(actor, g);
  const parsed = inviteToGameSchema.safeParse(input);
  if (!parsed.success) throw validation("Choose at least one player.", fieldErrors(parsed.error));
  requireStatus(g, JOINABLE, "changed");
  const ids = [...new Set(parsed.data.userIds)].filter((id) => id !== a.id);
  const existing = new Map(g.participants.map((p) => [p.userId, p]));
  const fresh = ids.filter((id) => !["INVITED", "ACCEPTED"].includes(existing.get(id)?.status ?? ""));
  if (fresh.length === 0) return g;
  if (g.acceptedCount + g.invitedCount + fresh.length > g.maxPlayers) {
    const room = Math.max(0, g.maxPlayers - g.acceptedCount - g.invitedCount);
    throw new AppError("SESSION_FULL", room === 0 ? "Every spot is taken or already has a pending invitation." : `Only ${room} more ${room === 1 ? "invitation fits" : "invitations fit"} in this game.`);
  }
  const users = await db.user.findMany({ where: { id: { in: fresh }, status: "ACTIVE" }, select: { id: true } });
  if (users.length !== fresh.length) throw validation("One of the players could not be found.");

  const updated = await db.$transaction(async (tx) => {
    for (const userId of fresh) {
      await tx.gameParticipant.upsert({
        where: { sessionId_userId: { sessionId: g.id, userId } },
        create: { sessionId: g.id, userId, role: "PLAYER", status: "INVITED", invitedById: a.id },
        update: { status: "INVITED", invitedById: a.id, invitedAt: new Date(), respondedAt: null },
      });
    }
    await audit({ actorId: a.id, action: "game.invited", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { userIds: fresh } }, tx);
    return load(g.id, tx);
  });
  await notifyMany(fresh, { type: "game.invited", url: `/app/play/${g.code}`, groupKey: g.id, data: { organizer: a.name, ...whenData(g), code: g.code, gameId: g.id } });
  return updated;
}

/**
 * An invited player accepts or declines. Acceptance locks the session row and recounts inside the
 * transaction so concurrent accepts can never exceed maxPlayers.
 */
export async function respondToInvite(actor: Actor | null, sessionId: string, response: "ACCEPT" | "DECLINE", opts: { now?: Date } = {}): Promise<GameView> {
  const a = await requirePermission(actor, "session.participate.own");
  const now = opts.now ?? new Date();
  const g = await load(sessionId);
  const me = participantOf(a, g);
  if (!me || me.status !== "INVITED") throw forbidden("You have no pending invitation to this game.");
  if (g.status === "CANCELLED" || g.status === "COMPLETED" || g.status === "IN_PROGRESS") throw new AppError("INVALID_TRANSITION", `This game is ${label(g.status)}.`);

  if (response === "DECLINE") {
    const updated = await db.$transaction(async (tx) => {
      await tx.gameParticipant.update({ where: { id: me.id }, data: { status: "DECLINED", respondedAt: now } });
      await audit({ actorId: a.id, action: "game.declined", entityType: "GameSession", entityId: g.id, locationId: g.locationId }, tx);
      return load(g.id, tx);
    });
    await notify(g.organizerId, { type: "game.declined", url: `/app/play/${g.code}`, groupKey: g.id, data: { player: a.name, ...whenData(g), code: g.code, gameId: g.id } });
    return updated;
  }

  const updated = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GameSession" WHERE "id" = ${g.id} FOR UPDATE`;
      const fresh = await load(g.id, tx);
      if (!JOINABLE.includes(fresh.status) && fresh.status !== "FULL") throw new AppError("INVALID_TRANSITION", `This game is ${label(fresh.status)}.`);
      if (fresh.acceptedCount >= fresh.maxPlayers) throw new AppError("SESSION_FULL", "This game just filled up.");
      await tx.gameParticipant.update({ where: { id: me.id }, data: { status: "ACCEPTED", respondedAt: now } });
      const next = fillStatus(fresh.status, fresh.acceptedCount + 1, fresh.maxPlayers);
      if (next !== fresh.status) await tx.gameSession.update({ where: { id: g.id }, data: { status: next } });
      await audit({ actorId: a.id, action: "game.accepted", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { status: next } }, tx);
      return load(g.id, tx);
    },
    { isolationLevel: "ReadCommitted" },
  );
  await notify(g.organizerId, { type: "game.accepted", url: `/app/play/${g.code}`, groupKey: g.id, data: { player: a.name, accepted: updated.acceptedCount, max: updated.maxPlayers, ...whenData(g), code: g.code, gameId: g.id } });
  if (updated.status === "OPEN" && updated.spotsLeft === 1) {
    await notify(g.organizerId, { type: "game.almost_full", url: `/app/play/${g.code}`, groupKey: g.id, data: { ...whenData(g), code: g.code, gameId: g.id } });
  }
  return updated;
}

/** An accepted player steps out. A full or confirmed game reopens its spot. */
export async function leaveGame(actor: Actor | null, sessionId: string, opts: { now?: Date } = {}): Promise<GameView> {
  const a = await requirePermission(actor, "session.participate.own");
  const g = await load(sessionId);
  const me = participantOf(a, g);
  if (!me || me.status !== "ACCEPTED") throw forbidden("You are not in this game.");
  if (me.role === "ORGANIZER") throw validation("The organizer cannot leave. Cancel the game instead.");
  requireStatus(g, ["DRAFT", "OPEN", "FULL", "CONFIRMED"], "left");
  let promoted: WaitlistPromotion[] = [];
  const updated = await db.$transaction(async (tx) => {
    await tx.gameParticipant.update({ where: { id: me.id }, data: { status: "LEFT", respondedAt: opts.now ?? new Date() } });
    const next = fillStatus(g.status, g.acceptedCount - 1, g.maxPlayers);
    if (next !== g.status) await tx.gameSession.update({ where: { id: g.id }, data: { status: next } });
    await audit({ actorId: a.id, action: "game.left", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { status: next } }, tx);
    promoted = await promoteWaitlist(tx, g.id);
    return load(g.id, tx);
  });
  await notify(g.organizerId, {
    type: "game.left",
    url: `/app/play/${g.code}`,
    groupKey: g.id,
    data: {
      player: a.name,
      spots: updated.spotsLeft,
      spotsPlural: plural(updated.spotsLeft),
      ...whenData(g),
      waitlistSuffix: suffix(promoted.length ? `${promoted.length} waitlisted request${plural(promoted.length)} are pending again.` : ""),
      code: g.code,
      gameId: g.id,
    },
  });
  await announcePromotions(g, promoted);
  await suggestToCompatiblePlayers(updated);
  return updated;
}

/** Organizer removes a player or withdraws an invitation. */
export async function removeParticipant(actor: Actor | null, sessionId: string, userId: string): Promise<GameView> {
  const g = await load(sessionId);
  const a = await requireOrganizer(actor, g);
  const target = g.participants.find((p) => p.userId === userId);
  if (!target || !["INVITED", "ACCEPTED"].includes(target.status)) throw notFound("Participant");
  if (target.role === "ORGANIZER") throw validation("The organizer cannot be removed.");
  requireStatus(g, ["DRAFT", "OPEN", "FULL", "CONFIRMED"], "changed");
  const wasAccepted = target.status === "ACCEPTED";
  let promoted: WaitlistPromotion[] = [];
  const updated = await db.$transaction(async (tx) => {
    await tx.gameParticipant.update({ where: { id: target.id }, data: { status: "REMOVED", respondedAt: new Date() } });
    const next = wasAccepted ? fillStatus(g.status, g.acceptedCount - 1, g.maxPlayers) : g.status;
    if (next !== g.status) await tx.gameSession.update({ where: { id: g.id }, data: { status: next } });
    await audit({ actorId: a.id, action: wasAccepted ? "game.participant_removed" : "game.invite_withdrawn", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { userId } }, tx);
    if (wasAccepted) promoted = await promoteWaitlist(tx, g.id);
    return load(g.id, tx);
  });
  await notify(userId, { type: "game.removed", url: `/app/play/${g.code}`, data: { headline: wasAccepted ? "You were removed from a game" : "An invitation was withdrawn", ...whenData(g), code: g.code, gameId: g.id } });
  await announcePromotions(g, promoted);
  await suggestToCompatiblePlayers(updated);
  return updated;
}

/* ------------------------------------------------------------------ Organizer: details, publish, confirm, cancel */

export async function updateGameSession(actor: Actor | null, sessionId: string, input: unknown): Promise<GameView> {
  const g = await load(sessionId);
  const a = await requireOrganizer(actor, g);
  const parsed = updateGameSessionSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  requireStatus(g, EDITABLE, "edited");
  const data: Prisma.GameSessionUpdateInput = { ...parsed.data };
  const format = parsed.data.format ?? g.format;
  if (parsed.data.format !== undefined || parsed.data.maxPlayers !== undefined) {
    const max = playersFor(format, parsed.data.maxPlayers ?? (format === g.format ? g.maxPlayers : undefined));
    if (max < g.acceptedCount) throw validation(`${g.acceptedCount} players already accepted; the game cannot shrink below that.`, { maxPlayers: `At least ${g.acceptedCount}` });
    if (max < g.acceptedCount + g.invitedCount) throw validation("Withdraw pending invitations before reducing the player count.", { maxPlayers: `At least ${g.acceptedCount + g.invitedCount}` });
    data.maxPlayers = max;
  }
  const costMode = parsed.data.costMode ?? g.costMode;
  if (costMode !== "FIXED_PER_PLAYER") data.costPerPlayerCents = null;
  let promoted: WaitlistPromotion[] = [];
  const updated = await db.$transaction(async (tx) => {
    await tx.gameSession.update({ where: { id: g.id }, data });
    const fresh = await load(g.id, tx);
    const next = fillStatus(fresh.status, fresh.acceptedCount, fresh.maxPlayers);
    if (next !== fresh.status) await tx.gameSession.update({ where: { id: g.id }, data: { status: next } });
    await audit({ actorId: a.id, action: "game.updated", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { fields: Object.keys(parsed.data) } }, tx);
    if (fresh.spotsLeft > 0) promoted = await promoteWaitlist(tx, g.id);
    return load(g.id, tx);
  });
  await announcePromotions(updated, promoted);
  return updated;
}

/** DRAFT → OPEN (or FULL when the lineup is already complete). Requires a live booking in the future. */
export async function publishGame(actor: Actor | null, sessionId: string, opts: { now?: Date } = {}): Promise<GameView> {
  const g = await load(sessionId);
  const a = await requireOrganizer(actor, g);
  requireStatus(g, ["DRAFT"], "published");
  const now = opts.now ?? new Date();
  if (g.booking.status !== "CONFIRMED" && g.booking.status !== "PENDING") throw validation("The court booking is no longer active.");
  if (g.startsAt <= now) throw validation("The booking has already started.");
  const next: GameStatus = g.acceptedCount >= g.maxPlayers ? "FULL" : "OPEN";
  const updated = await db.$transaction(async (tx) => {
    await tx.gameSession.update({ where: { id: g.id }, data: { status: next, publishedAt: now } });
    await audit({ actorId: a.id, action: "game.published", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { status: next, visibility: g.visibility } }, tx);
    return load(g.id, tx);
  });
  await suggestToCompatiblePlayers(updated);
  return updated;
}

/**
 * Tells the players a newly open game actually suits that it exists. Imported lazily because the matchmaking
 * engine reads this module, and it never blocks the organizer: a failure here is logged, not surfaced.
 */
async function suggestToCompatiblePlayers(g: GameView): Promise<void> {
  if (g.visibility !== "PUBLIC" || g.status !== "OPEN" || !g.openToRequests) return;
  try {
    const { announceCompatibleGame } = await import("./matchmaking");
    await announceCompatibleGame(g.id);
  } catch (e) {
    console.error("[game] suggesting a game to compatible players failed", e);
  }
}

/** FULL → CONFIRMED: the organizer locks the lineup. Players are told the game is on. */
export async function confirmGame(actor: Actor | null, sessionId: string, opts: { now?: Date } = {}): Promise<GameView> {
  const g = await load(sessionId);
  const a = await requireOrganizer(actor, g);
  if (g.status === "OPEN") throw new AppError("INVALID_TRANSITION", `${g.spotsLeft} spot${g.spotsLeft === 1 ? " is" : "s are"} still open. Fill the lineup before confirming.`);
  requireStatus(g, ["FULL"], "confirmed");
  const now = opts.now ?? new Date();
  const updated = await db.$transaction(async (tx) => {
    await tx.gameSession.update({ where: { id: g.id }, data: { status: "CONFIRMED", confirmedAt: now } });
    await audit({ actorId: a.id, action: "game.confirmed", entityType: "GameSession", entityId: g.id, locationId: g.locationId }, tx);
    return load(g.id, tx);
  });
  // Outside the transaction: a billing failure must not undo a lineup the players have already agreed.
  await billGameShares(g.id, a.id, { now }).catch(() => undefined);
  const others = g.participants.filter((p) => p.status === "ACCEPTED" && p.userId !== a.id).map((p) => p.userId);
  await notifyMany(others, { type: "game.confirmed", url: `/app/play/${g.code}`, groupKey: g.id, data: { ...whenData(g), code: g.code, gameId: g.id } });
  return updated;
}

/** Organizer, or staff with session.manage at the location, cancels the game. The booking is untouched. */
export async function cancelGame(actor: Actor | null, sessionId: string, input: unknown = {}, opts: { now?: Date } = {}): Promise<GameView> {
  const a = await requireActor(actor);
  const g = await load(sessionId);
  const parsed = cancelGameSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const staff = !isOrganizer(a, g) && (await can(a, "session.manage", { locationId: g.locationId }));
  if (!isOrganizer(a, g) && !staff) throw forbidden();
  requireStatus(g, LIVE, "cancelled");
  const now = opts.now ?? new Date();
  let requesters: string[] = [];
  const updated = await db.$transaction(async (tx) => {
    await tx.gameSession.update({ where: { id: g.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: a.id, cancelReason: parsed.data.reason } });
    await audit({ actorId: a.id, action: "game.cancelled", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { byStaff: staff, reason: parsed.data.reason } }, tx);
    requesters = await expireRequestsForGame(tx, g.id);
    return load(g.id, tx);
  });
  // The shares go; the court booking does not, because it may still be going ahead.
  await unbillGameShares(g.id, a.id, { now }).catch(() => undefined);
  const others = [...new Set([...g.participants.filter((p) => ["ACCEPTED", "INVITED"].includes(p.status)).map((p) => p.userId), ...requesters])].filter((id) => id !== a.id);
  await notifyMany(others, { type: "game.cancelled", url: `/app/play/${g.code}`, groupKey: g.id, data: { ...whenData(g), reasonSuffix: suffix(parsed.data.reason), code: g.code, gameId: g.id } });
  return updated;
}

/* ------------------------------------------------------------------ Time-driven transitions and booking hooks */

/**
 * Moves games along with the clock: live games become IN_PROGRESS at start and COMPLETED at the end;
 * drafts that were never published expire. Cheap enough to run on reads.
 */
export async function advanceElapsedGames(now = new Date()): Promise<{ started: number; completed: number; expired: number }> {
  await db.gameJoinRequest.updateMany({ where: { status: { in: ["PENDING", "WAITLISTED"] }, OR: [{ expiresAt: { lte: now } }, { session: { startsAt: { lte: now } } }] }, data: { status: "EXPIRED" } });
  const [completed, started, expired] = await Promise.all([
    db.gameSession.updateMany({ where: { status: { in: ["OPEN", "FULL", "CONFIRMED", "IN_PROGRESS"] }, endsAt: { lte: now } }, data: { status: "COMPLETED" } }),
    db.gameSession.updateMany({ where: { status: { in: ["OPEN", "FULL", "CONFIRMED"] }, startsAt: { lte: now }, endsAt: { gt: now } }, data: { status: "IN_PROGRESS" } }),
    db.gameSession.updateMany({ where: { status: "DRAFT", endsAt: { lte: now } }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Expired before it was published" } }),
  ]);
  return { started: started.count, completed: completed.count, expired: expired.count };
}

/** What a booking hook hands back so the caller can notify after its transaction commits. */
export type GameCascade = { gameId: string; code: string; userIds: string[] };

/** Called inside cancelBooking's transaction. Returns the people to notify once the transaction commits. */
export async function cancelGameForBooking(tx: Prisma.TransactionClient, bookingId: string, actorId: string, now: Date): Promise<GameCascade | null> {
  const g = await tx.gameSession.findUnique({ where: { bookingId }, select: { id: true, code: true, status: true, locationId: true, organizerId: true, participants: { select: { userId: true, status: true } } } });
  if (!g || !LIVE.includes(g.status)) return null;
  await tx.gameSession.update({ where: { id: g.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: actorId, cancelReason: "Court booking cancelled" } });
  await audit({ actorId, action: "game.cancelled", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { reason: "booking cancelled", bookingId } }, tx);
  const requesters = await expireRequestsForGame(tx, g.id);
  const userIds = [...g.participants.filter((p) => ["ACCEPTED", "INVITED"].includes(p.status)).map((p) => p.userId), ...requesters].filter((id) => id !== actorId);
  if (g.organizerId !== actorId) userIds.push(g.organizerId);
  return { gameId: g.id, code: g.code, userIds: [...new Set(userIds)] };
}

/** Called inside rescheduleBooking's transaction: the game follows its booking to the new court and time. */
export async function moveGameToBooking(tx: Prisma.TransactionClient, oldBookingId: string, next: { id: string; courtId: string; startsAt: Date; endsAt: Date }, actorId: string): Promise<GameCascade | null> {
  const g = await tx.gameSession.findUnique({ where: { bookingId: oldBookingId }, select: { id: true, code: true, status: true, locationId: true, organizerId: true, participants: { select: { userId: true, status: true } } } });
  if (!g || !LIVE.includes(g.status)) return null;
  await tx.gameSession.update({ where: { id: g.id }, data: { bookingId: next.id, courtId: next.courtId, startsAt: next.startsAt, endsAt: next.endsAt } });
  await audit({ actorId, action: "game.moved", entityType: "GameSession", entityId: g.id, locationId: g.locationId, metadata: { from: oldBookingId, to: next.id, startsAt: next.startsAt } }, tx);
  const userIds = g.participants.filter((p) => ["ACCEPTED", "INVITED"].includes(p.status) && p.userId !== actorId).map((p) => p.userId);
  return { gameId: g.id, code: g.code, userIds: [...new Set(userIds)] };
}

/* ------------------------------------------------------------------ Join-request hooks shared with matchmaking.ts */

/** Open requests on a cancelled game expire. Returns the requesters (and pair partners) to notify. */
export async function expireRequestsForGame(tx: Prisma.TransactionClient, gameId: string): Promise<string[]> {
  const open = await tx.gameJoinRequest.findMany({ where: { sessionId: gameId, status: { in: ["PENDING", "WAITLISTED"] } }, select: { id: true, userId: true, pair: { select: { playerAId: true, playerBId: true } } } });
  if (open.length === 0) return [];
  await tx.gameJoinRequest.updateMany({ where: { id: { in: open.map((r) => r.id) } }, data: { status: "EXPIRED" } });
  return [...new Set(open.flatMap((r) => [r.userId, ...(r.pair ? [r.pair.playerAId, r.pair.playerBId] : [])]))];
}

/** One requester who moved off the waitlist, with their place in the promoted queue. */
export type WaitlistPromotion = { userId: string; position: number };

/**
 * When spots reopen, waitlisted requests that now fit become PENDING again (oldest first). Nothing is accepted:
 * the organizer still decides. Returns the people to tell, oldest request first, so the caller can notify them
 * once the transaction has committed.
 */
export async function promoteWaitlist(tx: Prisma.TransactionClient, gameId: string): Promise<WaitlistPromotion[]> {
  const g = await load(gameId, tx);
  if (g.status !== "OPEN" || g.spotsLeft === 0) return [];
  const waiting = await tx.gameJoinRequest.findMany({
    where: { sessionId: gameId, status: "WAITLISTED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, spots: true, userId: true, pair: { select: { playerAId: true, playerBId: true } } },
  });
  const fit = waiting.filter((r) => r.spots <= g.spotsLeft);
  if (fit.length === 0) return [];
  await tx.gameJoinRequest.updateMany({ where: { id: { in: fit.map((r) => r.id) } }, data: { status: "PENDING" } });
  const seen = new Set<string>();
  const out: WaitlistPromotion[] = [];
  fit.forEach((r, i) => {
    for (const userId of [r.userId, ...(r.pair ? [r.pair.playerAId, r.pair.playerBId] : [])]) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      out.push({ userId, position: i + 1 });
    }
  });
  return out;
}

/** Once a game fills, the remaining pending requests wait. Returns the requester ids to notify. */
export async function waitlistPending(tx: Prisma.TransactionClient, gameId: string): Promise<string[]> {
  const pending = await tx.gameJoinRequest.findMany({ where: { sessionId: gameId, status: "PENDING" }, select: { id: true, userId: true } });
  if (pending.length === 0) return [];
  await tx.gameJoinRequest.updateMany({ where: { id: { in: pending.map((r) => r.id) } }, data: { status: "WAITLISTED" } });
  return pending.map((r) => r.userId);
}
