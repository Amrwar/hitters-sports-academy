import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requirePermission, type Actor } from "@/lib/auth/authorize";
import { globalRoleSchema, paginationSchema } from "@/lib/validation/schemas";
import { revokeAllSessions } from "./sessions";

export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  globalRole: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  playerProfile: { select: { id: true, level: true, side: true, homeLocationId: true, homeLocation: { select: { name: true, slug: true } } } },
  memberships: { where: { status: "ACTIVE" as const }, select: { locationId: true, role: true, location: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

export type UserSummary = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

/**
 * Lists users visible to the actor. Global roles see everyone; location staff see players whose home
 * location is one of theirs plus staff at those locations.
 */
export async function listUsers(actor: Actor | null, input: unknown = {}) {
  const a = await requirePermission(actor, "users.read");
  const { page, pageSize, q } = paginationSchema.parse(input);
  const scope = await accessibleLocationIds(a, "users.read");
  const where: Prisma.UserWhereInput = { status: { not: "DELETED" } };
  if (scope !== "all") {
    where.OR = [{ playerProfile: { homeLocationId: { in: scope } } }, { memberships: { some: { locationId: { in: scope }, status: "ACTIVE" } } }];
  }
  if (q) where.AND = [{ OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }];
  const [items, total] = await Promise.all([
    db.user.findMany({ where, select: userSummarySelect, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.user.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getUser(actor: Actor | null, userId: string): Promise<UserSummary> {
  const a = await requirePermission(actor, "users.read");
  const user = await db.user.findFirst({ where: { id: userId, status: { not: "DELETED" } }, select: userSummarySelect });
  if (!user) throw notFound("User");
  const scope = await accessibleLocationIds(a, "users.read");
  if (scope !== "all") {
    const visible = (user.playerProfile?.homeLocationId && scope.includes(user.playerProfile.homeLocationId)) || user.memberships.some((m) => scope.includes(m.locationId));
    if (!visible) throw forbidden();
  }
  return user;
}

/** Assigns or clears a global role. SUPER_ADMIN only (roles.manage). */
export async function setGlobalRole(actor: Actor | null, userId: string, roleInput: unknown) {
  const a = await requirePermission(actor, "roles.manage");
  const role = globalRoleSchema.parse(roleInput);
  if (a.id === userId && role !== "SUPER_ADMIN") throw validation("You cannot remove your own super admin role.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { globalRole: role } });
    await audit({ actorId: a.id, action: "user.global_role_set", entityType: "User", entityId: userId, metadata: { from: user.globalRole, to: role } }, tx);
  });
  return { userId, globalRole: role };
}

export async function setUserStatus(actor: Actor | null, userId: string, status: "ACTIVE" | "SUSPENDED") {
  const a = await requirePermission(actor, "users.suspend");
  if (a.id === userId) throw validation("You cannot suspend your own account.");
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound("User");
  // Only a super admin may suspend another global admin.
  if (target.globalRole && a.globalRole !== "SUPER_ADMIN") throw forbidden();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    await audit({ actorId: a.id, action: status === "SUSPENDED" ? "user.suspended" : "user.reactivated", entityType: "User", entityId: userId }, tx);
  });
  if (status === "SUSPENDED") await revokeAllSessions(userId);
  return { userId, status };
}

/** Audit log reader scoped to the actor's locations (global roles see everything). */
export async function listAuditLogs(actor: Actor | null, input: { locationId?: string; page?: number; pageSize?: number } = {}) {
  const a = await requirePermission(actor, "audit.read", { locationId: input.locationId });
  const { page, pageSize } = paginationSchema.parse(input);
  const scope = await accessibleLocationIds(a, "audit.read");
  const where: Prisma.AuditLogWhereInput = {};
  if (input.locationId) where.locationId = input.locationId;
  else if (scope !== "all") where.locationId = { in: scope };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { actor: { select: { name: true, email: true } } } }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export { can };
