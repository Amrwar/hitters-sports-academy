import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { assessmentSchema, fieldErrors } from "@/lib/validation/schemas";
import { notify } from "./notifications";

export const assessmentSelect = {
  id: true,
  level: true,
  previousLevel: true,
  notes: true,
  scores: true,
  assessedAt: true,
  locationId: true,
  location: { select: { id: true, name: true } },
  assessor: { select: { id: true, name: true } },
  playerProfile: { select: { id: true, user: { select: { id: true, name: true } } } },
} satisfies Prisma.AssessmentSelect;

export type AssessmentView = Prisma.AssessmentGetPayload<{ select: typeof assessmentSelect }>;

/** Records an A/B/C/D placement and updates the player's current level. Assessors act only at their own location. */
export async function createAssessment(actor: Actor | null, input: unknown): Promise<AssessmentView> {
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { playerProfileId, locationId, level, notes, scores } = parsed.data;
  const a = await requirePermission(actor, "assessment.create", { locationId });
  const [profile, location] = await Promise.all([
    db.playerProfile.findUnique({ where: { id: playerProfileId }, select: { id: true, level: true, userId: true } }),
    db.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } }),
  ]);
  if (!profile) throw notFound("Player");
  if (!location) throw notFound("Location");
  if (profile.userId === a.id) throw validation("You cannot assess yourself.");

  const assessment = await db.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: { playerProfileId, locationId, level, notes, scores, assessorId: a.id, previousLevel: profile.level },
      select: assessmentSelect,
    });
    await tx.playerProfile.update({ where: { id: playerProfileId }, data: { level, levelUpdatedAt: created.assessedAt } });
    await audit({ actorId: a.id, action: "assessment.created", entityType: "Assessment", entityId: created.id, locationId, metadata: { playerProfileId, from: profile.level, to: level } }, tx);
    return created;
  });
  await notify(profile.userId, { type: "assessment.completed", title: `You've been placed at Level ${level}`, body: `Assessed at ${location.name} by ${a.name}.`, data: { assessmentId: assessment.id, level } });
  return assessment;
}

/** A player's assessment history: the player themself, or staff with assessment.read at the assessment's location. */
export async function listPlayerAssessments(actor: Actor | null, playerProfileId: string): Promise<AssessmentView[]> {
  const a = await requireActor(actor);
  const profile = await db.playerProfile.findUnique({ where: { id: playerProfileId }, select: { userId: true } });
  if (!profile) throw notFound("Player");
  if (profile.userId === a.id) return db.assessment.findMany({ where: { playerProfileId }, select: assessmentSelect, orderBy: { assessedAt: "desc" } });
  const scope = await accessibleLocationIds(a, "assessment.read");
  if (scope !== "all" && scope.length === 0) throw forbidden();
  return db.assessment.findMany({ where: { playerProfileId, ...(scope === "all" ? {} : { locationId: { in: scope } }) }, select: assessmentSelect, orderBy: { assessedAt: "desc" } });
}

export async function listLocationAssessments(actor: Actor | null, locationId: string, take = 50): Promise<AssessmentView[]> {
  await requirePermission(actor, "assessment.read", { locationId });
  return db.assessment.findMany({ where: { locationId }, select: assessmentSelect, orderBy: { assessedAt: "desc" }, take });
}
