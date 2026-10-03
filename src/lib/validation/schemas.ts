import { z } from "zod";

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);

/** E.164-ish; Egyptian local numbers are normalised by the service. */
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, "Enter a valid phone number.")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128)
  .refine((v) => /[a-z]/i.test(v) && /[0-9]/.test(v), "Include at least one letter and one number.");

export const name = z.string().trim().min(2, "Enter your name.").max(80);

export const registerSchema = z.object({ name, email, phone, password });
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.") });
export const requestResetSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password });
export const verifyEmailSchema = z.object({ token: z.string().min(10) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

export const levelSchema = z.enum(["A", "B", "C", "D"]);
export const sideSchema = z.enum(["LEFT", "RIGHT", "BOTH"]);

export const updateProfileSchema = z.object({
  name: name.optional(),
  phone,
  side: sideSchema.optional(),
  bio: z.string().trim().max(500).optional().or(z.literal("").transform(() => null)),
  homeLocationId: z.string().cuid().nullable().optional(),
  visibility: z.enum(["PUBLIC", "MEMBERS", "PRIVATE"]).optional(),
  dateOfBirth: z.coerce.date().max(new Date(), "Date of birth must be in the past.").nullable().optional(),
  photoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === "" || /^https?:\/\/[^\s]+$/i.test(u), "Use an https image URL.")
    .transform((u) => (u === "" ? null : u))
    .optional(),
  selfLevel: levelSchema.nullable().optional(),
  matchType: z.enum(["FRIENDLY", "COMPETITIVE", "ANY"]).optional(),
  playStyle: z.string().trim().max(80).optional().or(z.literal("").transform(() => null)),
  yearsPlaying: z.coerce.number().int().min(0).max(60).nullable().optional(),
  preferredTimes: z.array(z.enum(PREFERRED_TIME_KEYS)).max(6).optional(),
  preferredLocationIds: z.array(z.string().cuid()).max(5).optional(),
});

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes.")
  .min(2)
  .max(60);

export const locationSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  area: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(200),
  timezone: z.string().trim().min(3).max(60).default("Africa/Cairo"),
  phone: z.string().trim().max(30).optional().or(z.literal("").transform(() => undefined)),
  email: email.optional().or(z.literal("").transform(() => undefined)),
  status: z.enum(["ACTIVE", "INACTIVE", "COMING_SOON"]).default("ACTIVE"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});
export const updateLocationSchema = locationSchema.partial();

export const courtSchema = z.object({
  locationId: z.string().cuid(),
  name: z.string().trim().min(1).max(40),
  type: z.enum(["INDOOR", "OUTDOOR", "PANORAMIC"]),
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  surface: z.string().trim().max(40).optional(),
});
export const updateCourtSchema = courtSchema.omit({ locationId: true }).partial();

const minutes = z.coerce.number().int().min(0).max(24 * 60);

export const availabilitySchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    opensAt: minutes,
    closesAt: minutes,
    slotMinutes: z.coerce.number().int().refine((v) => [30, 60, 90, 120].includes(v), "Slot must be 30, 60, 90 or 120 minutes.").default(60),
    priceCents: z.coerce.number().int().min(0).max(10_000_000),
  })
  .refine((v) => v.closesAt > v.opensAt, { message: "Closing time must be after opening time.", path: ["closesAt"] })
  .refine((v) => (v.closesAt - v.opensAt) % v.slotMinutes === 0 || v.closesAt - v.opensAt >= v.slotMinutes, { message: "Window is shorter than one slot.", path: ["closesAt"] });

export const closureSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "End must be after start.", path: ["endsAt"] });

export const staffRoleSchema = z.enum(["LOCATION_MANAGER", "RECEPTIONIST", "TRAINER", "ASSESSOR", "FINANCE_MANAGER"]);
export const globalRoleSchema = z.enum(["SUPER_ADMIN", "ACADEMY_OWNER"]).nullable();

