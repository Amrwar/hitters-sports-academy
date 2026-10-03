import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as bookings from "@/server/services/bookings";
import * as courts from "@/server/services/courts";
import * as games from "@/server/services/game-sessions";
import { searchPlayers } from "@/server/services/profiles";
import { expectCode, makeLocation, makeUser } from "./helpers";

const NOW = new Date("2026-11-09T08:00:00Z"); // Monday 10:00 Cairo
const DAY = "2026-11-10";
const ALL_WEEK = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt: 7 * 60, closesAt: 24 * 60, slotMinutes: 60, priceCents: 40000 }));

async function world() {
  const A = await makeLocation("alpha");
  const B = await makeLocation("beta");
  const managerA = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }] });
  const receptionB = await makeUser({ staff: [{ locationId: B.id, role: "RECEPTIONIST" }] });
  const trainerA = await makeUser({ staff: [{ locationId: A.id, role: "TRAINER" }] });
  const org = await makeUser({ homeLocationId: A.id, name: "Omar Organizer", level: "B" });
  const p1 = await makeUser({ homeLocationId: A.id, name: "Laila Player", level: "B" });
  const p2 = await makeUser({ homeLocationId: A.id, name: "Karim Player", level: "C" });
  const p3 = await makeUser({ homeLocationId: A.id, name: "Salma Player", level: "A" });
  const p4 = await makeUser({ homeLocationId: A.id, name: "Youssef Player", level: "D" });
  const c1 = await courts.createCourt(managerA.actor, { locationId: A.id, name: "Court 1", type: "INDOOR" });
  await courts.setCourtAvailability(managerA.actor, c1.id, ALL_WEEK);
  const booking = await bookings.createBooking(org.actor, { courtId: c1.id, dateISO: DAY, startMinutes: 19 * 60, durationMinutes: 90 }, { now: NOW });
  return { A, B, managerA, receptionB, trainerA, org, p1, p2, p3, p4, c1, booking };
}
type World = Awaited<ReturnType<typeof world>>;

const create = (w: World, extra: Record<string, unknown> = {}) => games.createGameSession(w.org.actor, { bookingId: w.booking.id, ...extra }, { now: NOW });

describe("creating a game", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("creates a draft on the organizer's booking with invited players who are not auto-accepted", async () => {
    const g = await create(w, { inviteUserIds: [w.p1.user.id, w.p2.user.id], description: "Tuesday doubles", levels: ["B", "C"] });
    expect(g.status).toBe("DRAFT");
    expect(g.code).toMatch(/^GM-[A-Z2-9]{6}$/);
    expect(g.format).toBe("DOUBLES");
    expect(g.maxPlayers).toBe(4);
    expect(g.startsAt.toISOString()).toBe(w.booking.startsAt.toISOString());
    expect(g.courtId).toBe(w.c1.id);
    expect(g.acceptedCount).toBe(1);
    expect(g.invitedCount).toBe(2);
    expect(g.spotsLeft).toBe(3);
    expect(g.participants.find((p) => p.userId === w.org.user.id)?.role).toBe("ORGANIZER");
    expect(g.participants.filter((p) => p.status === "INVITED").map((p) => p.userId).sort()).toEqual([w.p1.user.id, w.p2.user.id].sort());
    expect(g.sharePerPlayerCents).toBe(Math.ceil(w.booking.priceCents / 4));
    expect(await db.auditLog.count({ where: { action: "game.created", entityId: g.id } })).toBe(1);
    expect(await db.notification.count({ where: { type: "game.invited", userId: { in: [w.p1.user.id, w.p2.user.id] } } })).toBe(2);
  });

  it("rejects bookings the organizer does not hold, duplicates and bad formats", async () => {
    await expectCode(games.createGameSession(w.p1.actor, { bookingId: w.booking.id }, { now: NOW }), "FORBIDDEN");
    await expectCode(games.createGameSession(null, { bookingId: w.booking.id }), "UNAUTHENTICATED");
    await expectCode(create(w, { format: "DOUBLES", maxPlayers: 6 }), "VALIDATION");
    await expectCode(create(w, { inviteUserIds: [w.p1.user.id, w.p2.user.id, w.p3.user.id, w.p4.user.id] }), "VALIDATION");
    await expectCode(create(w, { costMode: "FIXED_PER_PLAYER" }), "VALIDATION");
    await create(w);
    await expectCode(create(w), "CONFLICT");
    await expectCode(games.createGameSession(w.org.actor, { bookingId: w.booking.id }, { now: new Date("2026-11-11T00:00:00Z") }), "VALIDATION"); // already started
  });

  it("supports other formats with their own player counts", async () => {
    const singles = await create(w, { format: "SINGLES" });
    expect(singles.maxPlayers).toBe(2);
    expect(singles.spotsLeft).toBe(1);
    await db.gameSession.delete({ where: { id: singles.id } });
    const open = await create(w, { format: "OPEN", maxPlayers: 8, costMode: "FIXED_PER_PLAYER", costPerPlayerCents: 15000 });
    expect(open.maxPlayers).toBe(8);
    expect(open.sharePerPlayerCents).toBe(15000);
  });
});

