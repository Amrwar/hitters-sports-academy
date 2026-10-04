import type { GameRequestKind, MatchmakingConfig, PlayerLevel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, conflict, forbidden, notFound, validation } from "@/lib/errors";
import { can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { utcToZoned } from "@/lib/time";
import { canWaitlist, compareMatches, evaluateMatch, type MatchCandidate, type MatchConfig, type MatchResult, type Seeker } from "@/lib/matching";
import { decideRequestSchema, fieldErrors, findMatchesSchema, joinRequestSchema, matchmakingConfigSchema } from "@/lib/validation/schemas";
import { decorate, gameSelect, waitlistPending, advanceElapsedGames, type GameView } from "./game-sessions";
import { getLevelDefinitions } from "./levels";
import { notify, notifyMany } from "./notifications";
import { suffix } from "@/lib/notifications";
import { requireActivePair, type PairView } from "./pairs";

/* ------------------------------------------------------------------ Academy configuration */

let cfgCache: { row: MatchmakingConfig; at: number } | null = null;

export async function getMatchmakingConfig(): Promise<MatchmakingConfig> {
  if (cfgCache && Date.now() - cfgCache.at < 60_000) return cfgCache.row;
  let row = await db.matchmakingConfig.findUnique({ where: { id: "default" } });
  if (!row) {
    // Two first readers may race to create the singleton; the loser simply reads it back.
    row = await db.matchmakingConfig.create({ data: { id: "default" } }).catch(() => db.matchmakingConfig.findUniqueOrThrow({ where: { id: "default" } }));
  }
  cfgCache = { row, at: Date.now() };
  return row;
}

export function invalidateMatchmakingConfigCache() {
  cfgCache = null;
}

export async function updateMatchmakingConfig(actor: Actor | null, input: unknown): Promise<MatchmakingConfig> {
  const a = await requirePermission(actor, "matchmaking.configure");
  const parsed = matchmakingConfigSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  return db.$transaction(async (tx) => {
    const cfg = await tx.matchmakingConfig.upsert({ where: { id: "default" }, create: { id: "default", ...parsed.data }, update: parsed.data });
    await audit({ actorId: a.id, action: "matchmaking.configured", entityType: "MatchmakingConfig", entityId: "default", metadata: parsed.data }, tx);
    return cfg;
  }).then((cfg) => {
    cfgCache = { row: cfg, at: Date.now() };
    return cfg;
  });
}

async function matchConfig(): Promise<MatchConfig> {
  const [cfg, levels] = await Promise.all([getMatchmakingConfig(), getLevelDefinitions()]);
  return {
    allowAdjacentLevels: cfg.allowAdjacentLevels,
    ranks: Object.fromEntries(levels.map((l) => [l.level, l.rank])) as Record<PlayerLevel, number>,
    labels: Object.fromEntries(levels.map((l) => [l.level, l.label])) as Record<PlayerLevel, string>,
  };
}

/* ------------------------------------------------------------------ Seeker and candidates */

const seekerProfileSelect = { level: true, homeLocationId: true, preferredTimes: true, matchType: true, preferredLocations: { select: { id: true } } } satisfies Prisma.PlayerProfileSelect;

async function buildSeeker(a: Actor, opts: { kind: GameRequestKind; pairId?: string; dateISO?: string; startMinutes?: number; endMinutes?: number; selectedLocationIds?: string[] }): Promise<{ seeker: Seeker; pair: PairView | null }> {
  const profile = await db.playerProfile.findUnique({ where: { userId: a.id }, select: seekerProfileSelect });
  if (!profile) throw notFound("Profile");
  let pair: PairView | null = null;
  let partner: Seeker["partner"] = null;
  if (opts.kind === "PAIR") {
    if (!opts.pairId) throw validation("Choose which pair you are requesting with.", { pairId: "Required for a pair request" });
    pair = await requireActivePair(a, opts.pairId);
    const partnerUser = pair.playerAId === a.id ? pair.playerB : pair.playerA;
    partner = { userId: partnerUser.id, level: partnerUser.playerProfile?.level ?? null };
  }
  return {
    pair,
    seeker: {
      userId: a.id,
      level: profile.level,
      homeLocationId: profile.homeLocationId,
      preferredLocationIds: profile.preferredLocations.map((l) => l.id),
      preferredTimes: profile.preferredTimes,
      matchType: profile.matchType,
      kind: opts.kind,
      partner,
      dateISO: opts.dateISO,
      startMinutes: opts.startMinutes,
      endMinutes: opts.endMinutes,
      selectedLocationIds: opts.selectedLocationIds,
    },
  };
}

export function toCandidate(g: GameView): MatchCandidate {
  const z = utcToZoned(g.startsAt, g.location.timezone);
  return {
    id: g.id,
    code: g.code,
    status: g.status,
    visibility: g.visibility,
    openToRequests: g.openToRequests,
    joinPolicy: g.joinPolicy,
    levelPolicy: g.levelPolicy,
    levels: g.levels,
    matchType: g.matchType,
    organizerId: g.organizerId,
    locationId: g.locationId,
    locationName: g.location.name,
    dateISO: z.dateISO,
    startMinutes: z.minutes,
    endMinutes: z.minutes + g.booking.durationMinutes,
    dayOfWeek: z.dayOfWeek,
    startsAt: g.startsAt,
    maxPlayers: g.maxPlayers,
    acceptedCount: g.acceptedCount,
    participants: g.participants.map((p) => ({ userId: p.userId, status: p.status })),
    // A pair request counts for both members, so a partner cannot slip in a second request.
    requests: g.requests.flatMap((r) => (r.pair ? [r.pair.playerAId, r.pair.playerBId] : [r.userId]).map((userId) => ({ userId, status: r.status, pairId: r.pairId }))),
  };
}

export type Recommendation = { game: GameView; match: MatchResult; waitlist: boolean };

export type FindResult = {
  items: Recommendation[];
  seeker: { level: PlayerLevel | null; kind: GameRequestKind; pair: PairView | null; adjacentAllowed: boolean };
  /** Games that were close but blocked, with the reason, so the player understands why nothing shows. */
  nearMisses: { game: GameView; blockers: string[] }[];
};

/**
 * Scenario 4 (and the default "For you" list): rank every discoverable open game for this player.
 * Deterministic: same inputs, same order. Location only ranks; it never hides a game unless the date or
 * time window excludes it.
 */
export async function findMatches(actor: Actor | null, input: unknown = {}, now = new Date()): Promise<FindResult> {
  const a = await requirePermission(actor, "session.participate.own");
  const parsed = findMatchesSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the search.", fieldErrors(parsed.error));
  const { dateISO, startMinutes, endMinutes, locationIds, kind, pairId, take } = parsed.data;
  if (startMinutes !== undefined && endMinutes !== undefined && endMinutes < startMinutes) throw validation("The time window ends before it starts.", { endMinutes: "After the start" });
  await advanceElapsedGames(now);
  const [{ seeker, pair }, config] = await Promise.all([buildSeeker(a, { kind, pairId, dateISO, startMinutes, endMinutes, selectedLocationIds: locationIds }), matchConfig()]);

  const rows = await db.gameSession.findMany({
    where: { visibility: "PUBLIC", status: "OPEN", openToRequests: true, startsAt: { gt: now }, organizerId: { not: a.id } },
    select: gameSelect,
    orderBy: { startsAt: "asc" },
    take: 300,
  });
  const scored: Recommendation[] = [];
  const nearMisses: FindResult["nearMisses"] = [];
  for (const row of rows) {
    const game = decorate(row);
    const match = evaluateMatch(toCandidate(game), seeker, config);
    if (match.eligible) scored.push({ game, match, waitlist: false });
    else if (!match.blockers.some((b) => b.startsWith("Not on the date") || b.startsWith("Starts outside"))) nearMisses.push({ game, blockers: match.blockers });
  }
  scored.sort((x, y) => compareMatches({ score: x.match.score, startsAt: x.game.startsAt, code: x.game.code }, { score: y.match.score, startsAt: y.game.startsAt, code: y.game.code }));
  return { items: scored.slice(0, take), seeker: { level: seeker.level, kind, pair, adjacentAllowed: config.allowAdjacentLevels }, nearMisses: nearMisses.slice(0, 5) };
}

/** Compatibility of one game for the actor, shown on the game page before they request. */
export async function evaluateGameForActor(actor: Actor | null, game: GameView, opts: { kind?: GameRequestKind; pairId?: string } = {}): Promise<MatchResult & { waitlist: boolean }> {
  const a = await requireActor(actor);
  const kind = opts.kind ?? "SOLO";
  const [{ seeker }, config] = await Promise.all([buildSeeker(a, { kind, pairId: opts.pairId }), matchConfig()]);
  const result = evaluateMatch(toCandidate(game), seeker, config);
  return { ...result, waitlist: !result.eligible && canWaitlist(result) };
}

/* ------------------------------------------------------------------ Requests */

export const requestSelect = {
  id: true,
  sessionId: true,
  userId: true,
  kind: true,
  pairId: true,
  spots: true,
  status: true,
  message: true,
  score: true,
  reasons: true,
  expiresAt: true,
  decidedById: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  user: { select: { id: true, name: true, playerProfile: { select: { level: true, side: true, photoUrl: true, visibility: true, yearsPlaying: true, matchType: true, playStyle: true } } } },
  pair: { select: { id: true, name: true, playerAId: true, playerBId: true, playerA: { select: { id: true, name: true, playerProfile: { select: { level: true, side: true } } } }, playerB: { select: { id: true, name: true, playerProfile: { select: { level: true, side: true } } } } } },
  session: { select: gameSelect },
} satisfies Prisma.GameJoinRequestSelect;

type RequestRow = Prisma.GameJoinRequestGetPayload<{ select: typeof requestSelect }>;
export type RequestView = Omit<RequestRow, "session"> & { game: GameView };

function viewRequest(r: RequestRow): RequestView {
  const { session, ...rest } = r;
  return { ...rest, game: decorate(session) };
}

async function loadRequest(id: string, tx: Prisma.TransactionClient | typeof db = db): Promise<RequestView> {
  const r = await tx.gameJoinRequest.findUnique({ where: { id }, select: requestSelect });
  if (!r) throw notFound("Request");
  return viewRequest(r);
}

function membersOf(r: { userId: string; pair: { playerAId: string; playerBId: string } | null }): string[] {
  return r.pair ? [r.pair.playerAId, r.pair.playerBId] : [r.userId];
}

/**
 * Scenarios 1 to 3: a solo player asks for one spot, a confirmed pair asks for two. The engine decides
 * eligibility; a full game may be waitlisted. Nothing is accepted here: the organizer decides.
 */
export async function requestToJoin(actor: Actor | null, sessionId: string, input: unknown = {}, opts: { now?: Date } = {}): Promise<RequestView> {
  const a = await requirePermission(actor, "session.participate.own");
  const parsed = joinRequestSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { kind, pairId, message } = parsed.data;
  const now = opts.now ?? new Date();
  await advanceElapsedGames(now);
  const row = await db.gameSession.findUnique({ where: { id: sessionId }, select: gameSelect });
  if (!row) throw notFound("Game");
  const game = decorate(row);
  const [{ seeker, pair }, config, cfg] = await Promise.all([buildSeeker(a, { kind, pairId }), matchConfig(), getMatchmakingConfig()]);
  const result = evaluateMatch(toCandidate(game), seeker, config);
  const waitlist = !result.eligible && canWaitlist(result);
  if (!result.eligible && !waitlist) throw new AppError("NOT_ELIGIBLE", result.blockers[0]);

  const open = await db.gameJoinRequest.count({ where: { userId: a.id, status: { in: ["PENDING", "WAITLISTED"] } } });
  if (open >= cfg.maxOpenRequests) throw validation(`You already have ${open} open requests. Withdraw one before asking for another game.`);

  const expiresAt = new Date(Math.min(now.getTime() + cfg.requestExpiryHours * 3_600_000, game.startsAt.getTime()));
  const status: "WAITLISTED" | "PENDING" = waitlist ? "WAITLISTED" : "PENDING";
  const reasons = result.reasons.map((r) => r.label);
  const created = await db.$transaction(async (tx) => {
    const existing = await tx.gameJoinRequest.findUnique({ where: { sessionId_userId: { sessionId, userId: a.id } }, select: { id: true, status: true } });
    if (existing && (existing.status === "PENDING" || existing.status === "WAITLISTED")) throw conflict("You already asked to join this game.");
    if (existing && existing.status === "ACCEPTED") throw conflict("You are already in this game.");
    const data = { kind, pairId: pair?.id ?? null, spots: result.spotsNeeded, status, message, score: result.score, reasons, expiresAt, decidedById: null, decidedAt: null, decisionNote: null };
    const r = existing
      ? await tx.gameJoinRequest.update({ where: { id: existing.id }, data: { ...data, createdAt: now }, select: requestSelect })
      : await tx.gameJoinRequest.create({ data: { sessionId, userId: a.id, ...data }, select: requestSelect });
    await audit({ actorId: a.id, action: "game.requested", entityType: "GameJoinRequest", entityId: r.id, locationId: game.locationId, metadata: { gameId: game.id, kind, spots: result.spotsNeeded, status, score: result.score, reasons } }, tx);
    return viewRequest(r);
  });
  const who = pair ? `${a.name} and ${(pair.playerAId === a.id ? pair.playerB : pair.playerA).name.split(" ")[0]}` : a.name;
  await notify(game.organizerId, { type: waitlist ? "game.request_waitlist" : "game.request", url: `/app/play/${game.code}`, groupKey: game.id, data: { who, reasons: reasons.slice(0, 3).join(" · "), code: game.code, gameId: game.id, requestId: created.id } });
  if (pair) {
    const partnerId = pair.playerAId === a.id ? pair.playerBId : pair.playerAId;
    await notify(partnerId, { type: "game.request_sent", url: `/app/play/${game.code}`, data: { player: a.name, club: game.location.name, code: game.code, gameId: game.id, requestId: created.id } });
  }
  return created;
}

/** The requester (or their pair partner) withdraws an open request. */
export async function withdrawRequest(actor: Actor | null, requestId: string, opts: { now?: Date } = {}): Promise<RequestView> {
  const a = await requireActor(actor);
  const r = await loadRequest(requestId);
  if (!membersOf(r).includes(a.id)) throw forbidden();
  if (r.status !== "PENDING" && r.status !== "WAITLISTED") throw new AppError("INVALID_TRANSITION", `This request is already ${r.status.toLowerCase()}.`);
  const updated = await db.$transaction(async (tx) => {
    await tx.gameJoinRequest.update({ where: { id: r.id }, data: { status: "WITHDRAWN", decidedAt: opts.now ?? new Date() } });
    await audit({ actorId: a.id, action: "game.request_withdrawn", entityType: "GameJoinRequest", entityId: r.id, locationId: r.game.locationId }, tx);
    return loadRequest(r.id, tx);
  });
  await notify(r.game.organizerId, { type: "game.request_withdrawn", url: `/app/play/${r.game.code}`, groupKey: r.game.id, data: { player: a.name, code: r.game.code, gameId: r.game.id } });
  return updated;
}

/**
 * Organizer accepts or declines. Acceptance locks the game and the request rows, re-checks the spots and
 * the lineup inside the transaction, and reserves exactly `spots` seats. Two simultaneous approvals therefore
 * cannot overfill the game, and a request can only be accepted once.
 */
export async function decideRequest(actor: Actor | null, requestId: string, input: unknown, opts: { now?: Date } = {}): Promise<RequestView> {
  const a = await requireActor(actor);
  const parsed = decideRequestSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const now = opts.now ?? new Date();
  const r = await loadRequest(requestId);
  if (r.game.organizerId !== a.id) throw forbidden("Only the organizer decides who joins.");
  if (r.status !== "PENDING" && r.status !== "WAITLISTED") throw new AppError("INVALID_TRANSITION", `This request is already ${r.status.toLowerCase()}.`);
  const members = membersOf(r);

  if (parsed.data.decision === "DECLINE") {
    const updated = await db.$transaction(async (tx) => {
      await tx.gameJoinRequest.update({ where: { id: r.id }, data: { status: "DECLINED", decidedById: a.id, decidedAt: now, decisionNote: parsed.data.note } });
      await audit({ actorId: a.id, action: "game.request_declined", entityType: "GameJoinRequest", entityId: r.id, locationId: r.game.locationId, metadata: { note: parsed.data.note } }, tx);
      return loadRequest(r.id, tx);
    });
    await notifyMany(members, { type: "game.request_declined", url: `/app/play/${r.game.code}`, data: { code: r.game.code, reasonSuffix: suffix(parsed.data.note || "The organizer chose another lineup."), gameId: r.game.id } });
    return updated;
  }

  let waitlisted: string[] = [];
  const updated = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GameSession" WHERE "id" = ${r.game.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "GameJoinRequest" WHERE "id" = ${r.id} FOR UPDATE`;
      const fresh = await loadRequest(r.id, tx);
      if (fresh.status !== "PENDING" && fresh.status !== "WAITLISTED") throw new AppError("INVALID_TRANSITION", `This request was already ${fresh.status.toLowerCase()}.`);
      const g = fresh.game;
      if (g.status !== "OPEN" && g.status !== "FULL") throw new AppError("INVALID_TRANSITION", `This game is ${g.status.toLowerCase().replace("_", " ")}.`);
      if (g.spotsLeft < fresh.spots) throw new AppError("SESSION_FULL", fresh.spots === 2 ? `Only ${g.spotsLeft} spot${g.spotsLeft === 1 ? "" : "s"} left; a pair needs two.` : "No spot left in this game.");
      for (const userId of members) {
        const p = g.participants.find((x) => x.userId === userId);
        if (p && p.status === "ACCEPTED") throw conflict("That player is already in the lineup.");
        await tx.gameParticipant.upsert({
          where: { sessionId_userId: { sessionId: g.id, userId } },
          create: { sessionId: g.id, userId, role: "PLAYER", status: "ACCEPTED", invitedById: a.id, respondedAt: now, pairId: fresh.pairId },
          update: { status: "ACCEPTED", respondedAt: now, invitedById: a.id, pairId: fresh.pairId },
        });
      }
      await tx.gameJoinRequest.update({ where: { id: fresh.id }, data: { status: "ACCEPTED", decidedById: a.id, decidedAt: now, decisionNote: parsed.data.note } });
      const accepted = g.acceptedCount + members.filter((userId) => g.participants.find((x) => x.userId === userId)?.status !== "ACCEPTED").length;
      const next = accepted >= g.maxPlayers ? "FULL" : g.status === "FULL" ? "OPEN" : g.status;
      if (next !== g.status) await tx.gameSession.update({ where: { id: g.id }, data: { status: next } });
      if (next === "FULL") waitlisted = await waitlistPending(tx, g.id);
      await audit({ actorId: a.id, action: "game.request_accepted", entityType: "GameJoinRequest", entityId: fresh.id, locationId: g.locationId, metadata: { gameId: g.id, members, status: next } }, tx);
      return loadRequest(fresh.id, tx);
    },
    { isolationLevel: "ReadCommitted" },
  );
  const g = updated.game;
  const names = members.length === 2 ? `${updated.pair!.playerA.name.split(" ")[0]} and ${updated.pair!.playerB.name.split(" ")[0]}` : updated.user.name;
  await Promise.all([
    notifyMany(members, { type: "game.request_accepted", url: `/app/play/${g.code}`, groupKey: g.id, data: { club: g.location.name, court: g.court.name, code: g.code, accepted: g.acceptedCount, max: g.maxPlayers, gameId: g.id } }),
    notifyMany(
      g.participants.filter((p) => p.status === "ACCEPTED" && !members.includes(p.userId) && p.userId !== a.id).map((p) => p.userId),
      { type: "game.lineup", url: `/app/play/${g.code}`, groupKey: g.id, data: { player: names, accepted: g.acceptedCount, max: g.maxPlayers, code: g.code, gameId: g.id } },
    ),
    notifyMany(waitlisted, { type: "game.request_waitlisted", url: `/app/play/${g.code}`, groupKey: g.id, data: { code: g.code, gameId: g.id } }),
  ]);
  return updated;
}

