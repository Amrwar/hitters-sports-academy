import type { GlobalRole, Role, StaffRole } from "@prisma/client";

/**
 * Permission catalogue. Keep keys stable: they are persisted in RolePermission.
 * Suffix conventions: ".own" applies to the actor's own records, everything else is scoped by location
 * unless the permission is marked global below.
 */
export const PERMISSIONS = [
  // Accounts and players
  "users.read",
  "users.manage",
  "users.suspend",
  "profile.read.own",
  "profile.update.own",
  "profile.read.any",
  "profile.update.any",
  // Assessments
  "assessment.read",
  "assessment.create",
  // Locations and courts
  "location.read",
  "location.create",
  "location.manage",
  "court.read",
  "court.manage",
  "availability.manage",
  // Staff
  "staff.read",
  "staff.manage",
  // Finance
  "finance.read",
  "finance.manage",
  // Messaging and audit
  "notification.send",
  "audit.read",
  // Global role administration
  "roles.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permissions that are never location scoped. */
export const GLOBAL_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(["location.create", "roles.manage", "users.suspend", "users.manage"]);

const ALL = [...PERMISSIONS];

/**
 * Default role -> permission matrix. Seeded into RolePermission, which is authoritative at runtime.
 * SUPER_ADMIN and ACADEMY_OWNER are global; the other staff roles apply at the locations of their memberships.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  ACADEMY_OWNER: ALL.filter((p) => p !== "roles.manage"),
  LOCATION_MANAGER: [
    "users.read",
    "profile.read.any",
    "profile.update.any",
    "assessment.read",
    "location.read",
    "location.manage",
    "court.read",
    "court.manage",
    "availability.manage",
    "staff.read",
    "staff.manage",
    "finance.read",
    "notification.send",
    "audit.read",
  ],
  RECEPTIONIST: ["users.read", "profile.read.any", "assessment.read", "location.read", "court.read", "staff.read", "notification.send"],
  TRAINER: ["users.read", "profile.read.any", "assessment.read", "location.read", "court.read"],
  ASSESSOR: ["users.read", "profile.read.any", "assessment.read", "assessment.create", "location.read", "court.read"],
  FINANCE_MANAGER: ["users.read", "location.read", "court.read", "finance.read", "finance.manage", "audit.read"],
  PLAYER: ["profile.read.own", "profile.update.own", "location.read", "court.read"],
};

/** Staff roles a LOCATION_MANAGER may grant at their own location. Only global roles may grant LOCATION_MANAGER. */
export const MANAGER_GRANTABLE_ROLES: readonly StaffRole[] = ["RECEPTIONIST", "TRAINER", "ASSESSOR", "FINANCE_MANAGER"];

export const GLOBAL_ROLES: readonly GlobalRole[] = ["SUPER_ADMIN", "ACADEMY_OWNER"];
export const STAFF_ROLES: readonly StaffRole[] = ["LOCATION_MANAGER", "RECEPTIONIST", "TRAINER", "ASSESSOR", "FINANCE_MANAGER"];

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ACADEMY_OWNER: "Academy owner",
  LOCATION_MANAGER: "Location manager",
  RECEPTIONIST: "Receptionist",
  TRAINER: "Trainer",
  ASSESSOR: "Assessor",
  FINANCE_MANAGER: "Finance manager",
  PLAYER: "Player",
};