describe("lineup and states", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("walks draft → open → full → confirmed, with players accepting themselves", async () => {
    let g = await create(w, { inviteUserIds: [w.p1.user.id] });
    await expectCode(games.respondToInvite(w.p2.actor, g.id, "ACCEPT"), "FORBIDDEN"); // not invited
    g = await games.respondToInvite(w.p1.actor, g.id, "ACCEPT", { now: NOW });
    expect(g.acceptedCount).toBe(2);
    expect(g.status).toBe("DRAFT");
    expect(await db.notification.count({ where: { userId: w.org.user.id, type: "game.accepted" } })).toBe(1);

    await expectCode(games.confirmGame(w.org.actor, g.id), "INVALID_TRANSITION");
    g = await games.publishGame(w.org.actor, g.id, { now: NOW });
    expect(g.status).toBe("OPEN");
    expect(g.publishedAt).not.toBeNull();
    await expectCode(games.publishGame(w.org.actor, g.id, { now: NOW }), "INVALID_TRANSITION");

    g = await games.inviteToGame(w.org.actor, g.id, { userIds: [w.p2.user.id, w.p3.user.id] });
    expect(g.invitedCount).toBe(2);
    await expectCode(games.inviteToGame(w.org.actor, g.id, { userIds: [w.p4.user.id] }), "SESSION_FULL"); // 2 accepted + 2 invited = 4
    await expectCode(games.inviteToGame(w.p1.actor, g.id, { userIds: [w.p4.user.id] }), "FORBIDDEN");

    g = await games.respondToInvite(w.p2.actor, g.id, "DECLINE");
    expect(g.participants.find((p) => p.userId === w.p2.user.id)?.status).toBe("DECLINED");
    expect(g.status).toBe("OPEN");
    g = await games.inviteToGame(w.org.actor, g.id, { userIds: [w.p4.user.id] }); // the declined spot is free again
    g = await games.respondToInvite(w.p3.actor, g.id, "ACCEPT");
    expect(g.status).toBe("OPEN");
    g = await games.respondToInvite(w.p4.actor, g.id, "ACCEPT");
    expect(g.status).toBe("FULL");
    expect(g.spotsLeft).toBe(0);

    await expectCode(games.confirmGame(w.p1.actor, g.id), "FORBIDDEN");
    g = await games.confirmGame(w.org.actor, g.id, { now: NOW });
    expect(g.status).toBe("CONFIRMED");
    expect(await db.notification.count({ where: { type: "game.confirmed" } })).toBe(3);

    // A confirmed game reopens when someone drops out.
    g = await games.leaveGame(w.p3.actor, g.id);
    expect(g.status).toBe("OPEN");
    expect(g.spotsLeft).toBe(1);
    await expectCode(games.leaveGame(w.org.actor, g.id), "VALIDATION");
    await expectCode(games.leaveGame(w.p2.actor, g.id), "FORBIDDEN");
  });

  it("never exceeds the player count under concurrent acceptances", async () => {
    const g = await create(w);
    await games.publishGame(w.org.actor, g.id, { now: NOW });
    // Six pending invitations written directly (the next phase's join requests will create such rows); only 3 spots remain.
    const extras = await Promise.all(Array.from({ length: 6 }, () => makeUser({ homeLocationId: w.A.id })));
    await db.gameParticipant.createMany({ data: extras.map((u) => ({ sessionId: g.id, userId: u.user.id, status: "INVITED", invitedById: w.org.user.id })) });
    const results = await Promise.allSettled(extras.map((u) => games.respondToInvite(u.actor, g.id, "ACCEPT")));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const full = results.filter((r) => r.status === "rejected" && (r.reason as { code?: string }).code === "SESSION_FULL").length;
    expect(ok).toBe(3);
    expect(full).toBe(3);
    const fresh = await games.getGameSession(w.org.actor, g.id, { now: NOW });
    expect(fresh.acceptedCount).toBe(4);
    expect(fresh.status).toBe("FULL");
  });

  it("lets the organizer remove players and withdraw invitations", async () => {
    let g = await create(w, { inviteUserIds: [w.p1.user.id, w.p2.user.id] });
    g = await games.respondToInvite(w.p1.actor, g.id, "ACCEPT");
    await expectCode(games.removeParticipant(w.p1.actor, g.id, w.p2.user.id), "FORBIDDEN");
    await expectCode(games.removeParticipant(w.org.actor, g.id, w.org.user.id), "VALIDATION");
    g = await games.removeParticipant(w.org.actor, g.id, w.p2.user.id);
    expect(g.participants.find((p) => p.userId === w.p2.user.id)?.status).toBe("REMOVED");
    g = await games.removeParticipant(w.org.actor, g.id, w.p1.user.id);
    expect(g.acceptedCount).toBe(1);
    expect(await db.notification.count({ where: { type: "game.removed" } })).toBe(2);
    // Removed players can be invited again.
    g = await games.inviteToGame(w.org.actor, g.id, { userIds: [w.p1.user.id] });
    expect(g.participants.find((p) => p.userId === w.p1.user.id)?.status).toBe("INVITED");
  });

  it("edits details and cost but never shrinks below the lineup", async () => {
    let g = await create(w, { format: "OPEN", maxPlayers: 6, inviteUserIds: [w.p1.user.id, w.p2.user.id] });
    g = await games.respondToInvite(w.p1.actor, g.id, "ACCEPT");
    g = await games.publishGame(w.org.actor, g.id, { now: NOW });
    await expectCode(games.updateGameSession(w.org.actor, g.id, { maxPlayers: 2 }), "VALIDATION"); // 2 accepted + 1 invited
    g = await games.updateGameSession(w.org.actor, g.id, { maxPlayers: 3, visibility: "PUBLIC", openToRequests: true, costMode: "FIXED_PER_PLAYER", costPerPlayerCents: 12000, notes: "Meet at reception" });
    expect(g.maxPlayers).toBe(3);
    expect(g.visibility).toBe("PUBLIC");
    expect(g.openToRequests).toBe(true);
    expect(g.sharePerPlayerCents).toBe(12000);
    g = await games.updateGameSession(w.org.actor, g.id, { costMode: "ORGANIZER_PAYS" });
    expect(g.costPerPlayerCents).toBeNull();
    expect(g.sharePerPlayerCents).toBeNull();
    g = await games.respondToInvite(w.p2.actor, g.id, "ACCEPT");
    expect(g.status).toBe("FULL");
    // Growing a full game reopens it.
    g = await games.updateGameSession(w.org.actor, g.id, { maxPlayers: 4 });
    expect(g.status).toBe("OPEN");
    await expectCode(games.updateGameSession(w.p1.actor, g.id, { notes: "x" }), "FORBIDDEN");
  });

  it("cancels by organizer or location staff only", async () => {
    let g = await create(w, { inviteUserIds: [w.p1.user.id] });
    await expectCode(games.cancelGame(w.p1.actor, g.id), "FORBIDDEN");
    await expectCode(games.cancelGame(w.trainerA.actor, g.id), "FORBIDDEN"); // session.read only
    await expectCode(games.cancelGame(w.receptionB.actor, g.id), "FORBIDDEN"); // other location
    g = await games.cancelGame(w.managerA.actor, g.id, { reason: "Court flooded" }, { now: NOW });
    expect(g.status).toBe("CANCELLED");
    expect(g.cancelReason).toBe("Court flooded");
    expect(await db.notification.count({ where: { type: "game.cancelled" } })).toBe(2); // organizer + invitee
    await expectCode(games.cancelGame(w.org.actor, g.id), "INVALID_TRANSITION");
    await expectCode(games.respondToInvite(w.p1.actor, g.id, "ACCEPT"), "INVALID_TRANSITION");
    const booking = await bookings.getBooking(w.org.actor, w.booking.id);
    expect(booking.status).toBe("CONFIRMED"); // the reservation is separate
  });
});