/* ------------------------------------------------------------------ Lists */

export async function listMyRequests(actor: Actor | null, now = new Date()): Promise<RequestView[]> {
  const a = await requireActor(actor);
  await advanceElapsedGames(now);
  const rows = await db.gameJoinRequest.findMany({
    where: { OR: [{ userId: a.id }, { pair: { OR: [{ playerAId: a.id }, { playerBId: a.id }] } }] },
    select: requestSelect,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(viewRequest);
}

export type RequestReview = RequestView & {
  /** Fresh compatibility, re-evaluated now (the stored reasons are what the requester saw). */
  current: MatchResult;
  /** Completed games the requester and organizer both played; null when the requester's profile is private. */
  playedTogether: number | null;
  members: { id: string; name: string; level: PlayerLevel | null; side: string | null }[];
};

/** Organizer's review list for a game: profile, level, requested spots, compatibility and history. Staff may read it. */
export async function listSessionRequests(actor: Actor | null, sessionId: string, now = new Date()): Promise<RequestReview[]> {
  const a = await requireActor(actor);
  await advanceElapsedGames(now);
  const row = await db.gameSession.findUnique({ where: { id: sessionId }, select: gameSelect });
  if (!row) throw notFound("Game");
  const game = decorate(row);
  if (game.organizerId !== a.id && !(await can(a, "session.read", { locationId: game.locationId }))) throw forbidden();
  const [rows, config] = await Promise.all([db.gameJoinRequest.findMany({ where: { sessionId }, select: requestSelect, orderBy: [{ status: "asc" }, { score: "desc" }, { createdAt: "asc" }] }), matchConfig()]);
  const out: RequestReview[] = [];
  for (const r of rows) {
    const v = viewRequest(r);
    const partner = v.pair ? (v.pair.playerAId === v.userId ? v.pair.playerB : v.pair.playerA) : null;
    const seeker: Seeker = {
      userId: v.userId,
      level: v.user.playerProfile?.level ?? null,
      homeLocationId: null,
      preferredLocationIds: [],
      preferredTimes: [],
      matchType: v.user.playerProfile?.matchType ?? "ANY",
      kind: v.kind,
      partner: partner ? { userId: partner.id, level: partner.playerProfile?.level ?? null } : null,
    };
    // Compatibility as the organizer should read it: ignore the requester's own open request on this game.
    const candidate = toCandidate({ ...game, requests: game.requests.filter((x) => x.id !== v.id) });
    const current = evaluateMatch(candidate, seeker, config);
    const members = [{ id: v.user.id, name: v.user.name, level: v.user.playerProfile?.level ?? null, side: v.user.playerProfile?.side ?? null }, ...(partner ? [{ id: partner.id, name: partner.name, level: partner.playerProfile?.level ?? null, side: partner.playerProfile?.side ?? null }] : [])];
    const playedTogether =
      v.user.playerProfile?.visibility === "PRIVATE"
        ? null
        : await db.gameSession.count({ where: { status: "COMPLETED", participants: { some: { userId: v.userId, status: "ACCEPTED" } }, AND: { participants: { some: { userId: game.organizerId, status: "ACCEPTED" } } } } });
    out.push({ ...v, current, playedTogether, members });
  }
  const order = { PENDING: 0, WAITLISTED: 1, ACCEPTED: 2, DECLINED: 3, WITHDRAWN: 4, EXPIRED: 5 } as const;
  return out.sort((x, y) => order[x.status] - order[y.status] || y.score - x.score || x.createdAt.getTime() - y.createdAt.getTime());
}

/** Requests waiting on games the actor organizes (for the Requests tab badge and list). */
export async function listIncomingRequests(actor: Actor | null, now = new Date()): Promise<RequestView[]> {
  const a = await requireActor(actor);
  await advanceElapsedGames(now);
  const rows = await db.gameJoinRequest.findMany({ where: { status: { in: ["PENDING", "WAITLISTED"] }, session: { organizerId: a.id } }, select: requestSelect, orderBy: [{ createdAt: "asc" }] });
  return rows.map(viewRequest);
}

/** The actor's own request on a game (any status), or the one their pair sent. */
export async function getMyRequestForGame(actor: Actor | null, sessionId: string): Promise<RequestView | null> {
  const a = await requireActor(actor);
  const row = await db.gameJoinRequest.findFirst({ where: { sessionId, OR: [{ userId: a.id }, { pair: { OR: [{ playerAId: a.id }, { playerBId: a.id }] } }] }, select: requestSelect, orderBy: { createdAt: "desc" } });
  return row ? viewRequest(row) : null;
}

/* ------------------------------------------------------------------ Suggesting a game to compatible players */

/**
 * The reverse of findMatches: given one open game, which players does it fit? Used when a game is published
 * or a spot reopens, so "a new compatible session" reaches the people it actually suits.
 *
 * The same deterministic engine decides, so a suggestion is explainable with the same reasons the player
 * sees on the game page. Only a strong match is worth interrupting someone for, so weak scores are dropped
 * and the notification's own quiet window stops a player hearing about the same game twice.
 */
export async function announceCompatibleGame(gameId: string, opts: { now?: Date; minScore?: number; take?: number } = {}): Promise<{ notified: number; considered: number }> {
  const now = opts.now ?? new Date();
  const row = await db.gameSession.findUnique({ where: { id: gameId }, select: gameSelect });
  if (!row) return { notified: 0, considered: 0 };
  const game = decorate(row);
  if (game.visibility !== "PUBLIC" || game.status !== "OPEN" || !game.openToRequests || game.startsAt <= now) return { notified: 0, considered: 0 };

  const config = await matchConfig();
  const candidate = toCandidate(game);
  const already = new Set([game.organizerId, ...game.participants.map((p) => p.userId), ...candidate.requests.map((r) => r.userId)]);
  const profiles = await db.playerProfile.findMany({
    where: { user: { status: "ACTIVE", id: { notIn: [...already] } }, ...(game.levels.length ? { level: { not: null } } : {}) },
    select: { userId: true, ...seekerProfileSelect },
    take: 500,
  });

  const fits: { userId: string; score: number; reasons: string[] }[] = [];
  for (const p of profiles) {
    const seeker: Seeker = {
      userId: p.userId,
      level: p.level,
      homeLocationId: p.homeLocationId,
      preferredLocationIds: p.preferredLocations.map((l) => l.id),
      preferredTimes: p.preferredTimes,
      matchType: p.matchType,
      kind: "SOLO",
      partner: null,
    };
    const match = evaluateMatch(candidate, seeker, config);
    if (!match.eligible) continue;
    if (match.score < (opts.minScore ?? 60)) continue;
    fits.push({ userId: p.userId, score: match.score, reasons: match.reasons.slice(0, 2).map((r) => r.label) });
  }
  fits.sort((x, y) => y.score - x.score || x.userId.localeCompare(y.userId));
  const shortlist = fits.slice(0, opts.take ?? 20);

  const z = utcToZoned(game.startsAt, game.location.timezone);
  let notified = 0;
  for (const f of shortlist) {
    const res = await notify(f.userId, {
      type: "match.suggested",
      url: `/app/play/${game.code}`,
      groupKey: game.id,
      data: { when: `${z.dateISO} ${String(Math.floor(z.minutes / 60)).padStart(2, "0")}:${String(z.minutes % 60).padStart(2, "0")}`, club: game.location.name, reasons: f.reasons.join(" · "), code: game.code, gameId: game.id },
    }).catch(() => null);
    if (res?.created) notified++;
  }
  return { notified, considered: profiles.length };
}
