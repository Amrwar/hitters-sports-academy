import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, playerSearchSchema, updateProfileSchema } from "@/lib/validation/schemas";
import { normalisePhone } from "./auth";
import { bookingSelect } from "./bookings";

export const profileSelect = {
  id: true,
  level: true,
  levelUpdatedAt: true,
  selfLevel: true,
  photoUrl: true,
  side: true,
  matchType: true,
  playStyle: true,
  yearsPlaying: true,
  preferredTimes: true,
  bio: true,
  dateOfBirth: true,
  visibility: true,
  homeLocationId: true,
  homeLocation: { select: { id: true, name: true, slug: true } },
  preferredLocations: { select: { id: true, name: true, slug: true }, orderBy: { name: "asc" as const } },
  user: { select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true, createdAt: true } },
  assessments: {
    orderBy: { assessedAt: "desc" as const },
    take: 5,
    select: { id: true, kind: true, level: true, previousLevel: true, notes: true, assessedAt: true, location: { select: { name: true } }, assessor: { select: { name: true } } },
  },
  _count: { select: { assessments: true, trainingRecords: true } },
} satisfies Prisma.PlayerProfileSelect;

export type ProfileView = Prisma.PlayerProfileGetPayload<{ select: typeof profileSelect }>;

/** Can the actor edit this player's profile? Owner always; staff with profile.update.any at the player's home location; global admins. */
async function canEditProfile(actor: Actor, profile: { user: { id: string }; homeLocationId: string | null }): Promise<boolean> {
  if (actor.id === profile.user.id) return true;
  if (actor.globalRole) return can(actor, "profile.update.any");
  if (!profile.homeLocationId) return false;
  return can(actor, "profile.update.any", { locationId: profile.homeLocationId });
}

async function staffCanRead(actor: Actor, homeLocationId: string | null): Promise<boolean> {
  const scope = await accessibleLocationIds(actor, "profile.read.any");
  return scope === "all" || (homeLocationId !== null && scope.includes(homeLocationId));
}

export async function getMyProfile(actor: Actor | null): Promise<ProfileView> {
  const a = await requireActor(actor);
  const profile = await db.playerProfile.findUnique({ where: { userId: a.id }, select: profileSelect });
  if (!profile) throw notFound("Profile");
  return profile;
}

/** Reads another player's profile, honouring visibility and staff scope. */
export async function getProfile(actor: Actor | null, profileId: string): Promise<ProfileView> {
  const a = await requireActor(actor);
  const profile = await db.playerProfile.findUnique({ where: { id: profileId }, select: profileSelect });
  if (!profile) throw notFound("Profile");
  if (profile.user.id === a.id) return profile;
  if (await staffCanRead(a, profile.homeLocationId)) return profile;
  if (profile.visibility === "PRIVATE") throw forbidden("This profile is private.");
  return profile;
}

/**
 * Updates editable profile fields. The official level is never accepted here: unknown keys are
 * stripped by the schema and `level` is only written by the assessment service.
 */
export async function updateProfile(actor: Actor | null, profileId: string, input: unknown): Promise<ProfileView> {
  const a = await requireActor(actor);
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const profile = await db.playerProfile.findUnique({ where: { id: profileId }, select: { id: true, homeLocationId: true, user: { select: { id: true, phone: true } } } });
  if (!profile) throw notFound("Profile");
  if (!(await canEditProfile(a, profile))) throw forbidden("You can only edit your own profile.");

  const { name, phone: rawPhone, preferredLocationIds, ...profileData } = parsed.data;
  const phone = normalisePhone(rawPhone);
  if (phone && phone !== profile.user.phone) {
    const taken = await db.user.findUnique({ where: { phone }, select: { id: true } });
    if (taken && taken.id !== profile.user.id) throw conflict("That phone number is already in use.");
  }
  const locationIds = [...new Set([...(profileData.homeLocationId ? [profileData.homeLocationId] : []), ...(preferredLocationIds ?? [])])];
  if (locationIds.length) {
    const found = await db.location.count({ where: { id: { in: locationIds }, status: { in: ["ACTIVE", "COMING_SOON"] } } });
    if (found !== locationIds.length) throw validation("Unknown location.", { homeLocationId: "Unknown location." });
  }

  const updated = await db.$transaction(async (tx) => {
    if (name !== undefined || phone !== undefined) {
      await tx.user.update({ where: { id: profile.user.id }, data: { ...(name !== undefined ? { name } : {}), ...(phone !== undefined ? { phone } : {}) } });
    }
    const p = await tx.playerProfile.update({
      where: { id: profileId },
      data: { ...profileData, ...(preferredLocationIds ? { preferredLocations: { set: preferredLocationIds.map((id) => ({ id })) } } : {}) },
      select: profileSelect,
    });
    await audit({ actorId: a.id, action: "profile.updated", entityType: "PlayerProfile", entityId: profileId, locationId: p.homeLocationId, metadata: { fields: Object.keys(parsed.data), self: a.id === profile.user.id } }, tx);
    return p;
  });
  return updated;
}

