import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { evaluateMatch, type MatchCandidate, type MatchConfig, type Seeker } from "@/lib/matching";
import * as bookings from "@/server/services/bookings";
import * as courts from "@/server/services/courts";
import * as games from "@/server/services/game-sessions";
import * as mm from "@/server/services/matchmaking";
import * as pairs from "@/server/services/pairs";
import { expectCode, makeLocation, makeUser } from "./helpers";

/* ------------------------------------------------------------------ Pure engine */

const CONFIG: MatchConfig = { allowAdjacentLevels: false, ranks: { A: 1, B: 2, C: 3, D: 4 }, labels: { A: "Advanced", B: "Intermediate+", C: "Intermediate", D: "Beginner" } };
const ADJ: MatchConfig = { ...CONFIG, allowAdjacentLevels: true };

const candidate = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id: "g1",
  code: "GM-TEST01",
  status: "OPEN",
  visibility: "PUBLIC",
  openToRequests: true,
  joinPolicy: "OPEN",
  levelPolicy: "EXACT",
  levels: ["B"],
  matchType: "ANY",
  organizerId: "org",
  locationId: "locA",
  locationName: "HITTERS Alpha",
  dateISO: "2026-11-10",
  startMinutes: 19 * 60,
  endMinutes: 20 * 60 + 30,
  dayOfWeek: 2,
  startsAt: new Date("2026-11-10T17:00:00Z"),
  maxPlayers: 4,
  acceptedCount: 3,
  participants: [{ userId: "org", status: "ACCEPTED" }],
  requests: [],
  ...over,
});

const seeker = (over: Partial<Seeker> = {}): Seeker => ({ userId: "me", level: "B", homeLocationId: "locA", preferredLocationIds: [], preferredTimes: ["weekday_evening"], matchType: "ANY", kind: "SOLO", ...over });

