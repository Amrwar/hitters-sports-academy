import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { zonedToUtc } from "@/lib/time";
import * as bookings from "@/server/services/bookings";
import * as courts from "@/server/services/courts";
import * as locations from "@/server/services/locations";
import { getLocationSchedule } from "@/server/services/availability";
import { expectCode, makeLocation, makeUser } from "./helpers";

const NOW = new Date("2026-11-09T08:00:00Z"); // Monday 10:00 Cairo
const DAY = "2026-11-10"; // Tuesday
const ALL_WEEK = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt: 7 * 60, closesAt: 24 * 60, slotMinutes: 60, priceCents: 40000 }));

async function world() {
  const A = await makeLocation("alpha");
  const B = await makeLocation("beta");
  const owner = await makeUser({ globalRole: "ACADEMY_OWNER" });
  const managerA = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }] });
  const receptionA = await makeUser({ staff: [{ locationId: A.id, role: "RECEPTIONIST" }], name: "Rana Reception" });
  const receptionB = await makeUser({ staff: [{ locationId: B.id, role: "RECEPTIONIST" }] });
  const trainerA = await makeUser({ staff: [{ locationId: A.id, role: "TRAINER" }] });
  const p1 = await makeUser({ homeLocationId: A.id, name: "Player One" });
  const p2 = await makeUser({ homeLocationId: A.id, name: "Player Two" });
  const unverified = await makeUser({ homeLocationId: A.id, verified: false });
  const c1 = await courts.createCourt(w0(managerA), { locationId: A.id, name: "Court 1", type: "INDOOR" });
  const c2 = await courts.createCourt(w0(managerA), { locationId: A.id, name: "Court 2", type: "INDOOR" });
  await courts.setCourtAvailability(managerA.actor, c1.id, ALL_WEEK);
  await courts.setCourtAvailability(managerA.actor, c2.id, ALL_WEEK);
  await db.pricingRule.create({ data: { locationId: A.id, name: "Peak", kind: "PEAK", startsAt: 18 * 60, endsAt: 21 * 60, adjustmentPercent: 25 } });
  return { A, B, owner, managerA, receptionA, receptionB, trainerA, p1, p2, unverified, c1, c2 };
}
const w0 = (u: { actor: import("@/lib/auth/authorize").Actor }) => u.actor;
type World = Awaited<ReturnType<typeof world>>;
const req = (courtId: string, startMinutes: number, durationMinutes = 60, dateISO = DAY) => ({ courtId, dateISO, startMinutes, durationMinutes });