export const grantStaffSchema = z.object({ userId: z.string().cuid(), locationId: z.string().cuid(), role: staffRoleSchema });

export const assessmentSchema = z.object({
  playerProfileId: z.string().cuid(),
  locationId: z.string().cuid(),
  level: levelSchema,
  kind: z.enum(["INITIAL", "REASSESSMENT", "LEVEL_CHANGE"]).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  staffNotes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  scores: z.record(z.string(), z.coerce.number().min(0).max(10)).optional(),
  requestId: z.string().cuid().optional().or(z.literal("").transform(() => undefined)),
  assessedAt: z.coerce.date().optional(),
});

export const requestAssessmentSchema = z.object({
  locationId: z.string().cuid(),
  note: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});

export const scheduleAssessmentSchema = z.object({
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60_000, "Pick a time in the future."),
  assessorId: z.string().cuid().optional().or(z.literal("").transform(() => undefined)),
});

export const levelChangeSchema = z.object({
  playerProfileId: z.string().cuid(),
  level: levelSchema,
  reason: z.string().trim().min(5, "Give a reason for the change.").max(500),
});

export const levelDefinitionsSchema = z
  .array(
    z.object({
      level: levelSchema,
      rank: z.coerce.number().int().min(1).max(4),
      label: z.string().trim().min(2).max(40),
      description: z.string().trim().min(5).max(500),
    }),
  )
  .length(4, "Provide all four levels.");

export const trainingRecordSchema = z.object({
  playerProfileId: z.string().cuid(),
  locationId: z.string().cuid(),
  kind: z.enum(["PRIVATE", "PROGRAM", "CLINIC", "ASSESSMENT"]).default("PRIVATE"),
  title: z.string().trim().min(2).max(120),
  heldAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
  notes: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
  trainerId: z.string().cuid().optional().or(z.literal("").transform(() => undefined)),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});

/** Turn a ZodError into our field error map. */
export function fieldErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/* ------------------------------------------------------------------ Location management (phase: courts) */

import { FACILITY_KEYS, PREFERRED_TIME_KEYS } from "@/lib/catalog";
import { isValidTimeZone } from "@/lib/time";

const minutesOfDay = z.coerce.number().int().min(0).max(24 * 60);

/** Seven entries, Sunday first; null = closed that day. */
export const openingHoursSchema = z
  .array(z.object({ opensAt: minutesOfDay, closesAt: minutesOfDay }).nullable())
  .length(7, "Provide all seven days.")
  .refine((days) => days.every((d) => !d || d.closesAt > d.opensAt), "Closing time must be after opening time.");

export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const locationDetailsSchema = z.object({
  slug: slug.optional(),
  name: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(60).optional(),
  area: z.string().trim().min(2).max(80).optional(),
  address: z.string().trim().min(5).max(200).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("").transform(() => null)),
  timezone: z.string().trim().refine(isValidTimeZone, "Unknown timezone.").optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("").transform(() => null)),
  email: email.optional().or(z.literal("").transform(() => null)),
  status: z.enum(["ACTIVE", "INACTIVE", "COMING_SOON"]).optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  facilities: z.array(z.enum(FACILITY_KEYS)).max(FACILITY_KEYS.length).optional(),
  openingHours: openingHoursSchema.optional(),
});

export const photoSchema = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => /^https?:\/\/[^\s]+$/i.test(u) || /^\/brand\/[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(u), "Use an https URL or a brand library photo."),
  alt: z.string().trim().max(200).optional(),
});

export const bookingPolicySchema = z.object({
  advanceBookingDays: z.coerce.number().int().min(1).max(365),
  minNoticeMinutes: z.coerce.number().int().min(0).max(24 * 60 * 7),
  cancellationCutoffHours: z.coerce.number().int().min(0).max(24 * 30),
  maxActiveBookingsPerPlayer: z.coerce.number().int().min(1).max(50),
  requireVerifiedEmail: z.coerce.boolean(),
  allowedDurations: z.array(z.coerce.number().int().refine((v) => [30, 60, 90, 120, 150, 180].includes(v), "Unsupported duration.")).min(1).max(6),
});