describe("visibility, discovery and listings", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("hides private games and lists public open games with spots, filtered by level", async () => {
    let g = await create(w, { inviteUserIds: [w.p1.user.id], levels: ["B"], visibility: "PRIVATE" });
    await expectCode(games.getGameSession(w.p2.actor, g.id, { now: NOW }), "FORBIDDEN");
    expect((await games.getGameSession(w.p1.actor, g.id, { now: NOW })).id).toBe(g.id); // invited
    expect((await games.getGameSession(w.managerA.actor, g.id, { now: NOW })).id).toBe(g.id); // staff in scope
    await expectCode(games.getGameSession(w.receptionB.actor, g.id, { now: NOW }), "FORBIDDEN");
    expect(await games.discoverGames(w.p2.actor, {}, NOW)).toHaveLength(0);

    g = await games.updateGameSession(w.org.actor, g.id, { visibility: "PUBLIC", notes: "Secret meeting point" });
    expect(await games.discoverGames(w.p2.actor, {}, NOW)).toHaveLength(0); // still a draft
    await expectCode(games.getGameSession(w.p2.actor, g.id, { now: NOW }), "FORBIDDEN");
    g = await games.publishGame(w.org.actor, g.id, { now: NOW });
    const seen = await games.getGameSession(w.p2.actor, g.id, { now: NOW });
    expect(seen.notes).toBeNull(); // notes stay with the lineup
    expect((await games.getGameSession(w.p1.actor, g.id, { now: NOW })).notes).toBe("Secret meeting point");

    expect((await games.discoverGames(w.p2.actor, {}, NOW)).map((x) => x.id)).toEqual([g.id]);
    expect(await games.discoverGames(w.p2.actor, { level: "B" }, NOW)).toHaveLength(1);
    expect(await games.discoverGames(w.p2.actor, { level: "D" }, NOW)).toHaveLength(0);
    expect(await games.discoverGames(w.p2.actor, { locationId: w.B.id }, NOW)).toHaveLength(0);
    expect(await games.discoverGames(w.p2.actor, { dateISO: DAY }, NOW)).toHaveLength(1);
    expect(await games.discoverGames(w.p2.actor, { dateISO: "2026-11-11" }, NOW)).toHaveLength(0);

    for (const u of [w.p1, w.p2, w.p3]) {
      if (u !== w.p1) await games.inviteToGame(w.org.actor, g.id, { userIds: [u.user.id] });
      await games.respondToInvite(u.actor, g.id, "ACCEPT");
    }
    expect(await games.discoverGames(w.p4.actor, {}, NOW)).toHaveLength(0); // full
  });

  it("lists my games and staff games in scope", async () => {
    const g = await create(w, { inviteUserIds: [w.p1.user.id] });
    expect((await games.listMyGames(w.org.actor, "upcoming", NOW)).map((x) => x.id)).toEqual([g.id]);
    expect((await games.listMyGames(w.p1.actor, "upcoming", NOW)).map((x) => x.id)).toEqual([g.id]);
    expect(await games.listMyGames(w.p2.actor, "upcoming", NOW)).toHaveLength(0);
    await games.respondToInvite(w.p1.actor, g.id, "DECLINE");
    expect(await games.listMyGames(w.p1.actor, "upcoming", NOW)).toHaveLength(0);

    expect((await games.listGamesInScope(w.managerA.actor, {}, NOW)).total).toBe(1);
    expect((await games.listGamesInScope(w.trainerA.actor, { locationId: w.A.id }, NOW)).total).toBe(1);
    expect((await games.listGamesInScope(w.receptionB.actor, {}, NOW)).total).toBe(0);
    await expectCode(games.listGamesInScope(w.receptionB.actor, { locationId: w.A.id }, NOW), "FORBIDDEN");
    await expectCode(games.listGamesInScope(w.p2.actor, {}, NOW), "FORBIDDEN");
  });

  it("finds players to invite without exposing private profiles", async () => {
    await db.playerProfile.update({ where: { userId: w.p3.user.id }, data: { visibility: "PRIVATE" } });
    const hits = await searchPlayers(w.org.actor, { q: "player" });
    expect(hits.map((h) => h.name).sort()).toEqual(["Karim Player", "Laila Player", "Youssef Player"]);
    expect(hits.find((h) => h.name === "Laila Player")?.level).toBe("B");
    expect(await searchPlayers(w.org.actor, { q: "o" })).toHaveLength(0); // too short
    expect((await searchPlayers(w.p1.actor, { q: "organizer" })).map((h) => h.name)).toEqual(["Omar Organizer"]);
  });
});

