import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as trainers from "@/server/services/trainers";
import * as lessons from "@/server/services/lessons";
import * as programs from "@/server/services/programs";
import * as packages from "@/server/services/packages";
import { expectCode, makeLocation, makeUser } from "./helpers";

const NOW = new Date("2026-11-09T08:00:00Z"); // Monday 10:00 Cairo
const DAY = "2026-11-10"; // Tuesday
const ALL_WEEK = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinutes: 9 * 60, endMinutes: 13 * 60 }));

async function world() {
  const A = await makeLocation("alpha");
  const B = await makeLocation("beta");
  const owner = await makeUser({ globalRole: "ACADEMY_OWNER" });
  const managerA = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }] });
  const receptionA = await makeUser({ staff: [{ locationId: A.id, role: "RECEPTIONIST" }] });
  const coach = await makeUser({ staff: [{ locationId: A.id, role: "TRAINER" }, { locationId: B.id, role: "TRAINER" }], name: "Coach Ahmed" });
  const coach2 = await makeUser({ staff: [{ locationId: A.id, role: "TRAINER" }], name: "Coach Nour" });
  const p1 = await makeUser({ homeLocationId: A.id, name: "Player One", level: "B" });
  const p2 = await makeUser({ homeLocationId: A.id, name: "Player Two", level: "C" });
  const p3 = await makeUser({ homeLocationId: A.id, name: "Player Three", level: "B" });
  const novice = await makeUser({ homeLocationId: A.id, name: "No Level" });
  const trainer = await trainers.createTrainerProfile(managerA.actor, { userId: coach.user.id, title: "Head coach", hourlyRateCents: 90000, durationsMinutes: [60, 90], levels: ["B", "C"], locationIds: [A.id], specialties: ["Technique"], languages: ["Arabic", "English"] });
  await trainers.setTrainerAvailability(coach.actor, trainer.id, { rows: ALL_WEEK.map((w) => ({ ...w, locationId: A.id })) });
  return { A, B, owner, managerA, receptionA, coach, coach2, p1, p2, p3, novice, trainer };
}
type World = Awaited<ReturnType<typeof world>>;
const req = (w: World, startMinutes: number, extra: Record<string, unknown> = {}) => ({ trainerId: w.trainer.id, locationId: w.A.id, dateISO: DAY, startMinutes, durationMinutes: 60, ...extra });