describe("quotes and creation", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("quotes a slot with pricing rules and allowed durations", async () => {
    const q = await bookings.quoteBooking(w.p1.actor, req(w.c1.id, 19 * 60, 90), { now: NOW });
    expect(q.quote.baseCents).toBe(60000);
    expect(q.quote.totalCents).toBe(75000);
    expect(q.allowedDurations).toEqual([60, 90, 120]);
    expect(q.startsAt.toISOString()).toBe("2026-11-10T17:00:00.000Z"); // 19:00 Cairo (UTC+2 in November)
    await expectCode(bookings.quoteBooking(null, req(w.c1.id, 10 * 60)), "UNAUTHENTICATED");
  });

  it("creates a confirmed booking with participant, pending payment, code, audit and notification", async () => {
    const b = await bookings.createBooking(w.p1.actor, { ...req(w.c1.id, 10 * 60, 60), notes: "Bring balls" }, { now: NOW });
    expect(b.status).toBe("CONFIRMED");
    expect(b.source).toBe("PLAYER_APP");
    expect(b.confirmationCode).toMatch(/^HT-[A-Z2-9]{6}$/);
    expect(b.priceCents).toBe(40000);
    expect(b.participants).toHaveLength(1);
    expect(b.participants[0].role).toBe("ORGANIZER");
    expect(b.payments[0].status).toBe("PENDING");
    expect(await db.auditLog.count({ where: { action: "booking.created", entityId: b.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: w.p1.user.id, type: "booking.confirmed" } })).toBe(1);
  });

  it("returns clear domain errors", async () => {
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60, 45), { now: NOW }), "INVALID_DURATION");
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 6 * 60), { now: NOW }), "SLOT_UNAVAILABLE"); // before opening
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 23 * 60, 120), { now: NOW }), "SLOT_UNAVAILABLE"); // runs past closing
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60 + 30), { now: NOW }), "SLOT_UNAVAILABLE"); // off the 60-min grid
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 9 * 60, 60, "2026-11-09"), { now: NOW }), "SLOT_UNAVAILABLE"); // past
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60, 60, "2026-11-09"), { now: NOW }), "SLOT_UNAVAILABLE"); // inside 60 min notice
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60, 60, "2026-12-09"), { now: NOW }), "SLOT_UNAVAILABLE"); // beyond 14 days

    await courts.updateCourt(w.managerA.actor, w.c2.id, { status: "MAINTENANCE" });
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c2.id, 10 * 60), { now: NOW }), "COURT_UNAVAILABLE");
    await courts.updateCourt(w.managerA.actor, w.c2.id, { status: "ACTIVE" });
    await courts.addCourtClosure(w.managerA.actor, w.c2.id, { startLocal: `${DAY}T09:30`, endLocal: `${DAY}T10:30`, reason: "Cleaning" });
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c2.id, 10 * 60), { now: NOW }), "COURT_UNAVAILABLE");
    expect((await bookings.createBooking(w.p1.actor, req(w.c2.id, 11 * 60), { now: NOW })).status).toBe("CONFIRMED");

    const hours = Array.from({ length: 7 }, (_, d) => (d === 2 ? null : { opensAt: 8 * 60, closesAt: 22 * 60 }));
    await locations.updateLocation(w.managerA.actor, w.A.id, { openingHours: hours });
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60), { now: NOW }), "LOCATION_CLOSED"); // Tuesday closed
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 7 * 60, 60, "2026-11-11"), { now: NOW }), "SLOT_UNAVAILABLE"); // location opens at 08:00
    await locations.updateLocation(w.owner.actor, w.A.id, { status: "COMING_SOON", openingHours: Array(7).fill({ opensAt: 420, closesAt: 1440 }) });
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60), { now: NOW }), "LOCATION_CLOSED");
  });

  it("requires a verified email and enforces the active booking limit", async () => {
    await expectCode(bookings.createBooking(w.unverified.actor, req(w.c1.id, 10 * 60), { now: NOW }), "FORBIDDEN");
    await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60), { now: NOW });
    await bookings.createBooking(w.p1.actor, req(w.c1.id, 12 * 60), { now: NOW });
    await bookings.createBooking(w.p1.actor, req(w.c1.id, 14 * 60), { now: NOW });
    await expectCode(bookings.createBooking(w.p1.actor, req(w.c1.id, 16 * 60), { now: NOW }), "VALIDATION");
    // Staff are not limited and bypass notice/window rules.
    expect((await bookings.createBooking(w.receptionA.actor, { ...req(w.c1.id, 10 * 60 + 60, 60, "2026-11-09"), playerId: w.p2.user.id }, { now: NOW })).source).toBe("RECEPTION");
  });
});

