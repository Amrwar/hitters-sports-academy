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
  bio: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  homeLocationId: z.string().cuid().nullable().optional(),
  visibility: z.enum(["PUBLIC", "MEMBERS", "PRIVATE"]).optional(),
  dateOfBirth: z.coerce.date().max(new Date(), "Date of birth must be in the past.").nullable().optional(),
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
    peakStartsAt: minutes.optional(),
    peakEndsAt: minutes.optional(),
    peakPriceCents: z.coerce.number().int().min(0).max(10_000_000).optional(),
  })
  .refine((v) => v.closesAt > v.opensAt, { message: "Closing time must be after opening time.", path: ["closesAt"] })
  .refine((v) => (v.peakStartsAt === undefined) === (v.peakEndsAt === undefined) && (v.peakStartsAt === undefined) === (v.peakPriceCents === undefined), {
    message: "Peak start, end and price must be set together.",
    path: ["peakStartsAt"],
  })
  .refine((v) => v.peakStartsAt === undefined || (v.peakEndsAt! > v.peakStartsAt && v.peakStartsAt >= v.opensAt && v.peakEndsAt! <= v.closesAt), {
    message: "Peak window must sit inside opening hours.",
    path: ["peakEndsAt"],
  });

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
  notes: z.string().trim().max(2000).optional(),
  scores: z.record(z.string(), z.number().min(0).max(10)).optional(),
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