describe("matching engine (pure, deterministic)", () => {
  it("scores an exact level match at the home club with explanations", () => {
    const r = evaluateMatch(candidate(), seeker(), CONFIG);
    expect(r.eligible).toBe(true);
    expect(r.reasons.map((x) => x.label)).toEqual(["Level B match", "One of your preferred times", "Your home club", "1 spot remaining"]);
    expect(r.score).toBe(40 + 10 + 30 + 8);
    expect(evaluateMatch(candidate(), seeker(), CONFIG)).toEqual(r); // same inputs, same answer
  });

  it("allows adjacent levels only when both the game and the academy permit it", () => {
    expect(evaluateMatch(candidate(), seeker({ level: "C" }), CONFIG).blockers[0]).toMatch(/Level C is not welcome/);
    expect(evaluateMatch(candidate(), seeker({ level: "C" }), ADJ).eligible).toBe(false); // game is EXACT
    expect(evaluateMatch(candidate({ levelPolicy: "ADJACENT" }), seeker({ level: "C" }), CONFIG).eligible).toBe(false); // academy forbids
    const ok = evaluateMatch(candidate({ levelPolicy: "ADJACENT" }), seeker({ level: "C" }), ADJ);
    expect(ok.eligible).toBe(true);
    expect(ok.reasons[0].label).toMatch(/Adjacent level/);
    expect(ok.reasons[0].points).toBeLessThan(40);
    expect(evaluateMatch(candidate({ levelPolicy: "ADJACENT" }), seeker({ level: "D" }), ADJ).eligible).toBe(false); // two ranks away
    expect(evaluateMatch(candidate({ levels: [] }), seeker({ level: "D" }), CONFIG).reasons[0].label).toBe("Open to any level");
    expect(evaluateMatch(candidate(), seeker({ level: null }), CONFIG).blockers[0]).toMatch(/official level first/);
  });

  it("blocks wrong dates and times, and ranks location without blocking it", () => {
    expect(evaluateMatch(candidate(), seeker({ dateISO: "2026-11-11" }), CONFIG).blockers).toContain("Not on the date you chose.");
    expect(evaluateMatch(candidate(), seeker({ startMinutes: 9 * 60, endMinutes: 12 * 60 }), CONFIG).blockers).toContain("Starts outside the time window you chose.");
    const inWindow = evaluateMatch(candidate(), seeker({ dateISO: "2026-11-10", startMinutes: 18 * 60, endMinutes: 21 * 60 }), CONFIG);
    expect(inWindow.eligible).toBe(true);
    expect(inWindow.reasons.some((r) => r.label === "Available at your selected time")).toBe(true);

    const other = evaluateMatch(candidate({ locationId: "locB", locationName: "HITTERS Beta" }), seeker({ selectedLocationIds: ["locA"] }), CONFIG);
    expect(other.eligible).toBe(true);
    expect(other.reasons.find((r) => r.kind === "location")).toMatchObject({ label: "Other club: Beta", points: 0 });
    const preferred = evaluateMatch(candidate({ locationId: "locB", locationName: "HITTERS Beta" }), seeker({ preferredLocationIds: ["locB"] }), CONFIG);
    expect(preferred.reasons.find((r) => r.kind === "location")).toMatchObject({ label: "Preferred location", points: 25 });
    expect(preferred.score).toBeLessThan(evaluateMatch(candidate(), seeker(), CONFIG).score); // home club outranks
  });

  it("respects capacity, pair rules, visibility and existing participation", () => {
    expect(evaluateMatch(candidate({ acceptedCount: 4, status: "FULL" }), seeker(), CONFIG).blockers).toEqual(["The game is full. You can ask to be waitlisted."]);
    const pair = seeker({ kind: "PAIR", partner: { userId: "mate", level: "B" } });
    expect(evaluateMatch(candidate(), pair, CONFIG).blockers).toContain("Only one spot is left; a pair needs two.");
    const two = evaluateMatch(candidate({ acceptedCount: 2 }), pair, CONFIG);
    expect(two.eligible).toBe(true);
    expect(two.spotsNeeded).toBe(2);
    expect(two.reasons.some((r) => r.label === "Exactly 2 spots remaining")).toBe(true);
    expect(evaluateMatch(candidate({ acceptedCount: 2 }), seeker({ kind: "PAIR", partner: { userId: "mate", level: "D" } }), CONFIG).blockers[0]).toMatch(/partner's level D/);
    expect(evaluateMatch(candidate({ acceptedCount: 2, joinPolicy: "PAIRS_ONLY" }), seeker(), CONFIG).blockers[0]).toMatch(/pair challenge/);
    expect(evaluateMatch(candidate({ acceptedCount: 2, joinPolicy: "SOLO_ONLY" }), pair, CONFIG).blockers[0]).toMatch(/solo players only/);
    expect(evaluateMatch(candidate({ visibility: "PRIVATE" }), seeker(), CONFIG).eligible).toBe(false);
    expect(evaluateMatch(candidate({ openToRequests: false }), seeker(), CONFIG).eligible).toBe(false);
    expect(evaluateMatch(candidate({ status: "DRAFT" }), seeker(), CONFIG).eligible).toBe(false);
    expect(evaluateMatch(candidate(), seeker({ userId: "org" }), CONFIG).blockers).toContain("You organize this game.");
    expect(evaluateMatch(candidate({ participants: [{ userId: "me", status: "INVITED" }] }), seeker(), CONFIG).blockers[0]).toMatch(/already invited/);
    expect(evaluateMatch(candidate({ requests: [{ userId: "me", status: "PENDING", pairId: null }] }), seeker(), CONFIG).blockers[0]).toMatch(/already asked/);
    expect(evaluateMatch(candidate({ requests: [{ userId: "me", status: "DECLINED", pairId: null }] }), seeker(), CONFIG).eligible).toBe(true);
  });
});

/* ------------------------------------------------------------------ Workflow against the database */

const NOW = new Date("2026-11-09T08:00:00Z");
const DAY = "2026-11-10";
const ALL_WEEK = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt: 7 * 60, closesAt: 24 * 60, slotMinutes: 60, priceCents: 40000 }));

