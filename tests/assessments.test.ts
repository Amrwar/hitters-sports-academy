import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as assessments from "@/server/services/assessments";
import * as levels from "@/server/services/levels";
import * as profiles from "@/server/services/profiles";
import * as training from "@/server/services/training";
import { expectCode, makeLocation, makeUser } from "./helpers";

async function world() {
  const A = await makeLocation("alpha");
  const B = await makeLocation("beta");
  const owner = await makeUser({ globalRole: "ACADEMY_OWNER", name: "Owner" });
  const managerA = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }], name: "Manager A" });
  const receptionA = await makeUser({ staff: [{ locationId: A.id, role: "RECEPTIONIST" }], name: "Reception A" });
  const assessorA = await makeUser({ staff: [{ locationId: A.id, role: "ASSESSOR" }], name: "Assessor A" });
  const assessorB = await makeUser({ staff: [{ locationId: B.id, role: "ASSESSOR" }], name: "Assessor B" });
  const trainerA = await makeUser({ staff: [{ locationId: A.id, role: "TRAINER" }], name: "Trainer A" });
  const player = await makeUser({ homeLocationId: A.id, name: "Player" });
  const other = await makeUser({ homeLocationId: B.id, name: "Other" });
  const nomad = await makeUser({ name: "Nomad" });
  return { A, B, owner, managerA, receptionA, assessorA, assessorB, trainerA, player, other, nomad };
}
type World = Awaited<ReturnType<typeof world>>;

describe("level definitions", () => {
  it("are seeded with defaults and only global roles can reconfigure them", async () => {
    const w = await world();
    const defs = await levels.getLevelDefinitions(true);
    expect(defs.map((d) => `${d.level}:${d.rank}`)).toEqual(["A:1", "B:2", "C:3", "D:4"]);
    const flipped = [
      { level: "D", rank: 1, label: "Elite", description: "Top of the ladder in this academy." },
      { level: "C", rank: 2, label: "Advanced", description: "Strong club players." },
      { level: "B", rank: 3, label: "Intermediate", description: "Developing players." },
      { level: "A", rank: 4, label: "Starter", description: "Just getting started." },
    ];
    await expectCode(levels.updateLevelDefinitions(w.managerA.actor, flipped), "FORBIDDEN");
    await expectCode(levels.updateLevelDefinitions(w.player.actor, flipped), "FORBIDDEN");
    const updated = await levels.updateLevelDefinitions(w.owner.actor, flipped);
    expect(updated.map((d) => `${d.level}:${d.rank}:${d.label}`)).toEqual(["D:1:Elite", "C:2:Advanced", "B:3:Intermediate", "A:4:Starter"]);
    await expectCode(levels.updateLevelDefinitions(w.owner.actor, flipped.map((d) => ({ ...d, rank: 1 }))), "VALIDATION");
    await expectCode(levels.updateLevelDefinitions(w.owner.actor, flipped.slice(0, 3)), "VALIDATION");
    expect(await db.auditLog.count({ where: { action: "levels.configured" } })).toBe(1);
  });
});

