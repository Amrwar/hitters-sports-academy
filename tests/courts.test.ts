import { beforeEach, describe, expect, it } from "vitest";
import type { PricingRule } from "@prisma/client";
import { db } from "@/lib/db";
import { zonedToUtc } from "@/lib/time";
import * as locations from "@/server/services/locations";
import * as courts from "@/server/services/courts";
import * as pricing from "@/server/services/pricing";
import { computeCourtDay, getLocationSchedule } from "@/server/services/availability";
import { expectCode, makeLocation, makeUser } from "./helpers";

const ALL_WEEK = (opensAt: number, closesAt: number, priceCents = 40000, slotMinutes = 60) => Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt, closesAt, slotMinutes, priceCents }));

async function world() {
  const A = await makeLocation("alpha");
  const B = await makeLocation("beta");
  const owner = await makeUser({ globalRole: "ACADEMY_OWNER" });
  const managerA = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }] });
  const financeA = await makeUser({ staff: [{ locationId: A.id, role: "FINANCE_MANAGER" }] });
  const receptionA = await makeUser({ staff: [{ locationId: A.id, role: "RECEPTIONIST" }] });
  const player = await makeUser({ homeLocationId: A.id });
  return { A, B, owner, managerA, financeA, receptionA, player };
}
type World = Awaited<ReturnType<typeof world>>;