async function world() {
  const A = await makeLocation("alpha");
  const B = await makeLocation("beta");
  const managerA = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }] });
  const org = await makeUser({ homeLocationId: A.id, name: "Omar Organizer", level: "B" });
  const s1 = await makeUser({ homeLocationId: A.id, name: "Seeker One", level: "B" });
  const s2 = await makeUser({ homeLocationId: B.id, name: "Seeker Two", level: "B" });
  const s3 = await makeUser({ homeLocationId: A.id, name: "Seeker Three", level: "C" });
  const s4 = await makeUser({ homeLocationId: A.id, name: "Seeker Four", level: "B" });
  const s5 = await makeUser({ homeLocationId: A.id, name: "Seeker Five", level: "B" });
  const c1 = await courts.createCourt(managerA.actor, { locationId: A.id, name: "Court 1", type: "INDOOR" });
  await courts.setCourtAvailability(managerA.actor, c1.id, ALL_WEEK);
  const booking = await bookings.createBooking(org.actor, { courtId: c1.id, dateISO: DAY, startMinutes: 19 * 60, durationMinutes: 90 }, { now: NOW });
  return { A, B, managerA, org, s1, s2, s3, s4, s5, c1, booking };
}
type World = Awaited<ReturnType<typeof world>>;

/** An open, discoverable B-level doubles with `accepted` players already in (organizer included). */
async function openGame(w: World, accepted = 3, extra: Record<string, unknown> = {}) {
  const g = await games.createGameSession(w.org.actor, { bookingId: w.booking.id, levels: ["B"], visibility: "PUBLIC", openToRequests: true, ...extra }, { now: NOW });
  const fillers = await Promise.all(Array.from({ length: accepted - 1 }, () => makeUser({ homeLocationId: w.A.id, level: "B" })));
  if (fillers.length) await games.inviteToGame(w.org.actor, g.id, { userIds: fillers.map((f) => f.user.id) });
  for (const f of fillers) await games.respondToInvite(f.actor, g.id, "ACCEPT", { now: NOW });
  return games.publishGame(w.org.actor, g.id, { now: NOW });
}

async function activePair(a: World["s1"], b: World["s1"]) {
  const p = await pairs.proposePair(a.actor, { partnerUserId: b.user.id, name: "The Lobs" });
  return (await pairs.respondToPair(b.actor, p.id, "ACCEPT"))!;
}

