import type { EnrollmentStatus, Prisma, ProgramStatus } from "@prisma/client";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, conflict, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { addDaysISO, dayOfWeekISO, formatInZone, zonedToUtc } from "@/lib/time";
import { attendanceMarkSchema, enrollmentCancelSchema, fieldErrors, programSchema, programUpdateSchema } from "@/lib/validation/schemas";
import { notify, notifyMany } from "./notifications";

/* ------------------------------------------------------------------ Select */

export const programSelect = {
  id: true,
  code: true,
  name: true,
  category: true,
  description: true,
  levels: true,
  minAge: true,
  maxAge: true,
  trainerId: true,
  locationId: true,
  startsOn: true,
  endsOn: true,
  schedule: true,
  sessionsCount: true,
  capacity: true,
  priceCents: true,
  currency: true,
  allowWaitlist: true,
  enrollmentClosesAt: true,
  cancellationCutoffHours: true,
  enrollmentRules: true,
  cancellationRules: true,
  status: true,
  createdAt: true,
  trainer: { select: { id: true, userId: true, title: true, photoUrl: true, user: { select: { id: true, name: true } } } },
  location: { select: { id: true, slug: true, name: true, timezone: true, address: true } },
  sessions: { select: { id: true, index: true, startsAt: true, endsAt: true, status: true, topic: true, court: { select: { id: true, name: true } }, _count: { select: { attendance: true } } }, orderBy: { index: "asc" as const } },
  _count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
} satisfies Prisma.ProgramSelect;

type ProgramRow = Prisma.ProgramGetPayload<{ select: typeof programSelect }>;
export type ProgramView = ProgramRow & { enrolledCount: number; spotsLeft: number; waitlistCount: number };