describe("double booking prevention", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("rejects overlapping and partially overlapping slots, allows adjacent ones", async () => {
    await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60, 90), { now: NOW }); // 10:00-11:30
    await expectCode(bookings.createBooking(w.p2.actor, req(w.c1.id, 10 * 60, 60), { now: NOW }), "SLOT_UNAVAILABLE");
    await expectCode(bookings.createBooking(w.p2.actor, req(w.c1.id, 11 * 60, 60), { now: NOW }), "SLOT_UNAVAILABLE"); // 11:00-12:00 overlaps 11:00-11:30
    await expectCode(bookings.createBooking(w.p2.actor, req(w.c1.id, 9 * 60, 120), { now: NOW }), "SLOT_UNAVAILABLE"); // 09:00-11:00 overlaps
    expect((await bookings.createBooking(w.p2.actor, req(w.c1.id, 12 * 60, 60), { now: NOW })).status).toBe("CONFIRMED"); // adjacent-ish (11:30 free)
    expect((await bookings.createBooking(w.p2.actor, req(w.c2.id, 10 * 60, 60), { now: NOW })).status).toBe("CONFIRMED"); // other court
  });

  it("lets exactly one of many concurrent requests for the same slot win", async () => {
    const players = await Promise.all(Array.from({ length: 12 }, (_, i) => makeUser({ name: `Racer ${i}`, homeLocationId: w.A.id })));
    const results = await Promise.allSettled(players.map((p) => bookings.createBooking(p.actor, req(w.c1.id, 15 * 60, 60), { now: NOW })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(11);
    for (const f of failed) expect((f.reason as { code?: string }).code).toBe("SLOT_UNAVAILABLE");
    expect(await db.booking.count({ where: { courtId: w.c1.id, status: "CONFIRMED" } })).toBe(1);
  });

  it("never leaves overlapping active bookings under mixed concurrent durations", async () => {
    const players = await Promise.all(Array.from({ length: 16 }, (_, i) => makeUser({ name: `Mixer ${i}`, homeLocationId: w.A.id })));
    const attempts = players.map((p, i) => {
      const start = [9, 9, 10, 10, 11, 8][i % 6] * 60;
      const dur = [60, 120, 60, 90, 60, 120][i % 6];
      return bookings.createBooking(p.actor, req(w.c1.id, start, dur), { now: NOW });
    });
    const results = await Promise.allSettled(attempts);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const active = await db.booking.findMany({ where: { courtId: w.c1.id, status: { in: ["PENDING", "CONFIRMED"] } }, orderBy: { startsAt: "asc" } });
    for (let i = 1; i < active.length; i++) expect(active[i].startsAt.getTime()).toBeGreaterThanOrEqual(active[i - 1].endsAt.getTime());
  });

  it("is enforced by the database even when the service is bypassed", async () => {
    const b = await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60, 60), { now: NOW });
    await expect(
      db.booking.create({ data: { confirmationCode: "HT-RAWRAW", courtId: w.c1.id, locationId: w.A.id, playerId: w.p2.user.id, startsAt: b.startsAt, endsAt: b.endsAt, durationMinutes: 60, priceCents: 1 } }),
    ).rejects.toThrow(/Booking_no_overlap|exclusion/i);
    // A cancelled booking does not block the slot.
    await db.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
    const again = await db.booking.create({ data: { confirmationCode: "HT-RAWRAW", courtId: w.c1.id, locationId: w.A.id, playerId: w.p2.user.id, startsAt: b.startsAt, endsAt: b.endsAt, durationMinutes: 60, priceCents: 1 } });
    expect(again.id).toBeTruthy();
  });
});