describe("trainer profiles and availability", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("creates profiles only for users with the trainer role, and lets trainers edit their own public details", async () => {
    await expectCode(trainers.createTrainerProfile(w.managerA.actor, { userId: w.p1.user.id, title: "Coach", hourlyRateCents: 50000, locationIds: [w.A.id] }), "VALIDATION");
    await expectCode(trainers.createTrainerProfile(w.managerA.actor, { userId: w.coach2.user.id, title: "Coach", hourlyRateCents: 50000, locationIds: [w.B.id] }), "FORBIDDEN"); // manager A cannot act at B
    await expectCode(trainers.createTrainerProfile(w.receptionA.actor, { userId: w.coach2.user.id, title: "Coach", hourlyRateCents: 50000, locationIds: [w.A.id] }), "FORBIDDEN");
    const t2 = await trainers.createTrainerProfile(w.owner.actor, { userId: w.coach2.user.id, title: "Coach", hourlyRateCents: 50000, locationIds: [w.A.id] });
    expect(t2.status).toBe("ACTIVE");
    // Trainer edits bio and photo but cannot change the rate or clubs.
    const mine = await trainers.updateTrainerProfile(w.coach.actor, w.trainer.id, { bio: "12 years on tour", photoUrl: "https://cdn.example.com/ahmed.jpg", hourlyRateCents: 1 });
    expect(mine.bio).toBe("12 years on tour");
    expect(mine.photoUrl).toBe("https://cdn.example.com/ahmed.jpg");
    expect(mine.hourlyRateCents).toBe(90000);
    await expectCode(trainers.updateTrainerProfile(w.coach.actor, w.trainer.id, { photoUrl: "javascript:alert(1)" }), "VALIDATION");
    expect((await trainers.updateTrainerProfile(w.coach.actor, w.trainer.id, { photoUrl: "" })).photoUrl).toBeNull(); // clearing works
    await expectCode(trainers.updateTrainerProfile(w.coach.actor, w.trainer.id, { locationIds: [w.A.id, w.B.id] }), "FORBIDDEN");
    await expectCode(trainers.updateTrainerProfile(w.coach2.actor, w.trainer.id, { bio: "hijack" }), "FORBIDDEN");
    const grown = await trainers.updateTrainerProfile(w.owner.actor, w.trainer.id, { locationIds: [w.A.id, w.B.id], hourlyRateCents: 100000 });
    expect(grown.locations.map((l) => l.location.id).sort()).toEqual([w.A.id, w.B.id].sort());
    expect((await trainers.listTrainers(w.p1.actor, { locationId: w.B.id })).map((t) => t.id)).toEqual([w.trainer.id]);
    expect((await trainers.listTrainers(w.p1.actor, { level: "A" })).map((t) => t.id)).toEqual([t2.id]); // coach coaches B/C only
  });

  it("builds the day's slots from availability, hours, time off and existing lessons", async () => {
    await expectCode(trainers.setTrainerAvailability(w.coach.actor, w.trainer.id, { rows: [{ locationId: w.B.id, dayOfWeek: 1, startMinutes: 540, endMinutes: 600 }] }), "VALIDATION");
    await expectCode(trainers.setTrainerAvailability(w.coach.actor, w.trainer.id, { rows: [{ locationId: w.A.id, dayOfWeek: 1, startMinutes: 540, endMinutes: 660 }, { locationId: w.A.id, dayOfWeek: 1, startMinutes: 600, endMinutes: 720 }] }), "VALIDATION");
    let day = await trainers.getTrainerDay(w.p1.actor, w.trainer.id, w.A.id, DAY, NOW);
    expect(day.open).toBe(true);
    expect(day.slots[0].startMinutes).toBe(9 * 60);
    expect(day.slots.at(-1)!.startMinutes).toBe(12 * 60); // last 60-min start inside 09:00-13:00
    expect(day.slots.find((s) => s.startMinutes === 12 * 60)!.durations).toEqual([60]); // 90 would run past 13:00
    await lessons.bookLesson(w.p1.actor, req(w, 10 * 60), { now: NOW });
    await trainers.addTimeOff(w.coach.actor, w.trainer.id, { startLocal: `${DAY}T11:00`, endLocal: `${DAY}T12:00`, reason: "Dentist" });
    day = await trainers.getTrainerDay(w.p1.actor, w.trainer.id, w.A.id, DAY, NOW);
    expect(day.slots.filter((s) => s.available).map((s) => s.startMinutes)).toEqual([9 * 60, 12 * 60]);
    expect(day.slots.find((s) => s.startMinutes === 9 * 60)!.durations).toEqual([60]); // 90 would collide with the 10:00 lesson
    expect((await trainers.getTrainerDay(w.p1.actor, w.trainer.id, w.A.id, "2026-11-09", NOW)).slots.filter((s) => s.available).map((s) => s.startMinutes)).toEqual([12 * 60]); // today: 09-11 too soon (now 10:00 + 2h notice)
  });
});

