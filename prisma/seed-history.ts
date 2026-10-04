/**
 * Twelve weeks of trading history for the demo database.
 *
 * The dashboard and the analytics screen read real tables, so with only a handful of future bookings they
 * correctly show almost nothing. This fills in the past: completed bookings spread across every club and
 * court, weighted the way a padel club actually fills (evenings busy, weekends busiest, mornings quiet),
 * with a realistic trickle of cancellations and a few lessons.
 *
 * It is idempotent: every row it writes carries an HX- confirmation code, and it does nothing if those
 * already exist. Dates are generated relative to today, so the history stays current however long the demo
 * database sits unused.
 */
import { PrismaClient, type Prisma } from "@prisma/client";

const CODE_PREFIX = "HX-";
const WEEKS = 30;
/** Fraction of generated bookings that were cancelled rather than played. */
const CANCEL_RATE = 0.07;

/** Deterministic pseudo-random, so two runs on the same day produce the same history. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** How likely an hour is to be booked, by hour of the day and whether it is a weekend. */
function demand(hour: number, weekend: boolean): number {
  if (hour < 9) return weekend ? 0.3 : 0.08;
  if (hour < 16) return weekend ? 0.45 : 0.15;
  if (hour < 19) return weekend ? 0.5 : 0.35;
  if (hour < 23) return weekend ? 0.7 : 0.62; // the evening peak every club lives on
  return 0.08;
}

const code = (n: number) => `${CODE_PREFIX}${n.toString(36).toUpperCase().padStart(5, "0")}`;

export async function seedHistory(db: PrismaClient): Promise<{ created: number; skipped: boolean }> {
  const existing = await db.booking.count({ where: { confirmationCode: { startsWith: CODE_PREFIX } } });
  if (existing > 0) return { created: 0, skipped: true };

  const [locations, players] = await Promise.all([
    db.location.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, timezone: true, courts: { where: { status: "ACTIVE" }, select: { id: true, availability: { select: { dayOfWeek: true, opensAt: true, closesAt: true, priceCents: true } } } } },
    }),
    db.user.findMany({ where: { status: "ACTIVE", playerProfile: { isNot: null } }, select: { id: true } }),
  ]);
  if (locations.length === 0 || players.length === 0) return { created: 0, skipped: true };

  const staff = await db.user.findFirst({ where: { memberships: { some: { role: "RECEPTIONIST", status: "ACTIVE" } } }, select: { id: true } });

  const random = rng(20261004);
  const now = new Date();
  const rows: Prisma.BookingCreateManyInput[] = [];
  const payments: { code: string; amountCents: number; paid: boolean }[] = [];
  let n = 1;

  for (let dayBack = WEEKS * 7; dayBack >= 1; dayBack--) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - dayBack);
    day.setUTCHours(0, 0, 0, 0);
    const dow = day.getUTCDay();
    const weekend = dow === 5 || dow === 6; // Friday and Saturday in Egypt
    // A gentle upward trend, so the charts show a club that is growing rather than flat noise.
    const growth = 0.75 + (1 - dayBack / (WEEKS * 7)) * 0.5;

    for (const location of locations) {
      for (const court of location.courts) {
        const hours = court.availability.find((a) => a.dayOfWeek === dow);
        if (!hours) continue;
        // A court is a single resource, so the cursor walks the day in minutes and the next booking can only
        // start once the previous one has finished. Minutes, not hours, because a 90 minute slot is not whole.
        let cursorMinutes = hours.opensAt;
        while (cursorMinutes + 60 <= hours.closesAt) {
          const hour = Math.floor(cursorMinutes / 60);
          if (random() > demand(hour, weekend) * growth) {
            cursorMinutes += 30;
            continue;
          }
          const durationMinutes = random() < 0.65 && cursorMinutes + 90 <= hours.closesAt ? 90 : 60;
          // Africa/Cairo is UTC+2 for the seeded clubs; the stored instant is the local time minus two hours.
          const startsAt = new Date(day.getTime() + (cursorMinutes - 120) * 60_000);
          const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
          cursorMinutes += durationMinutes;
          if (startsAt >= now) break;

          const priceCents = Math.round(((hours.priceCents || 40000) * durationMinutes) / 60);
          const cancelled = random() < CANCEL_RATE;
          const playerId = players[Math.floor(random() * players.length)]!.id;
          const confirmationCode = code(n++);
          const fromReception = random() < 0.18;

          rows.push({
            confirmationCode,
            courtId: court.id,
            locationId: location.id,
            playerId,
            startsAt,
            endsAt,
            durationMinutes,
            status: cancelled ? "CANCELLED" : "COMPLETED",
            source: fromReception ? "RECEPTION" : "PLAYER_APP",
            priceCents,
            createdById: fromReception ? (staff?.id ?? playerId) : playerId,
            createdAt: new Date(startsAt.getTime() - 3 * 86_400_000),
            ...(cancelled ? { cancelledAt: new Date(startsAt.getTime() - 86_400_000), cancelledById: playerId, cancellationReason: "Something came up" } : {}),
          });
          if (!cancelled) payments.push({ code: confirmationCode, amountCents: priceCents, paid: true });
        }
      }
    }
  }

  // createMany keeps this to a handful of statements; the overlap constraint is satisfied by construction,
  // because at most one booking is generated per court per hour.
  for (let i = 0; i < rows.length; i += 500) {
    await db.booking.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
  }

  const created = await db.booking.findMany({ where: { confirmationCode: { startsWith: CODE_PREFIX } }, select: { id: true, confirmationCode: true, playerId: true, startsAt: true } });
  const byCode = new Map(created.map((b) => [b.confirmationCode, b]));

  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const participantRows: Prisma.BookingParticipantCreateManyInput[] = [];
  for (const p of payments) {
    const booking = byCode.get(p.code);
    if (!booking) continue;
    paymentRows.push({ bookingId: booking.id, amountCents: p.amountCents, status: "PAID", method: random() < 0.5 ? "CASH" : "CARD", paidAt: booking.startsAt });
    if (booking.playerId) participantRows.push({ bookingId: booking.id, userId: booking.playerId, role: "ORGANIZER" });
  }
  for (let i = 0; i < paymentRows.length; i += 500) await db.payment.createMany({ data: paymentRows.slice(i, i + 500), skipDuplicates: true });
  for (let i = 0; i < participantRows.length; i += 500) await db.bookingParticipant.createMany({ data: participantRows.slice(i, i + 500), skipDuplicates: true });

  await seedPastGames(db, created, random);
  await seedPastLessons(db, random);

  return { created: rows.length, skipped: false };
}