describe("scenario 1: three players need a fourth", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("finds the game with reasons, lets the solo player request, and adds them only after approval", async () => {
    const g = await openGame(w, 3);
    const found = await mm.findMatches(w.s1.actor, { dateISO: DAY, startMinutes: 18 * 60, endMinutes: 21 * 60, locationIds: [w.A.id] }, NOW);
    expect(found.items.map((i) => i.game.id)).toEqual([g.id]);
    expect(found.items[0].match.reasons.map((r) => r.label)).toEqual(["Level B match", "Available at your selected time", "Your home club", "1 spot remaining"]);
    expect(await mm.findMatches(w.s3.actor, {}, NOW)).toMatchObject({ items: [], nearMisses: [{ blockers: ["Level C is not welcome here (B only)."] }] }); // wrong level
    expect((await mm.findMatches(w.s1.actor, { dateISO: "2026-11-11" }, NOW)).items).toHaveLength(0); // wrong date
    expect((await mm.findMatches(w.s1.actor, { startMinutes: 8 * 60, endMinutes: 12 * 60 }, NOW)).items).toHaveLength(0); // wrong time
    const other = await mm.findMatches(w.s2.actor, { locationIds: [w.B.id] }, NOW); // wrong location: still offered, ranked lower
    expect(other.items).toHaveLength(1);
    expect(other.items[0].match.reasons.find((r) => r.kind === "location")?.label).toMatch(/Other club/);
    expect(other.items[0].match.score).toBeLessThan(found.items[0].match.score);

    const req = await mm.requestToJoin(w.s1.actor, g.id, { message: "Left side, happy to bring balls" }, { now: NOW });
    expect(req.status).toBe("PENDING");
    expect(req.spots).toBe(1);
    expect(req.reasons[0]).toBe("Level B match");
    expect(await db.notification.count({ where: { userId: w.org.user.id, type: "game.request" } })).toBe(1);
    let fresh = await games.getGameSession(w.org.actor, g.id, { now: NOW });
    expect(fresh.acceptedCount).toBe(3); // nothing added yet
    expect(fresh.pendingRequests).toBe(1);

    await expectCode(mm.requestToJoin(w.s1.actor, g.id, {}, { now: NOW }), "NOT_ELIGIBLE"); // duplicate request
    await expectCode(mm.decideRequest(w.s4.actor, req.id, { decision: "ACCEPT" }), "FORBIDDEN"); // not the organizer
    await expectCode(mm.requestToJoin(w.s3.actor, g.id, {}, { now: NOW }), "NOT_ELIGIBLE"); // wrong level

    const review = await mm.listSessionRequests(w.org.actor, g.id, NOW);
    expect(review).toHaveLength(1);
    expect(review[0].members[0]).toMatchObject({ name: "Seeker One", level: "B" });
    expect(review[0].current.eligible).toBe(true);
    expect(review[0].playedTogether).toBe(0);

    const decided = await mm.decideRequest(w.org.actor, req.id, { decision: "ACCEPT" }, { now: NOW });
    expect(decided.status).toBe("ACCEPTED");
    fresh = await games.getGameSession(w.org.actor, g.id, { now: NOW });
    expect(fresh.acceptedCount).toBe(4);
    expect(fresh.status).toBe("FULL");
    expect(fresh.participants.find((p) => p.userId === w.s1.user.id)?.status).toBe("ACCEPTED");
    expect(await db.notification.count({ where: { userId: w.s1.user.id, type: "game.request_accepted" } })).toBe(1);
    expect(await db.notification.count({ where: { type: "game.lineup" } })).toBe(2); // the two other players
    await expectCode(mm.decideRequest(w.org.actor, req.id, { decision: "ACCEPT" }), "INVALID_TRANSITION"); // duplicate acceptance impossible
  });

  it("declines with a note, and the player can withdraw a pending request", async () => {
    const g = await openGame(w, 3);
    const r1 = await mm.requestToJoin(w.s1.actor, g.id, {}, { now: NOW });
    const declined = await mm.decideRequest(w.org.actor, r1.id, { decision: "DECLINE", note: "Keeping it to the regulars" }, { now: NOW });
    expect(declined.status).toBe("DECLINED");
    expect(await db.notification.count({ where: { userId: w.s1.user.id, type: "game.request_declined" } })).toBe(1);
    expect((await games.getGameSession(w.org.actor, g.id, { now: NOW })).acceptedCount).toBe(3);

    const r4 = await mm.requestToJoin(w.s4.actor, g.id, {}, { now: NOW });
    await expectCode(mm.withdrawRequest(w.s5.actor, r4.id), "FORBIDDEN");
    expect((await mm.withdrawRequest(w.s4.actor, r4.id)).status).toBe("WITHDRAWN");
    await expectCode(mm.withdrawRequest(w.s4.actor, r4.id), "INVALID_TRANSITION");
    // A declined player may ask again later; the row is reused.
    const again = await mm.requestToJoin(w.s1.actor, g.id, {}, { now: NOW });
    expect(again.status).toBe("PENDING");
    expect((await mm.listMyRequests(w.s1.actor, NOW)).map((r) => r.status)).toEqual(["PENDING"]);
  });

  it("waitlists requests to a full game and promotes them when a spot reopens", async () => {
    const g = await openGame(w, 4);
    expect((await mm.findMatches(w.s1.actor, {}, NOW)).items).toHaveLength(0); // full games are not recommended
    const r = await mm.requestToJoin(w.s1.actor, g.id, {}, { now: NOW });
    expect(r.status).toBe("WAITLISTED");
    await expectCode(mm.decideRequest(w.org.actor, r.id, { decision: "ACCEPT" }, { now: NOW }), "SESSION_FULL");
    const filler = (await games.getGameSession(w.org.actor, g.id, { now: NOW })).participants.find((p) => p.role === "PLAYER" && p.status === "ACCEPTED")!;
    await games.removeParticipant(w.org.actor, g.id, filler.userId);
    expect((await mm.listMyRequests(w.s1.actor, NOW))[0].status).toBe("PENDING");
    expect((await mm.decideRequest(w.org.actor, r.id, { decision: "ACCEPT" }, { now: NOW })).status).toBe("ACCEPTED");
  });

  it("expires open requests when the game is cancelled or starts", async () => {
    const g = await openGame(w, 3);
    const r = await mm.requestToJoin(w.s1.actor, g.id, {}, { now: NOW });
    await games.cancelGame(w.org.actor, g.id, { reason: "Rain" }, { now: NOW });
    expect((await mm.listMyRequests(w.s1.actor, NOW))[0].status).toBe("EXPIRED");
    expect(await db.notification.count({ where: { userId: w.s1.user.id, type: "game.cancelled" } })).toBe(1);
    await expectCode(mm.decideRequest(w.org.actor, r.id, { decision: "ACCEPT" }, { now: NOW }), "INVALID_TRANSITION");

    const b2 = await bookings.createBooking(w.org.actor, { courtId: w.c1.id, dateISO: "2026-11-12", startMinutes: 10 * 60, durationMinutes: 60 }, { now: NOW });
    const g2 = await games.publishGame(w.org.actor, (await games.createGameSession(w.org.actor, { bookingId: b2.id, levels: ["B"], visibility: "PUBLIC", openToRequests: true }, { now: NOW })).id, { now: NOW });
    await mm.requestToJoin(w.s1.actor, g2.id, {}, { now: NOW });
    expect((await mm.listMyRequests(w.s1.actor, new Date("2026-11-12T08:30:00Z")))[0].status).toBe("EXPIRED"); // game started
  });

  it("never overfills under simultaneous approvals or simultaneous requests", async () => {
    const g = await openGame(w, 3); // one spot
    const seekers = await Promise.all(Array.from({ length: 5 }, () => makeUser({ homeLocationId: w.A.id, level: "B" })));
    const reqs = await Promise.all(seekers.map((s) => mm.requestToJoin(s.actor, g.id, {}, { now: NOW })));
    expect(reqs.every((r) => r.status === "PENDING")).toBe(true);
    const results = await Promise.allSettled(reqs.map((r) => mm.decideRequest(w.org.actor, r.id, { decision: "ACCEPT" }, { now: NOW })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as { code: string }).code === "SESSION_FULL")).toHaveLength(4);
    const fresh = await games.getGameSession(w.org.actor, g.id, { now: NOW });
    expect(fresh.acceptedCount).toBe(4);
    expect(fresh.status).toBe("FULL");
    const rest = await mm.listSessionRequests(w.org.actor, g.id, NOW);
    expect(rest.filter((r) => r.status === "WAITLISTED")).toHaveLength(4); // the others wait, nobody is dropped
    expect(rest.filter((r) => r.status === "ACCEPTED")).toHaveLength(1);
  });
});