describe("booking cascade and the clock", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("cancels the game when its booking is cancelled, and moves it when the booking is rescheduled", async () => {
    let g = await create(w, { inviteUserIds: [w.p1.user.id] });
    await games.respondToInvite(w.p1.actor, g.id, "ACCEPT");
    g = await games.publishGame(w.org.actor, g.id, { now: NOW });

    const moved = await bookings.rescheduleBooking(w.org.actor, w.booking.id, { courtId: w.c1.id, dateISO: DAY, startMinutes: 21 * 60, durationMinutes: 60 }, { now: NOW });
    g = await games.getGameSession(w.org.actor, g.id, { now: NOW });
    expect(g.bookingId).toBe(moved.id);
    expect(g.startsAt.toISOString()).toBe(moved.startsAt.toISOString());
    expect(g.status).toBe("OPEN");
    expect(await db.notification.count({ where: { userId: w.p1.user.id, type: "game.moved" } })).toBe(1);

    await bookings.cancelBooking(w.org.actor, moved.id, {}, { now: NOW });
    g = await games.getGameSession(w.org.actor, g.id, { now: NOW });
    expect(g.status).toBe("CANCELLED");
    expect(g.cancelReason).toBe("Court booking cancelled");
    expect(await db.notification.count({ where: { userId: w.p1.user.id, type: "game.cancelled" } })).toBe(1);
  });

  it("moves games along with time", async () => {
    const g = await create(w);
    await games.publishGame(w.org.actor, g.id, { now: NOW });
    const start = w.booking.startsAt;
    const during = new Date(start.getTime() + 10 * 60_000);
    const after = new Date(w.booking.endsAt.getTime() + 60_000);
    expect((await games.getGameSession(w.org.actor, g.id, { now: during })).status).toBe("IN_PROGRESS");
    expect((await games.getGameSession(w.org.actor, g.id, { now: after })).status).toBe("COMPLETED");
    expect((await games.listMyGames(w.org.actor, "past", after)).map((x) => x.id)).toEqual([g.id]);
    expect(await games.listMyGames(w.org.actor, "upcoming", after)).toHaveLength(0);

    // A draft that was never published expires.
    const b2 = await bookings.createBooking(w.org.actor, { courtId: w.c1.id, dateISO: "2026-11-12", startMinutes: 10 * 60, durationMinutes: 60 }, { now: NOW });
    const draft = await games.createGameSession(w.org.actor, { bookingId: b2.id }, { now: NOW });
    const res = await games.advanceElapsedGames(new Date("2026-11-13T00:00:00Z"));
    expect(res.expired).toBe(1);
    expect((await db.gameSession.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("CANCELLED");
  });
});
