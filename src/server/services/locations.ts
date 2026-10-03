import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { bookingPolicySchema, fieldErrors, locationDetailsSchema, locationSchema, photoSchema, type OpeningHours } from "@/lib/validation/schemas";
import { dayOfWeekISO, todayISO } from "@/lib/time";

export const locationSelect = {
  id: true,
  slug: true,
  name: true,
  city: true,
  area: true,
  address: true,
  description: true,
  facilities: true,
  openingHours: true,
  timezone: true,
  phone: true,
  email: true,
  status: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  photos: { orderBy: { sortOrder: "asc" as const } },
  bookingPolicy: true,
  _count: { select: { courts: true, memberships: true, homePlayers: true } },
} satisfies Prisma.LocationSelect;

export type LocationView = Prisma.LocationGetPayload<{ select: typeof locationSelect }>;

/** Adds the cheapest hourly rate and today's hours for list cards. */
export type LocationCard = LocationView & { priceFromCents: number | null; openToday: { opensAt: number; closesAt: number } | null; activeCourts: number };

async function decorate(locations: LocationView[]): Promise<LocationCard[]> {
  if (locations.length === 0) return [];
  const ids = locations.map((l) => l.id);
  const [prices, counts] = await Promise.all([
    db.courtAvailability.groupBy({ by: ["courtId"], where: { court: { locationId: { in: ids }, status: { not: "INACTIVE" } } }, _min: { priceCents: true } }),
    db.court.groupBy({ by: ["locationId"], where: { locationId: { in: ids }, status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const courtLoc = new Map((await db.court.findMany({ where: { id: { in: prices.map((p) => p.courtId) } }, select: { id: true, locationId: true } })).map((c) => [c.id, c.locationId]));
  const priceFrom = new Map<string, number>();
  for (const p of prices) {
    const loc = courtLoc.get(p.courtId);
    if (!loc || p._min.priceCents == null) continue;
    priceFrom.set(loc, Math.min(priceFrom.get(loc) ?? Infinity, p._min.priceCents));
  }
  const activeCourts = new Map(counts.map((c) => [c.locationId, c._count._all]));
  return locations.map((l) => {
    const hours = l.openingHours as OpeningHours | null;
    const today = hours ? hours[dayOfWeekISO(todayISO(l.timezone))] : null;
    return { ...l, priceFromCents: priceFrom.get(l.id) ?? null, openToday: today ?? null, activeCourts: activeCourts.get(l.id) ?? 0 };
  });
}

/** Public, read-only list for players (ACTIVE and COMING_SOON only). */
export async function listPublicLocations(): Promise<LocationCard[]> {
  const rows = await db.location.findMany({ where: { status: { in: ["ACTIVE", "COMING_SOON"] } }, select: locationSelect, orderBy: { name: "asc" } });
  return decorate(rows);
}

/** Staff list: global roles see every location, staff see the locations they belong to. */
export async function listManagedLocations(actor: Actor | null): Promise<LocationCard[]> {
  const a = await requireActor(actor);
  const scope = await accessibleLocationIds(a, "location.read");
  if (scope !== "all" && scope.length === 0) return [];
  const rows = await db.location.findMany({ where: scope === "all" ? {} : { id: { in: scope } }, select: locationSelect, orderBy: { name: "asc" } });
  return decorate(rows);
}

export async function getLocation(actor: Actor | null, idOrSlug: string): Promise<LocationView> {
  await requireActor(actor);
  const loc = await db.location.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: locationSelect });
  if (!loc) throw notFound("Location");
  if (loc.status === "INACTIVE") await requirePermission(actor, "location.manage", { locationId: loc.id });
  return loc;
}

/** Player-facing detail: location, visible courts with their weekly template, active pricing rules. */
export async function getLocationPublic(actor: Actor | null, idOrSlug: string) {
  const loc = await getLocation(actor, idOrSlug);
  const [card] = await decorate([loc]);
  const staff = !!actor && (await can(actor, "court.manage", { locationId: loc.id }));
  const [courts, rules] = await Promise.all([
    db.court.findMany({
      where: { locationId: loc.id, ...(staff ? {} : { status: { in: ["ACTIVE", "MAINTENANCE"] } }) },
      include: { availability: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }] } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.pricingRule.findMany({ where: { locationId: loc.id, active: true }, orderBy: [{ priority: "asc" }] }),
  ]);
  return { ...card, courts, rules };
}

export async function createLocation(actor: Actor | null, input: unknown): Promise<LocationView> {
  const a = await requirePermission(actor, "location.create");
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const exists = await db.location.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
  if (exists) throw conflict("A location with this slug already exists.");
  return db.$transaction(async (tx) => {
    const loc = await tx.location.create({ data: { ...parsed.data, bookingPolicy: { create: {} } }, select: locationSelect });
    await audit({ actorId: a.id, action: "location.created", entityType: "Location", entityId: loc.id, locationId: loc.id }, tx);
    return loc;
  });
}

/** Updates details, status, timezone, facilities, description and opening hours. */
export async function updateLocation(actor: Actor | null, locationId: string, input: unknown): Promise<LocationView> {
  const a = await requirePermission(actor, "location.manage", { locationId });
  const parsed = locationDetailsSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const existing = await db.location.findUnique({ where: { id: locationId }, select: { id: true, slug: true, status: true } });
  if (!existing) throw notFound("Location");
  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    const taken = await db.location.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
    if (taken) throw conflict("A location with this slug already exists.");
  }
  // Activating or deactivating a club is an owner-level decision.
  if (parsed.data.status && parsed.data.status !== existing.status && !a.globalRole) throw forbidden("Only academy owners can change a location's status.");
  const { openingHours, ...rest } = parsed.data;
  const data: Prisma.LocationUpdateInput = { ...rest, ...(openingHours !== undefined ? { openingHours: openingHours as Prisma.InputJsonValue } : {}) };
  return db.$transaction(async (tx) => {
    const loc = await tx.location.update({ where: { id: locationId }, data, select: locationSelect });
    await audit({ actorId: a.id, action: "location.updated", entityType: "Location", entityId: locationId, locationId, metadata: { fields: Object.keys(parsed.data) } }, tx);
    return loc;
  });
}

/* ------------------------------------------------------------------ Photos */

const MAX_PHOTOS = 12;

export async function addLocationPhoto(actor: Actor | null, locationId: string, input: unknown) {
  const a = await requirePermission(actor, "location.manage", { locationId });
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const count = await db.locationPhoto.count({ where: { locationId } });
  if (count >= MAX_PHOTOS) throw validation(`A location can have at most ${MAX_PHOTOS} photos.`);
  return db.$transaction(async (tx) => {
    const photo = await tx.locationPhoto.create({ data: { ...parsed.data, locationId, sortOrder: count } });
    await audit({ actorId: a.id, action: "location.photo_added", entityType: "LocationPhoto", entityId: photo.id, locationId }, tx);
    return photo;
  });
}

export async function removeLocationPhoto(actor: Actor | null, photoId: string): Promise<{ ok: true }> {
  const photo = await db.locationPhoto.findUnique({ where: { id: photoId } });
  if (!photo) throw notFound("Photo");
  const a = await requirePermission(actor, "location.manage", { locationId: photo.locationId });
  await db.$transaction(async (tx) => {
    await tx.locationPhoto.delete({ where: { id: photoId } });
    const rest = await tx.locationPhoto.findMany({ where: { locationId: photo.locationId }, orderBy: { sortOrder: "asc" } });
    await Promise.all(rest.map((p, i) => tx.locationPhoto.update({ where: { id: p.id }, data: { sortOrder: i } })));
    await audit({ actorId: a.id, action: "location.photo_removed", entityType: "LocationPhoto", entityId: photoId, locationId: photo.locationId }, tx);
  });
  return { ok: true };
}

export async function reorderLocationPhotos(actor: Actor | null, locationId: string, orderedIds: string[]) {
  const a = await requirePermission(actor, "location.manage", { locationId });
  const photos = await db.locationPhoto.findMany({ where: { locationId }, select: { id: true } });
  const ids = new Set(photos.map((p) => p.id));
  if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id))) throw validation("Photo list does not match this location.");
  await db.$transaction(async (tx) => {
    await Promise.all(orderedIds.map((id, i) => tx.locationPhoto.update({ where: { id }, data: { sortOrder: i } })));
    await audit({ actorId: a.id, action: "location.photos_reordered", entityType: "Location", entityId: locationId, locationId }, tx);
  });
  return db.locationPhoto.findMany({ where: { locationId }, orderBy: { sortOrder: "asc" } });
}

/* ------------------------------------------------------------------ Booking policy */

export async function upsertBookingPolicy(actor: Actor | null, locationId: string, input: unknown) {
  const a = await requirePermission(actor, "location.manage", { locationId });
  const parsed = bookingPolicySchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const loc = await db.location.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!loc) throw notFound("Location");
  return db.$transaction(async (tx) => {
    const policy = await tx.bookingPolicy.upsert({ where: { locationId }, create: { ...parsed.data, locationId }, update: parsed.data });
    await audit({ actorId: a.id, action: "location.policy_updated", entityType: "BookingPolicy", entityId: policy.id, locationId, metadata: parsed.data }, tx);
    return policy;
  });
}
