import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, locationSchema, updateLocationSchema } from "@/lib/validation/schemas";

export const locationSelect = {
  id: true,
  slug: true,
  name: true,
  city: true,
  area: true,
  address: true,
  timezone: true,
  phone: true,
  email: true,
  status: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  _count: { select: { courts: true, memberships: true, homePlayers: true } },
} satisfies Prisma.LocationSelect;

export type LocationView = Prisma.LocationGetPayload<{ select: typeof locationSelect }>;

/** Public, read-only list for players (ACTIVE and COMING_SOON only). Anyone signed in may call this. */
export async function listPublicLocations() {
  return db.location.findMany({ where: { status: { in: ["ACTIVE", "COMING_SOON"] } }, select: locationSelect, orderBy: { name: "asc" } });
}

/** Staff list: global roles see every location, staff see the locations they belong to. */
export async function listManagedLocations(actor: Actor | null): Promise<LocationView[]> {
  const a = await requireActor(actor);
  const scope = await accessibleLocationIds(a, "location.read");
  if (scope !== "all" && scope.length === 0) return [];
  return db.location.findMany({ where: scope === "all" ? {} : { id: { in: scope } }, select: locationSelect, orderBy: { name: "asc" } });
}

export async function getLocation(actor: Actor | null, idOrSlug: string): Promise<LocationView> {
  await requireActor(actor);
  const loc = await db.location.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, select: locationSelect });
  if (!loc) throw notFound("Location");
  if (loc.status === "INACTIVE") {
    // Inactive locations are hidden from players; staff of that location and global admins may still see them.
    await requirePermission(actor, "location.manage", { locationId: loc.id });
  }
  return loc;
}

export async function createLocation(actor: Actor | null, input: unknown): Promise<LocationView> {
  const a = await requirePermission(actor, "location.create");
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const exists = await db.location.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
  if (exists) throw conflict("A location with this slug already exists.");
  return db.$transaction(async (tx) => {
    const loc = await tx.location.create({ data: parsed.data, select: locationSelect });
    await audit({ actorId: a.id, action: "location.created", entityType: "Location", entityId: loc.id, locationId: loc.id }, tx);
    return loc;
  });
}

export async function updateLocation(actor: Actor | null, locationId: string, input: unknown): Promise<LocationView> {
  const a = await requirePermission(actor, "location.manage", { locationId });
  const parsed = updateLocationSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const existing = await db.location.findUnique({ where: { id: locationId }, select: { id: true, slug: true } });
  if (!existing) throw notFound("Location");
  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    const taken = await db.location.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
    if (taken) throw conflict("A location with this slug already exists.");
  }
  // Location managers may not deactivate their own location; that is an owner-level decision.
  if (parsed.data.status === "INACTIVE" && !a.globalRole) throw forbidden("Only academy owners can deactivate a location.");
  return db.$transaction(async (tx) => {
    const loc = await tx.location.update({ where: { id: locationId }, data: parsed.data, select: locationSelect });
    await audit({ actorId: a.id, action: "location.updated", entityType: "Location", entityId: locationId, locationId, metadata: { fields: Object.keys(parsed.data) } }, tx);
    return loc;
  });
}
