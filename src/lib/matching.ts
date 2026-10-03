/**
 * HITTERS matching engine: pure, deterministic, rules-based. No randomness, no learned weights.
 * Given a candidate game and the seeker's context it answers "may they ask for these spots?" and
 * "how good a match is it?" with human-readable reasons for every rule that fired.
 *
 * Scores (higher is better):
 *   level     exact 40 · any-level game 25 · adjacent 15
 *   location  home club 30 · preferred club 25 · one of the clubs selected in the search 20 · other 0
 *   time      inside the requested window 20 · matches a preferred time of week 10
 *   capacity  exactly the spots needed left 8 · otherwise 4
 *   type      friendly/competitive preference aligned 5
 * Ties break on start time (sooner first) then code, so the same inputs always give the same order.
 */
import type { GameJoinPolicy, GameLevelPolicy, GameParticipantStatus, GameRequestKind, GameRequestStatus, GameStatus, GameVisibility, MatchTypePreference, PlayerLevel } from "@prisma/client";

export type ReasonKind = "level" | "location" | "time" | "capacity" | "type" | "policy";
export type MatchReason = { kind: ReasonKind; label: string; detail?: string; points: number };

export type MatchCandidate = {
  id: string;
  code: string;
  status: GameStatus;
  visibility: GameVisibility;
  openToRequests: boolean;
  joinPolicy: GameJoinPolicy;
  levelPolicy: GameLevelPolicy;
  levels: PlayerLevel[];
  matchType: MatchTypePreference;
  organizerId: string;
  locationId: string;
  locationName: string;
  /** Local wall-clock of the game at its club. */
  dateISO: string;
  startMinutes: number;
  endMinutes: number;
  dayOfWeek: number;
  startsAt: Date;
  maxPlayers: number;
  acceptedCount: number;
  participants: { userId: string; status: GameParticipantStatus }[];
  /** The seeker's (and partner's) existing requests on this game. */
  requests: { userId: string; status: GameRequestStatus; pairId: string | null }[];
};

export type Seeker = {
  userId: string;
  /** Official level; null means not yet assessed. */
  level: PlayerLevel | null;
  homeLocationId: string | null;
  preferredLocationIds: string[];
  /** Keys from PREFERRED_TIMES. */
  preferredTimes: string[];
  matchType: MatchTypePreference;
  kind: GameRequestKind;
  /** For PAIR: the partner's id and level. */
  partner?: { userId: string; level: PlayerLevel | null } | null;
  /** Search filters. */
  dateISO?: string;
  startMinutes?: number;
  endMinutes?: number;
  selectedLocationIds?: string[];
};

export type MatchConfig = {
  allowAdjacentLevels: boolean;
  /** rank by level, 1 = strongest (admin configurable; never assume which letter is highest). */
  ranks: Record<PlayerLevel, number>;
  labels: Record<PlayerLevel, string>;
};

export type MatchResult = {
  eligible: boolean;
  score: number;
  reasons: MatchReason[];
  /** Why the seeker cannot request this game. Empty when eligible. */
  blockers: string[];
  spotsNeeded: number;
};

export const PREFERRED_TIME_WINDOWS: Record<string, { weekend: boolean; from: number; to: number }> = {
  weekday_morning: { weekend: false, from: 5 * 60, to: 12 * 60 },
  weekday_afternoon: { weekend: false, from: 12 * 60, to: 17 * 60 },
  weekday_evening: { weekend: false, from: 17 * 60, to: 24 * 60 },
  weekend_morning: { weekend: true, from: 5 * 60, to: 12 * 60 },
  weekend_afternoon: { weekend: true, from: 12 * 60, to: 17 * 60 },
  weekend_evening: { weekend: true, from: 17 * 60, to: 24 * 60 },
};

/** Egypt weekend is Friday and Saturday (ISO 5, 6); Sunday is a working day. */
export const isWeekend = (dayOfWeek: number) => dayOfWeek === 5 || dayOfWeek === 6;

export function levelFits(level: PlayerLevel | null, game: Pick<MatchCandidate, "levels" | "levelPolicy">, config: MatchConfig): "any" | "exact" | "adjacent" | "none" {
  if (!level) return "none";
  if (game.levels.length === 0) return "any";
  if (game.levels.includes(level)) return "exact";
  if (game.levelPolicy === "ADJACENT" && config.allowAdjacentLevels) {
    const r = config.ranks[level];
    if (game.levels.some((l) => Math.abs(config.ranks[l] - r) === 1)) return "adjacent";
  }
  return "none";
}

