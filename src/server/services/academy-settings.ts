/**
 * The academy's own identity: its name, how players reach it, and the policy wording shown before someone
 * pays. One row, read on almost every page, so it is cached for a minute and never blocks a render: if the
 * row is missing or the database is unreachable, the defaults below are used.
 */
import type { AcademySettings } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { validation } from "@/lib/errors";
import { requirePermission, type Actor } from "@/lib/auth/authorize";
import { academySettingsSchema, fieldErrors } from "@/lib/validation/schemas";

export type AcademyProfile = {
  name: string;
  tagline: string | null;
  supportEmail: string;
  supportPhone: string | null;
  defaultTimezone: string;
  currency: string;
  cancellationPolicy: string;
};

export const ACADEMY_DEFAULTS: AcademyProfile = {
  name: "HITTERS Sports Academy",
  tagline: null,
  supportEmail: "hello@hitters.academy",
  supportPhone: null,
  defaultTimezone: "Africa/Cairo",
  currency: "EGP",
  cancellationPolicy: "Free cancellation up to 12 hours before the booking. Later cancellations are charged in full.",
};

const TTL_MS = 60_000;
let cache: { row: AcademyProfile; at: number } | null = null;

export function invalidateAcademySettingsCache() {
  cache = null;
}

const toProfile = (row: AcademySettings): AcademyProfile => ({
  name: row.name,
  tagline: row.tagline,
  supportEmail: row.supportEmail,
  supportPhone: row.supportPhone,
  defaultTimezone: row.defaultTimezone,
  currency: row.currency,
  cancellationPolicy: row.cancellationPolicy,
});

/** Never throws: a page that only needs the academy's name should not fail because of it. */
export async function getAcademySettings(): Promise<AcademyProfile> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.row;
  try {
    const row = await db.academySettings.findUnique({ where: { id: "default" } });
    const profile = row ? toProfile(row) : ACADEMY_DEFAULTS;
    cache = { row: profile, at: Date.now() };
    return profile;
  } catch {
    return ACADEMY_DEFAULTS;
  }
}

/** Creates the row on first read from the admin screen, so the form always has something to edit. */
export async function getEditableAcademySettings(actor: Actor | null): Promise<AcademyProfile> {
  await requirePermission(actor, "academy.configure");
  const existing = await db.academySettings.findUnique({ where: { id: "default" } });
  if (existing) return toProfile(existing);
  const created = await db.academySettings.create({ data: { id: "default" } }).catch(() => db.academySettings.findUniqueOrThrow({ where: { id: "default" } }));
  invalidateAcademySettingsCache();
  return toProfile(created);
}

export async function updateAcademySettings(actor: Actor | null, input: unknown): Promise<AcademyProfile> {
  const a = await requirePermission(actor, "academy.configure");
  const parsed = academySettingsSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const data = { ...parsed.data, updatedById: a.id };
  const row = await db.academySettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  await audit({ actorId: a.id, action: "academy.configured", entityType: "AcademySettings", entityId: "default", metadata: { fields: Object.keys(parsed.data) } });
  invalidateAcademySettingsCache();
  return toProfile(row);
}