describe("assessment workflow", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("runs request -> schedule -> record -> level assigned -> history, with notifications and audit", async () => {
    const profileId = w.player.profileId;
    const req = await assessments.requestAssessment(w.player.actor, { locationId: w.A.id, note: "Played tennis for years" });
    expect(req.status).toBe("REQUESTED");
    expect(req.kind).toBe("INITIAL");
    await expectCode(assessments.requestAssessment(w.player.actor, { locationId: w.A.id }), "CONFLICT");
    expect((await assessments.getAssessmentOverview(w.player.actor, profileId)).status).toBe("requested");

    // Scheduling: receptionist can at A; assessor at B cannot; player cannot.
    const when = new Date(Date.now() + 2 * 86_400_000);
    await expectCode(assessments.scheduleAssessment(w.player.actor, req.id, { scheduledAt: when }), "FORBIDDEN");
    await expectCode(assessments.scheduleAssessment(w.assessorB.actor, req.id, { scheduledAt: when }), "FORBIDDEN");
    await expectCode(assessments.scheduleAssessment(w.receptionA.actor, req.id, { scheduledAt: when, assessorId: w.trainerA.user.id }), "VALIDATION");
    const scheduled = await assessments.scheduleAssessment(w.receptionA.actor, req.id, { scheduledAt: when, assessorId: w.assessorA.user.id });
    expect(scheduled.status).toBe("SCHEDULED");
    expect(scheduled.assessor?.id).toBe(w.assessorA.user.id);
    expect((await assessments.getAssessmentOverview(w.player.actor, profileId)).status).toBe("scheduled");
    expect(await db.notification.count({ where: { userId: w.player.user.id, type: "assessment.scheduled" } })).toBe(1);

    // Recording: assessor at A completes the request; player and trainer cannot.
    await expectCode(assessments.createAssessment(w.player.actor, { playerProfileId: profileId, locationId: w.A.id, level: "A", requestId: req.id }), "FORBIDDEN");
    await expectCode(assessments.createAssessment(w.trainerA.actor, { playerProfileId: profileId, locationId: w.A.id, level: "A", requestId: req.id }), "FORBIDDEN");
    await expectCode(assessments.createAssessment(w.assessorB.actor, { playerProfileId: profileId, locationId: w.A.id, level: "A", requestId: req.id }), "FORBIDDEN");
    const result = await assessments.createAssessment(w.assessorA.actor, { playerProfileId: profileId, locationId: w.A.id, level: "C", notes: "Solid basics", staffNotes: "Watch the backhand", scores: { serve: 6 }, requestId: req.id });
    expect(result.kind).toBe("INITIAL");
    expect(result.previousLevel).toBeNull();
    expect(result.assessor.id).toBe(w.assessorA.user.id);

    const overview = await assessments.getAssessmentOverview(w.player.actor, profileId);
    expect(overview.level).toBe("C");
    expect(overview.status).toBe("assessed");
    expect(overview.openRequest).toBeNull();
    const done = await db.assessmentRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(done.status).toBe("COMPLETED");
    expect(done.assessmentId).toBe(result.id);
    await expectCode(assessments.createAssessment(w.assessorA.actor, { playerProfileId: profileId, locationId: w.A.id, level: "B", requestId: req.id }), "VALIDATION");

    // History: player sees it without staff notes, staff see staff notes.
    const mine = await assessments.listPlayerAssessments(w.player.actor, profileId);
    expect(mine).toHaveLength(1);
    expect("staffNotes" in mine[0]).toBe(false);
    const staffView = (await assessments.listPlayerAssessments(w.managerA.actor, profileId)) as assessments.AssessmentView[];
    expect(staffView[0].staffNotes).toBe("Watch the backhand");
    await expectCode(assessments.listPlayerAssessments(w.other.actor, profileId), "FORBIDDEN");
    await expectCode(assessments.listPlayerAssessments(w.assessorB.actor, profileId), "FORBIDDEN");
    expect(await db.auditLog.count({ where: { action: { in: ["assessment.requested", "assessment.scheduled", "assessment.created"] } } })).toBe(3);
    expect(await db.notification.count({ where: { userId: w.player.user.id, type: "assessment.completed" } })).toBe(1);
  });

  it("supports reassessment and keeps every previous result", async () => {
    const profileId = w.player.profileId;
    await assessments.createAssessment(w.assessorA.actor, { playerProfileId: profileId, locationId: w.A.id, level: "D" });
    const req = await assessments.requestAssessment(w.player.actor, { locationId: w.A.id });
    expect(req.kind).toBe("REASSESSMENT");
    const second = await assessments.createAssessment(w.assessorA.actor, { playerProfileId: profileId, locationId: w.A.id, level: "B", requestId: req.id });
    expect(second.kind).toBe("REASSESSMENT");
    expect(second.previousLevel).toBe("D");
    const history = await assessments.listPlayerAssessments(w.player.actor, profileId);
    expect(history.map((h) => h.level)).toEqual(["B", "D"]);
    expect((await profiles.getMyProfile(w.player.actor)).level).toBe("B");
  });

  it("lets players withdraw and staff decline requests", async () => {
    const req = await assessments.requestAssessment(w.player.actor, { locationId: w.A.id });
    await expectCode(assessments.cancelAssessmentRequest(w.other.actor, req.id), "FORBIDDEN");
    await expectCode(assessments.cancelAssessmentRequest(w.assessorB.actor, req.id), "FORBIDDEN");
    const declined = await assessments.cancelAssessmentRequest(w.receptionA.actor, req.id, { reason: "No assessor this week" });
    expect(declined.status).toBe("CANCELLED");
    expect(await db.notification.count({ where: { userId: w.player.user.id, type: "assessment.cancelled" } })).toBe(1);
    await expectCode(assessments.cancelAssessmentRequest(w.player.actor, req.id), "VALIDATION");
    const again = await assessments.requestAssessment(w.player.actor, { locationId: w.A.id });
    expect((await assessments.cancelAssessmentRequest(w.player.actor, again.id)).status).toBe("CANCELLED");
    await db.location.update({ where: { id: w.B.id }, data: { status: "INACTIVE" } });
    await expectCode(assessments.requestAssessment(w.player.actor, { locationId: w.B.id }), "VALIDATION"); // inactive location
  });

  it("lists requests within location scope", async () => {
    await assessments.requestAssessment(w.player.actor, { locationId: w.A.id });
    await assessments.requestAssessment(w.other.actor, { locationId: w.B.id });
    expect((await assessments.listAssessmentRequests(w.owner.actor, { status: "OPEN" })).length).toBe(2);
    expect((await assessments.listAssessmentRequests(w.assessorA.actor, { status: "OPEN" })).map((r) => r.locationId)).toEqual([w.A.id]);
    await expectCode(assessments.listAssessmentRequests(w.assessorA.actor, { locationId: w.B.id }), "FORBIDDEN");
    await expectCode(assessments.listAssessmentRequests(w.player.actor), "FORBIDDEN");
  });
});