export type ScheduleSlot = { dayOfWeek: number; startMinutes: number; durationMinutes: number };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => `PR-${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;
const PUBLIC: ProgramStatus[] = ["OPEN", "FULL", "IN_PROGRESS"];

async function decorate(row: ProgramRow, tx: Prisma.TransactionClient | typeof db = db): Promise<ProgramView> {
  const waitlistCount = await tx.programEnrollment.count({ where: { programId: row.id, status: "WAITLISTED" } });
  const enrolledCount = row._count.enrollments;
  return { ...row, enrolledCount, spotsLeft: Math.max(0, row.capacity - enrolledCount), waitlistCount };
}

async function load(idOrCode: string, tx: Prisma.TransactionClient | typeof db = db): Promise<ProgramView> {
  const row = await tx.program.findFirst({ where: idOrCode.startsWith("PR-") ? { code: idOrCode } : { id: idOrCode }, select: programSelect });
  if (!row) throw notFound("Program");
  return decorate(row, tx);
}

/** Generates dated sessions from the weekly schedule between startsOn and endsOn, up to sessionsCount. */
export function generateSessions(startsOn: string, endsOn: string, schedule: ScheduleSlot[], sessionsCount: number, tz: string): { startsAt: Date; endsAt: Date }[] {
  const out: { startsAt: Date; endsAt: Date }[] = [];
  let day = startsOn;
  let guard = 0;
  while (day <= endsOn && out.length < sessionsCount && guard++ < 400) {
    const dow = dayOfWeekISO(day);
    for (const s of [...schedule].filter((x) => x.dayOfWeek === dow).sort((x, y) => x.startMinutes - y.startMinutes)) {
      if (out.length >= sessionsCount) break;
      const startsAt = zonedToUtc(day, s.startMinutes, tz);
      out.push({ startsAt, endsAt: new Date(startsAt.getTime() + s.durationMinutes * 60_000) });
    }
    day = addDaysISO(day, 1);
  }
  return out;
}

/* ------------------------------------------------------------------ Admin: create, update, publish, cancel */

export async function createProgram(actor: Actor | null, input: unknown): Promise<ProgramView> {
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { courtId, startsOn, endsOn, ...data } = parsed.data;
  const a = await requirePermission(actor, "program.manage", { locationId: data.locationId });
  const trainer = await db.trainerProfile.findUnique({ where: { id: data.trainerId }, select: { id: true, status: true, userId: true, locations: { select: { locationId: true } } } });
  if (!trainer || trainer.status !== "ACTIVE") throw notFound("Trainer");
  if (!trainer.locations.some((l) => l.locationId === data.locationId)) throw validation("The trainer does not coach at that club.", { trainerId: "Not at this club" });
  const loc = await db.location.findUniqueOrThrow({ where: { id: data.locationId }, select: { timezone: true, name: true } });
  const sessions = generateSessions(startsOn, endsOn, data.schedule, data.sessionsCount, loc.timezone);
  if (sessions.length < data.sessionsCount) throw validation(`The schedule only fits ${sessions.length} of ${data.sessionsCount} sessions between the dates.`, { sessionsCount: `Max ${sessions.length}` });
  return db.$transaction(async (tx) => {
    let c = code();
    for (let i = 0; i < 5 && (await tx.program.findUnique({ where: { code: c }, select: { id: true } })); i++) c = code();
    const p = await tx.program.create({
      data: { code: c, ...data, startsOn: new Date(`${startsOn}T00:00:00Z`), endsOn: new Date(`${endsOn}T00:00:00Z`), createdById: a.id, sessions: { create: sessions.map((s, i) => ({ index: i + 1, startsAt: s.startsAt, endsAt: s.endsAt, courtId })) } },
      select: programSelect,
    });
    await audit({ actorId: a.id, action: "program.created", entityType: "Program", entityId: p.id, locationId: data.locationId, metadata: { code: c, name: data.name, sessions: sessions.length } }, tx);
    await notify(trainer.userId, { type: "program.assigned", url: `/admin/programs`, data: { program: data.name, club: loc.name, sessions: sessions.length, startsOn, programId: p.id, code: c } });
    return decorate(p, tx);
  });
}

/** Edits a program. Dates or schedule changes regenerate sessions only while no attendance has been recorded. */
export async function updateProgram(actor: Actor | null, programId: string, input: unknown): Promise<ProgramView> {
  const p = await load(programId);
  const a = await requirePermission(actor, "program.manage", { locationId: p.locationId });
  const parsed = programUpdateSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { courtId, startsOn, endsOn, ...data } = parsed.data;
  if (data.capacity !== undefined && data.capacity < p.enrolledCount) throw validation(`${p.enrolledCount} players are enrolled; capacity cannot go below that.`, { capacity: `At least ${p.enrolledCount}` });
  const regenerate = startsOn !== undefined || endsOn !== undefined || data.schedule !== undefined || data.sessionsCount !== undefined;
  if (regenerate && p.sessions.some((s) => s._count.attendance > 0)) throw validation("Attendance has been recorded; the schedule can no longer be regenerated.");
  const s0 = startsOn ?? p.startsOn.toISOString().slice(0, 10);
  const e0 = endsOn ?? p.endsOn.toISOString().slice(0, 10);
  const schedule = (data.schedule ?? (p.schedule as ScheduleSlot[])) as ScheduleSlot[];
  const count = data.sessionsCount ?? p.sessionsCount;
  const sessions = regenerate ? generateSessions(s0, e0, schedule, count, p.location.timezone) : [];
  if (regenerate && sessions.length < count) throw validation(`The schedule only fits ${sessions.length} of ${count} sessions between the dates.`, { sessionsCount: `Max ${sessions.length}` });
  const updated = await db.$transaction(async (tx) => {
    await tx.program.update({ where: { id: p.id }, data: { ...data, ...(startsOn ? { startsOn: new Date(`${startsOn}T00:00:00Z`) } : {}), ...(endsOn ? { endsOn: new Date(`${endsOn}T00:00:00Z`) } : {}) } });
    if (regenerate) {
      await tx.programSession.deleteMany({ where: { programId: p.id } });
      await tx.programSession.createMany({ data: sessions.map((s, i) => ({ programId: p.id, index: i + 1, startsAt: s.startsAt, endsAt: s.endsAt, courtId: courtId ?? p.sessions[0]?.court?.id ?? null })) });
    } else if (courtId) await tx.programSession.updateMany({ where: { programId: p.id }, data: { courtId } });
    if (data.capacity !== undefined) {
      const fresh = await load(p.id, tx);
      const next = fresh.enrolledCount >= fresh.capacity ? "FULL" : fresh.status === "FULL" ? "OPEN" : fresh.status;
      if (next !== fresh.status) await tx.program.update({ where: { id: p.id }, data: { status: next } });
      if (next === "OPEN") await promoteWaitlist(tx, p.id, a.id);
    }
    await audit({ actorId: a.id, action: "program.updated", entityType: "Program", entityId: p.id, locationId: p.locationId, metadata: { fields: Object.keys(parsed.data), regenerated: regenerate } }, tx);
    return load(p.id, tx);
  });
  await announceProgramChange(updated, parsed.data, regenerate);
  return updated;
}

/**
 * Tells the people already enrolled what moved. Only changes a player would notice are worth a notification,
 * so a rename of an internal field stays silent, and the type's quiet window collapses a burst of edits.
 */
async function announceProgramChange(p: ProgramView, fields: Record<string, unknown>, regenerated: boolean): Promise<void> {
  const parts: string[] = [];
  if (regenerated) parts.push("The schedule changed.");
  if (fields.trainerId !== undefined) parts.push("A different coach is leading it.");
  if (fields.courtId !== undefined && !regenerated) parts.push("The court changed.");
  if (fields.priceCents !== undefined) parts.push("The price changed.");
  if (fields.capacity !== undefined) parts.push("The number of places changed.");
  if (fields.level !== undefined || fields.levels !== undefined) parts.push("The level requirement changed.");
  if (parts.length === 0) return;
  const rows = await db.programEnrollment.findMany({ where: { programId: p.id, status: "ENROLLED" }, select: { playerId: true } });
  const players = rows.map((r) => r.playerId);
  if (players.length === 0) return;
  await notifyMany(players, {
    type: "program.changed",
    url: `/app/programs/${p.id}`,
    groupKey: p.id,
    data: { program: p.name, summary: parts.join(" "), programId: p.id, code: p.code },
  }).catch((e) => {
    console.error("[program] announcing a change failed", e);
    return 0;
  });
}

export async function setProgramStatus(actor: Actor | null, programId: string, status: "OPEN" | "CANCELLED" | "DRAFT", reason?: string): Promise<ProgramView> {
  const p = await load(programId);
  const a = await requirePermission(actor, "program.manage", { locationId: p.locationId });
  if (status === "OPEN" && !["DRAFT", "FULL"].includes(p.status)) throw new AppError("INVALID_TRANSITION", `A ${p.status.toLowerCase()} program cannot be opened.`);
  if (status === "DRAFT" && p.status !== "OPEN") throw new AppError("INVALID_TRANSITION", "Only an open program can go back to draft.");
  if (status === "CANCELLED" && ["COMPLETED", "CANCELLED"].includes(p.status)) throw new AppError("INVALID_TRANSITION", `This program is already ${p.status.toLowerCase()}.`);
  const next: ProgramStatus = status === "OPEN" && p.enrolledCount >= p.capacity ? "FULL" : status;
  let affected: string[] = [];
  const updated = await db.$transaction(async (tx) => {
    await tx.program.update({ where: { id: p.id }, data: { status: next } });
    if (status === "CANCELLED") {
      const open = await tx.programEnrollment.findMany({ where: { programId: p.id, status: { in: ["ENROLLED", "WAITLISTED"] } }, select: { id: true, playerId: true } });
      affected = open.map((e) => e.playerId);
      await tx.programEnrollment.updateMany({ where: { id: { in: open.map((e) => e.id) } }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? "Program cancelled" } });
      await tx.payment.updateMany({ where: { enrollmentId: { in: open.map((e) => e.id) }, status: "PENDING" }, data: { status: "CANCELLED" } });
      await tx.payment.updateMany({ where: { enrollmentId: { in: open.map((e) => e.id) }, status: "PAID" }, data: { status: "REFUNDED", refundedAt: new Date() } });
      await tx.programSession.updateMany({ where: { programId: p.id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
    }
    await audit({ actorId: a.id, action: `program.${status.toLowerCase()}`, entityType: "Program", entityId: p.id, locationId: p.locationId, metadata: { reason } }, tx);
    return load(p.id, tx);
  });
  await notifyMany(affected, { type: "program.cancelled", url: "/app/programs", groupKey: p.id, data: { program: p.name, reason: reason ?? "The club cancelled this program. Any payment is refunded.", programId: p.id, code: p.code } });
  return updated;
}

/* ------------------------------------------------------------------ Reads */

/** Players browse OPEN, FULL and IN_PROGRESS programs; staff with program.manage also see drafts at their clubs. */
export async function listPrograms(actor: Actor | null, filter: { locationId?: string; category?: string; includeAll?: boolean } = {}, now = new Date()): Promise<ProgramView[]> {
  const a = await requireActor(actor);
  await advancePrograms(now);
  let where: Prisma.ProgramWhereInput = { status: { in: PUBLIC } };
  if (filter.includeAll) {
    const ids = await accessibleLocationIds(a, "program.manage");
    if (ids !== "all" && ids.length === 0) throw forbidden();
    where = ids === "all" ? {} : { locationId: { in: ids } };
  }
  const rows = await db.program.findMany({ where: { ...where, ...(filter.locationId ? { locationId: filter.locationId } : {}), ...(filter.category ? { category: filter.category as ProgramView["category"] } : {}) }, select: programSelect, orderBy: [{ startsOn: "asc" }] });
  return Promise.all(rows.map((r) => decorate(r)));
}

export async function getProgram(actor: Actor | null, idOrCode: string, now = new Date()): Promise<ProgramView> {
  const a = await requireActor(actor);
  await advancePrograms(now);
  const p = await load(idOrCode);
  if (!PUBLIC.includes(p.status) && p.status !== "COMPLETED") {
    if (p.trainer.userId !== a.id && !(await can(a, "program.manage", { locationId: p.locationId }))) throw notFound("Program");
  }
  return p;
}

/* ------------------------------------------------------------------ Enrollment */

export const enrollmentSelect = {
  id: true,
  programId: true,
  playerId: true,
  status: true,
  position: true,
  enrolledAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  player: { select: { id: true, name: true, email: true, playerProfile: { select: { id: true, level: true, photoUrl: true, dateOfBirth: true } } } },
  program: { select: programSelect },
  attendance: { select: { id: true, sessionId: true, status: true, markedAt: true } },
  payments: { select: { id: true, amountCents: true, currency: true, status: true, method: true, paidAt: true }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ProgramEnrollmentSelect;
type EnrollmentRow = Prisma.ProgramEnrollmentGetPayload<{ select: typeof enrollmentSelect }>;
export type EnrollmentView = Omit<EnrollmentRow, "program"> & { program: ProgramView };

async function viewEnrollment(r: EnrollmentRow, tx: Prisma.TransactionClient | typeof db = db): Promise<EnrollmentView> {
  const { program, ...rest } = r;
  return { ...rest, program: await decorate(program, tx) };
}

function ageOn(dob: Date | null | undefined, on: Date): number | null {
  if (!dob) return null;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/**
 * Enrolls a player (self with program.enroll.own, or staff with program.manage for a member). Capacity is
 * reserved under a row lock; when full, the player is waitlisted in order if the program allows it.
 */
export async function enroll(actor: Actor | null, programId: string, opts: { playerId?: string; now?: Date } = {}): Promise<EnrollmentView> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();
  const playerId = opts.playerId ?? a.id;
  const p0 = await load(programId);
  if (playerId !== a.id) await requirePermission(a, "program.manage", { locationId: p0.locationId });
  else await requirePermission(a, "program.enroll.own");
  const player = await db.user.findUnique({ where: { id: playerId }, select: { id: true, name: true, status: true, playerProfile: { select: { level: true, dateOfBirth: true } } } });
  if (!player || player.status !== "ACTIVE") throw notFound("Player");
  if (p0.trainer.userId === playerId) throw validation("The trainer cannot enroll in their own program.");
  if (!["OPEN", "FULL"].includes(p0.status)) throw new AppError("INVALID_TRANSITION", `This program is ${p0.status.toLowerCase().replace("_", " ")}.`);
  if (p0.enrollmentClosesAt && p0.enrollmentClosesAt < now) throw new AppError("NOT_ELIGIBLE", "Enrollment for this program has closed.");
  const level = player.playerProfile?.level ?? null;
  if (p0.levels.length && (!level || !p0.levels.includes(level))) throw new AppError("NOT_ELIGIBLE", level ? `This program is for levels ${p0.levels.join(", ")}.` : `This program needs an official level (${p0.levels.join(", ")}). Request an assessment first.`);
  const age = ageOn(player.playerProfile?.dateOfBirth, p0.startsOn);
  if ((p0.minAge || p0.maxAge) && age === null) throw new AppError("NOT_ELIGIBLE", "Add your date of birth to your profile to enroll in this age-restricted program.");
  if (p0.minAge && age! < p0.minAge) throw new AppError("NOT_ELIGIBLE", `This program is for players aged ${p0.minAge}${p0.maxAge ? ` to ${p0.maxAge}` : "+"}.`);
  if (p0.maxAge && age! > p0.maxAge) throw new AppError("NOT_ELIGIBLE", `This program is for players aged ${p0.minAge ?? ""}${p0.minAge ? " to " : "up to "}${p0.maxAge}.`);

  let waitlisted = false;
  const created = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Program" WHERE "id" = ${p0.id} FOR UPDATE`;
      const p = await load(p0.id, tx);
      const existing = await tx.programEnrollment.findUnique({ where: { programId_playerId: { programId: p.id, playerId } } });
      if (existing && existing.status !== "CANCELLED") throw conflict(existing.status === "WAITLISTED" ? "Already on the waitlist." : "Already enrolled.");
      let status: EnrollmentStatus = "ENROLLED";
      let position: number | null = null;
      if (p.enrolledCount >= p.capacity) {
        if (!p.allowWaitlist) throw new AppError("PROGRAM_FULL", "This program is full and has no waitlist.");
        status = "WAITLISTED";
        waitlisted = true;
        const last = await tx.programEnrollment.aggregate({ where: { programId: p.id, status: "WAITLISTED" }, _max: { position: true } });
        position = (last._max.position ?? 0) + 1;
      }
      const data = { status, position, enrolledAt: status === "ENROLLED" ? now : null, cancelledAt: null, cancelReason: null, createdById: a.id };
      const e = existing
        ? await tx.programEnrollment.update({ where: { id: existing.id }, data, select: enrollmentSelect })
        : await tx.programEnrollment.create({ data: { programId: p.id, playerId, ...data }, select: enrollmentSelect });
      if (status === "ENROLLED") {
        await tx.payment.create({ data: { enrollmentId: e.id, amountCents: p.priceCents, currency: p.currency, status: "PENDING", method: "NONE" } });
        if (p.enrolledCount + 1 >= p.capacity && p.status === "OPEN") await tx.program.update({ where: { id: p.id }, data: { status: "FULL" } });
      }
      await audit({ actorId: a.id, action: status === "ENROLLED" ? "program.enrolled" : "program.waitlisted", entityType: "ProgramEnrollment", entityId: e.id, locationId: p.locationId, metadata: { programId: p.id, playerId, position } }, tx);
      return viewEnrollment(await tx.programEnrollment.findUniqueOrThrow({ where: { id: e.id }, select: enrollmentSelect }), tx);
    },
    { isolationLevel: "ReadCommitted" },
  );
  await Promise.all([
    notify(playerId, {
      type: waitlisted ? "program.waitlisted" : "program.enrolled",
      url: `/app/programs/${p0.id}`,
      data: { program: p0.name, club: p0.location.name, startsOn: formatInZone(p0.startsOn, "UTC", { day: "numeric", month: "short" }), position: created.position, programId: p0.id, code: p0.code },
    }),
    notify(p0.trainer.userId, {
      type: "program.roster",
      url: `/admin/programs`,
      groupKey: p0.id,
      data: { player: player.name, verb: waitlisted ? "joined the waitlist for" : "enrolled in", program: p0.name, enrolled: created.program.enrolledCount, capacity: p0.capacity, programId: p0.id, code: p0.code },
    }),
  ]);
  return created;
}