describe("private lessons", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("books inside availability with the right price, confirms automatically and notifies both sides", async () => {
    const l = await lessons.bookLesson(w.p1.actor, req(w, 9 * 60, { durationMinutes: 90, focus: "Backhand volleys" }), { now: NOW });
    expect(l.status).toBe("CONFIRMED");
    expect(l.code).toMatch(/^LS-[A-Z2-9]{6}$/);
    expect(l.priceCents).toBe(135000);
    expect(l.payments[0].status).toBe("PENDING");
    expect(await db.notification.count({ where: { userId: w.coach.user.id, type: "lesson.booked" } })).toBe(1);
    await expectCode(lessons.bookLesson(w.p3.actor, req(w, 9 * 60 + 30), { now: NOW }), "SLOT_UNAVAILABLE"); // overlaps
    await expectCode(lessons.bookLesson(w.p1.actor, req(w, 14 * 60), { now: NOW }), "SLOT_UNAVAILABLE"); // outside availability
    await expectCode(lessons.bookLesson(w.p1.actor, req(w, 11 * 60, { durationMinutes: 45 }), { now: NOW }), "INVALID_DURATION");
    await expectCode(lessons.bookLesson(w.novice.actor, req(w, 11 * 60), { now: NOW }), "NOT_ELIGIBLE"); // trainer coaches B/C, no level
    await expectCode(lessons.bookLesson(w.p1.actor, req(w, 11 * 60, { locationId: w.B.id }), { now: NOW }), "VALIDATION"); // not at B
    await expectCode(lessons.bookLesson(w.p1.actor, req(w, 11 * 60, { dateISO: "2026-12-20" }), { now: NOW }), "SLOT_UNAVAILABLE"); // beyond 30 days
    await expectCode(lessons.bookLesson(null, req(w, 11 * 60)), "UNAUTHENTICATED");
  });

  it("never double-books a trainer under concurrent requests", async () => {
    const players = await Promise.all(Array.from({ length: 5 }, () => makeUser({ homeLocationId: w.A.id, level: "B" })));
    const results = await Promise.allSettled(players.map((p) => lessons.bookLesson(p.actor, req(w, 11 * 60), { now: NOW })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as { code: string }).code === "SLOT_UNAVAILABLE")).toHaveLength(4);
  });

  it("applies the cancellation policy, reschedules with the credit following, and keeps notes private", async () => {
    const l = await lessons.bookLesson(w.p1.actor, req(w, 10 * 60), { now: NOW });
    await expectCode(lessons.cancelLesson(w.p2.actor, l.id, {}, { now: NOW }), "FORBIDDEN");
    await expectCode(lessons.cancelLesson(w.p1.actor, l.id, {}, { now: new Date("2026-11-10T07:30:00Z") }), "CANCELLATION_NOT_ALLOWED"); // inside 12 h
    const moved = await lessons.rescheduleLesson(w.p1.actor, l.id, { dateISO: DAY, startMinutes: 12 * 60, durationMinutes: 60 }, { now: NOW });
    expect(moved.rescheduledFromId).toBe(l.id);
    expect((await lessons.getLesson(w.p1.actor, l.id)).status).toBe("CANCELLED");
    const staffCancel = await lessons.cancelLesson(w.receptionA.actor, moved.id, { reason: "Court flooded" }, { now: new Date("2026-11-10T09:30:00Z") });
    expect(staffCancel.status).toBe("CANCELLED");
    expect(staffCancel.payments[0].status).toBe("CANCELLED");
    expect(await db.notification.count({ where: { userId: w.p1.user.id, type: "lesson.cancelled" } })).toBe(1);

    // Attendance after the start, then a private note the player cannot read and a shared one they can.
    const l2 = await lessons.bookLesson(w.p1.actor, req(w, 9 * 60), { now: NOW });
    await expectCode(lessons.markLessonAttendance(w.coach.actor, l2.id, { status: "COMPLETED" }, { now: NOW }), "VALIDATION");
    const done = await lessons.markLessonAttendance(w.coach.actor, l2.id, { status: "COMPLETED" }, { now: new Date("2026-11-10T08:30:00Z") });
    expect(done.status).toBe("COMPLETED");
    expect(await db.trainingRecord.count({ where: { playerProfileId: w.p1.profileId, kind: "PRIVATE" } })).toBe(1);
    await lessons.addProgressNote(w.coach.actor, { playerId: w.p1.user.id, lessonId: l2.id, body: "Grip too tight on the bandeja.", visibility: "PRIVATE" });
    await lessons.addProgressNote(w.coach.actor, { playerId: w.p1.user.id, lessonId: l2.id, body: "Great session, keep the lob drills.", visibility: "SHARED" });
    await expectCode(lessons.addProgressNote(w.coach.actor, { playerId: w.p2.user.id, body: "never coached" }), "FORBIDDEN");
    expect((await lessons.getLesson(w.p1.actor, l2.id)).notes.map((n) => n.visibility)).toEqual(["SHARED"]);
    expect((await lessons.getLesson(w.coach.actor, l2.id)).notes).toHaveLength(2);
    expect((await lessons.listProgressNotes(w.p1.actor, w.p1.user.id)).map((n) => n.visibility)).toEqual(["SHARED"]);
    expect(await lessons.listProgressNotes(w.managerA.actor, w.p1.user.id)).toHaveLength(2);
    await expectCode(lessons.listProgressNotes(w.p2.actor, w.p1.user.id), "FORBIDDEN");
    await expectCode(lessons.getLesson(w.p2.actor, l2.id), "FORBIDDEN");
    const students = await lessons.listTrainerStudents(w.coach.actor, w.trainer.id);
    expect(students.map((s) => s.user.name)).toEqual(["Player One"]);
    expect(students[0].completed).toBe(1);
    await expectCode(lessons.listTrainerStudents(w.coach2.actor, w.trainer.id), "FORBIDDEN"); // another trainer sees nothing
    await expectCode(lessons.listTrainerLessons(w.coach2.actor, w.trainer.id, "upcoming", NOW), "FORBIDDEN");
  });

  it("trainers who do not auto-confirm receive requests and decide", async () => {
    await trainers.updateTrainerProfile(w.coach.actor, w.trainer.id, { autoConfirm: false });
    const l = await lessons.bookLesson(w.p1.actor, req(w, 10 * 60), { now: NOW });
    expect(l.status).toBe("REQUESTED");
    expect((await lessons.listTrainerLessons(w.coach.actor, w.trainer.id, "requests", NOW)).map((x) => x.id)).toEqual([l.id]);
    await expectCode(lessons.respondToLessonRequest(w.p1.actor, l.id, "ACCEPT"), "FORBIDDEN");
    expect((await lessons.respondToLessonRequest(w.coach.actor, l.id, "ACCEPT")).status).toBe("CONFIRMED");
    const l2 = await lessons.bookLesson(w.p3.actor, req(w, 12 * 60), { now: NOW });
    expect((await lessons.respondToLessonRequest(w.coach.actor, l2.id, "DECLINE")).status).toBe("CANCELLED");
    expect(await db.notification.count({ where: { userId: w.p3.user.id, type: "lesson.cancelled" } })).toBe(1);
    // Staff booking for a member is confirmed immediately.
    const staff = await lessons.bookLesson(w.receptionA.actor, req(w, 11 * 60, { playerId: w.p3.user.id }), { now: NOW });
    expect(staff.status).toBe("CONFIRMED");
  });
});

