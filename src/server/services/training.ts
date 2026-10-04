import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notFound, validation } from "@/lib/errors";
import { requirePermission, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, trainingRecordSchema } from "@/lib/validation/schemas";
import { notify } from "./notifications";
import { suffix } from "@/lib/notifications";

export const trainingSelect = {
  id: true,
  kind: true,
  title: true,
  heldAt: true,
  durationMinutes: true,
  notes: true,
  createdAt: true,
  location: { select: { id: true, name: true } },
  trainer: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  playerProfile: { select: { id: true, user: { select: { id: true, name: true } } } },
} satisfies Prisma.TrainingRecordSelect;

export type TrainingView = Prisma.TrainingRecordGetPayload<{ select: typeof trainingSelect }>;

/** Trainers and managers record training a player attended at their location. */
export async function recordTraining(actor: Actor | null, input: unknown): Promise<TrainingView> {
  const parsed = trainingRecordSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const a = await requirePermission(actor, "training.record", { locationId: parsed.data.locationId });
  const profile = await db.playerProfile.findUnique({ where: { id: parsed.data.playerProfileId }, select: { id: true, userId: true } });
  if (!profile) throw notFound("Player");
  const trainerId = parsed.data.trainerId ?? a.id;
  const record = await db.$transaction(async (tx) => {
    const r = await tx.trainingRecord.create({ data: { ...parsed.data, trainerId, createdById: a.id }, select: trainingSelect });
    await audit({ actorId: a.id, action: "training.recorded", entityType: "TrainingRecord", entityId: r.id, locationId: parsed.data.locationId, metadata: { playerProfileId: profile.id, kind: r.kind, title: r.title } }, tx);
    return r;
  });
  await notify(profile.userId, { type: "training.recorded", url: "/app/profile", data: { title: record.title, club: record.location?.name ?? "", coachSuffix: suffix(record.trainer ? `with ${record.trainer.name}` : ""), trainingId: record.id } });
  return record;
}

export async function listLocationTraining(actor: Actor | null, locationId: string, take = 50): Promise<TrainingView[]> {
  await requirePermission(actor, "training.read", { locationId });
  return db.trainingRecord.findMany({ where: { locationId }, select: trainingSelect, orderBy: { heldAt: "desc" }, take });
}
