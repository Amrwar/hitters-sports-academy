import type { BookingPolicy, Court, CourtAvailability, CourtClosure, CourtStatus, CourtType, PricingRule } from "@prisma/client";
import { db } from "@/lib/db";
import { forbidden, notFound, validation } from "@/lib/errors";
import { can, requireActor, type Actor } from "@/lib/auth/authorize";
import { dayOfWeekISO, zonedToUtc } from "@/lib/time";
import { dateISOSchema, type OpeningHours } from "@/lib/validation/schemas";
import { quotePrice } from "./pricing";

/* ------------------------------------------------------------------ Pure engine */

export type SlotStatus = "available" | "booked" | "past" | "too_soon" | "outside_window" | "closed" | "maintenance" | "inactive" | "location_closed";

export type Slot = {
  startsAt: Date;
  endsAt: Date;
  startMinutes: number;
  endMinutes: number;
  status: SlotStatus;
  reason?: string;
  priceCents: number | null;
  peak: boolean;
  /** Present when status is "booked". `mine` is true for the viewer's own booking; label only for staff. */
  booking?: { id: string; mine: boolean; label?: string };
};

export type CourtSchedule = {
  court: { id: string; name: string; type: CourtType; status: CourtStatus; sortOrder: number };
  slotMinutes: number | null;
  /** Effective operating window after intersecting with location opening hours (null = closed). */
  open: { opensAt: number; closesAt: number } | null;
  slots: Slot[];
};

export type EngineBooking = { id: string; startsAt: Date; endsAt: Date; playerId: string | null; label?: string };

export type EngineInput = {
  court: Pick<Court, "id" | "name" | "type" | "status" | "sortOrder"> & { availability: CourtAvailability[]; closures: Pick<CourtClosure, "startsAt" | "endsAt" | "reason">[]; bookings?: EngineBooking[] };
  viewerId?: string | null;
  location: { timezone: string; status: "ACTIVE" | "INACTIVE" | "COMING_SOON"; openingHours: OpeningHours | null; bookingPolicy: Pick<BookingPolicy, "advanceBookingDays" | "minNoticeMinutes"> | null };
  rules: PricingRule[];
  dateISO: string;
  now: Date;
  isMember?: boolean;
  membershipTier?: string | null;
};

const DEFAULT_POLICY = { advanceBookingDays: 14, minNoticeMinutes: 60 };

/** Computes every bookable slot of one court for one calendar date in the location's timezone. */
export function computeCourtDay(input: EngineInput): CourtSchedule {
  const { court, location, rules, dateISO, now } = input;
  const tz = location.timezone;
  const dayOfWeek = dayOfWeekISO(dateISO);
  const policy = location.bookingPolicy ?? DEFAULT_POLICY;
  const base: CourtSchedule = { court: { id: court.id, name: court.name, type: court.type, status: court.status, sortOrder: court.sortOrder }, slotMinutes: null, open: null, slots: [] };

  const windows = court.availability.filter((a) => a.dayOfWeek === dayOfWeek).sort((a, b) => a.opensAt - b.opensAt);
  if (windows.length === 0) return base;

  const locHours = location.openingHours ? location.openingHours[dayOfWeek] : undefined;
  if (location.openingHours && locHours === null) return base; // location closed that day

  const earliest = new Date(now.getTime() + policy.minNoticeMinutes * 60_000);
  const latest = new Date(now.getTime() + policy.advanceBookingDays * 86_400_000);
  const slots: Slot[] = [];
  let open: CourtSchedule["open"] = null;

  for (const w of windows) {
    const opensAt = locHours ? Math.max(w.opensAt, locHours.opensAt) : w.opensAt;
    const closesAt = locHours ? Math.min(w.closesAt, locHours.closesAt) : w.closesAt;
    if (closesAt <= opensAt) continue;
    open = open ? { opensAt: Math.min(open.opensAt, opensAt), closesAt: Math.max(open.closesAt, closesAt) } : { opensAt, closesAt };
    base.slotMinutes = base.slotMinutes ?? w.slotMinutes;

    for (let t = opensAt; t + w.slotMinutes <= closesAt; t += w.slotMinutes) {
      const startsAt = zonedToUtc(dateISO, t, tz);
      const endsAt = zonedToUtc(dateISO, t + w.slotMinutes, tz);
      const quote = quotePrice({ rules, courtId: court.id, baseHourlyCents: w.priceCents, dateISO, dayOfWeek, startMinutes: t, durationMinutes: w.slotMinutes, isMember: input.isMember, membershipTier: input.membershipTier });
      const closure = court.closures.find((c) => c.startsAt < endsAt && c.endsAt > startsAt);
      const booking = (court.bookings ?? []).find((b) => b.startsAt < endsAt && b.endsAt > startsAt);

      let status: SlotStatus = "available";
      let reason: string | undefined;
      if (location.status !== "ACTIVE") status = "location_closed";
      else if (court.status === "INACTIVE") status = "inactive";
      else if (court.status === "MAINTENANCE") status = "maintenance";
      else if (closure) {
        status = "closed";
        reason = closure.reason ?? undefined;
      } else if (booking) status = "booked";
      else if (startsAt <= now) status = "past";
      else if (startsAt < earliest) status = "too_soon";
      else if (startsAt > latest) status = "outside_window";

      slots.push({
        startsAt,
        endsAt,
        startMinutes: t,
        endMinutes: t + w.slotMinutes,
        status,
        reason,
        priceCents: quote.totalCents,
        peak: quote.adjustments.some((a) => a.kind === "PEAK" && a.deltaCents > 0),
        ...(booking ? { booking: { id: booking.id, mine: !!input.viewerId && booking.playerId === input.viewerId, label: booking.label } } : {}),
      });
    }
  }
  return { ...base, open, slots };
}

