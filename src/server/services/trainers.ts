import type { PlayerLevel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, type Actor } from "@/lib/auth/authorize";
import { dayOfWeekISO, localInputToUtc, utcToZoned, zonedToUtc } from "@/lib/time";
import { fieldErrors, timeOffSchema, trainerAvailabilitySchema, trainerProfileSchema, trainerProfileUpdateSchema, type OpeningHours } from "@/lib/validation/schemas";
import { notify } from "./notifications";

/* ------------------------------------------------------------------ Select and view */

export const trainerSelect = {
  id: true,
  userId: true,
  title: true,
  bio: true,
  photoUrl: true,
  qualifications: true,
  languages: true,
  specialties: true,
  levels: true,
  hourlyRateCents: true,
  currency: true,
  durationsMinutes: true,
  autoConfirm: true,
  status: true,
  yearsExperience: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, playerProfile: { select: { level: true, photoUrl: true } } } },
  locations: { select: { location: { select: { id: true, slug: true, name: true, timezone: true, address: true } } } },
  availability: { select: { id: true, locationId: true, dayOfWeek: true, startMinutes: true, endMinutes: true }, orderBy: [{ dayOfWeek: "asc" as const }, { startMinutes: "asc" as const }] },
  timeOff: { where: { endsAt: { gte: new Date(0) } }, select: { id: true, startsAt: true, endsAt: true, reason: true }, orderBy: { startsAt: "asc" as const } },
  _count: { select: { lessons: { where: { status: "COMPLETED" } }, programs: true } },
} satisfies Prisma.TrainerProfileSelect;

export type TrainerView = Prisma.TrainerProfileGetPayload<{ select: typeof trainerSelect }>;

export const LESSON_CANCEL_CUTOFF_HOURS = 12;
export const LESSON_MIN_NOTICE_MINUTES = 120;
export const LESSON_WINDOW_DAYS = 30;

async function load(id: string, tx: Prisma.TransactionClient | typeof db = db): Promise<TrainerView> {
  const t = await tx.trainerProfile.findFirst({ where: { OR: [{ id }, { userId: id }] }, select: trainerSelect });
  if (!t) throw notFound("Trainer");
  return t;
}

export function trainerLocationIds(t: TrainerView): string[] {
  return t.locations.map((l) => l.location.id);
}

/** The trainer themself (trainer.self) or staff who manage trainers at one of the trainer's locations. */
export async function requireTrainerAccess(actor: Actor | null, t: TrainerView): Promise<{ a: Actor; self: boolean }> {
  const a = await requireActor(actor);
  if (t.userId === a.id && (await can(a, "trainer.self"))) return { a, self: true };
  for (const locationId of trainerLocationIds(t)) if (await can(a, "trainer.manage", { locationId })) return { a, self: false };
  if (a.globalRole && (await can(a, "trainer.manage"))) return { a, self: false };
  throw forbidden();
}

/* ------------------------------------------------------------------ Public reads */

