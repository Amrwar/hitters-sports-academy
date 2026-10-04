/**
 * Reporting for the admin Analytics screen. Everything here is read from the live tables and scoped to the
 * locations the viewer may read, so a location manager sees their clubs and an owner sees the academy.
 *
 * The numbers are deliberately plain: bookings, the money attached to them, how full the courts were, how
 * often matchmaking filled a lineup, and how full the academy is. Nothing is estimated or extrapolated.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { accessibleLocationIds, requirePermission, type Actor } from "@/lib/auth/authorize";

export type Point = { label: string; value: number };

export type AnalyticsReport = {
  /** The window these numbers cover. */
  weeks: number;
  scope: { locations: number; names: string[] };
  totals: {
    bookings: number;
    revenueCents: number;
    cancelled: number;
    cancellationRate: number;
    occupancy: number;
    newMembers: number;
    activeMembers: number;
  };
  /** Same figures for the window before this one, so the screen can show a real change. */
  previous: { bookings: number; revenueCents: number; occupancy: number; newMembers: number };
  revenueByWeek: Point[];
  bookingsByWeek: Point[];
  byLocation: { id: string; name: string; bookings: number; revenueCents: number; occupancy: number }[];
  byHour: Point[];
  matchmaking: { games: number; filled: number; fillRate: number; requests: number; accepted: number; acceptRate: number };
  academy: { programs: number; capacity: number; enrolled: number; fillRate: number; lessons: number; lessonRevenueCents: number; packagesSold: number };
  levels: Point[];
};

const WEEK_MS = 7 * 86_400_000;
/** Hours a court is treated as sellable per day, matching the seeded 07:00 to 24:00 operating window. */
const SELLABLE_HOURS_PER_DAY = 17;

const startOfWeek = (d: Date): Date => {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const back = (copy.getUTCDay() + 6) % 7; // weeks start Monday
  copy.setUTCDate(copy.getUTCDate() - back);
  return copy;
};