/** First on the waitlist moves into a freed place. Returns the promoted player ids. */
async function promoteWaitlist(tx: Prisma.TransactionClient, programId: string, actorId: string): Promise<string[]> {
  const promoted: string[] = [];
  for (;;) {
    const p = await load(programId, tx);
    if (p.spotsLeft === 0 || !["OPEN", "FULL"].includes(p.status)) break;
    const next = await tx.programEnrollment.findFirst({ where: { programId, status: "WAITLISTED" }, orderBy: { position: "asc" } });
    if (!next) break;
    await tx.programEnrollment.update({ where: { id: next.id }, data: { status: "ENROLLED", position: null, enrolledAt: new Date() } });
    await tx.payment.create({ data: { enrollmentId: next.id, amountCents: p.priceCents, currency: p.currency, status: "PENDING", method: "NONE" } });
    await audit({ actorId, action: "program.promoted", entityType: "ProgramEnrollment", entityId: next.id, locationId: p.locationId, metadata: { programId } }, tx);
    promoted.push(next.playerId);
  }
  const p = await load(programId, tx);
  const status = p.enrolledCount >= p.capacity ? "FULL" : p.status === "FULL" ? "OPEN" : p.status;
  if (status !== p.status) await tx.program.update({ where: { id: programId }, data: { status } });
  return promoted;
}

