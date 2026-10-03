import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, notFound, validation } from "@/lib/errors";
import { can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { availabilitySchema, closureLocalSchema, closureSchema, courtDetailsSchema, courtSchema, fieldErrors } from "@/lib/validation/schemas";
import { localInputToUtc } from "@/lib/time";

export const courtSelect = {
  id: true,
  locationId: true,
  name: true,
  type: true,
  status: true,
  sortOrder: true,
  surface: true,
  description: true,
  durationsMinutes: true,
  availability: { orderBy: [{ dayOfWeek: "asc" as const }, { opensAt: "asc" as const }] },
  closures: { where: { endsAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, orderBy: { startsAt: "asc" as const } },
} satisfies Prisma.CourtSelect;

export type CourtView = Prisma.CourtGetPayload<{ select: typeof courtSelect }>;

async function courtLocation(courtId: string) {
  const court = await db.court.findUnique({ where: { id: courtId }, select: { id: true, locationId: true, name: true, location: { select: { timezone: true } } } });
  if (!court) throw notFound("Court");
  return court;
}

/** Courts of a location. Players see ACTIVE/MAINTENANCE courts; staff of the location see all. */
export async function listCourts(actor: Actor | null, locationId: string): Promise<CourtView[]> {
  await requireActor(actor);
  const loc = await db.location.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!loc) throw notFound("Location");
  const staff = await can(actor, "court.manage", { locationId });
  return db.court.findMany({
    where: { locationId, ...(staff ? {} : { status: { in: ["ACTIVE", "MAINTENANCE"] } }) },
    select: courtSelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Single court with its location context, for the court admin page. */
export async function getCourt(actor: Actor | null, courtId: string) {
  const court = await db.court.findUnique({
    where: { id: courtId },
    select: { ...courtSelect, location: { select: { id: true, name: true, slug: true, timezone: true, status: true, openingHours: true, bookingPolicy: true } } },
  });
  if (!court) throw notFound("Court");
  await requirePermission(actor, "court.read", { locationId: court.locationId });
  return court;
}

export async function createCourt(actor: Actor | null, input: unknown): Promise<CourtView> {
  const parsed = courtSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const a = await requirePermission(actor, "court.manage", { locationId: parsed.data.locationId });
  const loc = await db.location.findUnique({ where: { id: parsed.data.locationId }, select: { id: true } });
  if (!loc) throw notFound("Location");
  const dup = await db.court.findUnique({ where: { locationId_name: { locationId: parsed.data.locationId, name: parsed.data.name } }, select: { id: true } });
  if (dup) throw conflict("A court with this name already exists at this location.");
  return db.$transaction(async (tx) => {
    const court = await tx.court.create({ data: parsed.data, select: courtSelect });
    await audit({ actorId: a.id, action: "court.created", entityType: "Court", entityId: court.id, locationId: court.locationId }, tx);
    return court;
  });
}

/** Rename, retype, change status, durations, surface, description, order. */
export async function updateCourt(actor: Actor | null, courtId: string, input: unknown): Promise<CourtView> {
  const court = await courtLocation(courtId);
  const a = await requirePermission(actor, "court.manage", { locationId: court.locationId });
  const parsed = courtDetailsSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  if (parsed.data.name && parsed.data.name !== court.name) {
    const dup = await db.court.findUnique({ where: { locationId_name: { locationId: court.locationId, name: parsed.data.name } }, select: { id: true } });
    if (dup) throw conflict("A court with this name already exists at this location.");
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.court.update({ where: { id: courtId }, data: parsed.data, select: courtSelect });
    await audit({ actorId: a.id, action: "court.updated", entityType: "Court", entityId: courtId, locationId: court.locationId, metadata: { fields: Object.keys(parsed.data), status: parsed.data.status } }, tx);
    return updated;
  });
}

/** Replaces the weekly operating template for a court. Rejects inverted or overlapping windows. */
export async function setCourtAvailability(actor: Actor | null, courtId: string, rows: unknown[]): Promise<CourtView> {
  const court = await courtLocation(courtId);
  const a = await requirePermission(actor, "availability.manage", { locationId: court.locationId });
  const parsed = rows.map((r, i) => {
    const p = availabilitySchema.safeParse(r);
    if (!p.success) throw validation(`Row ${i + 1}: ${p.error.issues[0]?.message}`, fieldErrors(p.error));
    return p.data;
  });
  const byDay = new Map<number, { opensAt: number; closesAt: number }[]>();
  for (const r of parsed) {
    const list = byDay.get(r.dayOfWeek) ?? [];
    if (list.some((w) => r.opensAt < w.closesAt && w.opensAt < r.closesAt)) throw validation("Availability windows overlap on the same day.");
    list.push(r);
    byDay.set(r.dayOfWeek, list);
  }
  return db.$transaction(async (tx) => {
    await tx.courtAvailability.deleteMany({ where: { courtId } });
    if (parsed.length) await tx.courtAvailability.createMany({ data: parsed.map((r) => ({ ...r, courtId })) });
    await audit({ actorId: a.id, action: "court.availability_set", entityType: "Court", entityId: courtId, locationId: court.locationId, metadata: { rows: parsed.length } }, tx);
    return tx.court.findUniqueOrThrow({ where: { id: courtId }, select: courtSelect });
  });
}

/**
 * Blocks a court for a period (maintenance, event). Accepts UTC instants or datetime-local strings interpreted
 * in the location timezone. Overlapping closures are rejected; the court row is locked so concurrent
 * requests cannot both pass the check.
 */
export async function addCourtClosure(actor: Actor | null, courtId: string, input: unknown) {
  const court = await courtLocation(courtId);
  const a = await requirePermission(actor, "court.manage", { locationId: court.locationId });

  let startsAt: Date;
  let endsAt: Date;
  let reason: string | undefined;
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.startLocal === "string") {
    const parsed = closureLocalSchema.safeParse(raw);
    if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
    startsAt = localInputToUtc(parsed.data.startLocal, court.location.timezone);
    endsAt = localInputToUtc(parsed.data.endLocal, court.location.timezone);
    reason = parsed.data.reason;
  } else {
    const parsed = closureSchema.safeParse(raw);
    if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
    ({ startsAt, endsAt, reason } = parsed.data);
  }
  if (endsAt.getTime() - startsAt.getTime() > 90 * 86_400_000) throw validation("A single closure cannot exceed 90 days.", { endLocal: "Maximum 90 days." });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Court" WHERE "id" = ${courtId} FOR UPDATE`;
    const overlap = await tx.courtClosure.findFirst({ where: { courtId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true, startsAt: true, endsAt: true } });
    if (overlap) throw conflict("This period overlaps an existing closure.");
    const closure = await tx.courtClosure.create({ data: { courtId, startsAt, endsAt, reason } });
    await audit({ actorId: a.id, action: "court.closure_added", entityType: "CourtClosure", entityId: closure.id, locationId: court.locationId, metadata: { startsAt, endsAt, reason } }, tx);
    return closure;
  });
}

