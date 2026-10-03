import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { accessibleLocationIds, can, type Actor } from "@/lib/auth/authorize";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/auth/permissions";
import * as locations from "@/server/services/locations";
import * as courts from "@/server/services/courts";
import * as staff from "@/server/services/staff";
import * as users from "@/server/services/users";
import * as profiles from "@/server/services/profiles";
import * as assessments from "@/server/services/assessments";
import * as notifications from "@/server/services/notifications";
import { buildActor } from "@/server/services/sessions";
import { expectCode, makeCourt, makeLocation, makeUser } from "./helpers";

type World = Awaited<ReturnType<typeof world>>;

/** Two locations (A, B) and one user per role, staff scoped to A. */
async function world() {
  const A = await makeLocation("alpha");
  const B = await makeLocation("beta");
  const courtA = await makeCourt(A.id, "A1");
  const courtB = await makeCourt(B.id, "B1");
  const superAdmin = await makeUser({ globalRole: "SUPER_ADMIN", name: "Super" });
  const owner = await makeUser({ globalRole: "ACADEMY_OWNER", name: "Owner" });
  const managerA = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }], name: "Manager A" });
  const receptionA = await makeUser({ staff: [{ locationId: A.id, role: "RECEPTIONIST" }], name: "Reception A" });
  const trainerA = await makeUser({ staff: [{ locationId: A.id, role: "TRAINER" }], name: "Trainer A" });
  const assessorA = await makeUser({ staff: [{ locationId: A.id, role: "ASSESSOR" }], name: "Assessor A" });
  const financeA = await makeUser({ staff: [{ locationId: A.id, role: "FINANCE_MANAGER" }], name: "Finance A" });
  const playerA = await makeUser({ homeLocationId: A.id, name: "Player A", level: "C" });
  const playerB = await makeUser({ homeLocationId: B.id, name: "Player B" });
  const playerNoHome = await makeUser({ name: "Nomad" });
  return { A, B, courtA, courtB, superAdmin, owner, managerA, receptionA, trainerA, assessorA, financeA, playerA, playerB, playerNoHome };
}

describe("permission matrix", () => {
  it("is seeded into RolePermission and matches the code matrix", async () => {
    const rows = await db.rolePermission.findMany();
    const expected = Object.values(DEFAULT_ROLE_PERMISSIONS).reduce((n, p) => n + p.length, 0);
    expect(rows.length).toBe(expected);
    for (const r of rows) expect(PERMISSIONS).toContain(r.permission);
  });

  it("denies everything to anonymous and suspended actors", async () => {
    const { user } = await makeUser({ globalRole: "SUPER_ADMIN", status: "SUSPENDED" });
    const suspended = { id: user.id, email: user.email, name: user.name, status: "SUSPENDED", globalRole: "SUPER_ADMIN", emailVerifiedAt: null, playerProfileId: null, memberships: [] } satisfies Actor;
    for (const p of PERMISSIONS) {
      expect(await can(null, p)).toBe(false);
      expect(await can(suspended, p)).toBe(false);
    }
  });

  it("scopes location roles to their location", async () => {
    const w = await world();
    expect(await can(w.managerA.actor, "court.manage", { locationId: w.A.id })).toBe(true);
    expect(await can(w.managerA.actor, "court.manage", { locationId: w.B.id })).toBe(false);
    expect(await can(w.owner.actor, "court.manage", { locationId: w.B.id })).toBe(true);
    expect(await accessibleLocationIds(w.managerA.actor, "court.manage")).toEqual([w.A.id]);
    expect(await accessibleLocationIds(w.owner.actor, "court.manage")).toBe("all");
    expect(await accessibleLocationIds(w.playerA.actor, "court.manage")).toEqual([]);
  });

  it("never grants global permissions through a location role", async () => {
    const w = await world();
    expect(await can(w.managerA.actor, "location.create")).toBe(false);
    expect(await can(w.managerA.actor, "roles.manage", { locationId: w.A.id })).toBe(false);
    expect(await can(w.owner.actor, "location.create")).toBe(true);
    expect(await can(w.owner.actor, "roles.manage")).toBe(false);
    expect(await can(w.superAdmin.actor, "roles.manage")).toBe(true);
  });
});

