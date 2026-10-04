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
  // Assessments and levels
  "assessment.read",
  "assessment.create",
  "assessment.request.own",
  "assessment.schedule",
  "level.override",
  "levels.configure",
  "training.read",
  "training.record",
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
  // Bookings and payments
  "booking.create.own",
  "booking.read.own",
  "booking.cancel.own",
  "booking.read",
  "booking.manage",
  "payment.manage",
  // Games (planned sessions on a booking)
  "session.create.own",
  "session.participate.own",
  "session.read",
  "session.manage",
  "matchmaking.configure",
  // Academy: coaching, programs, packages
  "trainer.read",
  "trainer.manage",
  "trainer.self",
  "lesson.book.own",
  "lesson.read.own",
  "lesson.read",
  "lesson.manage",
  "program.manage",
  "program.enroll.own",
  "package.manage",
  "package.purchase.own",
  // Notifications and messaging
  "academy.configure",
  "notification.configure",
  "announcement.send",
  "message.participate",
  "message.moderate",
  // Messaging and audit
  "notification.send",
  "audit.read",
  // Global role administration
  "roles.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permissions that are never location scoped. */
export const GLOBAL_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(["location.create", "roles.manage", "users.suspend", "users.manage", "levels.configure", "matchmaking.configure", "notification.configure", "academy.configure"]);

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
    "assessment.schedule",
    "level.override",
    "training.read",
    "training.record",
    "location.read",
    "location.manage",
    "court.read",
    "court.manage",
    "availability.manage",
    "staff.read",
    "staff.manage",
    "finance.read",
    "booking.read",
    "booking.manage",
    "payment.manage",
    "session.read",
    "session.manage",
    "trainer.read",
    "trainer.manage",
    "lesson.read",
    "lesson.manage",
    "program.manage",
    "package.manage",
    "announcement.send",
    "message.moderate",
    "notification.send",
    "audit.read",
  ],
  RECEPTIONIST: ["users.read", "profile.read.any", "assessment.read", "assessment.schedule", "training.read", "location.read", "court.read", "staff.read", "booking.read", "booking.manage", "payment.manage", "session.read", "session.manage", "trainer.read", "lesson.read", "lesson.manage", "package.manage", "message.moderate", "notification.send"],
  TRAINER: ["users.read", "profile.read.any", "assessment.read", "training.read", "training.record", "location.read", "court.read", "booking.read", "session.read", "trainer.read", "trainer.self", "message.participate"],
  ASSESSOR: ["users.read", "profile.read.any", "assessment.read", "assessment.create", "assessment.schedule", "training.read", "location.read", "court.read", "session.read", "trainer.read"],
  FINANCE_MANAGER: ["users.read", "location.read", "court.read", "finance.read", "finance.manage", "booking.read", "payment.manage", "session.read", "trainer.read", "lesson.read", "package.manage", "audit.read"],
  PLAYER: ["profile.read.own", "profile.update.own", "assessment.request.own", "location.read", "court.read", "booking.create.own", "booking.read.own", "booking.cancel.own", "session.create.own", "session.participate.own", "lesson.book.own", "lesson.read.own", "program.enroll.own", "package.purchase.own", "message.participate"],
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