describe("official level protection", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("players cannot set their official level through the profile, only the self-reported one", async () => {
    const p = await profiles.updateProfile(w.player.actor, w.player.profileId, { level: "A", selfLevel: "B", playStyle: "Net rusher", yearsPlaying: 3, matchType: "COMPETITIVE", preferredTimes: ["weekday_evening", "weekend_morning"], preferredLocationIds: [w.A.id, w.B.id], photoUrl: "https://cdn.example.com/me.jpg" });
    expect(p.level).toBeNull();
    expect(p.selfLevel).toBe("B");
    expect(p.preferredLocations.map((l) => l.slug).sort()).toEqual(["alpha", "beta"]);
    expect(p.preferredTimes).toEqual(["weekday_evening", "weekend_morning"]);
    await expectCode(profiles.updateProfile(w.player.actor, w.player.profileId, { preferredTimes: ["midnight"] }), "VALIDATION");
    await expectCode(profiles.updateProfile(w.player.actor, w.player.profileId, { photoUrl: "javascript:alert(1)" }), "VALIDATION");
    await expectCode(profiles.updateProfile(w.player.actor, w.player.profileId, { preferredLocationIds: ["clzzzzzzzzzzzzzzzzzzzzzzz"] }), "VALIDATION");
    const cleared = await profiles.updateProfile(w.player.actor, w.player.profileId, { preferredLocationIds: [], photoUrl: "" });
    expect(cleared.preferredLocations).toEqual([]);
    expect(cleared.photoUrl).toBeNull();
  });

  it("staff level changes are scoped, audited and never self-applied", async () => {
    await assessments.createAssessment(w.assessorA.actor, { playerProfileId: w.player.profileId, locationId: w.A.id, level: "C" });
    await expectCode(assessments.recordLevelChange(w.player.actor, { playerProfileId: w.player.profileId, level: "A", reason: "I am great" }), "FORBIDDEN");
    await expectCode(assessments.recordLevelChange(w.assessorA.actor, { playerProfileId: w.player.profileId, level: "A", reason: "Observed in league" }), "FORBIDDEN");
    await expectCode(assessments.recordLevelChange(w.receptionA.actor, { playerProfileId: w.player.profileId, level: "A", reason: "Observed in league" }), "FORBIDDEN");
    await expectCode(assessments.recordLevelChange(w.managerA.actor, { playerProfileId: w.other.profileId, level: "A", reason: "Observed in league" }), "FORBIDDEN"); // other location
    await expectCode(assessments.recordLevelChange(w.managerA.actor, { playerProfileId: w.nomad.profileId, level: "A", reason: "Observed in league" }), "FORBIDDEN"); // no home club
    await expectCode(assessments.recordLevelChange(w.managerA.actor, { playerProfileId: w.player.profileId, level: "C", reason: "Observed in league" }), "VALIDATION"); // no change
    await expectCode(assessments.recordLevelChange(w.managerA.actor, { playerProfileId: w.player.profileId, level: "B", reason: "x" }), "VALIDATION"); // reason too short
    const change = await assessments.recordLevelChange(w.managerA.actor, { playerProfileId: w.player.profileId, level: "B", reason: "Dominated the B ladder for a month" });
    expect(change.kind).toBe("LEVEL_CHANGE");
    expect(change.previousLevel).toBe("C");
    expect((await profiles.getMyProfile(w.player.actor)).level).toBe("B");
    expect((await assessments.recordLevelChange(w.owner.actor, { playerProfileId: w.nomad.profileId, level: "D", reason: "Owner placement after trial" })).level).toBe("D");
    expect(await db.auditLog.count({ where: { action: "assessment.level_changed" } })).toBe(2);
    expect((await assessments.listPlayerAssessments(w.player.actor, w.player.profileId)).map((h) => h.kind)).toEqual(["LEVEL_CHANGE", "INITIAL"]);
  });
});

