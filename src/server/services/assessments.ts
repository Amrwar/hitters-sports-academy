import type { AssessmentKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { assessmentSchema, fieldErrors, levelChangeSchema, requestAssessmentSchema, scheduleAssessmentSchema } from "@/lib/validation/schemas";
import { notify } from "./notifications";
import { suffix } from "@/lib/notifications";
import { getLevelMap } from "./levels";

/* ------------------------------------------------------------------ Selects */

export const assessmentSelect = {
  id: true,
  kind: true,
  level: true,
  previousLevel: true,
  notes: true,
  staffNotes: true,
  scores: true,
  assessedAt: true,
  locationId: true,
  location: { select: { id: true, name: true } },
  assessor: { select: { id: true, name: true } },
  playerProfile: { select: { id: true, user: { select: { id: true, name: true } } } },
  request: { select: { id: true } },
} satisfies Prisma.AssessmentSelect;

export type AssessmentView = Prisma.AssessmentGetPayload<{ select: typeof assessmentSelect }>;
/** What a player sees: staff-only notes removed. */
export type PlayerAssessmentView = Omit<AssessmentView, "staffNotes">;

export const requestSelect = {
  id: true,
  kind: true,
  status: true,
  note: true,
  scheduledAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  locationId: true,
  location: { select: { id: true, name: true, timezone: true } },
  assessor: { select: { id: true, name: true } },
  assessmentId: true,
  playerProfile: { select: { id: true, level: true, selfLevel: true, homeLocationId: true, user: { select: { id: true, name: true, email: true, phone: true } } } },
} satisfies Prisma.AssessmentRequestSelect;

export type AssessmentRequestView = Prisma.AssessmentRequestGetPayload<{ select: typeof requestSelect }>;

const OPEN = ["REQUESTED", "SCHEDULED"] as const;

function forPlayer(a: AssessmentView): PlayerAssessmentView {
  const { staffNotes: _hidden, ...rest } = a;
  void _hidden;
  return rest;
}

/* ------------------------------------------------------------------ Workflow: request */

/** Step 1: a player asks to be assessed (or re-assessed) at a location. One open request at a time. */
export async function requestAssessment(actor: Actor | null, input: unknown): Promise<AssessmentRequestView> {
  const a = await requirePermission(actor, "assessment.request.own");
  const parsed = requestAssessmentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const profile = await db.playerProfile.findUnique({ where: { userId: a.id }, select: { id: true, level: true } });
  if (!profile) throw notFound("Profile");
  const location = await db.location.findUnique({ where: { id: parsed.data.locationId }, select: { id: true, name: true, status: true } });
  if (!location || location.status !== "ACTIVE") throw validation("Choose an open HITTERS location.", { locationId: "Location is not open." });
  const open = await db.assessmentRequest.findFirst({ where: { playerProfileId: profile.id, status: { in: [...OPEN] } }, select: { id: true } });
  if (open) throw conflict("You already have an assessment request in progress.");
  return db.$transaction(async (tx) => {
    const r = await tx.assessmentRequest.create({ data: { playerProfileId: profile.id, locationId: location.id, kind: profile.level ? "REASSESSMENT" : "INITIAL", note: parsed.data.note }, select: requestSelect });
    await audit({ actorId: a.id, action: "assessment.requested", entityType: "AssessmentRequest", entityId: r.id, locationId: location.id, metadata: { kind: r.kind } }, tx);
    return r;
  });
}

/** The player withdraws, or staff at the location decline, an open request. */
export async function cancelAssessmentRequest(actor: Actor | null, requestId: string, input: { reason?: string } = {}): Promise<AssessmentRequestView> {
  const a = await requireActor(actor);
  const r = await db.assessmentRequest.findUnique({ where: { id: requestId }, select: requestSelect });
  if (!r) throw notFound("Assessment request");
  const own = r.playerProfile.user.id === a.id;
  if (!own && !(await can(a, "assessment.schedule", { locationId: r.locationId }))) throw forbidden();
  if (!OPEN.includes(r.status as (typeof OPEN)[number])) throw validation(`This request is already ${r.status.toLowerCase()}.`);
  const reason = input.reason?.trim().slice(0, 500) || undefined;
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.assessmentRequest.update({ where: { id: requestId }, data: { status: "CANCELLED", cancelReason: reason }, select: requestSelect });
    await audit({ actorId: a.id, action: "assessment.request_cancelled", entityType: "AssessmentRequest", entityId: requestId, locationId: r.locationId, metadata: { byStaff: !own, reason } }, tx);
    return u;
  });
  if (!own) await notify(r.playerProfile.user.id, { type: "assessment.cancelled", url: "/app/profile", data: { club: r.location.name, reasonSuffix: suffix(reason), requestId } });
  return updated;
}