export async function cancelEnrollment(actor: Actor | null, enrollmentId: string, input: unknown = {}, opts: { now?: Date } = {}): Promise<EnrollmentView> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();
  const parsed = enrollmentCancelSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const row = await db.programEnrollment.findUnique({ where: { id: enrollmentId }, select: enrollmentSelect });
  if (!row) throw notFound("Enrollment");
  const e = await viewEnrollment(row);
  const staff = await can(a, "program.manage", { locationId: e.program.locationId });
  if (e.playerId !== a.id && !staff) throw forbidden();
  if (!["ENROLLED", "WAITLISTED"].includes(e.status)) throw new AppError("INVALID_TRANSITION", `This enrollment is already ${e.status.toLowerCase()}.`);
  if (!staff && e.status === "ENROLLED") {
    const cutoff = new Date(e.program.sessions[0]?.startsAt ?? e.program.startsOn);
    if (cutoff.getTime() - now.getTime() < e.program.cancellationCutoffHours * 3_600_000) throw new AppError("CANCELLATION_NOT_ALLOWED", `Withdrawals close ${e.program.cancellationCutoffHours} hours before the first session. Contact the club.`);
  }
  let promoted: string[] = [];
  const updated = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Program" WHERE "id" = ${e.programId} FOR UPDATE`;
    await tx.programEnrollment.update({ where: { id: e.id }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: parsed.data.reason, position: null } });
    await tx.payment.updateMany({ where: { enrollmentId: e.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.payment.updateMany({ where: { enrollmentId: e.id, status: "PAID" }, data: { status: "REFUNDED", refundedAt: now } });
    if (e.status === "WAITLISTED") {
      const rest = await tx.programEnrollment.findMany({ where: { programId: e.programId, status: "WAITLISTED" }, orderBy: { position: "asc" } });
      for (const [i, r] of rest.entries()) await tx.programEnrollment.update({ where: { id: r.id }, data: { position: i + 1 } });
    } else promoted = await promoteWaitlist(tx, e.programId, a.id);
    await audit({ actorId: a.id, action: "program.enrollment_cancelled", entityType: "ProgramEnrollment", entityId: e.id, locationId: e.program.locationId, metadata: { byStaff: staff, reason: parsed.data.reason } }, tx);
    const fresh = await tx.programEnrollment.findUniqueOrThrow({ where: { id: e.id }, select: enrollmentSelect });
    return viewEnrollment(fresh, tx);
  });
  await Promise.all([
    ...(e.playerId !== a.id ? [notify(e.playerId, { type: "program.enrollment_cancelled", url: "/app/programs", data: { program: e.program.name, reason: parsed.data.reason ?? "The club withdrew your place. Any payment is refunded.", programId: e.programId } })] : []),
    notifyMany(promoted, { type: "program.promoted", url: `/app/programs/${e.programId}`, groupKey: e.programId, data: { program: e.program.name, programId: e.programId, code: e.program.code } }),
  ]);
  return updated;
}