describe("location management", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("owners create locations with a default booking policy; managers edit details, hours and facilities", async () => {
    const loc = await locations.createLocation(w.owner.actor, { slug: "gamma", name: "HITTERS Gamma", city: "Cairo", area: "Gamma Park", address: "1 Gamma St" });
    expect(loc.bookingPolicy?.advanceBookingDays).toBe(14);

    const hours = Array.from({ length: 7 }, (_, d) => (d === 5 ? null : { opensAt: 480, closesAt: 1380 }));
    const updated = await locations.updateLocation(w.managerA.actor, w.A.id, { description: "Flagship club", facilities: ["parking", "cafe"], openingHours: hours, timezone: "Africa/Cairo", phone: "+20 2 1234" });
    expect(updated.description).toBe("Flagship club");
    expect(updated.facilities).toEqual(["parking", "cafe"]);
    expect((updated.openingHours as unknown[])[5]).toBeNull();

    await expectCode(locations.updateLocation(w.managerA.actor, w.A.id, { facilities: ["jacuzzi"] }), "VALIDATION");
    await expectCode(locations.updateLocation(w.managerA.actor, w.A.id, { timezone: "Mars/Olympus" }), "VALIDATION");
    await expectCode(locations.updateLocation(w.managerA.actor, w.A.id, { openingHours: [null, null, null] }), "VALIDATION");
    await expectCode(locations.updateLocation(w.managerA.actor, w.A.id, { openingHours: Array(7).fill({ opensAt: 600, closesAt: 500 }) }), "VALIDATION");
    await expectCode(locations.updateLocation(w.managerA.actor, w.B.id, { description: "Nope" }), "FORBIDDEN");
    await expectCode(locations.updateLocation(w.receptionA.actor, w.A.id, { description: "Nope" }), "FORBIDDEN");
    await expectCode(locations.updateLocation(w.player.actor, w.A.id, { description: "Nope" }), "FORBIDDEN");
  });

  it("only owners activate or deactivate; players never see inactive locations", async () => {
    await expectCode(locations.updateLocation(w.managerA.actor, w.A.id, { status: "INACTIVE" }), "FORBIDDEN");
    const off = await locations.updateLocation(w.owner.actor, w.A.id, { status: "INACTIVE" });
    expect(off.status).toBe("INACTIVE");
    expect((await locations.listPublicLocations()).map((l) => l.slug)).toEqual(["beta"]);
    await expectCode(locations.getLocationPublic(w.player.actor, "alpha"), "FORBIDDEN");
    expect((await locations.getLocationPublic(w.managerA.actor, "alpha")).slug).toBe("alpha");
    const on = await locations.updateLocation(w.owner.actor, w.A.id, { status: "ACTIVE" });
    expect(on.status).toBe("ACTIVE");
  });

  it("manages photos within scope and limits", async () => {
    const p1 = await locations.addLocationPhoto(w.managerA.actor, w.A.id, { url: "/brand/court-net.jpg", alt: "Net" });
    const p2 = await locations.addLocationPhoto(w.managerA.actor, w.A.id, { url: "https://cdn.example.com/court.jpg" });
    expect([p1.sortOrder, p2.sortOrder]).toEqual([0, 1]);
    await expectCode(locations.addLocationPhoto(w.managerA.actor, w.A.id, { url: "javascript:alert(1)" }), "VALIDATION");
    await expectCode(locations.addLocationPhoto(w.managerA.actor, w.B.id, { url: "/brand/court-net.jpg" }), "FORBIDDEN");
    await expectCode(locations.addLocationPhoto(w.receptionA.actor, w.A.id, { url: "/brand/court-net.jpg" }), "FORBIDDEN");
    const reordered = await locations.reorderLocationPhotos(w.managerA.actor, w.A.id, [p2.id, p1.id]);
    expect(reordered.map((p) => p.id)).toEqual([p2.id, p1.id]);
    await expectCode(locations.reorderLocationPhotos(w.managerA.actor, w.A.id, [p1.id]), "VALIDATION");
    await locations.removeLocationPhoto(w.managerA.actor, p2.id);
    const left = await db.locationPhoto.findMany({ where: { locationId: w.A.id } });
    expect(left).toHaveLength(1);
    expect(left[0].sortOrder).toBe(0);
  });

  it("validates booking policies", async () => {
    const policy = await locations.upsertBookingPolicy(w.managerA.actor, w.A.id, { advanceBookingDays: 7, minNoticeMinutes: 30, cancellationCutoffHours: 24, maxActiveBookingsPerPlayer: 2, requireVerifiedEmail: true, allowedDurations: [60, 90] });
    expect(policy.allowedDurations).toEqual([60, 90]);
    await expectCode(locations.upsertBookingPolicy(w.managerA.actor, w.A.id, { advanceBookingDays: 0, minNoticeMinutes: 30, cancellationCutoffHours: 24, maxActiveBookingsPerPlayer: 2, requireVerifiedEmail: true, allowedDurations: [60] }), "VALIDATION");
    await expectCode(locations.upsertBookingPolicy(w.managerA.actor, w.A.id, { advanceBookingDays: 7, minNoticeMinutes: 30, cancellationCutoffHours: 24, maxActiveBookingsPerPlayer: 2, requireVerifiedEmail: true, allowedDurations: [45] }), "VALIDATION");
    await expectCode(locations.upsertBookingPolicy(w.managerA.actor, w.B.id, { advanceBookingDays: 7, minNoticeMinutes: 30, cancellationCutoffHours: 24, maxActiveBookingsPerPlayer: 2, requireVerifiedEmail: true, allowedDurations: [60] }), "FORBIDDEN");
  });
});