/* ------------------------------------------------------------------ Workflow: schedule */

/** Step 2: staff with assessment.schedule at the location book a time and (optionally) an assessor. */
export async function scheduleAssessment(actor: Actor | null, requestId: string, input: unknown): Promise<AssessmentRequestView> {
  const r = await db.assessmentRequest.findUnique({ where: { id: requestId }, select: requestSelect });
  if (!r) throw notFound("Assessment request");
  const a = await requirePermission(actor, "assessment.schedule", { locationId: r.locationId });
  const parsed = scheduleAssessmentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  if (!OPEN.includes(r.status as (typeof OPEN)[number])) throw validation(`This request is already ${r.status.toLowerCase()}.`);
  const assessorId = parsed.data.assessorId ?? (await can(a, "assessment.create", { locationId: r.locationId }) ? a.id : undefined);
  if (assessorId) {
    const assessor = await db.user.findUnique({ where: { id: assessorId }, select: { id: true, status: true, globalRole: true, memberships: { where: { locationId: r.locationId, role: "ASSESSOR", status: "ACTIVE" }, select: { id: true } } } });
    if (!assessor || assessor.status !== "ACTIVE" || (!assessor.globalRole && assessor.memberships.length === 0)) throw validation("Choose an assessor assigned to this location.", { assessorId: "Not an assessor at this location." });
  }
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.assessmentRequest.update({ where: { id: requestId }, data: { status: "SCHEDULED", scheduledAt: parsed.data.scheduledAt, assessorId: assessorId ?? null }, select: requestSelect });
    await audit({ actorId: a.id, action: "assessment.scheduled", entityType: "AssessmentRequest", entityId: requestId, locationId: r.locationId, metadata: { scheduledAt: parsed.data.scheduledAt, assessorId } }, tx);
    return u;
  });
  await notify(r.playerProfile.user.id, {
    type: "assessment.scheduled",
    url: "/app/profile",
    data: {
      club: r.location.name,
      when: parsed.data.scheduledAt.toLocaleString("en-GB", { timeZone: r.location.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      assessorSuffix: updated.assessor ? ` with ${updated.assessor.name}` : "",
      requestId,
    },
  });
  return updated;
}

export async function listAssessmentRequests(actor: Actor | null, input: { locationId?: string; status?: "REQUESTED" | "SCHEDULED" | "COMPLETED" | "CANCELLED" | "OPEN" } = {}): Promise<AssessmentRequestView[]> {
  const a = await requirePermission(actor, "assessment.read", { locationId: input.locationId });
  const scope = await accessibleLocationIds(a, "assessment.read");
  const where: Prisma.AssessmentRequestWhereInput = {};
  if (input.locationId) where.locationId = input.locationId;
  else if (scope !== "all") where.locationId = { in: scope };
  if (input.status === "OPEN") where.status = { in: [...OPEN] };
  else if (input.status) where.status = input.status;
  return db.assessmentRequest.findMany({ where, select: requestSelect, orderBy: [{ status: "asc" }, { scheduledAt: "asc" }, { createdAt: "asc" }] });
}

/* ------------------------------------------------------------------ Workflow: record result */

/**
 * Steps 3-5: an assessor records the result, the official level is assigned and history is preserved.
 * Works with or without a request (walk-in assessments). Assessors act only at their own location.
 */
export async function createAssessment(actor: Actor | null, input: unknown): Promise<AssessmentView> {
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { playerProfileId, locationId, level, notes, staffNotes, scores, requestId, assessedAt } = parsed.data;
  const a = await requirePermission(actor, "assessment.create", { locationId });
  const [profile, location, request] = await Promise.all([
    db.playerProfile.findUnique({ where: { id: playerProfileId }, select: { id: true, level: true, userId: true } }),
    db.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } }),
    requestId ? db.assessmentRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, playerProfileId: true, locationId: true, kind: true } }) : null,
  ]);
  if (!profile) throw notFound("Player");
  if (!location) throw notFound("Location");
  if (profile.userId === a.id) throw validation("You cannot assess yourself.");
  if (requestId) {
    if (!request || request.playerProfileId !== playerProfileId) throw validation("That request does not belong to this player.", { requestId: "Mismatch." });
    if (!OPEN.includes(request.status as (typeof OPEN)[number])) throw validation(`That request is already ${request.status.toLowerCase()}.`);
  }
  const kind: AssessmentKind = parsed.data.kind ?? request?.kind ?? (profile.level ? "REASSESSMENT" : "INITIAL");
  const levels = await getLevelMap();

  const assessment = await db.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: { playerProfileId, locationId, level, kind, notes, staffNotes, scores, assessorId: a.id, previousLevel: profile.level, assessedAt: assessedAt ?? new Date() },
      select: assessmentSelect,
    });
    await tx.playerProfile.update({ where: { id: playerProfileId }, data: { level, levelUpdatedAt: created.assessedAt } });
    if (request) await tx.assessmentRequest.update({ where: { id: request.id }, data: { status: "COMPLETED", assessmentId: created.id, assessorId: a.id } });
    await audit({ actorId: a.id, action: "assessment.created", entityType: "Assessment", entityId: created.id, locationId, metadata: { playerProfileId, kind, from: profile.level, to: level, requestId: request?.id ?? null } }, tx);
    return created;
  });
  await notify(profile.userId, {
    type: "assessment.completed",
    url: "/app/profile",
    data: {
      level,
      label: levels[level].label,
      kind: kind === "REASSESSMENT" ? "Reassessed" : "Assessed",
      club: location.name,
      assessor: a.name,
      previousSuffix: suffix(profile.level && profile.level !== level ? `Previously ${profile.level}.` : ""),
      assessmentId: assessment.id,
    },
  });
  return assessment;
}