export async function listMyEnrollments(actor: Actor | null, now = new Date()): Promise<EnrollmentView[]> {
  const a = await requireActor(actor);
  await advancePrograms(now);
  const rows = await db.programEnrollment.findMany({ where: { playerId: a.id }, select: enrollmentSelect, orderBy: { createdAt: "desc" } });
  return Promise.all(rows.map((r) => viewEnrollment(r)));
}

/** Roster for the program's trainer or staff who manage programs at the club. */
export async function listProgramEnrollments(actor: Actor | null, programId: string): Promise<EnrollmentView[]> {
  const a = await requireActor(actor);
  const p = await load(programId);
  if (p.trainer.userId !== a.id && !(await can(a, "program.manage", { locationId: p.locationId })) && !(await can(a, "lesson.read", { locationId: p.locationId }))) throw forbidden();
  const rows = await db.programEnrollment.findMany({ where: { programId: p.id }, select: enrollmentSelect, orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }] });
  return Promise.all(rows.map((r) => viewEnrollment(r)));
}

/* ------------------------------------------------------------------ Attendance */

/** The trainer (or staff) marks attendance for one session; PRESENT and LATE join each player's training history once. */
export async function markAttendance(actor: Actor | null, sessionId: string, input: unknown, opts: { now?: Date } = {}): Promise<{ marked: number }> {
  const a = await requireActor(actor);
  const parsed = attendanceMarkSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the attendance marks.", fieldErrors(parsed.error));
  const session = await db.programSession.findUnique({ where: { id: sessionId }, select: { id: true, index: true, startsAt: true, endsAt: true, status: true, program: { select: programSelect } } });
  if (!session) throw notFound("Session");
  const p = await decorate(session.program);
  if (p.trainer.userId !== a.id && !(await can(a, "program.manage", { locationId: p.locationId }))) throw forbidden();
  const now = opts.now ?? new Date();
  if (session.startsAt > now) throw validation("Attendance opens once the session has started.");
  if (session.status === "CANCELLED") throw validation("This session was cancelled.");
  const enrollments = await db.programEnrollment.findMany({ where: { programId: p.id, id: { in: parsed.data.marks.map((m) => m.enrollmentId) }, status: { in: ["ENROLLED", "COMPLETED"] } }, select: { id: true, playerId: true, player: { select: { playerProfile: { select: { id: true } } } } } });
  const byId = new Map(enrollments.map((e) => [e.id, e]));
  return db.$transaction(async (tx) => {
    let marked = 0;
    for (const m of parsed.data.marks) {
      const e = byId.get(m.enrollmentId);
      if (!e) continue;
      const before = await tx.programAttendance.findUnique({ where: { sessionId_enrollmentId: { sessionId, enrollmentId: e.id } } });
      await tx.programAttendance.upsert({ where: { sessionId_enrollmentId: { sessionId, enrollmentId: e.id } }, create: { sessionId, enrollmentId: e.id, status: m.status, markedById: a.id }, update: { status: m.status, markedById: a.id, markedAt: now } });
      const attended = m.status === "PRESENT" || m.status === "LATE";
      const wasAttended = before && (before.status === "PRESENT" || before.status === "LATE");
      if (attended && !wasAttended && e.player.playerProfile) {
        await tx.trainingRecord.create({ data: { playerProfileId: e.player.playerProfile.id, locationId: p.locationId, trainerId: p.trainer.userId, kind: "PROGRAM", title: `${p.name} · session ${session.index}`, heldAt: session.startsAt, durationMinutes: Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000), createdById: a.id } });
      }
      marked++;
    }
    await tx.programSession.update({ where: { id: sessionId }, data: { status: "COMPLETED" } });
    await audit({ actorId: a.id, action: "program.attendance", entityType: "ProgramSession", entityId: sessionId, locationId: p.locationId, metadata: { programId: p.id, marked } }, tx);
    return { marked };
  });
}

