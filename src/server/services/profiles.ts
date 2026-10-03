import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, updateProfileSchema } from "@/lib/validation/schemas";
import { normalisePhone } from "./auth";

export const profileSelect = {
  id: true,
  level: true,
  levelUpdatedAt: true,
  side: true,
  bio: true,
  dateOfBirth: true,
  visibility: true,
  homeLocationId: true,
  homeLocation: { select: { id: true, name: true, slug: true } },
  user: { select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true, createdAt: true } },
  assessments: { orderBy: { assessedAt: "desc" as const }, take: 5, select: { id: true, level: true, previousLevel: true, assessedAt: true, location: { select: { name: true } }, assessor: { select: { name: true } } } },
} satisfies Prisma.PlayerProfileSelect;

export type ProfileView = Prisma.PlayerProfileGetPayload<{ select: typeof profileSelect }>;

/** Can the actor edit this player's profile? Owner always; staff with profile.update.any at the player's home location; global admins. */
async function canEditProfile(actor: Actor, profile: { user: { id: string }; homeLocationId: string | null }): Promise<boolean> {
  if (actor.id === profile.user.id) return true;
  if (actor.globalRole) return can(actor, "profile.update.any");
  if (!profile.homeLocationId) return false;
  return can(actor, "profile.update.any", { locationId: profile.homeLocationId });
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
  const staffScope = await accessibleLocationIds(a, "profile.read.any");
  const staffCanRead = staffScope === "all" || (profile.homeLocationId !== null && staffScope.includes(profile.homeLocationId));
  if (staffCanRead) return profile;
  if (profile.visibility === "PRIVATE") throw forbidden("This profile is private.");
  // MEMBERS and PUBLIC are readable by any signed-in player.
  return profile;
}

export async function updateProfile(actor: Actor | null, profileId: string, input: unknown): Promise<ProfileView> {
  const a = await requireActor(actor);
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const profile = await db.playerProfile.findUnique({ where: { id: profileId }, select: { id: true, homeLocationId: true, user: { select: { id: true, phone: true } } } });
  if (!profile) throw notFound("Profile");
  if (!(await canEditProfile(a, profile))) throw forbidden("You can only edit your own profile.");

  const { name, phone: rawPhone, ...profileData } = parsed.data;
  const phone = normalisePhone(rawPhone);
  if (phone && phone !== profile.user.phone) {
    const taken = await db.user.findUnique({ where: { phone }, select: { id: true } });
    if (taken && taken.id !== profile.user.id) throw conflict("That phone number is already in use.");
  }
  if (profileData.homeLocationId) {
    const loc = await db.location.findUnique({ where: { id: profileData.homeLocationId }, select: { id: true } });
    if (!loc) throw validation("Unknown location.", { homeLocationId: "Unknown location." });
  }

  const updated = await db.$transaction(async (tx) => {
    if (name !== undefined || phone !== undefined) {
      await tx.user.update({ where: { id: profile.user.id }, data: { ...(name !== undefined ? { name } : {}), ...(phone !== undefined ? { phone } : {}) } });
    }
    const p = await tx.playerProfile.update({ where: { id: profileId }, data: profileData, select: profileSelect });
    await audit({ actorId: a.id, action: "profile.updated", entityType: "PlayerProfile", entityId: profileId, locationId: p.homeLocationId, metadata: { fields: Object.keys(parsed.data), self: a.id === profile.user.id } }, tx);
    return p;
  });
  return updated;
}