export function evaluateMatch(game: MatchCandidate, seeker: Seeker, config: MatchConfig): MatchResult {
  const reasons: MatchReason[] = [];
  const blockers: string[] = [];
  const spotsNeeded = seeker.kind === "PAIR" ? 2 : 1;
  const members = seeker.kind === "PAIR" && seeker.partner ? [seeker.userId, seeker.partner.userId] : [seeker.userId];

  /* 1 · Official level */
  const fit = levelFits(seeker.level, game, config);
  const partnerFit = seeker.kind === "PAIR" && seeker.partner ? levelFits(seeker.partner.level, game, config) : "exact";
  if (!seeker.level) blockers.push("You need an official level first. Request an assessment from your profile.");
  else if (fit === "none") blockers.push(`Level ${seeker.level} is not welcome here (${game.levels.join(", ")} only).`);
  else if (fit === "exact") reasons.push({ kind: "level", label: `Level ${seeker.level} match`, points: 40 });
  else if (fit === "any") reasons.push({ kind: "level", label: "Open to any level", points: 25 });
  else reasons.push({ kind: "level", label: `Adjacent level (${game.levels.join("/")} game, you are ${seeker.level})`, detail: "Allowed by this game and the academy", points: 15 });
  if (seeker.kind === "PAIR" && seeker.partner) {
    if (!seeker.partner.level) blockers.push("Your partner needs an official level first.");
    else if (partnerFit === "none") blockers.push(`Your partner's level ${seeker.partner.level} is not welcome here.`);
  }

  /* 2 · Eligibility and organizer rules */
  if (game.status !== "OPEN" && game.status !== "FULL") blockers.push(`This game is ${game.status.toLowerCase().replace("_", " ")}.`);
  if (game.visibility !== "PUBLIC") blockers.push("This game is private; only invited players can join.");
  if (!game.openToRequests) blockers.push("The organizer is not taking requests for this game.");
  if (game.joinPolicy === "PAIRS_ONLY" && seeker.kind === "SOLO") blockers.push("This is a pair challenge: request it with your pair.");
  if (game.joinPolicy === "SOLO_ONLY" && seeker.kind === "PAIR") blockers.push("This game takes solo players only.");
  if (members.includes(game.organizerId)) blockers.push("You organize this game.");
  for (const m of members) {
    const p = game.participants.find((x) => x.userId === m && (x.status === "ACCEPTED" || x.status === "INVITED"));
    if (p) blockers.push(m === seeker.userId ? (p.status === "ACCEPTED" ? "You are already in this game." : "You are already invited; accept the invitation instead.") : "Your partner is already part of this game.");
    const r = game.requests.find((x) => x.userId === m && (x.status === "PENDING" || x.status === "WAITLISTED"));
    if (r) blockers.push(m === seeker.userId ? "You already asked to join this game." : "Your partner already asked to join this game.");
  }
  if (game.matchType !== "ANY" && seeker.matchType !== "ANY" && game.matchType === seeker.matchType) reasons.push({ kind: "type", label: game.matchType === "FRIENDLY" ? "Friendly game, like you prefer" : "Competitive game, like you prefer", points: 5 });

  /* 3 · Date */
  if (seeker.dateISO && seeker.dateISO !== game.dateISO) blockers.push("Not on the date you chose.");

  /* 4 · Time */
  const hasWindow = seeker.startMinutes !== undefined || seeker.endMinutes !== undefined;
  if (hasWindow) {
    const from = seeker.startMinutes ?? 0;
    const to = seeker.endMinutes ?? 24 * 60;
    if (game.startMinutes >= from && game.startMinutes <= to) reasons.push({ kind: "time", label: "Available at your selected time", points: 20 });
    else blockers.push("Starts outside the time window you chose.");
  } else {
    const slot = Object.entries(PREFERRED_TIME_WINDOWS).find(([key, w]) => seeker.preferredTimes.includes(key) && w.weekend === isWeekend(game.dayOfWeek) && game.startMinutes >= w.from && game.startMinutes < w.to);
    if (slot) reasons.push({ kind: "time", label: "One of your preferred times", detail: slot[0].replace("_", " "), points: 10 });
  }

  /* 5 · 6 · Location preference: ranks, never blocks */
  if (seeker.homeLocationId === game.locationId) reasons.push({ kind: "location", label: "Your home club", points: 30 });
  else if (seeker.preferredLocationIds.includes(game.locationId)) reasons.push({ kind: "location", label: "Preferred location", points: 25 });
  else if (seeker.selectedLocationIds?.includes(game.locationId)) reasons.push({ kind: "location", label: "A club you selected", points: 20 });
  else reasons.push({ kind: "location", label: `Other club: ${game.locationName.replace("HITTERS ", "")}`, points: 0 });

  /* 7 · Capacity */
  const spotsLeft = Math.max(0, game.maxPlayers - game.acceptedCount);
  if (spotsLeft === 0) blockers.push("The game is full. You can ask to be waitlisted.");
  else if (spotsLeft < spotsNeeded) blockers.push(seeker.kind === "PAIR" ? "Only one spot is left; a pair needs two." : "No spot left.");
  else if (spotsLeft === spotsNeeded) reasons.push({ kind: "capacity", label: spotsNeeded === 1 ? "1 spot remaining" : "Exactly 2 spots remaining", detail: "You complete the lineup", points: 8 });
  else reasons.push({ kind: "capacity", label: `${spotsLeft} spots remaining`, points: 4 });

  const score = reasons.reduce((n, r) => n + r.points, 0);
  return { eligible: blockers.length === 0, score, reasons, blockers, spotsNeeded };
}

/** Full-game requests may still be waitlisted: every blocker except capacity is clear. */
export function canWaitlist(result: MatchResult): boolean {
  return result.blockers.length > 0 && result.blockers.every((b) => b.startsWith("The game is full"));
}

/** Stable ordering for recommendations: score, then sooner, then code. */
export function compareMatches<T extends { score: number; startsAt: Date; code: string }>(a: T, b: T): number {
  return b.score - a.score || a.startsAt.getTime() - b.startsAt.getTime() || a.code.localeCompare(b.code);
}