/** Programs move with the calendar: OPEN/FULL → IN_PROGRESS after the first session, → COMPLETED after the last. */
export async function advancePrograms(now = new Date()): Promise<void> {
  await db.program.updateMany({ where: { status: { in: ["OPEN", "FULL"] }, sessions: { some: { startsAt: { lte: now } } } }, data: { status: "IN_PROGRESS" } });
  const done = await db.program.findMany({ where: { status: "IN_PROGRESS", sessions: { none: { endsAt: { gt: now }, status: { not: "CANCELLED" } } } }, select: { id: true } });
  if (done.length) {
    await db.program.updateMany({ where: { id: { in: done.map((d) => d.id) } }, data: { status: "COMPLETED" } });
    await db.programEnrollment.updateMany({ where: { programId: { in: done.map((d) => d.id) }, status: "ENROLLED" }, data: { status: "COMPLETED" } });
    await db.programEnrollment.updateMany({ where: { programId: { in: done.map((d) => d.id) }, status: "WAITLISTED" }, data: { status: "CANCELLED", cancelReason: "Program ended" } });
  }
}

/** Programs led by a trainer (their own view) with rosters sizes. */
export async function listTrainerPrograms(actor: Actor | null, trainerId: string, now = new Date()): Promise<ProgramView[]> {
  const a = await requireActor(actor);
  await advancePrograms(now);
  const t = await db.trainerProfile.findFirst({ where: { OR: [{ id: trainerId }, { userId: trainerId }] }, select: { id: true, userId: true, locations: { select: { locationId: true } } } });
  if (!t) throw notFound("Trainer");
  if (t.userId !== a.id) {
    const ids = await accessibleLocationIds(a, "program.manage");
    if (ids !== "all" && !t.locations.some((l) => ids.includes(l.locationId))) throw forbidden();
  }
  const rows = await db.program.findMany({ where: { trainerId: t.id }, select: programSelect, orderBy: { startsOn: "desc" } });
  return Promise.all(rows.map((r) => decorate(r)));
}