export async function removeCourtClosure(actor: Actor | null, closureId: string) {
  const closure = await db.courtClosure.findUnique({ where: { id: closureId }, include: { court: { select: { locationId: true } } } });
  if (!closure) throw notFound("Closure");
  const a = await requirePermission(actor, "court.manage", { locationId: closure.court.locationId });
  await db.$transaction(async (tx) => {
    await tx.courtClosure.delete({ where: { id: closureId } });
    await audit({ actorId: a.id, action: "court.closure_removed", entityType: "CourtClosure", entityId: closureId, locationId: closure.court.locationId }, tx);
  });
  return { ok: true as const };
}

/** Closes every active court at a location for the period (e.g. a tournament day). Fails atomically on any overlap. */
export async function closeLocationCourts(actor: Actor | null, locationId: string, input: unknown) {
  const a = await requirePermission(actor, "court.manage", { locationId });
  const loc = await db.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
  if (!loc) throw notFound("Location");
  const parsed = closureLocalSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const startsAt = localInputToUtc(parsed.data.startLocal, loc.timezone);
  const endsAt = localInputToUtc(parsed.data.endLocal, loc.timezone);
  const courts = await db.court.findMany({ where: { locationId, status: { not: "INACTIVE" } }, select: { id: true, name: true } });
  return db.$transaction(async (tx) => {
    for (const c of courts) {
      await tx.$queryRaw`SELECT "id" FROM "Court" WHERE "id" = ${c.id} FOR UPDATE`;
      const overlap = await tx.courtClosure.findFirst({ where: { courtId: c.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
      if (overlap) throw conflict(`${c.name} already has a closure in that period.`);
    }
    await tx.courtClosure.createMany({ data: courts.map((c) => ({ courtId: c.id, startsAt, endsAt, reason: parsed.data.reason })) });
    await audit({ actorId: a.id, action: "location.courts_closed", entityType: "Location", entityId: locationId, locationId, metadata: { startsAt, endsAt, courts: courts.length, reason: parsed.data.reason } }, tx);
    return { count: courts.length };
  });
}