export async function listTrainers(actor: Actor | null, filter: { locationId?: string; level?: PlayerLevel; includeInactive?: boolean } = {}): Promise<TrainerView[]> {
  const a = await requireActor(actor);
  const staff = filter.includeInactive && (await can(a, "trainer.read"));
  return db.trainerProfile.findMany({
    where: {
      ...(staff ? {} : { status: "ACTIVE" }),
      ...(filter.locationId ? { locations: { some: { locationId: filter.locationId } } } : {}),
      ...(filter.level ? { OR: [{ levels: { isEmpty: true } }, { levels: { has: filter.level } }] } : {}),
    },
    select: trainerSelect,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

export async function getTrainer(actor: Actor | null, idOrUserId: string): Promise<TrainerView> {
  const a = await requireActor(actor);
  const t = await load(idOrUserId);
  if (t.status !== "ACTIVE" && t.userId !== a.id && !(await can(a, "trainer.read"))) throw notFound("Trainer");
  return t;
}

/** The actor's own trainer profile, or null when they are not a trainer. */
export async function getMyTrainerProfile(actor: Actor | null): Promise<TrainerView | null> {
  const a = await requireActor(actor);
  return db.trainerProfile.findUnique({ where: { userId: a.id }, select: trainerSelect });
}

/* ------------------------------------------------------------------ Profile management */

/** Staff with trainer.manage create a profile for a user who holds the TRAINER role at every chosen location. */
export async function createTrainerProfile(actor: Actor | null, input: unknown): Promise<TrainerView> {
  const a = await requireActor(actor);
  const parsed = trainerProfileSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { userId, locationIds, ...data } = parsed.data;
  for (const locationId of locationIds) if (!(await can(a, "trainer.manage", { locationId }))) throw forbidden();
  const memberships = await db.staffMembership.findMany({ where: { userId, role: "TRAINER", status: "ACTIVE", locationId: { in: locationIds } }, select: { locationId: true } });
  const missing = locationIds.filter((id) => !memberships.some((m) => m.locationId === id));
  if (missing.length) throw validation("The user must hold the Trainer role at every selected location first (Staff page).", { locationIds: "Missing trainer role" });
  if (await db.trainerProfile.findUnique({ where: { userId } })) throw conflict("This user already has a trainer profile.");
  const created = await db.$transaction(async (tx) => {
    const t = await tx.trainerProfile.create({ data: { userId, ...data, locations: { create: locationIds.map((locationId) => ({ locationId })) } }, select: trainerSelect });
    await audit({ actorId: a.id, action: "trainer.created", entityType: "TrainerProfile", entityId: t.id, metadata: { userId, locationIds } }, tx);
    return t;
  });
  await notify(userId, { type: "trainer.profile", title: "Your coaching profile is live", body: "Set your weekly availability from Admin › Coaching.", data: { trainerId: created.id } });
  return created;
}

/** Trainers edit their own public details; staff may change everything, including rate, status and locations. */
export async function updateTrainerProfile(actor: Actor | null, trainerId: string, input: unknown): Promise<TrainerView> {
  const t = await load(trainerId);
  const { a, self } = await requireTrainerAccess(actor, t);
  const parsed = trainerProfileUpdateSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { locationIds, ...data } = parsed.data;
  if (self) {
    delete data.hourlyRateCents;
    delete data.status;
    if (locationIds) throw forbidden("Ask a manager to change the clubs you coach at.");
  }
  if (locationIds) {
    for (const locationId of locationIds) if (!(await can(a, "trainer.manage", { locationId }))) throw forbidden();
    const memberships = await db.staffMembership.findMany({ where: { userId: t.userId, role: "TRAINER", status: "ACTIVE", locationId: { in: locationIds } }, select: { locationId: true } });
    if (memberships.length !== locationIds.length) throw validation("The trainer must hold the Trainer role at every selected location.", { locationIds: "Missing trainer role" });
  }
  return db.$transaction(async (tx) => {
    await tx.trainerProfile.update({ where: { id: t.id }, data });
    if (locationIds) {
      await tx.trainerLocation.deleteMany({ where: { trainerId: t.id, locationId: { notIn: locationIds } } });
      for (const locationId of locationIds) await tx.trainerLocation.upsert({ where: { trainerId_locationId: { trainerId: t.id, locationId } }, create: { trainerId: t.id, locationId }, update: {} });
      await tx.trainerAvailability.deleteMany({ where: { trainerId: t.id, locationId: { notIn: locationIds } } });
    }
    await audit({ actorId: a.id, action: "trainer.updated", entityType: "TrainerProfile", entityId: t.id, metadata: { fields: Object.keys(parsed.data), self } }, tx);
    return load(t.id, tx);
  });
}

/** Replaces the weekly coaching windows. Windows must sit at clubs the trainer coaches at and not overlap on a day. */
export async function setTrainerAvailability(actor: Actor | null, trainerId: string, input: unknown): Promise<TrainerView> {
  const t = await load(trainerId);
  const { a } = await requireTrainerAccess(actor, t);
  const parsed = trainerAvailabilitySchema.safeParse(input);
  if (!parsed.success) throw validation(parsed.error.issues[0]?.message ?? "Check the availability.", fieldErrors(parsed.error));
  const allowed = new Set(trainerLocationIds(t));
  const rows = parsed.data.rows;
  for (const r of rows) if (!allowed.has(r.locationId)) throw validation("Availability can only be set at clubs the trainer coaches at.");
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].dayOfWeek === rows[j].dayOfWeek && rows[i].startMinutes < rows[j].endMinutes && rows[j].startMinutes < rows[i].endMinutes) throw validation("Availability windows overlap on the same day (even across clubs a trainer can only be in one place).");
    }
  }
  return db.$transaction(async (tx) => {
    await tx.trainerAvailability.deleteMany({ where: { trainerId: t.id } });
    if (rows.length) await tx.trainerAvailability.createMany({ data: rows.map((r) => ({ trainerId: t.id, ...r })) });
    await audit({ actorId: a.id, action: "trainer.availability_set", entityType: "TrainerProfile", entityId: t.id, metadata: { windows: rows.length } }, tx);
    return load(t.id, tx);
  });
}

