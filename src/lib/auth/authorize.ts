import type { GlobalRole, Role, StaffRole, UserStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { forbidden, unauthenticated } from "@/lib/errors";
import { GLOBAL_PERMISSIONS, type Permission } from "./permissions";

/** The authenticated principal every service receives. Built once per request from the session. */
export type Actor = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  globalRole: GlobalRole | null;
  emailVerifiedAt: Date | null;
  playerProfileId: string | null;
  memberships: { locationId: string; role: StaffRole }[];
};

export const ANONYMOUS: Actor | null = null;

// ---------------------------------------------------------------- Role -> permission map (DB authoritative, cached)

type PermMap = Map<Role, Set<Permission>>;
let cache: { map: PermMap; loadedAt: number } | null = null;
const TTL_MS = 60_000;

export async function loadRolePermissions(force = false): Promise<PermMap> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache.map;
  const rows = await db.rolePermission.findMany();
  const map: PermMap = new Map();
  for (const row of rows) {
    if (!map.has(row.role)) map.set(row.role, new Set());
    map.get(row.role)!.add(row.permission as Permission);
  }
  cache = { map, loadedAt: Date.now() };
  return map;
}

export function invalidatePermissionCache() {
  cache = null;
}

// ---------------------------------------------------------------- Checks

export type Scope = { locationId?: string | null };

/** All roles the actor holds, globally or at the given location. Every user is a PLAYER. */
function rolesFor(actor: Actor, locationId?: string | null): Role[] {
  const roles: Role[] = ["PLAYER"];
  if (actor.globalRole) roles.push(actor.globalRole);
  for (const m of actor.memberships) {
    if (locationId === undefined || locationId === null || m.locationId === locationId) roles.push(m.role);
  }
  return roles;
}

/**
 * Does the actor hold `permission`?
 * - Global roles are checked regardless of scope.
 * - Location roles only count when `scope.locationId` matches a membership, or when no scope is given
 *   (meaning "at any of my locations"; callers must then filter data with accessibleLocationIds).
 */
export async function can(actor: Actor | null, permission: Permission, scope: Scope = {}): Promise<boolean> {
  if (!actor || actor.status !== "ACTIVE") return false;
  const map = await loadRolePermissions();
  const global = GLOBAL_PERMISSIONS.has(permission);
  const roles = global ? rolesFor(actor).filter((r) => r === "SUPER_ADMIN" || r === "ACADEMY_OWNER" || r === "PLAYER") : rolesFor(actor, scope.locationId);
  return roles.some((r) => map.get(r)?.has(permission));
}

export async function requireActor(actor: Actor | null): Promise<Actor> {
  if (!actor) throw unauthenticated();
  if (actor.status !== "ACTIVE") throw forbidden("This account is suspended.");
  return actor;
}

/** Throws UNAUTHENTICATED / FORBIDDEN unless the actor holds the permission in scope. */
export async function requirePermission(actor: Actor | null, permission: Permission, scope: Scope = {}): Promise<Actor> {
  const a = await requireActor(actor);
  if (!(await can(a, permission, scope))) throw forbidden();
  return a;
}

/** Allows the owner of a record, or anyone holding `anyPermission` (optionally within a location). */
export async function requireSelfOrPermission(actor: Actor | null, ownerUserId: string, anyPermission: Permission, scope: Scope = {}): Promise<Actor> {
  const a = await requireActor(actor);
  if (a.id === ownerUserId) return a;
  if (await can(a, anyPermission, scope)) return a;
  throw forbidden();
}

export function isGlobalAdmin(actor: Actor | null): boolean {
  return !!actor && actor.status === "ACTIVE" && (actor.globalRole === "SUPER_ADMIN" || actor.globalRole === "ACADEMY_OWNER");
}

/** True when the actor has any staff capability (used to gate the admin shell; services still check every call). */
export function isStaff(actor: Actor | null): boolean {
  return !!actor && actor.status === "ACTIVE" && (isGlobalAdmin(actor) || actor.memberships.length > 0);
}

/**
 * Location ids the actor may act on with `permission`.
 * Returns "all" for global roles, otherwise the membership locations whose role grants the permission.
 */
export async function accessibleLocationIds(actor: Actor | null, permission: Permission): Promise<"all" | string[]> {
  if (!actor || actor.status !== "ACTIVE") return [];
  const map = await loadRolePermissions();
  if (actor.globalRole && map.get(actor.globalRole)?.has(permission)) return "all";
  const ids = new Set<string>();
  for (const m of actor.memberships) if (map.get(m.role)?.has(permission)) ids.add(m.locationId);
  return [...ids];
}

/** Prisma `where` fragment restricting rows to accessible locations. */
export async function locationWhere(actor: Actor | null, permission: Permission, field = "locationId"): Promise<Record<string, unknown>> {
  const ids = await accessibleLocationIds(actor, permission);
  if (ids === "all") return {};
  if (ids.length === 0) throw forbidden();
  return { [field]: { in: ids } };
}
