import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, requirePermission, type Actor } from "@/lib/auth/authorize";
import { MANAGER_GRANTABLE_ROLES } from "@/lib/auth/permissions";
import { fieldErrors, grantStaffSchema } from "@/lib/validation/schemas";
import { notify } from "./notifications";

export const membershipSelect = {
  id: true,
  role: true,
  status: true,
  createdAt: true,
  locationId: true,
  location: { select: { id: true, name: true, slug: true } },
  user: { select: { id: true, name: true, email: true, status: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.StaffMembershipSelect;

export type MembershipView = Prisma.StaffMembershipGetPayload<{ select: typeof membershipSelect }>;

export async function listStaff(actor: Actor | null, locationId?: string): Promise<MembershipView[]> {
  const a = await requirePermission(actor, "staff.read", { locationId });
  const scope = await accessibleLocationIds(a, "staff.read");
  const where: Prisma.StaffMembershipWhereInput = { status: "ACTIVE" };
  if (locationId) where.locationId = locationId;
  else if (scope !== "all") where.locationId = { in: scope };
  return db.staffMembership.findMany({ where, select: membershipSelect, orderBy: [{ location: { name: "asc" } }, { role: "asc" }, { createdAt: "asc" }] });
}

/**
 * Grants a location role. Global admins may grant any role anywhere; a LOCATION_MANAGER may grant
 * non-manager roles at their own location only.
 */
export async function grantStaffRole(actor: Actor | null, input: unknown): Promise<MembershipView> {
  const parsed = grantStaffSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { userId, locationId, role } = parsed.data;
  const a = await requirePermission(actor, "staff.manage", { locationId });
  if (!a.globalRole && !MANAGER_GRANTABLE_ROLES.includes(role)) throw forbidden("Only academy owners can appoint location managers.");

  const [user, location] = await Promise.all([db.user.findUnique({ where: { id: userId }, select: { id: true, status: true, name: true } }), db.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } })]);
  if (!user || user.status === "DELETED") throw notFound("User");
  if (user.status === "SUSPENDED") throw validation("Suspended accounts cannot hold staff roles.");
  if (!location) throw notFound("Location");

  const membership = await db.$transaction(async (tx) => {
    const m = await tx.staffMembership.upsert({
      where: { userId_locationId_role: { userId, locationId, role } },
      create: { userId, locationId, role, createdById: a.id },
      update: { status: "ACTIVE", createdById: a.id },
      select: membershipSelect,
    });
    await audit({ actorId: a.id, action: "staff.granted", entityType: "StaffMembership", entityId: m.id, locationId, metadata: { userId, role } }, tx);
    return m;
  });
  await notify(userId, { type: "staff.granted", url: "/admin", data: { role: role.toLowerCase().replace("_", " "), club: location.name, locationId } });
  return membership;
}

export async function revokeStaffRole(actor: Actor | null, membershipId: string): Promise<{ ok: true }> {
  const m = await db.staffMembership.findUnique({ where: { id: membershipId }, select: { id: true, userId: true, locationId: true, role: true, status: true } });
  if (!m) throw notFound("Membership");
  const a = await requirePermission(actor, "staff.manage", { locationId: m.locationId });
  if (!a.globalRole && !MANAGER_GRANTABLE_ROLES.includes(m.role)) throw forbidden("Only academy owners can remove location managers.");
  if (m.userId === a.id) throw validation("You cannot revoke your own role.");
  await db.$transaction(async (tx) => {
    await tx.staffMembership.update({ where: { id: membershipId }, data: { status: "INACTIVE" } });
    await audit({ actorId: a.id, action: "staff.revoked", entityType: "StaffMembership", entityId: membershipId, locationId: m.locationId, metadata: { userId: m.userId, role: m.role } }, tx);
  });
  return { ok: true };
}