export async function addTimeOff(actor: Actor | null, trainerId: string, input: unknown): Promise<TrainerView> {
  const t = await load(trainerId);
  const { a } = await requireTrainerAccess(actor, t);
  const parsed = timeOffSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const tz = t.locations[0]?.location.timezone ?? "Africa/Cairo";
  const startsAt = localInputToUtc(parsed.data.startLocal, tz);
  const endsAt = localInputToUtc(parsed.data.endLocal, tz);
  return db.$transaction(async (tx) => {
    await tx.trainerTimeOff.create({ data: { trainerId: t.id, startsAt, endsAt, reason: parsed.data.reason } });
    await audit({ actorId: a.id, action: "trainer.time_off_added", entityType: "TrainerProfile", entityId: t.id, metadata: { startsAt, endsAt } }, tx);
    return load(t.id, tx);
  });
}

export async function removeTimeOff(actor: Actor | null, trainerId: string, timeOffId: string): Promise<TrainerView> {
  const t = await load(trainerId);
  const { a } = await requireTrainerAccess(actor, t);
  return db.$transaction(async (tx) => {
    await tx.trainerTimeOff.deleteMany({ where: { id: timeOffId, trainerId: t.id } });
    await audit({ actorId: a.id, action: "trainer.time_off_removed", entityType: "TrainerProfile", entityId: t.id, metadata: { timeOffId } }, tx);
    return load(t.id, tx);
  });
}

/* ------------------------------------------------------------------ Slots */

export type TrainerSlot = { startMinutes: number; startsAt: Date; durations: number[]; available: boolean; reason?: string };
export type TrainerDay = { dateISO: string; timezone: string; locationId: string; slots: TrainerSlot[]; open: boolean };

/**
 * Bookable starts for one trainer at one club on one day: availability windows, location hours, time off,
 * existing lessons and program sessions, past/min-notice. Pure given the rows, so the UI and the booking
 * service agree.
 */