describe("history and training", () => {
  it("records training with the right permissions and exposes history to self and scoped staff", async () => {
    const w = await world();
    const when = new Date("2026-10-01T16:00:00Z");
    const rec = await training.recordTraining(w.trainerA.actor, { playerProfileId: w.player.profileId, locationId: w.A.id, kind: "PRIVATE", title: "Volley clinic", heldAt: when, durationMinutes: 60, notes: "Improved" });
    expect(rec.trainer?.id).toBe(w.trainerA.user.id);
    await expectCode(training.recordTraining(w.trainerA.actor, { playerProfileId: w.player.profileId, locationId: w.B.id, title: "Nope", heldAt: when }), "FORBIDDEN");
    await expectCode(training.recordTraining(w.receptionA.actor, { playerProfileId: w.player.profileId, locationId: w.A.id, title: "Nope", heldAt: when }), "FORBIDDEN");
    await expectCode(training.recordTraining(w.player.actor, { playerProfileId: w.player.profileId, locationId: w.A.id, title: "Nope", heldAt: when }), "FORBIDDEN");
    const mine = await profiles.getPlayerHistory(w.player.actor, w.player.profileId);
    expect(mine.training.map((t) => t.title)).toEqual(["Volley clinic"]);
    expect((await profiles.getPlayerHistory(w.managerA.actor, w.player.profileId)).training).toHaveLength(1);
    await expectCode(profiles.getPlayerHistory(w.other.actor, w.player.profileId), "FORBIDDEN");
    await expectCode(profiles.getPlayerHistory(w.assessorB.actor, w.player.profileId), "FORBIDDEN");
    expect((await training.listLocationTraining(w.managerA.actor, w.A.id)).length).toBe(1);
    await expectCode(training.listLocationTraining(w.assessorB.actor, w.A.id), "FORBIDDEN");
    expect(await db.notification.count({ where: { userId: w.player.user.id, type: "training.recorded" } })).toBe(1);
  });
});