describe("cancellation and rescheduling", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("owners cancel before the cutoff; late changes need staff", async () => {
    const b = await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60), { now: NOW }); // Tue 10:00 Cairo = 08:00Z
    await expectCode(bookings.cancelBooking(w.p2.actor, b.id, {}, { now: NOW }), "FORBIDDEN");
    await expectCode(bookings.cancelBooking(w.trainerA.actor, b.id, {}, { now: NOW }), "FORBIDDEN");
    const lateNow = new Date("2026-11-10T02:00:00Z"); // 6h before, cutoff is 12h
    await expectCode(bookings.cancelBooking(w.p1.actor, b.id, {}, { now: lateNow }), "CANCELLATION_NOT_ALLOWED");
    const byStaff = await bookings.cancelBooking(w.receptionA.actor, b.id, { reason: "Player called" }, { now: lateNow });
    expect(byStaff.status).toBe("CANCELLED");
    expect(byStaff.payments[0].status).toBe("CANCELLED");
    expect(await db.notification.count({ where: { userId: w.p1.user.id, type: "booking.cancelled" } })).toBe(1);
    await expectCode(bookings.cancelBooking(w.receptionA.actor, b.id, {}, { now: lateNow }), "CANCELLATION_NOT_ALLOWED");
    // Slot is free again.
    expect((await bookings.createBooking(w.p2.actor, req(w.c1.id, 10 * 60), { now: NOW })).status).toBe("CONFIRMED");

    const c = await bookings.createBooking(w.p1.actor, req(w.c1.id, 12 * 60), { now: NOW });
    const mine = await bookings.cancelBooking(w.p1.actor, c.id, { reason: "Injury" }, { now: NOW });
    expect(mine.cancellationReason).toBe("Injury");
    const started = await bookings.createBooking(w.receptionA.actor, { ...req(w.c1.id, 14 * 60), playerId: w.p1.user.id }, { now: NOW });
    await expectCode(bookings.cancelBooking(w.receptionA.actor, started.id, {}, { now: new Date("2026-11-10T12:30:00Z") }), "CANCELLATION_NOT_ALLOWED");
  });

  it("reschedules atomically with a link to the original", async () => {
    const paidOriginal = await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60), { now: NOW });
    await bookings.recordPayment(w.receptionA.actor, paidOriginal.id, { method: "CASH" }, { now: NOW });
    const moved = await bookings.rescheduleBooking(w.p1.actor, paidOriginal.id, req(w.c2.id, 16 * 60, 90), { now: NOW });
    expect(moved.status).toBe("CONFIRMED");
    expect(moved.rescheduledFromId).toBe(paidOriginal.id);
    expect(moved.courtId).toBe(w.c2.id);
    expect(moved.participants).toHaveLength(1);
    expect(moved.payments.map((p) => p.status)).toEqual(["PAID"]); // paid payment follows the booking
    const old = await bookings.getBooking(w.p1.actor, paidOriginal.id);
    expect(old.status).toBe("CANCELLED");
    expect(old.cancellationReason).toBe("Rescheduled");
    expect(old.rescheduledTo?.id).toBe(moved.id);

    // Moving onto an occupied slot fails and leaves the current booking untouched.
    await bookings.createBooking(w.p2.actor, req(w.c1.id, 18 * 60), { now: NOW });
    await expectCode(bookings.rescheduleBooking(w.p1.actor, moved.id, req(w.c1.id, 18 * 60), { now: NOW }), "SLOT_UNAVAILABLE");
    expect((await bookings.getBooking(w.p1.actor, moved.id)).status).toBe("CONFIRMED");
    // Shifting within your own time range is allowed (the old booking is excluded from the clash check).
    const shifted = await bookings.rescheduleBooking(w.p1.actor, moved.id, req(w.c2.id, 16 * 60, 120), { now: NOW });
    expect(shifted.durationMinutes).toBe(120);
    await expectCode(bookings.rescheduleBooking(w.p1.actor, shifted.id, req(w.c2.id, 16 * 60, 45), { now: NOW }), "INVALID_DURATION");
    const otherLoc = await courts.createCourt(w.owner.actor, { locationId: w.B.id, name: "B1", type: "INDOOR" });
    await courts.setCourtAvailability(w.owner.actor, otherLoc.id, ALL_WEEK);
    await expectCode(bookings.rescheduleBooking(w.p1.actor, shifted.id, req(otherLoc.id, 16 * 60, 60), { now: NOW }), "VALIDATION");
  });
});