describe("locations", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("only global roles create locations", async () => {
    const input = { slug: "gamma", name: "HITTERS Gamma", city: "Cairo", area: "Gamma Park", address: "Somewhere 1" };
    await expectCode(locations.createLocation(null, input), "UNAUTHENTICATED");
    await expectCode(locations.createLocation(w.managerA.actor, input), "FORBIDDEN");
    await expectCode(locations.createLocation(w.playerA.actor, input), "FORBIDDEN");
    const loc = await locations.createLocation(w.owner.actor, input);
    expect(loc.slug).toBe("gamma");
    await expectCode(locations.createLocation(w.superAdmin.actor, input), "CONFLICT");
  });

  it("managers update only their own location and cannot deactivate it", async () => {
    const updated = await locations.updateLocation(w.managerA.actor, w.A.id, { name: "Alpha Renamed" });
    expect(updated.name).toBe("Alpha Renamed");
    await expectCode(locations.updateLocation(w.managerA.actor, w.B.id, { name: "Hacked" }), "FORBIDDEN");
    await expectCode(locations.updateLocation(w.managerA.actor, w.A.id, { status: "INACTIVE" }), "FORBIDDEN");
    await expectCode(locations.updateLocation(w.managerA.actor, w.A.id, { status: "COMING_SOON" }), "FORBIDDEN");
    await expectCode(locations.updateLocation(w.receptionA.actor, w.A.id, { name: "Nope" }), "FORBIDDEN");
    await expectCode(locations.updateLocation(w.playerA.actor, w.A.id, { name: "Nope" }), "FORBIDDEN");
    const off = await locations.updateLocation(w.owner.actor, w.A.id, { status: "INACTIVE" });
    expect(off.status).toBe("INACTIVE");
  });

  it("lists managed locations by scope", async () => {
    expect((await locations.listManagedLocations(w.owner.actor)).map((l) => l.slug).sort()).toEqual(["alpha", "beta"]);
    expect((await locations.listManagedLocations(w.managerA.actor)).map((l) => l.slug)).toEqual(["alpha"]);
    expect((await locations.listManagedLocations(w.financeA.actor)).map((l) => l.slug)).toEqual(["alpha"]);
    expect(await locations.listManagedLocations(w.playerA.actor)).toEqual([]);
    await expectCode(locations.listManagedLocations(null), "UNAUTHENTICATED");
  });

  it("hides inactive locations from players but not from their manager", async () => {
    await locations.updateLocation(w.owner.actor, w.B.id, { status: "INACTIVE" });
    await expectCode(locations.getLocation(w.playerA.actor, "beta"), "FORBIDDEN");
    await expectCode(locations.getLocation(w.managerA.actor, "beta"), "FORBIDDEN");
    expect((await locations.getLocation(w.owner.actor, "beta")).slug).toBe("beta");
    expect((await locations.listPublicLocations()).map((l) => l.slug)).toEqual(["alpha"]);
  });
});