describe("packages and credits", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("sells packages, spends credits on lessons, refunds them on cancellation and expires", async () => {
    await expectCode(packages.createPackage(w.managerA.actor, { name: "10 lessons", credits: 10, priceCents: 800000 }), "FORBIDDEN"); // academy-wide needs a global role
    const five = await packages.createPackage(w.owner.actor, { name: "5 lessons", credits: 5, priceCents: 400000, validityDays: 60 });
    const local = await packages.createPackage(w.managerA.actor, { name: "Alpha starter", credits: 2, priceCents: 150000, locationId: w.A.id });
    expect((await packages.listPackages(w.p1.actor)).map((p) => p.name)).toEqual(["Alpha starter", "5 lessons"]);
    const bought = await packages.purchasePackage(w.p1.actor, { packageId: five.id }, { now: NOW });
    expect(bought.creditsLeft).toBe(5);
    expect(bought.payments[0].status).toBe("PENDING");
    expect(bought.expiresAt.toISOString().slice(0, 10)).toBe("2027-01-08");
    await expectCode(packages.purchasePackage(w.p1.actor, { name: "Custom", credits: 3, priceCents: 1 }), "FORBIDDEN"); // players cannot invent custom packages
    const custom = await packages.purchasePackage(w.receptionA.actor, { playerId: w.p3.user.id, name: "Custom 3", credits: 3, priceCents: 200000, validityDays: 30 }, { now: NOW });
    expect(custom.credits).toBe(3);
    await packages.recordAcademyPayment(w.receptionA.actor, { purchaseId: bought.id }, { method: "CARD" }, { now: NOW });
    expect((await packages.listMyPurchases(w.p1.actor, NOW))[0].payments[0].status).toBe("PAID");

    const l = await lessons.bookLesson(w.p1.actor, req(w, 10 * 60, { purchaseId: bought.id }), { now: NOW });
    expect(l.redemption?.purchaseId).toBe(bought.id);
    expect(l.payments).toHaveLength(0); // paid with a credit
    expect((await packages.listMyPurchases(w.p1.actor, NOW))[0].creditsLeft).toBe(4);
    const moved = await lessons.rescheduleLesson(w.p1.actor, l.id, { dateISO: DAY, startMinutes: 12 * 60, durationMinutes: 60 }, { now: NOW });
    expect(moved.redemption?.purchaseId).toBe(bought.id); // the credit follows
    expect((await packages.listMyPurchases(w.p1.actor, NOW))[0].creditsLeft).toBe(4);
    await lessons.cancelLesson(w.p1.actor, moved.id, {}, { now: NOW });
    expect((await packages.listMyPurchases(w.p1.actor, NOW))[0].creditsLeft).toBe(5); // refunded
    await expectCode(lessons.bookLesson(w.p3.actor, req(w, 10 * 60, { purchaseId: bought.id }), { now: NOW }), "NOT_FOUND"); // not their package
    await expectCode(lessons.bookLesson(w.p1.actor, req(w, 10 * 60, { purchaseId: bought.id, dateISO: "2026-11-10" }), { now: new Date("2027-01-09T08:00:00Z") }), "SLOT_UNAVAILABLE"); // past, but also expired
    expect((await packages.usablePurchases(w.p1.actor, w.p1.user.id, w.trainer.id, w.A.id, NOW)).map((p) => p.id)).toEqual([bought.id]);
    expect(await packages.expirePurchases(new Date("2027-01-09T08:00:00Z"))).toBe(2); // the 60-day and the 30-day custom one
    expect((await packages.listMyPurchases(w.p1.actor, new Date("2027-01-09T08:00:00Z")))[0].status).toBe("EXPIRED");
    void local;
  });
});