export const courtDetailsSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  type: z.enum(["INDOOR", "OUTDOOR", "PANORAMIC"]).optional(),
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  surface: z.string().trim().max(40).optional().or(z.literal("").transform(() => null)),
  description: z.string().trim().max(500).optional().or(z.literal("").transform(() => null)),
  durationsMinutes: z.array(z.coerce.number().int().refine((v) => [30, 60, 90, 120, 150, 180].includes(v), "Unsupported duration.")).max(6).optional(),
});

export const pricingRuleSchema = z
  .object({
    courtId: z.string().cuid().nullable().optional(),
    name: z.string().trim().min(2).max(60),
    kind: z.enum(["PEAK", "OFF_PEAK", "WEEKEND", "MEMBERSHIP_DISCOUNT", "CUSTOM"]),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    startsAt: minutesOfDay.nullable().optional(),
    endsAt: minutesOfDay.nullable().optional(),
    priceCents: z.coerce.number().int().min(0).max(10_000_000).nullable().optional(),
    adjustmentPercent: z.coerce.number().int().min(-100).max(300).nullable().optional(),
    membershipTier: z.string().trim().max(40).nullable().optional(),
    priority: z.coerce.number().int().min(0).max(1000).default(100),
    active: z.coerce.boolean().default(true),
    validFrom: z.coerce.date().nullable().optional(),
    validTo: z.coerce.date().nullable().optional(),
  })
  .refine((r) => (r.priceCents ?? null) !== null || (r.adjustmentPercent ?? null) !== null, { message: "Set a price or a percentage adjustment.", path: ["priceCents"] })
  .refine((r) => (r.startsAt == null) === (r.endsAt == null), { message: "Set both start and end time, or neither.", path: ["endsAt"] })
  .refine((r) => r.startsAt == null || r.endsAt! > r.startsAt, { message: "End time must be after start time.", path: ["endsAt"] })
  .refine((r) => !r.validFrom || !r.validTo || r.validTo > r.validFrom, { message: "Valid-to must be after valid-from.", path: ["validTo"] });

/** Closure input as wall-clock times in the location timezone (datetime-local values). */
export const closureLocalSchema = z
  .object({
    startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter a start time."),
    endLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter an end time."),
    reason: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((v) => v.endLocal > v.startLocal, { message: "End must be after start.", path: ["endLocal"] });

export const dateISOSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/* ------------------------------------------------------------------ Bookings (phase: reservations) */

export const bookingRequestSchema = z.object({
  courtId: z.string().cuid(),
  dateISO: dateISOSchema,
  startMinutes: z.coerce.number().int().min(0).max(24 * 60 - 30),
  durationMinutes: z.coerce.number().int().min(30).max(240),
});
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export const createBookingSchema = bookingRequestSchema.extend({
  /** Staff may book on behalf of a member... */
  playerId: z.string().cuid().optional(),
  /** ...or a walk-in guest without an account. */
  guestName: z.string().trim().min(2).max(80).optional().or(z.literal("").transform(() => undefined)),
  guestPhone: z.string().trim().max(30).optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  participantIds: z.array(z.string().cuid()).max(3).optional(),
});

export const cancelBookingSchema = z.object({ reason: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)) });

export const recordPaymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "WALLET"]),
  status: z.enum(["PAID", "WAIVED"]).default("PAID"),
});