describe("courts and availability", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("enforces court.manage per location", async () => {
    const created = await courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "A2", type: "OUTDOOR" });
    expect(created.locationId).toBe(w.A.id);
    await expectCode(courts.createCourt(w.managerA.actor, { locationId: w.B.id, name: "B2", type: "OUTDOOR" }), "FORBIDDEN");
    await expectCode(courts.createCourt(w.managerA.actor, { locationId: w.A.id, name: "A2", type: "OUTDOOR" }), "CONFLICT");
    await expectCode(courts.createCourt(w.receptionA.actor, { locationId: w.A.id, name: "A3", type: "OUTDOOR" }), "FORBIDDEN");
    await expectCode(courts.createCourt(w.trainerA.actor, { locationId: w.A.id, name: "A3", type: "OUTDOOR" }), "FORBIDDEN");
    await expectCode(courts.createCourt(w.financeA.actor, { locationId: w.A.id, name: "A3", type: "OUTDOOR" }), "FORBIDDEN");
    await expectCode(courts.updateCourt(w.managerA.actor, w.courtB.id, { status: "MAINTENANCE" }), "FORBIDDEN");
    const m = await courts.updateCourt(w.managerA.actor, w.courtA.id, { status: "MAINTENANCE" });
    expect(m.status).toBe("MAINTENANCE");
    await expectCode(courts.updateCourt(w.playerA.actor, w.courtA.id, { status: "ACTIVE" }), "FORBIDDEN");
  });

  it("validates availability windows", async () => {
    const good = [
      { dayOfWeek: 1, opensAt: 420, closesAt: 1440, slotMinutes: 60, priceCents: 45000 },
      { dayOfWeek: 2, opensAt: 420, closesAt: 1440, slotMinutes: 90, priceCents: 45000 },
    ];
    const court = await courts.setCourtAvailability(w.managerA.actor, w.courtA.id, good);
    expect(court.availability).toHaveLength(2);
    await expectCode(courts.setCourtAvailability(w.managerA.actor, w.courtA.id, [{ dayOfWeek: 1, opensAt: 600, closesAt: 500, priceCents: 1 }]), "VALIDATION");
    await expectCode(courts.setCourtAvailability(w.managerA.actor, w.courtA.id, [{ dayOfWeek: 1, opensAt: 420, closesAt: 720, priceCents: 1 }, { dayOfWeek: 1, opensAt: 700, closesAt: 900, priceCents: 1 }]), "VALIDATION");
    await expectCode(courts.setCourtAvailability(w.managerA.actor, w.courtB.id, good), "FORBIDDEN");
    await expectCode(courts.setCourtAvailability(w.receptionA.actor, w.courtA.id, good), "FORBIDDEN");
    // Replacing is atomic: the earlier template survives a failed update.
    expect((await courts.listCourts(w.managerA.actor, w.A.id))[0].availability).toHaveLength(2);
  });

  it("players see active and maintenance courts only; staff see inactive too", async () => {
    await courts.updateCourt(w.managerA.actor, w.courtA.id, { status: "INACTIVE" });
    expect(await courts.listCourts(w.playerA.actor, w.A.id)).toHaveLength(0);
    expect(await courts.listCourts(w.managerA.actor, w.A.id)).toHaveLength(1);
    await expectCode(courts.listCourts(null, w.A.id), "UNAUTHENTICATED");
  });
});