describe("scenarios 2 and 3: pairs", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("forms a pair only when the partner confirms", async () => {
    const p = await pairs.proposePair(w.s1.actor, { partnerUserId: w.s4.user.id });
    expect(p.status).toBe("PENDING");
    await expectCode(pairs.proposePair(w.s4.actor, { partnerUserId: w.s1.user.id }), "CONFLICT");
    await expectCode(pairs.respondToPair(w.s1.actor, p.id, "ACCEPT"), "FORBIDDEN"); // proposer cannot self-confirm
    await expectCode(mm.findMatches(w.s1.actor, { kind: "PAIR", pairId: p.id }, NOW), "VALIDATION"); // not confirmed
    expect((await pairs.respondToPair(w.s4.actor, p.id, "ACCEPT"))?.status).toBe("ACTIVE");
    expect((await pairs.listMyPairs(w.s1.actor)).map((x) => x.status)).toEqual(["ACTIVE"]);
    const p2 = await pairs.proposePair(w.s1.actor, { partnerUserId: w.s5.user.id });
    expect(await pairs.respondToPair(w.s5.actor, p2.id, "DECLINE")).toBeNull();
    expect(await pairs.listMyPairs(w.s5.actor)).toHaveLength(0);
  });

  it("scenario 2: a pair takes both spots at once and is never split", async () => {
    const g = await openGame(w, 2); // two spots
    const pair = await activePair(w.s1, w.s4);
    const found = await mm.findMatches(w.s1.actor, { kind: "PAIR", pairId: pair.id }, NOW);
    expect(found.items[0].match.spotsNeeded).toBe(2);
    const solo = await mm.requestToJoin(w.s2.actor, g.id, {}, { now: NOW });
    const pr = await mm.requestToJoin(w.s1.actor, g.id, { kind: "PAIR", pairId: pair.id }, { now: NOW });
    expect(pr.spots).toBe(2);
    expect(pr.pairId).toBe(pair.id);
    expect(await db.notification.count({ where: { userId: w.s4.user.id, type: "game.request_sent" } })).toBe(1);
    await expectCode(mm.requestToJoin(w.s4.actor, g.id, {}, { now: NOW }), "NOT_ELIGIBLE"); // partner cannot also ask solo

    // Simultaneous approvals of a solo (1 spot) and a pair (2 spots) for 2 open spots: exactly one lands.
    const results = await Promise.allSettled([mm.decideRequest(w.org.actor, solo.id, { decision: "ACCEPT" }, { now: NOW }), mm.decideRequest(w.org.actor, pr.id, { decision: "ACCEPT" }, { now: NOW })]);
    const fresh = await games.getGameSession(w.org.actor, g.id, { now: NOW });
    const won = results.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    expect(fresh.acceptedCount).toBeLessThanOrEqual(4);
    const pairIn = fresh.participants.filter((p) => p.pairId === pair.id && p.status === "ACCEPTED").length;
    expect(pairIn === 0 || pairIn === 2).toBe(true); // both or neither, never one
    // The losing request did not overfill and was left pending or waitlisted; the solo decides the rest deterministically.
    if (pairIn === 2) {
      expect(fresh.status).toBe("FULL");
      expect(results[0].status).toBe("rejected");
    } else {
      expect(fresh.acceptedCount).toBe(3);
      await expectCode(mm.decideRequest(w.org.actor, pr.id, { decision: "ACCEPT" }, { now: NOW }), "SESSION_FULL"); // 1 spot left, pair needs 2
      expect((await mm.listSessionRequests(w.org.actor, g.id, NOW)).find((r) => r.id === pr.id)?.status).toBe("PENDING");
    }
  });

  it("scenario 3: a pair opens a challenge and another pair takes it", async () => {
    const home = await activePair(w.org, w.s4);
    const g0 = await games.createGameSession(w.org.actor, { bookingId: w.booking.id, levels: ["B"], visibility: "PUBLIC", openToRequests: true, joinPolicy: "PAIRS_ONLY", pairId: home.id, description: "Challenge us" }, { now: NOW });
    expect(g0.pairId).toBe(home.id);
    expect(g0.participants.find((p) => p.userId === w.s4.user.id)).toMatchObject({ status: "INVITED", pairId: home.id });
    await games.respondToInvite(w.s4.actor, g0.id, "ACCEPT", { now: NOW });
    const g = await games.publishGame(w.org.actor, g0.id, { now: NOW });
    expect(g.acceptedCount).toBe(2);

    await expectCode(mm.requestToJoin(w.s1.actor, g.id, {}, { now: NOW }), "NOT_ELIGIBLE"); // solo cannot take a challenge
    expect((await mm.findMatches(w.s1.actor, {}, NOW)).items).toHaveLength(0);
    const rivals = await activePair(w.s1, w.s5);
    expect((await mm.findMatches(w.s1.actor, { kind: "PAIR", pairId: rivals.id }, NOW)).items.map((i) => i.game.id)).toEqual([g.id]);
    const pr = await mm.requestToJoin(w.s5.actor, g.id, { kind: "PAIR", pairId: rivals.id }, { now: NOW });
    const review = await mm.listSessionRequests(w.org.actor, g.id, NOW);
    expect(review[0].members.map((m) => m.name).sort()).toEqual(["Seeker Five", "Seeker One"]);
    const accepted = await mm.decideRequest(w.org.actor, pr.id, { decision: "ACCEPT" }, { now: NOW });
    expect(accepted.status).toBe("ACCEPTED");
    const fresh = await games.getGameSession(w.org.actor, g.id, { now: NOW });
    expect(fresh.status).toBe("FULL");
    expect(fresh.participants.filter((p) => p.status === "ACCEPTED" && p.pairId === rivals.id)).toHaveLength(2);
    expect(fresh.participants.filter((p) => p.status === "ACCEPTED" && p.pairId === home.id)).toHaveLength(2);
    expect((await games.confirmGame(w.org.actor, g.id, { now: NOW })).status).toBe("CONFIRMED");
    expect(await db.notification.count({ where: { type: "game.request_accepted", userId: { in: [w.s1.user.id, w.s5.user.id] } } })).toBe(2);
  });

  it("dissolving a pair withdraws its open requests", async () => {
    const g = await openGame(w, 2);
    const pair = await activePair(w.s1, w.s4);
    const pr = await mm.requestToJoin(w.s1.actor, g.id, { kind: "PAIR", pairId: pair.id }, { now: NOW });
    await pairs.dissolvePair(w.s4.actor, pair.id);
    expect((await mm.listMyRequests(w.s1.actor, NOW)).find((r) => r.id === pr.id)?.status).toBe("WITHDRAWN");
    await expectCode(mm.requestToJoin(w.s1.actor, g.id, { kind: "PAIR", pairId: pair.id }, { now: NOW }), "NOT_FOUND");
  });
});