describe("court management", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("supports many courts per location with unique names, rename, type, durations and status", async () => {
    const c1 = await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 1", type: "PANORAMIC" });
    const c2 = await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 2", type: "INDOOR" });
    await courts.createCourt(w.owner.actor, { locationId: w.B.id, name: "Court 1", type: "OUTDOOR" }); // same name, other location is fine
    await expectCode(courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 2", type: "INDOOR" }), "CONFLICT");
    const renamed = await courts.updateCourt(w.managerA.actor, c1.id, { name: "Centre Court", type: "INDOOR", durationsMinutes: [60, 120], surface: "Mondo", description: "Show court" });
    expect(renamed.name).toBe("Centre Court");
    expect(renamed.durationsMinutes).toEqual([60, 120]);
    await expectCode(courts.updateCourt(w.managerA.actor, c2.id, { name: "Centre Court" }), "CONFLICT");
    await expectCode(courts.updateCourt(w.managerA.actor, c2.id, { durationsMinutes: [45] }), "VALIDATION");
    const closed = await courts.updateCourt(w.managerA.actor, c2.id, { status: "MAINTENANCE" });
    expect(closed.status).toBe("MAINTENANCE");
    expect((await courts.listCourts(w.managerA.actor, w.A.id)).map((c) => c.name)).toEqual(["Centre Court", "Court 2"]);
    expect((await courts.listCourts(w.owner.actor, w.B.id)).map((c) => c.name)).toEqual(["Court 1"]);
  });

  it("rejects overlapping closures but allows adjacent ones, and converts local times with the location timezone", async () => {
    await locations.updateLocation(w.owner.actor, w.A.id, { timezone: "Africa/Cairo" });
    const court = await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 1", type: "INDOOR" });
    const first = await courts.addCourtClosure(w.managerA.actor, court.id, { startLocal: "2026-11-10T08:00", endLocal: "2026-11-10T12:00", reason: "Resurfacing" });
    expect(first.startsAt.toISOString()).toBe("2026-11-10T06:00:00.000Z"); // Cairo is UTC+2 in November
    await expectCode(courts.addCourtClosure(w.managerA.actor, court.id, { startLocal: "2026-11-10T11:00", endLocal: "2026-11-10T13:00" }), "CONFLICT");
    await expectCode(courts.addCourtClosure(w.managerA.actor, court.id, { startLocal: "2026-11-10T07:00", endLocal: "2026-11-10T13:00" }), "CONFLICT");
    await expectCode(courts.addCourtClosure(w.managerA.actor, court.id, { startLocal: "2026-11-10T09:00", endLocal: "2026-11-10T10:00" }), "CONFLICT");
    const adjacent = await courts.addCourtClosure(w.managerA.actor, court.id, { startLocal: "2026-11-10T12:00", endLocal: "2026-11-10T14:00" });
    expect(adjacent.startsAt.getTime()).toBe(first.endsAt.getTime());
    await expectCode(courts.addCourtClosure(w.managerA.actor, court.id, { startLocal: "2026-11-10T15:00", endLocal: "2026-11-10T14:00" }), "VALIDATION");
    await expectCode(courts.addCourtClosure(w.managerA.actor, court.id, { startLocal: "2026-11-10T15:00", endLocal: "2027-06-10T14:00" }), "VALIDATION");
    await expectCode(courts.addCourtClosure(w.receptionA.actor, court.id, { startLocal: "2026-12-01T08:00", endLocal: "2026-12-01T09:00" }), "FORBIDDEN");
    await courts.removeCourtClosure(w.managerA.actor, first.id);
    expect(await db.courtClosure.count({ where: { courtId: court.id } })).toBe(1);
  });

  it("closes every court at a location atomically", async () => {
    const c1 = await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 1", type: "INDOOR" });
    await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 2", type: "INDOOR" });
    await courts.addCourtClosure(w.managerA.actor, c1.id, { startLocal: "2026-12-24T10:00", endLocal: "2026-12-24T12:00" });
    await expectCode(courts.closeLocationCourts(w.managerA.actor, w.A.id, { startLocal: "2026-12-24T09:00", endLocal: "2026-12-24T18:00", reason: "Tournament" }), "CONFLICT");
    expect(await db.courtClosure.count()).toBe(1); // nothing partially written
    const res = await courts.closeLocationCourts(w.managerA.actor, w.A.id, { startLocal: "2026-12-25T09:00", endLocal: "2026-12-25T18:00", reason: "Tournament" });
    expect(res.count).toBe(2);
    await expectCode(courts.closeLocationCourts(w.managerA.actor, w.B.id, { startLocal: "2026-12-25T09:00", endLocal: "2026-12-25T18:00" }), "FORBIDDEN");
  });
});