/* ------------------------------------------------------------------ Service wrappers */

export type LocationSchedule = {
  location: { id: string; slug: string; name: string; timezone: string; status: string };
  dateISO: string;
  courts: CourtSchedule[];
};

/**
 * Day schedule for every court at a location. Players see ACTIVE/MAINTENANCE courts of visible locations;
 * staff with court.read at the location also see INACTIVE courts and inactive locations.
 */
export async function getLocationSchedule(actor: Actor | null, locationIdOrSlug: string, dateISOInput: unknown, now = new Date()): Promise<LocationSchedule> {
  const a = await requireActor(actor);
  const parsedDate = dateISOSchema.safeParse(dateISOInput);
  if (!parsedDate.success) throw validation("Invalid date.", { dateISO: "Use YYYY-MM-DD." });
  const dateISO = parsedDate.data;

  const location = await db.location.findFirst({
    where: { OR: [{ id: locationIdOrSlug }, { slug: locationIdOrSlug }] },
    select: { id: true, slug: true, name: true, timezone: true, status: true, openingHours: true, bookingPolicy: true },
  });
  if (!location) throw notFound("Location");
  const staff = (a.globalRole || a.memberships.some((m) => m.locationId === location.id)) && (await can(a, "court.read", { locationId: location.id }));
  if (!staff && location.status === "INACTIVE") throw forbidden();

  // Closures overlapping the day in the location timezone (with a day of slack on each side).
  const dayStart = zonedToUtc(dateISO, -24 * 60, location.timezone);
  const dayEnd = zonedToUtc(dateISO, 48 * 60, location.timezone);
  const [courts, rules] = await Promise.all([
    db.court.findMany({
      where: { locationId: location.id, ...(staff ? {} : { status: { in: ["ACTIVE", "MAINTENANCE"] } }) },
      include: {
        availability: true,
        closures: { where: { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, select: { startsAt: true, endsAt: true, reason: true } },
        bookings: {
          where: { status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
          select: { id: true, startsAt: true, endsAt: true, playerId: true, guestName: true, confirmationCode: true, player: { select: { name: true } } },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.pricingRule.findMany({ where: { locationId: location.id, active: true } }),
  ]);

  const openingHours = (location.openingHours as OpeningHours | null) ?? null;
  return {
    location: { id: location.id, slug: location.slug, name: location.name, timezone: location.timezone, status: location.status },
    dateISO,
    courts: courts.map((court) =>
      computeCourtDay({
        court: { ...court, bookings: court.bookings.map((b) => ({ id: b.id, startsAt: b.startsAt, endsAt: b.endsAt, playerId: b.playerId, label: staff ? (b.player?.name ?? b.guestName ?? b.confirmationCode) : undefined })) },
        viewerId: a.id,
        location: { timezone: location.timezone, status: location.status, openingHours, bookingPolicy: location.bookingPolicy },
        rules,
        dateISO,
        now,
      }),
    ),
  };
}