describe("academy configuration", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("adjacent levels open up only when the academy switches it on", async () => {
    const g = await openGame(w, 3, { levelPolicy: "ADJACENT" });
    expect((await mm.findMatches(w.s3.actor, {}, NOW)).items).toHaveLength(0); // C into a B game, academy default off
    await expectCode(mm.updateMatchmakingConfig(w.managerA.actor, { allowAdjacentLevels: true, requestExpiryHours: 48, maxOpenRequests: 5 }), "FORBIDDEN");
    const owner = await makeUser({ globalRole: "ACADEMY_OWNER" });
    await mm.updateMatchmakingConfig(owner.actor, { allowAdjacentLevels: true, requestExpiryHours: 48, maxOpenRequests: 2 });
    const found = await mm.findMatches(w.s3.actor, {}, NOW);
    expect(found.items.map((i) => i.game.id)).toEqual([g.id]);
    expect(found.items[0].match.reasons[0].label).toMatch(/Adjacent level/);
    const r = await mm.requestToJoin(w.s3.actor, g.id, {}, { now: NOW });
    expect(r.reasons[0]).toMatch(/Adjacent level/);
    // Open-request cap from the configuration.
    const b2 = await bookings.createBooking(w.org.actor, { courtId: w.c1.id, dateISO: "2026-11-12", startMinutes: 10 * 60, durationMinutes: 60 }, { now: NOW });
    const g2 = await games.publishGame(w.org.actor, (await games.createGameSession(w.org.actor, { bookingId: b2.id, levels: ["C"], visibility: "PUBLIC", openToRequests: true }, { now: NOW })).id, { now: NOW });
    await mm.requestToJoin(w.s3.actor, g2.id, {}, { now: NOW });
    const b3 = await bookings.createBooking(w.org.actor, { courtId: w.c1.id, dateISO: "2026-11-13", startMinutes: 10 * 60, durationMinutes: 60 }, { now: NOW });
    const g3 = await games.publishGame(w.org.actor, (await games.createGameSession(w.org.actor, { bookingId: b3.id, levels: ["C"], visibility: "PUBLIC", openToRequests: true }, { now: NOW })).id, { now: NOW });
    await expectCode(mm.requestToJoin(w.s3.actor, g3.id, {}, { now: NOW }), "VALIDATION");
  });
});
