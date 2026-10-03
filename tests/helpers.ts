import type { GlobalRole, PlayerLevel, StaffRole } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { clearRateLimits } from "@/lib/auth/rate-limit";
import { invalidatePermissionCache, type Actor } from "@/lib/auth/authorize";
import { mailOutbox } from "@/lib/mail";
import { seedRolePermissions } from "@/server/services/permissions-seed";
import { buildActor } from "@/server/services/sessions";

export const PASSWORD = "Correct-horse-9";

export async function resetDb() {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE "AuditLog","Notification","Payment","BookingParticipant","Booking","Assessment","PricingRule","CourtClosure","CourtAvailability","Court","LocationPhoto","BookingPolicy","StaffMembership","PlayerProfile","VerificationToken","Session","RolePermission","Location","User" RESTART IDENTITY CASCADE`,
  );
  await seedRolePermissions(db);
  invalidatePermissionCache();
  clearRateLimits();
  mailOutbox.length = 0;
}

let counter = 0;

export async function makeLocation(slug = `loc-${++counter}`) {
  return db.location.create({ data: { slug, name: `HITTERS ${slug}`, city: "Cairo", area: "Area", address: "1 Court St" } });
}

export async function makeCourt(locationId: string, name = `Court ${++counter}`) {
  return db.court.create({ data: { locationId, name, type: "INDOOR" } });
}

type MakeUser = {
  email?: string;
  name?: string;
  globalRole?: GlobalRole | null;
  staff?: { locationId: string; role: StaffRole }[];
  homeLocationId?: string | null;
  level?: PlayerLevel | null;
  status?: "ACTIVE" | "SUSPENDED";
  verified?: boolean;
};

/** Creates a user with a profile and optional roles; returns the DB row and a ready Actor. */
export async function makeUser(opts: MakeUser = {}) {
  const n = ++counter;
  const user = await db.user.create({
    data: {
      email: opts.email ?? `user${n}@example.com`,
      name: opts.name ?? `User ${n}`,
      passwordHash: await hashPassword(PASSWORD),
      globalRole: opts.globalRole ?? null,
      status: opts.status ?? "ACTIVE",
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      playerProfile: { create: { homeLocationId: opts.homeLocationId ?? null, level: opts.level ?? null } },
      memberships: opts.staff ? { create: opts.staff.map((s) => ({ locationId: s.locationId, role: s.role })) } : undefined,
    },
    include: { playerProfile: true },
  });
  const actor = (await buildActor(user.id)) as Actor;
  return { user, actor, profileId: user.playerProfile!.id };
}

export function lastMailTo(email: string) {
  return [...mailOutbox].reverse().find((m) => m.to === email);
}

export function tokenFromMail(text: string, param: string): string {
  const m = text.match(new RegExp(`[?&]${param}=([A-Za-z0-9_-]+)`));
  if (!m) throw new Error(`No ${param} in mail: ${text}`);
  return m[1];
}

/** Asserts an async call rejects with an AppError of the given code. */
export async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code !== code) throw new Error(`Expected ${code} but got ${err.code ?? "no code"}: ${err.message}`);
    return;
  }
  throw new Error(`Expected ${code} but the call succeeded.`);
}