const weekLabel = (d: Date): string => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export async function getAnalytics(actor: Actor | null, opts: { weeks?: number; now?: Date } = {}): Promise<AnalyticsReport> {
  const a = await requirePermission(actor, "booking.read");
  const weeks = Math.min(26, Math.max(4, opts.weeks ?? 8));
  const now = opts.now ?? new Date();
  const firstWeek = startOfWeek(new Date(now.getTime() - (weeks - 1) * WEEK_MS));
  const windowStart = firstWeek;
  const previousStart = new Date(windowStart.getTime() - weeks * WEEK_MS);

  const scope = await accessibleLocationIds(a, "booking.read");
  const locations = await db.location.findMany({
    where: scope === "all" ? {} : { id: { in: scope } },
    select: { id: true, name: true, _count: { select: { courts: true } }, courts: { where: { status: "ACTIVE" }, select: { id: true } } },
    orderBy: { name: "asc" },
  });
  const locationIds = locations.map((l) => l.id);
  const locWhere: Prisma.BookingWhereInput = scope === "all" ? {} : { locationId: { in: locationIds } };
  const counted: Prisma.BookingWhereInput = { ...locWhere, status: { in: ["CONFIRMED", "COMPLETED"] } };

  const [current, prior, cancelled, bookings, newMembers, priorMembers, activeMembers, games, requests, programs, lessons, packages, levelRows] = await Promise.all([
    db.booking.aggregate({ where: { ...counted, startsAt: { gte: windowStart, lte: now } }, _sum: { priceCents: true }, _count: { _all: true } }),
    db.booking.aggregate({ where: { ...counted, startsAt: { gte: previousStart, lt: windowStart } }, _sum: { priceCents: true }, _count: { _all: true } }),
    db.booking.count({ where: { ...locWhere, status: "CANCELLED", startsAt: { gte: windowStart, lte: now } } }),
    db.booking.findMany({
      where: { ...counted, startsAt: { gte: windowStart, lte: now } },
      select: { startsAt: true, priceCents: true, durationMinutes: true, locationId: true },
      take: 20_000,
    }),
    db.user.count({ where: { createdAt: { gte: windowStart }, status: "ACTIVE" } }),
    db.user.count({ where: { createdAt: { gte: previousStart, lt: windowStart }, status: "ACTIVE" } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.gameSession.findMany({
      where: { ...(scope === "all" ? {} : { locationId: { in: locationIds } }), startsAt: { gte: windowStart, lte: now }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { maxPlayers: true, participants: { where: { status: "ACCEPTED" }, select: { id: true } } },
      take: 5_000,
    }),
    db.gameJoinRequest.groupBy({
      by: ["status"],
      where: { createdAt: { gte: windowStart }, ...(scope === "all" ? {} : { session: { locationId: { in: locationIds } } }) },
      _count: { _all: true },
    }),
    db.program.findMany({
      where: { ...(scope === "all" ? {} : { locationId: { in: locationIds } }), status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { capacity: true, _count: { select: { enrollments: true } }, enrollments: { where: { status: "ENROLLED" }, select: { id: true } } },
      take: 1_000,
    }),
    db.lesson.aggregate({
      where: { ...(scope === "all" ? {} : { locationId: { in: locationIds } }), status: { in: ["CONFIRMED", "COMPLETED"] }, startsAt: { gte: windowStart, lte: now } },
      _count: { _all: true },
      _sum: { priceCents: true },
    }),
    db.packagePurchase.count({ where: { createdAt: { gte: windowStart }, ...(scope === "all" ? {} : { locationId: { in: locationIds } }) } }),
    db.playerProfile.groupBy({ by: ["level"], _count: { _all: true } }),
  ]);

  // Weekly series, built from the booking rows so the chart and the totals can never disagree.
  const buckets = Array.from({ length: weeks }, (_, i) => new Date(windowStart.getTime() + i * WEEK_MS));
  const revenueByWeek: Point[] = buckets.map((b) => ({ label: weekLabel(b), value: 0 }));
  const bookingsByWeek: Point[] = buckets.map((b) => ({ label: weekLabel(b), value: 0 }));
  const byHourMap = new Map<number, number>();
  const perLocation = new Map<string, { bookings: number; revenueCents: number; minutes: number }>();
  let bookedMinutes = 0;

  for (const b of bookings) {
    const idx = Math.min(weeks - 1, Math.max(0, Math.floor((b.startsAt.getTime() - windowStart.getTime()) / WEEK_MS)));
    revenueByWeek[idx].value += b.priceCents;
    bookingsByWeek[idx].value += 1;
    byHourMap.set(b.startsAt.getUTCHours(), (byHourMap.get(b.startsAt.getUTCHours()) ?? 0) + 1);
    bookedMinutes += b.durationMinutes;
    const row = perLocation.get(b.locationId) ?? { bookings: 0, revenueCents: 0, minutes: 0 };
    row.bookings += 1;
    row.revenueCents += b.priceCents;
    row.minutes += b.durationMinutes;
    perLocation.set(b.locationId, row);
  }

  const daysElapsed = Math.max(1, Math.round((now.getTime() - windowStart.getTime()) / 86_400_000));
  const courtsTotal = locations.reduce((n, l) => n + l.courts.length, 0);
  const sellableMinutes = courtsTotal * SELLABLE_HOURS_PER_DAY * 60 * daysElapsed;
  const occupancy = sellableMinutes ? Math.round((bookedMinutes / sellableMinutes) * 100) : 0;

  const priorBookings = await db.booking.findMany({
    where: { ...counted, startsAt: { gte: previousStart, lt: windowStart } },
    select: { durationMinutes: true },
    take: 20_000,
  });
  const priorMinutes = priorBookings.reduce((n, b) => n + b.durationMinutes, 0);
  const priorOccupancy = sellableMinutes ? Math.round((priorMinutes / sellableMinutes) * 100) : 0;

  const filled = games.filter((g) => g.participants.length >= g.maxPlayers).length;
  const requestTotal = requests.reduce((n, r) => n + r._count._all, 0);
  const requestAccepted = requests.find((r) => r.status === "ACCEPTED")?._count._all ?? 0;

  const capacity = programs.reduce((n, p) => n + p.capacity, 0);
  const enrolled = programs.reduce((n, p) => n + p.enrollments.length, 0);

  const levelOrder = ["A", "B", "C", "D"];
  const levels: Point[] = levelOrder
    .map((lvl) => ({ label: `Level ${lvl}`, value: levelRows.find((r) => r.level === lvl)?._count._all ?? 0 }))
    .concat([{ label: "Not assessed", value: levelRows.find((r) => r.level === null)?._count._all ?? 0 }]);

  const totalBookings = current._count._all;

  return {
    weeks,
    scope: { locations: locations.length, names: locations.map((l) => l.name) },
    totals: {
      bookings: totalBookings,
      revenueCents: current._sum.priceCents ?? 0,
      cancelled,
      cancellationRate: totalBookings + cancelled ? Math.round((cancelled / (totalBookings + cancelled)) * 100) : 0,
      occupancy,
      newMembers,
      activeMembers,
    },
    previous: { bookings: prior._count._all, revenueCents: prior._sum.priceCents ?? 0, occupancy: priorOccupancy, newMembers: priorMembers },
    revenueByWeek,
    bookingsByWeek,
    byLocation: locations.map((l) => {
      const row = perLocation.get(l.id) ?? { bookings: 0, revenueCents: 0, minutes: 0 };
      const sellable = l.courts.length * SELLABLE_HOURS_PER_DAY * 60 * daysElapsed;
      return { id: l.id, name: l.name, bookings: row.bookings, revenueCents: row.revenueCents, occupancy: sellable ? Math.round((row.minutes / sellable) * 100) : 0 };
    }),
    byHour: Array.from({ length: SELLABLE_HOURS_PER_DAY }, (_, i) => i + 7).map((h) => ({ label: String(h).padStart(2, "0"), value: byHourMap.get(h) ?? 0 })),
    matchmaking: {
      games: games.length,
      filled,
      fillRate: games.length ? Math.round((filled / games.length) * 100) : 0,
      requests: requestTotal,
      accepted: requestAccepted,
      acceptRate: requestTotal ? Math.round((requestAccepted / requestTotal) * 100) : 0,
    },
    academy: {
      programs: programs.length,
      capacity,
      enrolled,
      fillRate: capacity ? Math.round((enrolled / capacity) * 100) : 0,
      lessons: lessons._count._all,
      lessonRevenueCents: lessons._sum.priceCents ?? 0,
      packagesSold: packages,
    },
    levels,
  };
}