export const bookingListSchema = z.object({
  locationId: z.string().cuid(),
  dateISO: dateISOSchema.optional(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

/* ------------------------------------------------------------------ Game sessions (phase: games) */

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

export const gameFormatSchema = z.enum(["SINGLES", "DOUBLES", "OPEN"]);
export const gameVisibilitySchema = z.enum(["PRIVATE", "PUBLIC"]);
export const gameCostModeSchema = z.enum(["FREE", "SPLIT_EVENLY", "ORGANIZER_PAYS", "FIXED_PER_PLAYER"]);
export const gameStatusSchema = z.enum(["DRAFT", "OPEN", "FULL", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

const gameDetails = z.object({
  format: gameFormatSchema.default("DOUBLES"),
  maxPlayers: z.coerce.number().int().min(2).max(16).optional(),
  levels: z.array(levelSchema).max(4).default([]),
  matchType: z.enum(["FRIENDLY", "COMPETITIVE", "ANY"]).default("ANY"),
  visibility: gameVisibilitySchema.default("PRIVATE"),
  openToRequests: z.coerce.boolean().default(false),
  joinPolicy: z.enum(["OPEN", "SOLO_ONLY", "PAIRS_ONLY"]).default("OPEN"),
  levelPolicy: z.enum(["EXACT", "ADJACENT"]).default("EXACT"),
  costMode: gameCostModeSchema.default("SPLIT_EVENLY"),
  costPerPlayerCents: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  description: optionalText(500),
  notes: optionalText(500),
});

const fixedCostNeedsAmount = (v: { costMode?: string; costPerPlayerCents?: number | null }, ctx: z.RefinementCtx) => {
  if (v.costMode === "FIXED_PER_PLAYER" && (v.costPerPlayerCents ?? 0) <= 0) ctx.addIssue({ code: "custom", path: ["costPerPlayerCents"], message: "Enter the amount each player pays." });
};

export const createGameSessionSchema = gameDetails.extend({ bookingId: z.string().cuid(), inviteUserIds: z.array(z.string().cuid()).max(15).default([]), pairId: z.string().cuid().optional() }).superRefine(fixedCostNeedsAmount);
export const updateGameSessionSchema = gameDetails.partial().superRefine(fixedCostNeedsAmount);

export const inviteToGameSchema = z.object({ userIds: z.array(z.string().cuid()).min(1).max(15) });
export const cancelGameSchema = z.object({ reason: optionalText(500) });

export const gameDiscoverSchema = z.object({
  locationId: z.string().cuid().optional(),
  level: levelSchema.optional(),
  dateISO: dateISOSchema.optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export const gameListSchema = z.object({
  locationId: z.string().cuid().optional(),
  status: gameStatusSchema.optional(),
  scope: z.enum(["upcoming", "all"]).default("upcoming"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

export const playerSearchSchema = z.object({ q: z.string().trim().min(2).max(80), take: z.coerce.number().int().min(1).max(20).default(8) });

/* ------------------------------------------------------------------ Matchmaking (phase: matchmaking) */

export const findMatchesSchema = z.object({
  dateISO: dateISOSchema.optional(),
  startMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  endMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  locationIds: z.array(z.string().cuid()).max(10).default([]),
  /** SOLO = one spot for me; PAIR = both spots for my pair. */
  kind: z.enum(["SOLO", "PAIR"]).default("SOLO"),
  pairId: z.string().cuid().optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export const joinRequestSchema = z.object({
  kind: z.enum(["SOLO", "PAIR"]).default("SOLO"),
  pairId: z.string().cuid().optional(),
  message: z.string().trim().max(300).optional().or(z.literal("").transform(() => undefined)),
});

export const decideRequestSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  note: z.string().trim().max(300).optional().or(z.literal("").transform(() => undefined)),
});

export const pairProposalSchema = z.object({ partnerUserId: z.string().cuid(), name: z.string().trim().max(60).optional().or(z.literal("").transform(() => undefined)) });

export const matchmakingConfigSchema = z.object({
  allowAdjacentLevels: z.coerce.boolean(),
  requestExpiryHours: z.coerce.number().int().min(1).max(24 * 14),
  maxOpenRequests: z.coerce.number().int().min(1).max(20),
});