/** Staff correction of the official level without a formal assessment. Audited as a LEVEL_CHANGE. */
export async function recordLevelChange(actor: Actor | null, input: unknown): Promise<AssessmentView> {
  const parsed = levelChangeSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const a = await requireActor(actor);
  const profile = await db.playerProfile.findUnique({ where: { id: parsed.data.playerProfileId }, select: { id: true, level: true, userId: true, homeLocationId: true } });
  if (!profile) throw notFound("Player");
  if (a.globalRole) {
    if (!(await can(a, "level.override"))) throw forbidden();
  } else {
    if (!profile.homeLocationId) throw forbidden("Only academy owners can change the level of a player without a home club.");
    if (!(await can(a, "level.override", { locationId: profile.homeLocationId }))) throw forbidden();
  }
  if (profile.userId === a.id) throw validation("You cannot change your own level.");
  if (profile.level === parsed.data.level) throw validation(`The player is already level ${parsed.data.level}.`, { level: "No change." });
  const locationId = profile.homeLocationId ?? (await db.location.findFirst({ where: { status: "ACTIVE" }, select: { id: true } }))?.id;
  if (!locationId) throw validation("No location available to record the change against.");
  const levels = await getLevelMap();
  const created = await db.$transaction(async (tx) => {
    const row = await tx.assessment.create({
      data: { playerProfileId: profile.id, locationId, level: parsed.data.level, kind: "LEVEL_CHANGE", notes: parsed.data.reason, assessorId: a.id, previousLevel: profile.level },
      select: assessmentSelect,
    });
    await tx.playerProfile.update({ where: { id: profile.id }, data: { level: parsed.data.level, levelUpdatedAt: row.assessedAt } });
    await audit({ actorId: a.id, action: "assessment.level_changed", entityType: "Assessment", entityId: row.id, locationId, metadata: { playerProfileId: profile.id, from: profile.level, to: parsed.data.level, reason: parsed.data.reason } }, tx);
    return row;
  });
  await notify(profile.userId, { type: "assessment.level_changed", url: "/app/profile", data: { level: parsed.data.level, label: levels[parsed.data.level].label, reason: parsed.data.reason, assessmentId: created.id } });
  return created;
}