export async function getTrainerDay(actor: Actor | null, trainerId: string, locationId: string, dateISO: string, now = new Date()): Promise<TrainerDay> {
  await requireActor(actor);
  const t = await load(trainerId);
  const loc = t.locations.find((l) => l.location.id === locationId)?.location;
  if (!loc) throw validation("This trainer does not coach at that club.");
  const tz = loc.timezone;
  const dayOfWeek = dayOfWeekISO(dateISO);
  const windows = t.availability.filter((w) => w.locationId === locationId && w.dayOfWeek === dayOfWeek);
  const location = await db.location.findUnique({ where: { id: locationId }, select: { openingHours: true, status: true } });
  const hours = (location?.openingHours as OpeningHours | null)?.[dayOfWeek];
  const dayStart = zonedToUtc(dateISO, 0, tz);
  const dayEnd = zonedToUtc(dateISO, 24 * 60, tz);
  const [lessons, sessions] = await Promise.all([
    db.lesson.findMany({ where: { trainerId: t.id, status: { in: ["REQUESTED", "CONFIRMED"] }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, select: { startsAt: true, endsAt: true } }),
    db.programSession.findMany({ where: { program: { trainerId: t.id, status: { in: ["OPEN", "FULL", "IN_PROGRESS"] } }, status: "SCHEDULED", startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, select: { startsAt: true, endsAt: true } }),
  ]);
  const busy = [...lessons, ...sessions, ...t.timeOff.map((o) => ({ startsAt: o.startsAt, endsAt: o.endsAt }))];
  const step = 30;
  const slots: TrainerSlot[] = [];
  const shortest = Math.min(...t.durationsMinutes);
  for (const w of windows) {
    const from = hours ? Math.max(w.startMinutes, hours.opensAt) : w.startMinutes;
    const to = hours === null ? w.startMinutes : hours ? Math.min(w.endMinutes, hours.closesAt) : w.endMinutes;
    for (let m = from; m + shortest <= to; m += step) {
      const startsAt = zonedToUtc(dateISO, m, tz);
      const durations = t.durationsMinutes.filter((d) => {
        const endsAt = new Date(startsAt.getTime() + d * 60_000);
        return m + d <= to && !busy.some((b) => b.startsAt < endsAt && b.endsAt > startsAt);
      });
      const tooSoon = startsAt.getTime() < now.getTime() + LESSON_MIN_NOTICE_MINUTES * 60_000;
      slots.push({ startMinutes: m, startsAt, durations, available: durations.length > 0 && !tooSoon, reason: tooSoon ? "Too soon" : durations.length === 0 ? "Busy" : undefined });
    }
  }
  slots.sort((x, y) => x.startMinutes - y.startMinutes);
  return { dateISO, timezone: tz, locationId, slots, open: windows.length > 0 && hours !== null && location?.status === "ACTIVE" };
}

/** Staff listing of trainers across the actor's locations. */
export async function listTrainersInScope(actor: Actor | null): Promise<TrainerView[]> {
  const a = await requireActor(actor);
  const ids = await accessibleLocationIds(a, "trainer.read");
  if (ids !== "all" && ids.length === 0) throw forbidden();
  return db.trainerProfile.findMany({ where: ids === "all" ? {} : { locations: { some: { locationId: { in: ids } } } }, select: trainerSelect, orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
}

export const localDay = (at: Date, tz: string) => utcToZoned(at, tz).dateISO;

/** Staff users holding the TRAINER role at clubs the actor manages trainers for, without a coaching profile yet. */
export async function listTrainerCandidates(actor: Actor | null): Promise<{ id: string; name: string; email: string; locationIds: string[] }[]> {
  const a = await requireActor(actor);
  const ids = await accessibleLocationIds(a, "trainer.manage");
  if (ids !== "all" && ids.length === 0) return [];
  const rows = await db.staffMembership.findMany({
    where: { role: "TRAINER", status: "ACTIVE", ...(ids === "all" ? {} : { locationId: { in: ids } }), user: { status: "ACTIVE", trainerProfile: null } },
    select: { locationId: true, user: { select: { id: true, name: true, email: true } } },
  });
  const map = new Map<string, { id: string; name: string; email: string; locationIds: string[] }>();
  for (const r of rows) {
    const u = map.get(r.user.id) ?? { ...r.user, locationIds: [] };
    u.locationIds.push(r.locationId);
    map.set(r.user.id, u);
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}