describe("staff views, attendance and payments", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("scopes bookings to locations and roles", async () => {
    const b = await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60), { now: NOW });
    const guest = await bookings.createBooking(w.receptionA.actor, { ...req(w.c2.id, 10 * 60), guestName: "Walk-in Wael", guestPhone: "0100" }, { now: NOW });
    expect(guest.playerId).toBeNull();
    expect(guest.participants[0].guestName).toBe("Walk-in Wael");
    await expectCode(bookings.createBooking(w.receptionB.actor, { ...req(w.c2.id, 12 * 60), guestName: "Nope" }, { now: NOW }), "FORBIDDEN");
    await expectCode(bookings.createBooking(w.p2.actor, { ...req(w.c2.id, 12 * 60), playerId: w.p1.user.id }, { now: NOW }), "FORBIDDEN");
    await expectCode(bookings.createBooking(w.trainerA.actor, { ...req(w.c2.id, 12 * 60), playerId: w.p1.user.id }, { now: NOW }), "FORBIDDEN");

    const list = await bookings.listLocationBookings(w.receptionA.actor, { locationId: w.A.id, dateISO: DAY }, NOW);
    expect(list.total).toBe(2);
    expect((await bookings.listLocationBookings(w.trainerA.actor, { locationId: w.A.id }, NOW)).total).toBe(2);
    await expectCode(bookings.listLocationBookings(w.receptionB.actor, { locationId: w.A.id }, NOW), "FORBIDDEN");
    await expectCode(bookings.listLocationBookings(w.p1.actor, { locationId: w.A.id }, NOW), "FORBIDDEN");
    expect((await bookings.listLocationBookings(w.owner.actor, { locationId: w.A.id, q: b.confirmationCode.slice(3) }, NOW)).items.map((x) => x.id)).toEqual([b.id]);
    expect((await bookings.listBookingsInScope(w.receptionA.actor, { from: NOW, to: new Date("2026-12-01T00:00:00Z") })).length).toBe(2);

    expect((await bookings.getBooking(w.p1.actor, b.id)).id).toBe(b.id);
    expect((await bookings.getBooking(w.trainerA.actor, b.id)).id).toBe(b.id);
    await expectCode(bookings.getBooking(w.p2.actor, b.id), "FORBIDDEN");
    await expectCode(bookings.getBooking(w.receptionB.actor, b.id), "FORBIDDEN");
  });

  it("lists upcoming and past bookings for the player and auto-completes elapsed ones", async () => {
    const b = await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60), { now: NOW });
    expect((await bookings.listMyBookings(w.p1.actor, "upcoming", NOW)).map((x) => x.id)).toEqual([b.id]);
    expect(await bookings.listMyBookings(w.p1.actor, "past", NOW)).toHaveLength(0);
    const later = new Date("2026-11-11T00:00:00Z");
    expect(await bookings.listMyBookings(w.p1.actor, "upcoming", later)).toHaveLength(0);
    const past = await bookings.listMyBookings(w.p1.actor, "past", later);
    expect(past.map((x) => x.status)).toEqual(["COMPLETED"]);
    expect(await bookings.listMyBookings(w.p2.actor, "past", later)).toHaveLength(0);
    await expectCode(bookings.listMyBookings(null, "upcoming"), "UNAUTHENTICATED");
  });

  it("records attendance and venue payments with the right permissions", async () => {
    const b = await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60), { now: NOW });
    await expectCode(bookings.setBookingStatus(w.receptionA.actor, b.id, "NO_SHOW", { now: NOW }), "VALIDATION"); // not started
    const during = new Date("2026-11-10T08:10:00Z");
    await expectCode(bookings.setBookingStatus(w.trainerA.actor, b.id, "NO_SHOW", { now: during }), "FORBIDDEN");
    await expectCode(bookings.setBookingStatus(w.p1.actor, b.id, "COMPLETED", { now: during }), "FORBIDDEN");
    expect((await bookings.setBookingStatus(w.receptionA.actor, b.id, "NO_SHOW", { now: during })).status).toBe("NO_SHOW");
    expect((await bookings.setBookingStatus(w.managerA.actor, b.id, "COMPLETED", { now: during })).status).toBe("COMPLETED");

    const paid = await bookings.recordPayment(w.receptionA.actor, b.id, { method: "CARD" }, { now: during });
    expect(paid.payments[0]).toMatchObject({ status: "PAID", method: "CARD" });
    await expectCode(bookings.recordPayment(w.trainerA.actor, b.id, { method: "CASH" }), "FORBIDDEN");
    await expectCode(bookings.recordPayment(w.p1.actor, b.id, { method: "CASH" }), "FORBIDDEN");
    await expectCode(bookings.recordPayment(w.receptionA.actor, b.id, { method: "BITCOIN" }), "VALIDATION");
  });

  it("marks booked slots in the schedule, with names for staff only", async () => {
    const b = await bookings.createBooking(w.p1.actor, req(w.c1.id, 10 * 60, 90), { now: NOW });
    const mine = await getLocationSchedule(w.p1.actor, w.A.id, DAY, NOW);
    const court = mine.courts.find((c) => c.court.id === w.c1.id)!;
    expect(court.slots.filter((s) => s.status === "booked").map((s) => s.startMinutes)).toEqual([600, 660]);
    expect(court.slots.find((s) => s.startMinutes === 600)!.booking).toEqual({ id: b.id, mine: true, label: undefined });
    const other = await getLocationSchedule(w.p2.actor, w.A.id, DAY, NOW);
    expect(other.courts.find((c) => c.court.id === w.c1.id)!.slots.find((s) => s.startMinutes === 600)!.booking).toMatchObject({ mine: false });
    const staff = await getLocationSchedule(w.receptionA.actor, w.A.id, DAY, NOW);
    expect(staff.courts.find((c) => c.court.id === w.c1.id)!.slots.find((s) => s.startMinutes === 600)!.booking?.label).toBe("Player One");
    expect(zonedToUtc(DAY, 600, "Africa/Cairo").getTime()).toBe(b.startsAt.getTime());
  });
});
