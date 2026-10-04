import type { LessonStatus, Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { formatInZone, zonedToUtc } from "@/lib/time";
import { fieldErrors, lessonAttendanceSchema, lessonCancelSchema, lessonRequestSchema, progressNoteSchema } from "@/lib/validation/schemas";
import { notify, notifyMany } from "./notifications";
import { suffix } from "@/lib/notifications";
import { getTrainerDay, LESSON_CANCEL_CUTOFF_HOURS, LESSON_WINDOW_DAYS, trainerSelect, type TrainerView } from "./trainers";

/* ------------------------------------------------------------------ Select */

export const lessonSelect = {
  id: true,
  code: true,
  trainerId: true,
  playerId: true,
  locationId: true,
  courtId: true,
  startsAt: true,
  endsAt: true,
  durationMinutes: true,
  status: true,
  priceCents: true,
  currency: true,
  focus: true,
  cancelledAt: true,
  cancellationReason: true,
  rescheduledFromId: true,
  createdAt: true,
  trainer: { select: { id: true, userId: true, title: true, photoUrl: true, autoConfirm: true, user: { select: { id: true, name: true } } } },
  player: { select: { id: true, name: true, email: true, playerProfile: { select: { id: true, level: true, side: true, photoUrl: true } } } },
  location: { select: { id: true, slug: true, name: true, timezone: true, address: true } },
  court: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
  payments: { select: { id: true, amountCents: true, currency: true, status: true, method: true, paidAt: true }, orderBy: { createdAt: "desc" as const } },
  redemption: { select: { id: true, purchaseId: true, credits: true, refundedAt: true, purchase: { select: { code: true, name: true } } } },
  rescheduledTo: { select: { id: true, code: true } },
  notes: { select: { id: true, body: true, visibility: true, createdAt: true, trainerId: true }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.LessonSelect;

export type LessonView = Prisma.LessonGetPayload<{ select: typeof lessonSelect }>;

const ACTIVE: LessonStatus[] = ["REQUESTED", "CONFIRMED"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => `LS-${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;

function isOverlapError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("Lesson_trainer_no_overlap") || msg.includes("23P01") || msg.includes("exclusion constraint");
}

async function loadLesson(id: string, tx: Prisma.TransactionClient | typeof db = db): Promise<LessonView> {
  const l = await tx.lesson.findFirst({ where: { OR: [{ id }, { code: id }] }, select: lessonSelect });
  if (!l) throw notFound("Lesson");
  return l;
}

/** Who may see a lesson: the player, the trainer, staff who read lessons at the club. Notes are filtered later. */
async function canReadLesson(a: Actor, l: LessonView): Promise<"player" | "trainer" | "staff"> {
  if (l.playerId === a.id) return "player";
  if (l.trainer.userId === a.id) return "trainer";
  if (await can(a, "lesson.read", { locationId: l.locationId })) return "staff";
  throw forbidden();
}

/** Players only ever see SHARED notes; the trainer and staff see everything. */
function scopeNotes(l: LessonView, role: "player" | "trainer" | "staff"): LessonView {
  return role === "player" ? { ...l, notes: l.notes.filter((n) => n.visibility === "SHARED") } : l;
}

export async function getLesson(actor: Actor | null, id: string): Promise<LessonView> {
  const a = await requireActor(actor);
  const l = await loadLesson(id);
  return scopeNotes(l, await canReadLesson(a, l));
}

/* ------------------------------------------------------------------ Book */

/**
 * Books a private lesson inside the trainer's published availability. Players book for themselves; staff with
 * lesson.manage book for a member. Credits from an active package may pay for it; otherwise a PENDING payment
 * is created (pay at venue). The trainer row is locked and the exclusion constraint rejects any overlap.
 */
export async function bookLesson(actor: Actor | null, input: unknown, opts: { now?: Date } = {}): Promise<LessonView> {
  const a = await requireActor(actor);
  const parsed = lessonRequestSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { trainerId, locationId, dateISO, startMinutes, durationMinutes, focus, purchaseId } = parsed.data;
  const now = opts.now ?? new Date();
  const playerId = parsed.data.playerId ?? a.id;
  const onBehalf = playerId !== a.id;
  if (onBehalf) await requirePermission(a, "lesson.manage", { locationId });
  else await requirePermission(a, "lesson.book.own");

  const trainer = await db.trainerProfile.findFirst({ where: { OR: [{ id: trainerId }, { userId: trainerId }] }, select: trainerSelect });
  if (!trainer || trainer.status !== "ACTIVE") throw notFound("Trainer");
  if (trainer.userId === playerId) throw validation("A trainer cannot book a lesson with themself.");
  const loc = trainer.locations.find((l) => l.location.id === locationId)?.location;
  if (!loc) throw validation("This trainer does not coach at that club.", { locationId: "Not available here" });
  if (!trainer.durationsMinutes.includes(durationMinutes)) throw new AppError("INVALID_DURATION", `Choose ${trainer.durationsMinutes.join(", ")} minutes.`, { durationMinutes: "Not offered" });

  const player = await db.user.findUnique({ where: { id: playerId }, select: { id: true, name: true, status: true, playerProfile: { select: { level: true, homeLocationId: true } } } });
  if (!player || player.status !== "ACTIVE") throw notFound("Player");
  const level = player.playerProfile?.level ?? null;
  if (trainer.levels.length && (!level || !trainer.levels.includes(level))) {
    throw new AppError("NOT_ELIGIBLE", level ? `${trainer.user.name} coaches levels ${trainer.levels.join(", ")} only.` : `${trainer.user.name} coaches assessed players (levels ${trainer.levels.join(", ")}). Request an assessment first.`);
  }

  const day = await getTrainerDay(a, trainer.id, locationId, dateISO, now);
  const slot = day.slots.find((s) => s.startMinutes === startMinutes);
  if (!slot || !slot.available || !slot.durations.includes(durationMinutes)) throw new AppError("SLOT_UNAVAILABLE", "That time is not available with this trainer.");
  if (slot.startsAt.getTime() > now.getTime() + LESSON_WINDOW_DAYS * 86_400_000) throw new AppError("SLOT_UNAVAILABLE", `Lessons can be booked up to ${LESSON_WINDOW_DAYS} days ahead.`);
  const startsAt = slot.startsAt;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const priceCents = Math.round((trainer.hourlyRateCents * durationMinutes) / 60);

  try {
    const lesson = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "TrainerProfile" WHERE "id" = ${trainer.id} FOR UPDATE`;
        const clash = await tx.lesson.findFirst({ where: { trainerId: trainer.id, status: { in: ACTIVE }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
        if (clash) throw new AppError("SLOT_UNAVAILABLE", "That time was just taken.");
        let c = code();
        for (let i = 0; i < 5 && (await tx.lesson.findUnique({ where: { code: c }, select: { id: true } })); i++) c = code();

        // Package credit: validate and reserve inside the same transaction.
        let purchase: { id: string; name: string } | null = null;
        if (purchaseId) {
          const p = await tx.packagePurchase.findUnique({ where: { id: purchaseId } });
          if (!p || p.playerId !== playerId) throw notFound("Package");
          if (p.status !== "ACTIVE") throw new AppError("NO_CREDITS", `That package is ${p.status.toLowerCase()}.`);
          if (p.expiresAt < startsAt) throw new AppError("NO_CREDITS", "That package expires before the lesson.");
          if (p.creditsUsed >= p.credits) throw new AppError("NO_CREDITS", "No credits left on that package.");
          if (p.trainerId && p.trainerId !== trainer.id) throw new AppError("NO_CREDITS", "That package is for a different trainer.");
          if (p.locationId && p.locationId !== locationId) throw new AppError("NO_CREDITS", "That package is for a different club.");
          const used = p.creditsUsed + 1;
          await tx.packagePurchase.update({ where: { id: p.id }, data: { creditsUsed: used, status: used >= p.credits ? "EXHAUSTED" : "ACTIVE" } });
          purchase = { id: p.id, name: p.name };
        }

        const created = await tx.lesson.create({
          data: {
            code: c,
            trainerId: trainer.id,
            playerId,
            locationId,
            startsAt,
            endsAt,
            durationMinutes,
            status: trainer.autoConfirm || onBehalf ? "CONFIRMED" : "REQUESTED",
            priceCents,
            focus,
            createdById: a.id,
            ...(purchase ? { redemption: { create: { purchaseId: purchase.id, credits: 1 } } } : { payments: { create: { amountCents: priceCents, status: "PENDING", method: "NONE" } } }),
          },
          select: lessonSelect,
        });
        await audit({ actorId: a.id, action: "lesson.booked", entityType: "Lesson", entityId: created.id, locationId, metadata: { code: c, trainerId: trainer.id, playerId, startsAt, durationMinutes, priceCents, credit: !!purchase, onBehalf, status: created.status } }, tx);
        return created;
      },
      { isolationLevel: "ReadCommitted" },
    );
    const pending = lesson.status === "REQUESTED";
    const shared = { when: formatInZone(startsAt, loc.timezone), club: loc.name, duration: durationMinutes, code: lesson.code, lessonId: lesson.id };
    await Promise.all([
      notify(trainer.userId, {
        type: "lesson.booked",
        url: `/admin/coaching`,
        data: { ...shared, headline: pending ? `${player.name} requested a lesson` : `New lesson with ${player.name}`, pendingSuffix: suffix(pending ? "Confirm or decline it from your calendar." : "") },
      }),
      playerId !== a.id || pending
        ? notify(playerId, {
            type: "lesson.booked",
            url: `/app/lessons/${lesson.id}`,
            data: { ...shared, headline: pending ? `Lesson requested with ${trainer.user.name}` : `Lesson booked with ${trainer.user.name}`, pendingSuffix: suffix(pending ? "Waiting for the coach to confirm." : "") },
          })
        : Promise.resolve(),
    ]);
    return lesson;
  } catch (e) {
    if (isOverlapError(e)) throw new AppError("SLOT_UNAVAILABLE", "That time was just taken.");
    throw e;
  }
}

/* ------------------------------------------------------------------ Lifecycle */

async function assertCanChange(a: Actor, l: LessonView, now: Date): Promise<{ by: "player" | "trainer" | "staff" }> {
  const staff = await can(a, "lesson.manage", { locationId: l.locationId });
  const by = l.playerId === a.id && !staff ? "player" : l.trainer.userId === a.id && !staff ? "trainer" : staff ? "staff" : null;
  if (!by) throw forbidden();
  if (!ACTIVE.includes(l.status)) throw new AppError("CANCELLATION_NOT_ALLOWED", `This lesson is already ${l.status.toLowerCase().replace("_", "-")}.`);
  if (l.startsAt <= now) throw new AppError("CANCELLATION_NOT_ALLOWED", "The lesson has already started.");
  if (by === "player" && l.startsAt.getTime() - now.getTime() < LESSON_CANCEL_CUTOFF_HOURS * 3_600_000) {
    throw new AppError("CANCELLATION_NOT_ALLOWED", `Lessons can be changed up to ${LESSON_CANCEL_CUTOFF_HOURS} hours before they start. Contact the club.`);
  }
  return { by };
}

/** Returns the credit to the package (if any) and settles payments. Runs inside the caller's transaction. */
async function releaseLesson(tx: Prisma.TransactionClient, l: LessonView, now: Date, keepCredit = false) {
  if (l.redemption && !l.redemption.refundedAt && !keepCredit) {
    await tx.packageRedemption.update({ where: { id: l.redemption.id }, data: { refundedAt: now } });
    const p = await tx.packagePurchase.findUniqueOrThrow({ where: { id: l.redemption.purchaseId } });
    await tx.packagePurchase.update({ where: { id: p.id }, data: { creditsUsed: Math.max(0, p.creditsUsed - l.redemption.credits), status: p.status === "EXHAUSTED" && p.expiresAt > now ? "ACTIVE" : p.status } });
  }
  await tx.payment.updateMany({ where: { lessonId: l.id, status: "PAID" }, data: { status: "REFUNDED", refundedAt: now } });
  await tx.payment.updateMany({ where: { lessonId: l.id, status: "PENDING" }, data: { status: "CANCELLED" } });
}

export async function cancelLesson(actor: Actor | null, lessonId: string, input: unknown = {}, opts: { now?: Date } = {}): Promise<LessonView> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();
  const parsed = lessonCancelSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const l = await loadLesson(lessonId);
  const { by } = await assertCanChange(a, l, now);
  const updated = await db.$transaction(async (tx) => {
    await tx.lesson.update({ where: { id: l.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: a.id, cancellationReason: parsed.data.reason } });
    await releaseLesson(tx, l, now);
    await audit({ actorId: a.id, action: "lesson.cancelled", entityType: "Lesson", entityId: l.id, locationId: l.locationId, metadata: { by, reason: parsed.data.reason } }, tx);
    return loadLesson(l.id, tx);
  });
  const when = formatInZone(l.startsAt, l.location.timezone);
  const others = [l.playerId, l.trainer.userId].filter((id) => id !== a.id);
  await notifyMany(others, { type: "lesson.cancelled", url: `/app/lessons/${l.id}`, groupKey: l.id, data: { code: l.code, when, club: l.location.name, reasonSuffix: suffix(parsed.data.reason), lessonId: l.id } });
  return updated;
}

/** Moves a lesson to a new slot: the old one is cancelled and a linked new one created; a package credit follows. */
export async function rescheduleLesson(actor: Actor | null, lessonId: string, input: unknown, opts: { now?: Date } = {}): Promise<LessonView> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();
  const old = await loadLesson(lessonId);
  const { by } = await assertCanChange(a, old, now);
  const parsed = lessonRequestSchema.pick({ dateISO: true, startMinutes: true, durationMinutes: true }).safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const trainer = await db.trainerProfile.findUniqueOrThrow({ where: { id: old.trainerId }, select: trainerSelect });
  if (!trainer.durationsMinutes.includes(parsed.data.durationMinutes)) throw new AppError("INVALID_DURATION", `Choose ${trainer.durationsMinutes.join(", ")} minutes.`);
  const day = await getTrainerDay(a, trainer.id, old.locationId, parsed.data.dateISO, now);
  const slot = day.slots.find((s) => s.startMinutes === parsed.data.startMinutes);
  // The old lesson still occupies its slot; moving within it is fine.
  const oldFree = slot && slot.startsAt < old.endsAt && new Date(slot.startsAt.getTime() + parsed.data.durationMinutes * 60_000) > old.startsAt;
  if (!slot || (!slot.available && !oldFree)) throw new AppError("SLOT_UNAVAILABLE", "That time is not available with this trainer.");
  const startsAt = slot.startsAt;
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60_000);
  const priceCents = Math.round((trainer.hourlyRateCents * parsed.data.durationMinutes) / 60);
  try {
    const created = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "TrainerProfile" WHERE "id" = ${trainer.id} FOR UPDATE`;
        await tx.lesson.update({ where: { id: old.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: a.id, cancellationReason: "Rescheduled" } });
        const clash = await tx.lesson.findFirst({ where: { trainerId: trainer.id, status: { in: ACTIVE }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
        if (clash) throw new AppError("SLOT_UNAVAILABLE", "That time was just taken.");
        let c = code();
        for (let i = 0; i < 5 && (await tx.lesson.findUnique({ where: { code: c }, select: { id: true } })); i++) c = code();
        const paid = old.payments.find((p) => p.status === "PAID");
        const b = await tx.lesson.create({
          data: { code: c, trainerId: trainer.id, playerId: old.playerId, locationId: old.locationId, startsAt, endsAt, durationMinutes: parsed.data.durationMinutes, status: old.status === "REQUESTED" ? "REQUESTED" : "CONFIRMED", priceCents, focus: old.focus, createdById: a.id, rescheduledFromId: old.id, ...(old.redemption || paid ? {} : { payments: { create: { amountCents: priceCents, status: "PENDING", method: "NONE" } } }) },
          select: lessonSelect,
        });
        if (old.redemption && !old.redemption.refundedAt) await tx.packageRedemption.update({ where: { id: old.redemption.id }, data: { lessonId: b.id } });
        if (paid) await tx.payment.update({ where: { id: paid.id }, data: { lessonId: b.id } });
        await tx.payment.updateMany({ where: { lessonId: old.id, status: "PENDING" }, data: { status: "CANCELLED" } });
        await audit({ actorId: a.id, action: "lesson.rescheduled", entityType: "Lesson", entityId: b.id, locationId: old.locationId, metadata: { from: old.id, by, startsAt } }, tx);
        return loadLesson(b.id, tx);
      },
      { isolationLevel: "ReadCommitted" },
    );
    const others = [old.playerId, old.trainer.userId].filter((id) => id !== a.id);
    await notifyMany(others, { type: "lesson.rescheduled", url: `/app/lessons/${created.id}`, groupKey: created.id, data: { code: created.code, when: formatInZone(created.startsAt, created.location.timezone), club: created.location.name, lessonId: created.id } });
    return created;
  } catch (e) {
    if (isOverlapError(e)) throw new AppError("SLOT_UNAVAILABLE", "That time was just taken.");
    throw e;
  }
}

/** Trainers who do not auto-confirm accept or decline requested lessons. */
export async function respondToLessonRequest(actor: Actor | null, lessonId: string, response: "ACCEPT" | "DECLINE", opts: { now?: Date } = {}): Promise<LessonView> {
  const a = await requireActor(actor);
  const l = await loadLesson(lessonId);
  const self = l.trainer.userId === a.id && (await can(a, "trainer.self"));
  if (!self && !(await can(a, "lesson.manage", { locationId: l.locationId }))) throw forbidden();
  if (l.status !== "REQUESTED") throw new AppError("INVALID_TRANSITION", `This lesson is ${l.status.toLowerCase()}.`);
  const now = opts.now ?? new Date();
  const updated = await db.$transaction(async (tx) => {
    if (response === "ACCEPT") await tx.lesson.update({ where: { id: l.id }, data: { status: "CONFIRMED" } });
    else {
      await tx.lesson.update({ where: { id: l.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: a.id, cancellationReason: "Declined by the coach" } });
      await releaseLesson(tx, l, now);
    }
    await audit({ actorId: a.id, action: response === "ACCEPT" ? "lesson.confirmed" : "lesson.declined", entityType: "Lesson", entityId: l.id, locationId: l.locationId }, tx);
    return loadLesson(l.id, tx);
  });
  await notify(l.playerId, {
    type: response === "ACCEPT" ? "lesson.confirmed" : "lesson.declined",
    url: `/app/lessons/${l.id}`,
    data: { coach: l.trainer.user.name, when: formatInZone(l.startsAt, l.location.timezone), club: l.location.name, code: l.code, lessonId: l.id },
  });
  return updated;
}

/** After the start time the trainer (or staff) records the outcome; a completed lesson joins the player's training history. */
export async function markLessonAttendance(actor: Actor | null, lessonId: string, input: unknown, opts: { now?: Date } = {}): Promise<LessonView> {
  const a = await requireActor(actor);
  const parsed = lessonAttendanceSchema.safeParse(input);
  if (!parsed.success) throw validation("Choose completed or no-show.");
  const l = await loadLesson(lessonId);
  const self = l.trainer.userId === a.id && (await can(a, "trainer.self"));
  if (!self && !(await can(a, "lesson.manage", { locationId: l.locationId }))) throw forbidden();
  const now = opts.now ?? new Date();
  if (!["CONFIRMED", "COMPLETED", "NO_SHOW"].includes(l.status)) throw validation(`A ${l.status.toLowerCase()} lesson cannot be marked.`);
  if (l.startsAt > now) throw validation("Attendance can only be recorded once the lesson has started.");
  return db.$transaction(async (tx) => {
    await tx.lesson.update({ where: { id: l.id }, data: { status: parsed.data.status } });
    if (parsed.data.status === "COMPLETED" && l.status !== "COMPLETED" && l.player.playerProfile) {
      await tx.trainingRecord.create({ data: { playerProfileId: l.player.playerProfile.id, locationId: l.locationId, trainerId: l.trainer.userId, kind: "PRIVATE", title: `Private lesson with ${l.trainer.user.name}`, heldAt: l.startsAt, durationMinutes: l.durationMinutes, createdById: a.id } });
    }
    await audit({ actorId: a.id, action: `lesson.${parsed.data.status.toLowerCase()}`, entityType: "Lesson", entityId: l.id, locationId: l.locationId }, tx);
    return loadLesson(l.id, tx);
  });
}

/* ------------------------------------------------------------------ Progress notes */

export const noteSelect = {
  id: true,
  body: true,
  visibility: true,
  createdAt: true,
  trainerId: true,
  lessonId: true,
  programId: true,
  trainer: { select: { id: true, user: { select: { id: true, name: true } } } },
  lesson: { select: { id: true, code: true, startsAt: true } },
  program: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ProgressNoteSelect;
export type NoteView = Prisma.ProgressNoteGetPayload<{ select: typeof noteSelect }>;

/** Trainers write notes only about players they coach (a lesson or program with that player). */
export async function addProgressNote(actor: Actor | null, input: unknown): Promise<NoteView> {
  const a = await requirePermission(actor, "trainer.self");
  const parsed = progressNoteSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const t = await db.trainerProfile.findUnique({ where: { userId: a.id }, select: { id: true } });
  if (!t) throw forbidden("You need a trainer profile.");
  const { playerId, lessonId, programId, body, visibility } = parsed.data;
  const coached =
    (await db.lesson.count({ where: { trainerId: t.id, playerId, status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW"] } } })) > 0 ||
    (await db.programEnrollment.count({ where: { playerId, status: { in: ["ENROLLED", "COMPLETED"] }, program: { trainerId: t.id } } })) > 0;
  if (!coached) throw forbidden("You can only add notes for players you coach.");
  if (lessonId && !(await db.lesson.findFirst({ where: { id: lessonId, trainerId: t.id, playerId } }))) throw notFound("Lesson");
  if (programId && !(await db.program.findFirst({ where: { id: programId, trainerId: t.id } }))) throw notFound("Program");
  const note = await db.$transaction(async (tx) => {
    const n = await tx.progressNote.create({ data: { trainerId: t.id, playerId, lessonId, programId, body, visibility }, select: noteSelect });
    await audit({ actorId: a.id, action: "note.added", entityType: "ProgressNote", entityId: n.id, metadata: { playerId, visibility } }, tx);
    return n;
  });
  if (visibility === "SHARED") await notify(playerId, { type: "lesson.note", url: `/app/lessons/${lessonId}`, data: { coach: a.name, excerpt: body.slice(0, 160), noteId: note.id, lessonId } });
  return note;
}

/** Notes about a player: the player sees SHARED ones; a trainer sees their own; staff with training.read at the player's home club see all. */
export async function listProgressNotes(actor: Actor | null, playerId: string): Promise<NoteView[]> {
  const a = await requireActor(actor);
  if (a.id === playerId) return db.progressNote.findMany({ where: { playerId, visibility: "SHARED" }, select: noteSelect, orderBy: { createdAt: "desc" } });
  const t = await db.trainerProfile.findUnique({ where: { userId: a.id }, select: { id: true } });
  const player = await db.playerProfile.findUnique({ where: { userId: playerId }, select: { homeLocationId: true } });
  const staff = player?.homeLocationId ? await can(a, "training.read", { locationId: player.homeLocationId }) : !!a.globalRole && (await can(a, "training.read"));
  if (staff && !t) return db.progressNote.findMany({ where: { playerId }, select: noteSelect, orderBy: { createdAt: "desc" } });
  if (t) return db.progressNote.findMany({ where: { playerId, OR: [{ trainerId: t.id }, ...(staff ? [{}] : [])] }, select: noteSelect, orderBy: { createdAt: "desc" } });
  throw forbidden();
}

/* ------------------------------------------------------------------ Lists */

export async function listMyLessons(actor: Actor | null, scope: "upcoming" | "past", now = new Date()): Promise<LessonView[]> {
  const a = await requirePermission(actor, "lesson.read.own");
  const rows = await db.lesson.findMany({
    where: scope === "upcoming" ? { playerId: a.id, status: { in: ACTIVE }, endsAt: { gte: now } } : { playerId: a.id, OR: [{ status: { notIn: ACTIVE } }, { endsAt: { lt: now } }] },
    select: lessonSelect,
    orderBy: { startsAt: scope === "upcoming" ? "asc" : "desc" },
    take: 100,
  });
  return rows.map((l) => scopeNotes(l, "player"));
}

/** A trainer's own calendar (or staff reading a trainer's lessons at their clubs). */
export async function listTrainerLessons(actor: Actor | null, trainerId: string, scope: "upcoming" | "past" | "requests", now = new Date()): Promise<LessonView[]> {
  const a = await requireActor(actor);
  const t = await db.trainerProfile.findFirst({ where: { OR: [{ id: trainerId }, { userId: trainerId }] }, select: { id: true, userId: true, locations: { select: { locationId: true } } } });
  if (!t) throw notFound("Trainer");
  const self = t.userId === a.id;
  if (!self) {
    const ids = await accessibleLocationIds(a, "lesson.read");
    if (ids !== "all" && !t.locations.some((l) => ids.includes(l.locationId))) throw forbidden();
  }
  const where: Prisma.LessonWhereInput =
    scope === "requests" ? { trainerId: t.id, status: "REQUESTED", startsAt: { gte: now } } : scope === "upcoming" ? { trainerId: t.id, status: { in: ACTIVE }, endsAt: { gte: now } } : { trainerId: t.id, OR: [{ status: { notIn: ACTIVE } }, { endsAt: { lt: now } }] };
  return db.lesson.findMany({ where, select: lessonSelect, orderBy: { startsAt: scope === "past" ? "desc" : "asc" }, take: 200 });
}

/** Staff: lessons at one club for a day (or all upcoming). */
export async function listLocationLessons(actor: Actor | null, locationId: string, dateISO?: string, now = new Date()): Promise<LessonView[]> {
  const a = await requirePermission(actor, "lesson.read", { locationId });
  void a;
  const loc = await db.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
  if (!loc) throw notFound("Location");
  const where: Prisma.LessonWhereInput = dateISO ? { locationId, startsAt: { gte: zonedToUtc(dateISO, 0, loc.timezone), lt: zonedToUtc(dateISO, 24 * 60, loc.timezone) } } : { locationId, endsAt: { gte: now } };
  return db.lesson.findMany({ where, select: lessonSelect, orderBy: { startsAt: "asc" }, take: 200 });
}

export type Student = { user: { id: string; name: string; level: string | null; photoUrl: string | null }; lessons: number; completed: number; lastLessonAt: Date | null; nextLessonAt: Date | null; programs: string[] };

/** Players a trainer coaches: anyone with a lesson or an active enrollment in one of their programs. */
export async function listTrainerStudents(actor: Actor | null, trainerId: string): Promise<Student[]> {
  const a = await requireActor(actor);
  const t = await db.trainerProfile.findFirst({ where: { OR: [{ id: trainerId }, { userId: trainerId }] }, select: { id: true, userId: true, locations: { select: { locationId: true } } } });
  if (!t) throw notFound("Trainer");
  if (t.userId !== a.id) {
    const ids = await accessibleLocationIds(a, "lesson.read");
    if (ids !== "all" && !t.locations.some((l) => ids.includes(l.locationId))) throw forbidden();
  }
  const now = new Date();
  const [lessons, enrollments] = await Promise.all([
    db.lesson.findMany({ where: { trainerId: t.id, status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW", "REQUESTED"] } }, select: { playerId: true, status: true, startsAt: true, player: { select: { id: true, name: true, playerProfile: { select: { level: true, photoUrl: true } } } } } }),
    db.programEnrollment.findMany({ where: { program: { trainerId: t.id }, status: { in: ["ENROLLED", "COMPLETED"] } }, select: { playerId: true, program: { select: { name: true } }, player: { select: { id: true, name: true, playerProfile: { select: { level: true, photoUrl: true } } } } } }),
  ]);
  const map = new Map<string, Student>();
  const ensure = (u: { id: string; name: string; playerProfile: { level: string | null; photoUrl: string | null } | null }) => {
    if (!map.has(u.id)) map.set(u.id, { user: { id: u.id, name: u.name, level: u.playerProfile?.level ?? null, photoUrl: u.playerProfile?.photoUrl ?? null }, lessons: 0, completed: 0, lastLessonAt: null, nextLessonAt: null, programs: [] });
    return map.get(u.id)!;
  };
  for (const l of lessons) {
    const s = ensure(l.player);
    s.lessons++;
    if (l.status === "COMPLETED") s.completed++;
    if (l.startsAt < now && (!s.lastLessonAt || l.startsAt > s.lastLessonAt)) s.lastLessonAt = l.startsAt;
    if (l.startsAt >= now && (!s.nextLessonAt || l.startsAt < s.nextLessonAt)) s.nextLessonAt = l.startsAt;
  }
  for (const e of enrollments) ensure(e.player).programs.push(e.program.name);
  return [...map.values()].sort((x, y) => x.user.name.localeCompare(y.user.name));
}

export type { TrainerView };