describe("staff memberships", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("managers grant non-manager roles at their own location only", async () => {
    const m = await staff.grantStaffRole(w.managerA.actor, { userId: w.playerA.user.id, locationId: w.A.id, role: "RECEPTIONIST" });
    expect(m.role).toBe("RECEPTIONIST");
    await expectCode(staff.grantStaffRole(w.managerA.actor, { userId: w.playerA.user.id, locationId: w.B.id, role: "RECEPTIONIST" }), "FORBIDDEN");
    await expectCode(staff.grantStaffRole(w.managerA.actor, { userId: w.playerA.user.id, locationId: w.A.id, role: "LOCATION_MANAGER" }), "FORBIDDEN");
    await expectCode(staff.grantStaffRole(w.receptionA.actor, { userId: w.playerA.user.id, locationId: w.A.id, role: "TRAINER" }), "FORBIDDEN");
    await expectCode(staff.grantStaffRole(w.playerA.actor, { userId: w.playerA.user.id, locationId: w.A.id, role: "TRAINER" }), "FORBIDDEN");
    const mgr = await staff.grantStaffRole(w.owner.actor, { userId: w.playerB.user.id, locationId: w.B.id, role: "LOCATION_MANAGER" });
    expect(mgr.role).toBe("LOCATION_MANAGER");
    const notif = await db.notification.findFirst({ where: { userId: w.playerA.user.id, type: "staff.granted" } });
    expect(notif).not.toBeNull();
  });

  it("lists staff within scope and revokes with the same rules", async () => {
    expect((await staff.listStaff(w.managerA.actor)).every((m) => m.locationId === w.A.id)).toBe(true);
    await expectCode(staff.listStaff(w.managerA.actor, w.B.id), "FORBIDDEN");
    expect((await staff.listStaff(w.owner.actor)).length).toBe(5);
    await expectCode(staff.listStaff(w.playerA.actor), "FORBIDDEN");

    const receptionMembership = (await staff.listStaff(w.managerA.actor)).find((m) => m.role === "RECEPTIONIST")!;
    const managerMembership = (await staff.listStaff(w.owner.actor)).find((m) => m.role === "LOCATION_MANAGER")!;
    await expectCode(staff.revokeStaffRole(w.managerA.actor, managerMembership.id), "FORBIDDEN"); // managers never touch manager roles
    await expectCode(staff.revokeStaffRole(w.receptionA.actor, receptionMembership.id), "FORBIDDEN");
    await staff.revokeStaffRole(w.managerA.actor, receptionMembership.id);
    expect((await staff.listStaff(w.managerA.actor)).some((m) => m.role === "RECEPTIONIST")).toBe(false);
    await staff.revokeStaffRole(w.owner.actor, managerMembership.id);
    const fresh = await buildActor(w.managerA.user.id);
    expect(await can(fresh, "court.manage", { locationId: w.A.id })).toBe(false);
  });
});

describe("users and global roles", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("scopes user lists to the staff member's locations", async () => {
    const all = await users.listUsers(w.owner.actor);
    expect(all.total).toBe(10);
    const mine = await users.listUsers(w.managerA.actor);
    const names = mine.items.map((u) => u.name).sort();
    expect(names).toContain("Player A");
    expect(names).not.toContain("Player B");
    expect(names).not.toContain("Nomad");
    await expectCode(users.listUsers(w.playerA.actor), "FORBIDDEN");
    await expectCode(users.getUser(w.managerA.actor, w.playerB.user.id), "FORBIDDEN");
    expect((await users.getUser(w.receptionA.actor, w.playerA.user.id)).name).toBe("Player A");
  });

  it("only super admins change global roles; owners and managers cannot", async () => {
    await expectCode(users.setGlobalRole(w.owner.actor, w.playerA.user.id, "ACADEMY_OWNER"), "FORBIDDEN");
    await expectCode(users.setGlobalRole(w.managerA.actor, w.playerA.user.id, "ACADEMY_OWNER"), "FORBIDDEN");
    await users.setGlobalRole(w.superAdmin.actor, w.playerA.user.id, "ACADEMY_OWNER");
    expect((await db.user.findUniqueOrThrow({ where: { id: w.playerA.user.id } })).globalRole).toBe("ACADEMY_OWNER");
    await expectCode(users.setGlobalRole(w.superAdmin.actor, w.superAdmin.user.id, null), "VALIDATION");
  });

  it("suspension is global-only, protects admins, and kills sessions", async () => {
    const { issueSession, resolveSession } = await import("@/server/services/sessions");
    const { token } = await issueSession(w.playerA.user.id);
    await expectCode(users.setUserStatus(w.managerA.actor, w.playerA.user.id, "SUSPENDED"), "FORBIDDEN");
    await expectCode(users.setUserStatus(w.owner.actor, w.superAdmin.user.id, "SUSPENDED"), "FORBIDDEN");
    await users.setUserStatus(w.owner.actor, w.playerA.user.id, "SUSPENDED");
    expect(await resolveSession(token)).toBeNull();
    await expectCode(users.setUserStatus(w.owner.actor, w.owner.user.id, "SUSPENDED"), "VALIDATION");
  });

  it("audit logs are readable within scope", async () => {
    await courts.updateCourt(w.managerA.actor, w.courtA.id, { status: "MAINTENANCE" });
    await courts.updateCourt(w.owner.actor, w.courtB.id, { status: "MAINTENANCE" });
    const mine = await users.listAuditLogs(w.managerA.actor);
    expect(mine.items.every((l) => l.locationId === w.A.id)).toBe(true);
    await expectCode(users.listAuditLogs(w.managerA.actor, { locationId: w.B.id }), "FORBIDDEN");
    await expectCode(users.listAuditLogs(w.receptionA.actor), "FORBIDDEN");
    expect((await users.listAuditLogs(w.financeA.actor)).items.length).toBeGreaterThan(0);
    expect((await users.listAuditLogs(w.superAdmin.actor)).total).toBeGreaterThanOrEqual(2);
  });
});