describe("training programs", () => {
  let w: World;
  const base = (w: World) => ({ name: "Intermediate Tuesdays", category: "INTERMEDIATE", levels: ["B"], trainerId: w.trainer.id, locationId: w.A.id, startsOn: "2026-11-10", endsOn: "2026-12-31", schedule: [{ dayOfWeek: 2, startMinutes: 9 * 60, durationMinutes: 90 }], sessionsCount: 6, capacity: 2, priceCents: 300000, allowWaitlist: true });
  beforeEach(async () => {
    w = await world();
  });

  it("creates dated sessions from the schedule and guards the trainer's club", async () => {
    await expectCode(programs.createProgram(w.receptionA.actor, base(w)), "FORBIDDEN");
    await expectCode(programs.createProgram(w.managerA.actor, { ...base(w), sessionsCount: 20 }), "VALIDATION"); // only 8 Tuesdays fit
    const p = await programs.createProgram(w.managerA.actor, base(w));
    expect(p.status).toBe("DRAFT");
    expect(p.sessions).toHaveLength(6);
    expect(p.sessions[0].startsAt.toISOString()).toBe("2026-11-10T07:00:00.000Z"); // 09:00 Cairo
    expect(p.sessions[1].startsAt.toISOString()).toBe("2026-11-17T07:00:00.000Z");
    expect(await programs.listPrograms(w.p1.actor, {}, NOW)).toHaveLength(0); // drafts are hidden
    await expectCode(programs.enroll(w.p1.actor, p.id, { now: NOW }), "INVALID_TRANSITION");
    const open = await programs.setProgramStatus(w.managerA.actor, p.id, "OPEN");
    expect(open.status).toBe("OPEN");
    expect((await programs.listPrograms(w.p1.actor, {}, NOW)).map((x) => x.id)).toEqual([p.id]);
    // The trainer's day shows the program session as busy.
    const day = await trainers.getTrainerDay(w.p1.actor, w.trainer.id, w.A.id, DAY, NOW);
    expect(day.slots.find((s) => s.startMinutes === 9 * 60)!.available).toBe(false);
  });

  it("enrolls with level and capacity rules, waitlists in order, promotes on withdrawal, and records attendance", async () => {
    const p = await programs.setProgramStatus(w.managerA.actor, (await programs.createProgram(w.managerA.actor, base(w))).id, "OPEN");
    await expectCode(programs.enroll(w.p2.actor, p.id, { now: NOW }), "NOT_ELIGIBLE"); // level C
    await expectCode(programs.enroll(w.novice.actor, p.id, { now: NOW }), "NOT_ELIGIBLE");
    const e1 = await programs.enroll(w.p1.actor, p.id, { now: NOW });
    expect(e1.status).toBe("ENROLLED");
    expect(e1.payments[0].amountCents).toBe(300000);
    await expectCode(programs.enroll(w.p1.actor, p.id, { now: NOW }), "CONFLICT");
    const e3 = await programs.enroll(w.managerA.actor, p.id, { playerId: w.p3.user.id, now: NOW });
    expect(e3.status).toBe("ENROLLED");
    expect((await programs.getProgram(w.p1.actor, p.id, NOW)).status).toBe("FULL");
    const late = await makeUser({ homeLocationId: w.A.id, level: "B", name: "Late Lucy" });
    const wl = await programs.enroll(late.actor, p.id, { now: NOW });
    expect(wl.status).toBe("WAITLISTED");
    expect(wl.position).toBe(1);
    expect(wl.payments).toHaveLength(0);
    // Player withdrawal respects the 72 h cutoff, then the waitlist moves up.
    await expectCode(programs.cancelEnrollment(w.p1.actor, e1.id, {}, { now: new Date("2026-11-09T20:00:00Z") }), "CANCELLATION_NOT_ALLOWED");
    await programs.cancelEnrollment(w.p1.actor, e1.id, {}, { now: new Date("2026-11-05T08:00:00Z") });
    const mine = await programs.listMyEnrollments(late.actor, NOW);
    expect(mine[0].status).toBe("ENROLLED");
    expect(await db.notification.count({ where: { userId: late.user.id, type: "program.enrolled" } })).toBe(1);
    expect((await programs.getProgram(w.p1.actor, p.id, NOW)).status).toBe("FULL");

    // Attendance by the trainer after session 1; present players get a training record once.
    const roster = await programs.listProgramEnrollments(w.coach.actor, p.id);
    expect(roster.filter((r) => r.status === "ENROLLED")).toHaveLength(2);
    await expectCode(programs.listProgramEnrollments(w.coach2.actor, p.id), "FORBIDDEN");
    const s1 = p.sessions[0];
    await expectCode(programs.markAttendance(w.coach.actor, s1.id, { marks: [{ enrollmentId: e3.id, status: "PRESENT" }] }, { now: NOW }), "VALIDATION");
    const after = new Date("2026-11-10T09:00:00Z");
    await programs.markAttendance(w.coach.actor, s1.id, { marks: [{ enrollmentId: e3.id, status: "PRESENT" }, { enrollmentId: mine[0].id, status: "ABSENT" }] }, { now: after });
    await programs.markAttendance(w.coach.actor, s1.id, { marks: [{ enrollmentId: e3.id, status: "LATE" }] }, { now: after });
    expect(await db.trainingRecord.count({ where: { playerProfileId: w.p3.profileId, kind: "PROGRAM" } })).toBe(1);
    expect(await db.trainingRecord.count({ where: { playerProfileId: late.profileId } })).toBe(0);
    expect((await programs.getProgram(w.p1.actor, p.id, after)).status).toBe("IN_PROGRESS");
    await expectCode(programs.markAttendance(w.p3.actor, s1.id, { marks: [{ enrollmentId: e3.id, status: "PRESENT" }] }, { now: after }), "FORBIDDEN");

    // Cancelling the program refunds and notifies everyone still in it.
    await programs.setProgramStatus(w.managerA.actor, p.id, "CANCELLED", "Coach unavailable");
    expect((await programs.listMyEnrollments(w.p3.actor, after))[0].status).toBe("CANCELLED");
    expect(await db.notification.count({ where: { type: "program.cancelled" } })).toBe(2);
  });

  it("completes programs after the last session and respects age limits", async () => {
    const junior = await programs.setProgramStatus(w.managerA.actor, (await programs.createProgram(w.managerA.actor, { ...base(w), name: "Juniors", category: "JUNIOR", levels: [], minAge: 8, maxAge: 14, sessionsCount: 2, endsOn: "2026-11-30" })).id, "OPEN");
    await expectCode(programs.enroll(w.p1.actor, junior.id, { now: NOW }), "NOT_ELIGIBLE"); // no date of birth
    await db.playerProfile.update({ where: { id: w.p1.profileId }, data: { dateOfBirth: new Date("1990-01-01") } });
    await expectCode(programs.enroll(w.p1.actor, junior.id, { now: NOW }), "NOT_ELIGIBLE"); // too old
    await db.playerProfile.update({ where: { id: w.novice.profileId }, data: { dateOfBirth: new Date("2016-05-01") } });
    expect((await programs.enroll(w.novice.actor, junior.id, { now: NOW })).status).toBe("ENROLLED");
    expect((await programs.getProgram(w.novice.actor, junior.id, new Date("2026-12-01T00:00:00Z"))).status).toBe("COMPLETED");
    expect((await programs.listMyEnrollments(w.novice.actor, new Date("2026-12-01T00:00:00Z")))[0].status).toBe("COMPLETED");
  });
});