/**
 * A slice of the historical bookings also hosted a game, so the matchmaking panel reports on something real:
 * most filled their lineup, a few never did. Nothing here is notified; it is history, not activity.
 */
async function seedPastGames(db: PrismaClient, bookings: { id: string; playerId: string | null; startsAt: Date }[], random: () => number): Promise<void> {
  if (await db.gameSession.count({ where: { code: { startsWith: "GX-" } } })) return;
  const players = await db.user.findMany({ where: { status: "ACTIVE", playerProfile: { isNot: null } }, select: { id: true } });
  if (players.length < 4) return;

  // Spread across the whole history rather than its oldest slice, so every reporting window has games in it.
  const candidates = bookings.filter((b) => b.playerId && b.startsAt < new Date()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const stride = Math.max(1, Math.floor(candidates.length / 400));
  let made = 0;
  for (let i = 0; i < candidates.length; i += stride) {
    const booking = candidates[i]!;
    if (made >= 320) break;
    if (random() > 0.8) continue;
    const full = random() < 0.72;
    const accepted = full ? 4 : 2 + Math.floor(random() * 2);
    const lineup = new Set<string>([booking.playerId!]);
    while (lineup.size < accepted) lineup.add(players[Math.floor(random() * players.length)]!.id);

    const full7 = await db.booking.findUnique({ where: { id: booking.id }, select: { locationId: true, courtId: true, startsAt: true, endsAt: true } });
    if (!full7) continue;
    made++;
    await db.gameSession.create({
      data: {
        code: `GX-${made.toString(36).toUpperCase().padStart(4, "0")}`,
        bookingId: booking.id,
        organizerId: booking.playerId!,
        locationId: full7.locationId,
        courtId: full7.courtId,
        startsAt: full7.startsAt,
        endsAt: full7.endsAt,
        format: "DOUBLES",
        maxPlayers: 4,
        status: "COMPLETED",
        visibility: "PUBLIC",
        openToRequests: true,
        costMode: "SPLIT_EVENLY",
        publishedAt: new Date(full7.startsAt.getTime() - 5 * 86_400_000),
        createdAt: new Date(full7.startsAt.getTime() - 5 * 86_400_000),
        participants: {
          create: [...lineup].map((userId, i) => ({
            userId,
            role: i === 0 ? ("ORGANIZER" as const) : ("PLAYER" as const),
            status: "ACCEPTED" as const,
            invitedById: booking.playerId!,
            respondedAt: new Date(full7.startsAt.getTime() - 4 * 86_400_000),
          })),
        },
      },
    });
  }
}

/**
 * Completed private lessons across the same period, so the academy panel reports real coaching revenue.
 * Lessons sit on the trainer's own calendar rather than a court booking, so there is nothing to collide with
 * beyond the trainer overlap constraint, which is satisfied by spacing them a day apart per coach.
 */
async function seedPastLessons(db: PrismaClient, random: () => number): Promise<void> {
  if (await db.lesson.count({ where: { code: { startsWith: "LX-" } } })) return;
  const trainers = await db.trainerProfile.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, userId: true, hourlyRateCents: true, locations: { select: { locationId: true } } },
  });
  const players = await db.user.findMany({ where: { status: "ACTIVE", playerProfile: { isNot: null } }, select: { id: true } });
  if (trainers.length === 0 || players.length === 0) return;

  const now = new Date();
  let made = 0;
  for (const trainer of trainers) {
    const locationId = trainer.locations[0]?.locationId;
    if (!locationId) continue;
    for (let dayBack = WEEKS * 7; dayBack >= 2; dayBack -= 1) {
      if (random() > 0.45) continue;
      const day = new Date(now);
      day.setUTCDate(day.getUTCDate() - dayBack);
      // One lesson per coach per day, at a believable coaching hour, so no two of a coach's lessons overlap.
      const hour = 10 + Math.floor(random() * 9);
      const startsAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - 2, 0, 0, 0));
      if (startsAt >= now) continue;
      const durationMinutes = random() < 0.7 ? 60 : 90;
      const priceCents = Math.round(((trainer.hourlyRateCents || 60000) * durationMinutes) / 60);
      made++;
      await db.lesson
        .create({
          data: {
            code: `LX-${made.toString(36).toUpperCase().padStart(4, "0")}`,
            trainerId: trainer.id,
            playerId: players[Math.floor(random() * players.length)]!.id,
            locationId,
            startsAt,
            endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
            durationMinutes,
            status: "COMPLETED",
            priceCents,
            createdById: trainer.userId,
            createdAt: new Date(startsAt.getTime() - 4 * 86_400_000),
            payments: { create: { amountCents: priceCents, status: "PAID", method: random() < 0.5 ? "CASH" : "CARD", paidAt: startsAt } },
          },
        })
        .catch(() => undefined); // a rare overlap with a seeded demo lesson is not worth failing the seed over
    }
  }
}