describe("player profiles", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("players edit only their own profile", async () => {
    const mine = await profiles.updateProfile(w.playerA.actor, w.playerA.profileId, { bio: "Net rusher", side: "LEFT", phone: "01099999999" });
    expect(mine.bio).toBe("Net rusher");
    expect(mine.user.phone).toBe("+201099999999");
    await expectCode(profiles.updateProfile(w.playerA.actor, w.playerB.profileId, { bio: "Hacked" }), "FORBIDDEN");
    await expectCode(profiles.updateProfile(null, w.playerA.profileId, { bio: "Anon" }), "UNAUTHENTICATED");
    await expectCode(profiles.updateProfile(w.playerA.actor, w.playerA.profileId, { bio: "x".repeat(501) }), "VALIDATION");
    await expectCode(profiles.updateProfile(w.playerA.actor, w.playerA.profileId, { homeLocationId: "clzzzzzzzzzzzzzzzzzzzzzzz" }), "VALIDATION");
  });

  it("staff edit players at their own location only; nobody but global admins edits homeless players", async () => {
    expect((await profiles.updateProfile(w.managerA.actor, w.playerA.profileId, { bio: "Manager note" })).bio).toBe("Manager note");
    await expectCode(profiles.updateProfile(w.managerA.actor, w.playerB.profileId, { bio: "Nope" }), "FORBIDDEN");
    await expectCode(profiles.updateProfile(w.managerA.actor, w.playerNoHome.profileId, { bio: "Nope" }), "FORBIDDEN");
    await expectCode(profiles.updateProfile(w.receptionA.actor, w.playerA.profileId, { bio: "Nope" }), "FORBIDDEN");
    await expectCode(profiles.updateProfile(w.trainerA.actor, w.playerA.profileId, { bio: "Nope" }), "FORBIDDEN");
    expect((await profiles.updateProfile(w.owner.actor, w.playerNoHome.profileId, { bio: "Owner note" })).bio).toBe("Owner note");
    const log = await db.auditLog.findFirst({ where: { action: "profile.updated", entityId: w.playerA.profileId, actorId: w.managerA.user.id } });
    expect(log).not.toBeNull();
  });

  it("respects visibility when players read each other", async () => {
    expect((await profiles.getProfile(w.playerB.actor, w.playerA.profileId)).id).toBe(w.playerA.profileId);
    await profiles.updateProfile(w.playerA.actor, w.playerA.profileId, { visibility: "PRIVATE" });
    await expectCode(profiles.getProfile(w.playerB.actor, w.playerA.profileId), "FORBIDDEN");
    expect((await profiles.getProfile(w.receptionA.actor, w.playerA.profileId)).id).toBe(w.playerA.profileId); // staff at home location
    expect((await profiles.getProfile(w.receptionA.actor, w.playerB.profileId)).id).toBe(w.playerB.profileId); // MEMBERS visibility: any signed-in user
  });
});