/* ------------------------------------------------------------------ History */

export type PlayerHistory = {
  bookings: Prisma.BookingGetPayload<{ select: typeof bookingSelect }>[];
  /** Completed sessions the player took part in, newest first (match results arrive with matchmaking). */
  matches: Prisma.BookingGetPayload<{ select: typeof bookingSelect }>[];
  training: Prisma.TrainingRecordGetPayload<{ include: { location: { select: { name: true } }; trainer: { select: { name: true } } } }>[];
};

/** Booking, match and training history. Self, or staff who can read the player's profile. */
export async function getPlayerHistory(actor: Actor | null, profileId: string, take = 50): Promise<PlayerHistory> {
  const a = await requireActor(actor);
  const profile = await db.playerProfile.findUnique({ where: { id: profileId }, select: { user: { select: { id: true } }, homeLocationId: true } });
  if (!profile) throw notFound("Profile");
  if (profile.user.id !== a.id && !(await staffCanRead(a, profile.homeLocationId))) throw forbidden();
  const userId = profile.user.id;
  const party: Prisma.BookingWhereInput = { OR: [{ playerId: userId }, { participants: { some: { userId, status: { in: ["JOINED", "INVITED"] } } } }] };
  const [bookings, matches, training] = await Promise.all([
    db.booking.findMany({ where: party, select: bookingSelect, orderBy: { startsAt: "desc" }, take }),
    db.booking.findMany({ where: { ...party, status: "COMPLETED" }, select: bookingSelect, orderBy: { startsAt: "desc" }, take }),
    db.trainingRecord.findMany({ where: { playerProfileId: profileId }, include: { location: { select: { name: true } }, trainer: { select: { name: true } } }, orderBy: { heldAt: "desc" }, take }),
  ]);
  return { bookings, matches, training };
}

export type SeasonStats = { gamesPlayed: number; courtMinutes: number; lessonsTaken: number };

/**
 * What a player has actually done, for their own home screen. "Assessments: 1" told them nothing; hours on
 * court and games played are the numbers anyone who plays keeps in their head anyway.
 *
 * Counts bookings the player either made or was in the lineup for, so a game someone else booked still
 * counts as a game they played.
 */
export async function getSeasonStats(actor: Actor | null): Promise<SeasonStats> {
  const a = await requireActor(actor);
  const party: Prisma.BookingWhereInput = {
    status: "COMPLETED",
    OR: [{ playerId: a.id }, { participants: { some: { userId: a.id, status: { in: ["JOINED", "INVITED"] } } } }],
  };
  const [courts, lessons] = await Promise.all([
    db.booking.aggregate({ where: party, _count: { _all: true }, _sum: { durationMinutes: true } }),
    db.lesson.count({ where: { playerId: a.id, status: "COMPLETED" } }),
  ]);
  return { gamesPlayed: courts._count._all, courtMinutes: courts._sum.durationMinutes ?? 0, lessonsTaken: lessons };
}

export type PlayerHit = { id: string; name: string; level: "A" | "B" | "C" | "D" | null; photoUrl: string | null; homeLocation: string | null };

/** Finds active members by name or email for invitations. Private profiles and the caller are never returned. */
export async function searchPlayers(actor: Actor | null, input: unknown): Promise<PlayerHit[]> {
  const a = await requireActor(actor);
  const parsed = playerSearchSchema.safeParse(input);
  if (!parsed.success) return [];
  const { q, take } = parsed.data;
  const rows = await db.user.findMany({
    where: {
      status: "ACTIVE",
      id: { not: a.id },
      OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { equals: q.toLowerCase() } }],
      playerProfile: { visibility: { not: "PRIVATE" } },
    },
    select: { id: true, name: true, playerProfile: { select: { level: true, photoUrl: true, homeLocation: { select: { name: true } } } } },
    orderBy: { name: "asc" },
    take,
  });
  return rows.map((u) => ({ id: u.id, name: u.name, level: u.playerProfile?.level ?? null, photoUrl: u.playerProfile?.photoUrl ?? null, homeLocation: u.playerProfile?.homeLocation?.name ?? null }));
}