describe("pricing engine", () => {
  const rule = (over: Partial<PricingRule>): PricingRule => ({
    id: over.id ?? Math.random().toString(36).slice(2),
    locationId: "L",
    courtId: null,
    name: over.name ?? "rule",
    kind: over.kind ?? "CUSTOM",
    daysOfWeek: over.daysOfWeek ?? [],
    startsAt: over.startsAt ?? null,
    endsAt: over.endsAt ?? null,
    priceCents: over.priceCents ?? null,
    adjustmentPercent: over.adjustmentPercent ?? null,
    membershipTier: over.membershipTier ?? null,
    priority: over.priority ?? 100,
    active: over.active ?? true,
    validFrom: over.validFrom ?? null,
    validTo: over.validTo ?? null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  });
  const base = { courtId: "C", baseHourlyCents: 40000, dateISO: "2026-10-09", dayOfWeek: 5, startMinutes: 19 * 60, durationMinutes: 90 };

  it("prorates the base rate by duration", () => {
    const q = pricing.quotePrice({ ...base, rules: [] });
    expect(q.baseCents).toBe(60000);
    expect(q.totalCents).toBe(60000);
  });

  it("applies peak, weekend and membership rules in priority order", () => {
    const rules = [
      rule({ name: "Peak", kind: "PEAK", startsAt: 18 * 60, endsAt: 21 * 60, adjustmentPercent: 25, priority: 100 }),
      rule({ name: "Weekend", kind: "WEEKEND", daysOfWeek: [5, 6], adjustmentPercent: 10, priority: 110 }),
      rule({ name: "Pro", kind: "MEMBERSHIP_DISCOUNT", membershipTier: "PRO", adjustmentPercent: -15, priority: 200 }),
    ];
    const guest = pricing.quotePrice({ ...base, rules });
    expect(guest.totalCents).toBe(Math.round(Math.round(60000 * 1.25) * 1.1)); // 82500
    expect(guest.adjustments.map((a) => a.kind)).toEqual(["PEAK", "WEEKEND"]);
    const member = pricing.quotePrice({ ...base, rules, isMember: true, membershipTier: "PRO" });
    expect(member.totalCents).toBe(Math.round(82500 * 0.85));
    const otherTier = pricing.quotePrice({ ...base, rules, isMember: true, membershipTier: "BASIC" });
    expect(otherTier.totalCents).toBe(82500);
    const offPeakWeekday = pricing.quotePrice({ ...base, rules, dayOfWeek: 2, startMinutes: 10 * 60 });
    expect(offPeakWeekday.totalCents).toBe(60000);
  });

  it("lets an absolute price replace the base and respects validity windows, court scope and inactive flags", () => {
    const rules = [
      rule({ name: "Winter rate", priceCents: 30000, priority: 50, validFrom: new Date("2026-11-01T00:00:00Z"), validTo: new Date("2027-02-28T00:00:00Z") }),
      rule({ name: "Other court", priceCents: 1, courtId: "X" }),
      rule({ name: "Disabled", adjustmentPercent: 500, active: false }),
    ];
    expect(pricing.quotePrice({ ...base, rules }).totalCents).toBe(60000); // October: winter rate not yet valid
    expect(pricing.quotePrice({ ...base, rules, dateISO: "2026-12-10" }).totalCents).toBe(45000);
  });

  it("stores rules per location with scope checks and validation", async () => {
    const w = await world();
    const court = await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 1", type: "INDOOR" });
    const r = await pricing.createPricingRule(w.financeA.actor, w.A.id, { name: "Peak", kind: "PEAK", startsAt: 1080, endsAt: 1260, adjustmentPercent: 25 });
    expect(r.locationId).toBe(w.A.id);
    await expectCode(pricing.createPricingRule(w.managerA.actor, w.A.id, { name: "Broken", kind: "PEAK" }), "VALIDATION");
    await expectCode(pricing.createPricingRule(w.managerA.actor, w.A.id, { name: "Broken", kind: "PEAK", startsAt: 1080, adjustmentPercent: 25 }), "VALIDATION");
    await expectCode(pricing.createPricingRule(w.managerA.actor, w.B.id, { name: "Nope", kind: "PEAK", adjustmentPercent: 25 }), "FORBIDDEN");
    await expectCode(pricing.createPricingRule(w.receptionA.actor, w.A.id, { name: "Nope", kind: "PEAK", adjustmentPercent: 25 }), "FORBIDDEN");
    await expectCode(pricing.createPricingRule(w.managerA.actor, w.A.id, { name: "Wrong court", kind: "PEAK", adjustmentPercent: 25, courtId: (await courts.createCourt(w.owner.actor, { locationId: w.B.id, name: "B1", type: "INDOOR" })).id }), "VALIDATION");
    const scoped = await pricing.createPricingRule(w.managerA.actor, w.A.id, { name: "Centre court premium", kind: "CUSTOM", adjustmentPercent: 20, courtId: court.id });
    expect(scoped.courtId).toBe(court.id);
    const updated = await pricing.updatePricingRule(w.managerA.actor, r.id, { adjustmentPercent: 30, active: false });
    expect(updated.adjustmentPercent).toBe(30);
    expect((await pricing.listPricingRules(w.player.actor, w.A.id)).map((x) => x.name)).toEqual(["Centre court premium"]); // inactive hidden from players
    expect((await pricing.listPricingRules(w.managerA.actor, w.A.id, { includeInactive: true })).length).toBe(2);
    await pricing.deletePricingRule(w.managerA.actor, scoped.id);
    await expectCode(pricing.deletePricingRule(w.receptionA.actor, r.id), "FORBIDDEN");
  });
});