/* ------------------------------------------------------------------ Reads */

async function canReadPlayerAssessments(a: Actor, profile: { userId: string; homeLocationId: string | null }): Promise<"self" | "staff" | null> {
  if (profile.userId === a.id) return "self";
  const scope = await accessibleLocationIds(a, "assessment.read");
  if (scope === "all") return "staff";
  if (scope.length === 0) return null;
  if (profile.homeLocationId && scope.includes(profile.homeLocationId)) return "staff";
  const any = await db.assessment.count({ where: { playerProfileId: undefined, locationId: { in: scope }, playerProfile: { userId: profile.userId } } });
  return any > 0 ? "staff" : null;
}

/** Full history. Players see their own (without staff notes); staff see players in scope. */
export async function listPlayerAssessments(actor: Actor | null, playerProfileId: string): Promise<PlayerAssessmentView[] | AssessmentView[]> {
  const a = await requireActor(actor);
  const profile = await db.playerProfile.findUnique({ where: { id: playerProfileId }, select: { userId: true, homeLocationId: true } });
  if (!profile) throw notFound("Player");
  const mode = await canReadPlayerAssessments(a, profile);
  if (!mode) throw forbidden();
  const rows = await db.assessment.findMany({ where: { playerProfileId }, select: assessmentSelect, orderBy: { assessedAt: "desc" } });
  return mode === "self" ? rows.map(forPlayer) : rows;
}

export async function listLocationAssessments(actor: Actor | null, locationId: string, take = 50): Promise<AssessmentView[]> {
  await requirePermission(actor, "assessment.read", { locationId });
  return db.assessment.findMany({ where: { locationId }, select: assessmentSelect, orderBy: { assessedAt: "desc" }, take });
}

export type AssessmentOverview = {
  level: AssessmentView["level"] | null;
  levelUpdatedAt: Date | null;
  selfLevel: AssessmentView["level"] | null;
  status: "none" | "requested" | "scheduled" | "assessed";
  openRequest: AssessmentRequestView | null;
  latest: PlayerAssessmentView | null;
  count: number;
};

/** What the player (or staff) sees at the top of the assessment tab. */
export async function getAssessmentOverview(actor: Actor | null, playerProfileId: string): Promise<AssessmentOverview> {
  const a = await requireActor(actor);
  const profile = await db.playerProfile.findUnique({ where: { id: playerProfileId }, select: { userId: true, homeLocationId: true, level: true, levelUpdatedAt: true, selfLevel: true } });
  if (!profile) throw notFound("Player");
  if (!(await canReadPlayerAssessments(a, profile))) throw forbidden();
  const [openRequest, latest, count] = await Promise.all([
    db.assessmentRequest.findFirst({ where: { playerProfileId, status: { in: [...OPEN] } }, select: requestSelect, orderBy: { createdAt: "desc" } }),
    db.assessment.findFirst({ where: { playerProfileId }, select: assessmentSelect, orderBy: { assessedAt: "desc" } }),
    db.assessment.count({ where: { playerProfileId } }),
  ]);
  const status: AssessmentOverview["status"] = openRequest ? (openRequest.status === "SCHEDULED" ? "scheduled" : "requested") : profile.level ? "assessed" : "none";
  return { level: profile.level, levelUpdatedAt: profile.levelUpdatedAt, selfLevel: profile.selfLevel, status, openRequest, latest: latest ? forPlayer(latest) : null, count };
}