describe("assessments", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("assessors place players at their own location and the level updates", async () => {
    const a = await assessments.createAssessment(w.assessorA.actor, { playerProfileId: w.playerA.profileId, locationId: w.A.id, level: "B", notes: "Solid", scores: { serve: 7 } });
    expect(a.level).toBe("B");
    expect(a.previousLevel).toBe("C");
    const profile = await db.playerProfile.findUniqueOrThrow({ where: { id: w.playerA.profileId } });
    expect(profile.level).toBe("B");
    const notif = await db.notification.findFirst({ where: { userId: w.playerA.user.id, type: "assessment.completed" } });
    expect(notif?.title).toContain("B");
    await expectCode(assessments.createAssessment(w.assessorA.actor, { playerProfileId: w.playerB.profileId, locationId: w.B.id, level: "A" }), "FORBIDDEN");
    await expectCode(assessments.createAssessment(w.trainerA.actor, { playerProfileId: w.playerA.profileId, locationId: w.A.id, level: "A" }), "FORBIDDEN");
    await expectCode(assessments.createAssessment(w.managerA.actor, { playerProfileId: w.playerA.profileId, locationId: w.A.id, level: "A" }), "FORBIDDEN");
    await expectCode(assessments.createAssessment(w.playerA.actor, { playerProfileId: w.playerB.profileId, locationId: w.A.id, level: "A" }), "FORBIDDEN");
    await expectCode(assessments.createAssessment(w.assessorA.actor, { playerProfileId: w.assessorA.profileId, locationId: w.A.id, level: "A" }), "VALIDATION");
    await expectCode(assessments.createAssessment(w.assessorA.actor, { playerProfileId: w.playerA.profileId, locationId: w.A.id, level: "E" }), "VALIDATION");
    expect((await assessments.createAssessment(w.owner.actor, { playerProfileId: w.playerB.profileId, locationId: w.B.id, level: "D" })).level).toBe("D");
  });

  it("history is visible to the player and to staff of the assessment location", async () => {
    await assessments.createAssessment(w.assessorA.actor, { playerProfileId: w.playerA.profileId, locationId: w.A.id, level: "B" });
    expect(await assessments.listPlayerAssessments(w.playerA.actor, w.playerA.profileId)).toHaveLength(1);
    expect(await assessments.listPlayerAssessments(w.trainerA.actor, w.playerA.profileId)).toHaveLength(1);
    await expectCode(assessments.listPlayerAssessments(w.playerB.actor, w.playerA.profileId), "FORBIDDEN");
    expect(await assessments.listLocationAssessments(w.receptionA.actor, w.A.id)).toHaveLength(1);
    await expectCode(assessments.listLocationAssessments(w.receptionA.actor, w.B.id), "FORBIDDEN");
  });
});

describe("notifications", () => {
  it("are private to their owner and staff can only message players at their location", async () => {
    const w = await world();
    const n = await notifications.notify(w.playerA.user.id, { type: "test", title: "Hi", body: "There" });
    expect((await notifications.listMyNotifications(w.playerA.actor)).unread).toBe(1);
    await expectCode(notifications.markNotificationRead(w.playerB.actor, n.id), "NOT_FOUND");
    await notifications.markNotificationRead(w.playerA.actor, n.id);
    expect((await notifications.listMyNotifications(w.playerA.actor)).unread).toBe(0);
    await notifications.sendNotification(w.receptionA.actor, w.playerA.user.id, w.A.id, { type: "desk", title: "Your racket is ready", body: "Pick it up at reception." });
    await expectCode(notifications.sendNotification(w.receptionA.actor, w.playerB.user.id, w.B.id, { type: "desk", title: "x", body: "y" }), "FORBIDDEN");
    await expectCode(notifications.sendNotification(w.trainerA.actor, w.playerA.user.id, w.A.id, { type: "desk", title: "x", body: "y" }), "FORBIDDEN");
    await expectCode(notifications.listMyNotifications(null), "UNAUTHENTICATED");
  });
});