describe("availability engine", () => {
  const court = (over: Partial<Parameters<typeof computeCourtDay>[0]["court"]> = {}) => ({
    id: "C1",
    name: "Court 1",
    type: "INDOOR" as const,
    status: "ACTIVE" as const,
    sortOrder: 0,
    availability: ALL_WEEK(8 * 60, 12 * 60).map((a, i) => ({ ...a, id: `a${i}`, courtId: "C1", createdAt: new Date(), updatedAt: new Date() })),
    closures: [],
    ...over,
  });
  const location = (over: Partial<Parameters<typeof computeCourtDay>[0]["location"]> = {}) => ({ timezone: "Africa/Cairo", status: "ACTIVE" as const, openingHours: null, bookingPolicy: { advanceBookingDays: 14, minNoticeMinutes: 60 }, ...over });
  const now = new Date("2026-11-09T12:00:00Z"); // Monday 14:00 Cairo

  it("generates slots in the location timezone and marks past / too soon / outside window", () => {
    const today = computeCourtDay({ court: court(), location: location(), rules: [], dateISO: "2026-11-09", now });
    expect(today.slots).toHaveLength(4);
    expect(today.slots[0].startsAt.toISOString()).toBe("2026-11-09T06:00:00.000Z"); // 08:00 Cairo = 06:00Z
    expect(today.slots.map((s) => s.status)).toEqual(["past", "past", "past", "past"]);

    const tomorrow = computeCourtDay({ court: court(), location: location(), rules: [], dateISO: "2026-11-10", now });
    expect(tomorrow.slots.every((s) => s.status === "available")).toBe(true);
    expect(tomorrow.slots[0].priceCents).toBe(40000);

    const soon = computeCourtDay({ court: court(), location: location(), rules: [], dateISO: "2026-11-09", now: new Date("2026-11-09T05:30:00Z") });
    expect(soon.slots.map((s) => s.status)).toEqual(["too_soon", "available", "available", "available"]);

    const far = computeCourtDay({ court: court(), location: location(), rules: [], dateISO: "2026-12-09", now });
    expect(far.slots.every((s) => s.status === "outside_window")).toBe(true);
  });

  it("respects closures, maintenance, inactive courts and location opening hours", () => {
    const closure = { startsAt: zonedToUtc("2026-11-10", 9 * 60, "Africa/Cairo"), endsAt: zonedToUtc("2026-11-10", 10 * 60 + 30, "Africa/Cairo"), reason: "Cleaning" };
    const withClosure = computeCourtDay({ court: court({ closures: [closure] }), location: location(), rules: [], dateISO: "2026-11-10", now });
    expect(withClosure.slots.map((s) => s.status)).toEqual(["available", "closed", "closed", "available"]);
    expect(withClosure.slots[1].reason).toBe("Cleaning");

    expect(computeCourtDay({ court: court({ status: "MAINTENANCE" }), location: location(), rules: [], dateISO: "2026-11-10", now }).slots.every((s) => s.status === "maintenance")).toBe(true);
    expect(computeCourtDay({ court: court({ status: "INACTIVE" }), location: location(), rules: [], dateISO: "2026-11-10", now }).slots.every((s) => s.status === "inactive")).toBe(true);
    expect(computeCourtDay({ court: court(), location: location({ status: "COMING_SOON" }), rules: [], dateISO: "2026-11-10", now }).slots.every((s) => s.status === "location_closed")).toBe(true);

    const hours = Array.from({ length: 7 }, (_, d) => (d === 2 ? null : { opensAt: 9 * 60, closesAt: 11 * 60 }));
    const trimmed = computeCourtDay({ court: court(), location: location({ openingHours: hours }), rules: [], dateISO: "2026-11-11", now }); // Wednesday
    expect(trimmed.slots).toHaveLength(2);
    expect(trimmed.open).toEqual({ opensAt: 540, closesAt: 660 });
    const closedDay = computeCourtDay({ court: court(), location: location({ openingHours: hours }), rules: [], dateISO: "2026-11-10", now }); // Tuesday closed
    expect(closedDay.slots).toHaveLength(0);
    expect(closedDay.open).toBeNull();
  });

  it("prices slots through the rules and flags peak", () => {
    const peak = { id: "p", locationId: "L", courtId: null, name: "Peak", kind: "PEAK" as const, daysOfWeek: [], startsAt: 10 * 60, endsAt: 12 * 60, priceCents: null, adjustmentPercent: 50, membershipTier: null, priority: 100, active: true, validFrom: null, validTo: null, createdAt: new Date(), updatedAt: new Date() };
    const day = computeCourtDay({ court: court(), location: location(), rules: [peak], dateISO: "2026-11-10", now });
    expect(day.slots.map((s) => s.priceCents)).toEqual([40000, 40000, 60000, 60000]);
    expect(day.slots.map((s) => s.peak)).toEqual([false, false, true, true]);
  });

  it("builds a schedule from the database with role-aware visibility", async () => {
    const w = await world();
    await locations.updateLocation(w.owner.actor, w.A.id, { timezone: "Asia/Dubai" });
    const c1 = await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 1", type: "INDOOR" });
    const c2 = await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "Court 2", type: "INDOOR", status: "INACTIVE" });
    await courts.setCourtAvailability(w.managerA.actor, c1.id, ALL_WEEK(7 * 60, 10 * 60, 50000));
    await courts.setCourtAvailability(w.managerA.actor, c2.id, ALL_WEEK(7 * 60, 10 * 60, 50000));
    await courts.addCourtClosure(w.managerA.actor, c1.id, { startLocal: "2026-11-10T08:00", endLocal: "2026-11-10T09:00" });

    const staffView = await getLocationSchedule(w.managerA.actor, w.A.id, "2026-11-10", new Date("2026-11-01T00:00:00Z"));
    expect(staffView.courts.map((c) => c.court.name)).toEqual(["Court 1", "Court 2"]);
    expect(staffView.courts[0].slots.map((s) => s.status)).toEqual(["available", "closed", "available"]);
    expect(staffView.courts[0].slots[0].startsAt.toISOString()).toBe("2026-11-10T03:00:00.000Z"); // 07:00 Dubai

    const playerView = await getLocationSchedule(w.player.actor, "alpha", "2026-11-10", new Date("2026-11-01T00:00:00Z"));
    expect(playerView.courts.map((c) => c.court.name)).toEqual(["Court 1"]);
    await expectCode(getLocationSchedule(w.player.actor, w.A.id, "10/11/2026"), "VALIDATION");
    await expectCode(getLocationSchedule(null, w.A.id, "2026-11-10"), "UNAUTHENTICATED");
    await locations.updateLocation(w.owner.actor, w.A.id, { status: "INACTIVE" });
    await expectCode(getLocationSchedule(w.player.actor, w.A.id, "2026-11-10"), "FORBIDDEN");
    expect((await getLocationSchedule(w.managerA.actor, w.A.id, "2026-11-10")).courts.length).toBe(2);
  });
});
