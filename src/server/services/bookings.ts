import type { BookingSource, BookingStatus, Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { dayOfWeekISO, formatInZone, utcToZoned, zonedToUtc } from "@/lib/time";
import { bookingListSchema, bookingRequestSchema, cancelBookingSchema, createBookingSchema, fieldErrors, recordPaymentSchema, type BookingRequest, type OpeningHours } from "@/lib/validation/schemas";
import { quotePrice, type Quote } from "./pricing";
import { notify, notifyMany } from "./notifications";
import { suffix } from "@/lib/notifications";
import { cancelGameForBooking, moveGameToBooking, type GameCascade } from "./game-sessions";

/* ------------------------------------------------------------------ Shared selects */

export const bookingSelect = {
  id: true,
  confirmationCode: true,
  courtId: true,
  locationId: true,
  playerId: true,
  guestName: true,
  guestPhone: true,
  startsAt: true,
  endsAt: true,
  durationMinutes: true,
  status: true,
  source: true,
  priceCents: true,
  currency: true,
  notes: true,
  cancelledAt: true,
  cancellationReason: true,
  rescheduledFromId: true,
  createdAt: true,
  court: { select: { id: true, name: true, type: true } },
  location: { select: { id: true, slug: true, name: true, timezone: true, address: true, bookingPolicy: { select: { cancellationCutoffHours: true } } } },
  player: { select: { id: true, name: true, email: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
  participants: { select: { id: true, role: true, status: true, guestName: true, user: { select: { id: true, name: true } } } },
  payments: { select: { id: true, amountCents: true, currency: true, status: true, method: true, paidAt: true }, orderBy: { createdAt: "desc" as const } },
  rescheduledTo: { select: { id: true, confirmationCode: true } },
  gameSession: { select: { id: true, code: true, status: true, maxPlayers: true } },
} satisfies Prisma.BookingSelect;

export type BookingView = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

const ACTIVE: BookingStatus[] = ["PENDING", "CONFIRMED"];

/* ------------------------------------------------------------------ Slot validation */

export type BookingQuote = {
  court: { id: string; name: string; locationId: string };
  location: { id: string; name: string; slug: string; timezone: string };
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  allowedDurations: number[];
  quote: Quote;
  cancellationCutoffHours: number;
};

type ValidateOpts = { now?: Date; excludeBookingId?: string; staff?: boolean };

function isOverlapError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("Booking_no_overlap") || msg.includes("23P01") || msg.includes("exclusion constraint");
}

/**
 * Validates a requested slot against status, hours, closures, policy and existing bookings and prices it.
 * Throws the booking-domain error codes; shared by quote, create and reschedule.
 */
async function validateSlot(req: BookingRequest, opts: ValidateOpts = {}): Promise<BookingQuote> {
  const now = opts.now ?? new Date();
  const court = await db.court.findUnique({
    where: { id: req.courtId },
    include: { availability: true, location: { include: { bookingPolicy: true } } },
  });
  if (!court) throw notFound("Court");
  const loc = court.location;
  const tz = loc.timezone;

  if (loc.status !== "ACTIVE") throw new AppError("LOCATION_CLOSED", "This location is not open for bookings.");
  if (court.status === "MAINTENANCE") throw new AppError("COURT_UNAVAILABLE", `${court.name} is under maintenance.`);
  if (court.status === "INACTIVE") throw new AppError("COURT_UNAVAILABLE", `${court.name} is not available.`);

  const policy = loc.bookingPolicy ?? { advanceBookingDays: 14, minNoticeMinutes: 60, cancellationCutoffHours: 12, maxActiveBookingsPerPlayer: 3, requireVerifiedEmail: true, allowedDurations: [60, 90, 120] };
  const allowedDurations = court.durationsMinutes.length ? court.durationsMinutes : policy.allowedDurations;
  if (!allowedDurations.includes(req.durationMinutes)) {
    throw new AppError("INVALID_DURATION", `Choose a duration of ${allowedDurations.join(", ")} minutes.`, { durationMinutes: `Allowed: ${allowedDurations.join(", ")} min` });
  }

  const dayOfWeek = dayOfWeekISO(req.dateISO);
  const hours = loc.openingHours as OpeningHours | null;
  const locHours = hours ? hours[dayOfWeek] : undefined;
  if (hours && locHours === null) throw new AppError("LOCATION_CLOSED", `${loc.name} is closed on that day.`);

  const end = req.startMinutes + req.durationMinutes;
  const window = court.availability
    .filter((a) => a.dayOfWeek === dayOfWeek)
    .map((a) => ({ ...a, opensAt: locHours ? Math.max(a.opensAt, locHours.opensAt) : a.opensAt, closesAt: locHours ? Math.min(a.closesAt, locHours.closesAt) : a.closesAt }))
    .find((a) => req.startMinutes >= a.opensAt && end <= a.closesAt && (req.startMinutes - a.opensAt) % a.slotMinutes === 0);
  if (!window) throw new AppError("SLOT_UNAVAILABLE", "That time is outside the court's operating hours.");

  const startsAt = zonedToUtc(req.dateISO, req.startMinutes, tz);
  const endsAt = zonedToUtc(req.dateISO, end, tz);

  const closure = await db.courtClosure.findFirst({ where: { courtId: court.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
  if (closure) throw new AppError("COURT_UNAVAILABLE", closure.reason ? `${court.name} is closed: ${closure.reason}.` : `${court.name} is closed during that time.`);

  if (startsAt <= now) throw new AppError("SLOT_UNAVAILABLE", "That time has already passed.");
  if (!opts.staff) {
    if (startsAt.getTime() < now.getTime() + policy.minNoticeMinutes * 60_000) throw new AppError("SLOT_UNAVAILABLE", `Bookings need at least ${policy.minNoticeMinutes} minutes' notice.`);
    if (startsAt.getTime() > now.getTime() + policy.advanceBookingDays * 86_400_000) throw new AppError("SLOT_UNAVAILABLE", `You can book up to ${policy.advanceBookingDays} days ahead.`);
  }

  const clash = await db.booking.findFirst({
    where: { courtId: court.id, status: { in: ACTIVE }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(opts.excludeBookingId ? { NOT: { id: opts.excludeBookingId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError("SLOT_UNAVAILABLE", "That slot is no longer available.");

  const rules = await db.pricingRule.findMany({ where: { locationId: loc.id, active: true } });
  const quote = quotePrice({ rules, courtId: court.id, baseHourlyCents: window.priceCents, dateISO: req.dateISO, dayOfWeek, startMinutes: req.startMinutes, durationMinutes: req.durationMinutes });

  return {
    court: { id: court.id, name: court.name, locationId: loc.id },
    location: { id: loc.id, name: loc.name, slug: loc.slug, timezone: tz },
    startsAt,
    endsAt,
    durationMinutes: req.durationMinutes,
    allowedDurations,
    quote,
    cancellationCutoffHours: policy.cancellationCutoffHours,
  };
}

/** Price review before confirming. Players see player rules; staff bypass notice/window limits. */
export async function quoteBooking(actor: Actor | null, input: unknown, opts: { now?: Date } = {}): Promise<BookingQuote> {
  const a = await requireActor(actor);
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const court = await db.court.findUnique({ where: { id: parsed.data.courtId }, select: { locationId: true } });
  if (!court) throw notFound("Court");
  const staff = await can(a, "booking.manage", { locationId: court.locationId });
  return validateSlot(parsed.data, { now: opts.now, staff });
}

/* ------------------------------------------------------------------ Create */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function confirmationCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `HT-${s}`;
}

function sourceFor(actor: Actor, locationId: string): BookingSource {
  if (actor.globalRole) return "ADMIN";
  const roles = actor.memberships.filter((m) => m.locationId === locationId).map((m) => m.role);
  return roles.includes("RECEPTIONIST") && !roles.includes("LOCATION_MANAGER") ? "RECEPTION" : "ADMIN";
}

/**
 * Reserves a court. Players book for themselves; staff with booking.manage book for a member or a guest.
 * Concurrency: the court row is locked for the transaction and the Booking_no_overlap exclusion
 * constraint rejects any overlapping active booking that slips past the check.
 */
export async function createBooking(actor: Actor | null, input: unknown, opts: { now?: Date } = {}): Promise<BookingView> {
  const a = await requireActor(actor);
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { playerId: requestedPlayerId, guestName, guestPhone, notes, participantIds = [], ...req } = parsed.data;
  const now = opts.now ?? new Date();

  const courtRow = await db.court.findUnique({ where: { id: req.courtId }, select: { locationId: true, location: { select: { bookingPolicy: true } } } });
  if (!courtRow) throw notFound("Court");
  const locationId = courtRow.locationId;
  const onBehalf = (requestedPlayerId && requestedPlayerId !== a.id) || !!guestName;
  const staff = onBehalf ? !!(await requirePermission(a, "booking.manage", { locationId })) : await can(a, "booking.manage", { locationId });
  const playerId = guestName ? (requestedPlayerId ?? null) : (requestedPlayerId ?? a.id);
  if (!playerId && !guestName) throw validation("Choose a member or enter a guest name.", { guestName: "Required for walk-ins." });

  if (!onBehalf) {
    await requirePermission(a, "booking.create.own");
    const policy = courtRow.location.bookingPolicy;
    if ((policy?.requireVerifiedEmail ?? true) && !a.emailVerifiedAt) throw forbidden("Verify your email address before booking.");
    const active = await db.booking.count({ where: { playerId: a.id, status: { in: ACTIVE }, startsAt: { gt: now } } });
    const max = policy?.maxActiveBookingsPerPlayer ?? 3;
    if (active >= max) throw validation(`You already have ${active} upcoming booking${active === 1 ? "" : "s"}. The limit is ${max}.`);
  }

  if (playerId && playerId !== a.id) {
    const player = await db.user.findUnique({ where: { id: playerId }, select: { id: true, status: true } });
    if (!player || player.status !== "ACTIVE") throw notFound("Member");
  }

  const slot = await validateSlot(req, { now, staff });

  try {
    const booking = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Court" WHERE "id" = ${req.courtId} FOR UPDATE`;
        const clash = await tx.booking.findFirst({ where: { courtId: req.courtId, status: { in: ACTIVE }, startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } }, select: { id: true } });
        if (clash) throw new AppError("SLOT_UNAVAILABLE", "That slot was just taken. Pick another time.");

        let code = confirmationCode();
        for (let i = 0; i < 5 && (await tx.booking.findUnique({ where: { confirmationCode: code }, select: { id: true } })); i++) code = confirmationCode();

        const created = await tx.booking.create({
          data: {
            confirmationCode: code,
            courtId: req.courtId,
            locationId,
            playerId,
            guestName,
            guestPhone,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            durationMinutes: req.durationMinutes,
            status: "CONFIRMED",
            source: onBehalf || staff ? sourceFor(a, locationId) : "PLAYER_APP",
            priceCents: slot.quote.totalCents,
            notes,
            createdById: a.id,
            participants: {
              create: [
                ...(playerId ? [{ userId: playerId, role: "ORGANIZER" as const }] : [{ guestName: guestName!, role: "ORGANIZER" as const }]),
                ...participantIds.filter((id) => id !== playerId).map((userId) => ({ userId, role: "PLAYER" as const, status: "INVITED" as const })),
              ],
            },
            payments: { create: { amountCents: slot.quote.totalCents, status: "PENDING", method: "NONE" } },
          },
          select: bookingSelect,
        });
        await audit({ actorId: a.id, action: "booking.created", entityType: "Booking", entityId: created.id, locationId, metadata: { code, courtId: req.courtId, startsAt: slot.startsAt, durationMinutes: req.durationMinutes, priceCents: slot.quote.totalCents, onBehalf } }, tx);
        return created;
      },
      { isolationLevel: "ReadCommitted" },
    );
    if (booking.playerId) {
      const z = utcToZoned(booking.startsAt, slot.location.timezone);
      await notify(booking.playerId, {
        type: "booking.confirmed",
        url: `/app/bookings/${booking.id}`,
        data: { code: booking.confirmationCode, club: slot.location.name, court: slot.court.name, when: `${z.dateISO} ${String(Math.floor(z.minutes / 60)).padStart(2, "0")}:${String(z.minutes % 60).padStart(2, "0")}`, duration: req.durationMinutes, bookingId: booking.id },
      });
    }
    return booking;
  } catch (e) {
    if (isOverlapError(e)) throw new AppError("SLOT_UNAVAILABLE", "That slot was just taken. Pick another time.");
    throw e;
  }
}

/* ------------------------------------------------------------------ Read */

async function loadBooking(bookingId: string) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: bookingSelect });
  if (!booking) throw notFound("Booking");
  return booking;
}

function isParty(actor: Actor, booking: BookingView): boolean {
  return booking.playerId === actor.id || booking.participants.some((p) => p.user?.id === actor.id);
}

export async function getBooking(actor: Actor | null, bookingId: string): Promise<BookingView> {
  const a = await requireActor(actor);
  const booking = await loadBooking(bookingId);
  if (isParty(a, booking)) return booking;
  if (await can(a, "booking.read", { locationId: booking.locationId })) return booking;
  throw forbidden();
}

/** Marks CONFIRMED bookings whose end time has passed as COMPLETED. Cheap enough to run on reads. */
export async function completeElapsedBookings(now = new Date()): Promise<number> {
  const res = await db.booking.updateMany({ where: { status: "CONFIRMED", endsAt: { lt: now } }, data: { status: "COMPLETED" } });
  return res.count;
}

export async function listMyBookings(actor: Actor | null, scope: "upcoming" | "past", now = new Date()): Promise<BookingView[]> {
  const a = await requirePermission(actor, "booking.read.own");
  await completeElapsedBookings(now);
  const party: Prisma.BookingWhereInput = { OR: [{ playerId: a.id }, { participants: { some: { userId: a.id, status: { in: ["JOINED", "INVITED"] } } } }] };
  if (scope === "upcoming") {
    return db.booking.findMany({ where: { ...party, status: { in: ACTIVE }, endsAt: { gte: now } }, select: bookingSelect, orderBy: { startsAt: "asc" } });
  }
  return db.booking.findMany({ where: { ...party, OR: undefined, AND: [party, { OR: [{ status: { notIn: ACTIVE } }, { endsAt: { lt: now } }] }] }, select: bookingSelect, orderBy: { startsAt: "desc" }, take: 100 });
}

export async function listLocationBookings(actor: Actor | null, input: unknown, now = new Date()) {
  const parsed = bookingListSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the filters.", fieldErrors(parsed.error));
  const { locationId, dateISO, status, q, page, pageSize } = parsed.data;
  const a = await requirePermission(actor, "booking.read", { locationId });
  await completeElapsedBookings(now);
  const loc = await db.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
  if (!loc) throw notFound("Location");
  const where: Prisma.BookingWhereInput = { locationId };
  if (dateISO) where.AND = [{ startsAt: { gte: zonedToUtc(dateISO, 0, loc.timezone) } }, { startsAt: { lt: zonedToUtc(dateISO, 24 * 60, loc.timezone) } }];
  if (status) where.status = status;
  if (q) where.OR = [{ confirmationCode: { contains: q.toUpperCase() } }, { guestName: { contains: q, mode: "insensitive" } }, { player: { name: { contains: q, mode: "insensitive" } } }, { player: { email: { contains: q, mode: "insensitive" } } }];
  const [items, total] = await Promise.all([
    db.booking.findMany({ where, select: bookingSelect, orderBy: { startsAt: dateISO ? "asc" : "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.booking.count({ where }),
  ]);
  void a;
  return { items, total, page, pageSize };
}

/** Bookings across every location the actor can read (admin dashboard). */
export async function listBookingsInScope(actor: Actor | null, opts: { from: Date; to: Date; take?: number }): Promise<BookingView[]> {
  const a = await requireActor(actor);
  const scope = await accessibleLocationIds(a, "booking.read");
  if (scope !== "all" && scope.length === 0) throw forbidden();
  await completeElapsedBookings();
  return db.booking.findMany({
    where: { ...(scope === "all" ? {} : { locationId: { in: scope } }), startsAt: { gte: opts.from, lt: opts.to } },
    select: bookingSelect,
    orderBy: { startsAt: "asc" },
    take: opts.take ?? 50,
  });
}

/* ------------------------------------------------------------------ Cancel / reschedule / status */

async function assertCanChange(a: Actor, booking: BookingView, now: Date, verb: "cancel" | "reschedule"): Promise<{ staff: boolean }> {
  const owner = booking.playerId === a.id;
  const staff = await can(a, "booking.manage", { locationId: booking.locationId });
  if (!owner && !staff) throw forbidden();
  if (owner && !staff) await requirePermission(a, "booking.cancel.own");
  if (!ACTIVE.includes(booking.status)) throw new AppError("CANCELLATION_NOT_ALLOWED", `This booking is already ${booking.status.toLowerCase().replace("_", "-")}.`);
  if (booking.startsAt <= now) throw new AppError("CANCELLATION_NOT_ALLOWED", `The session has already started and cannot be ${verb === "cancel" ? "cancelled" : "rescheduled"}.`);
  if (!staff) {
    const cutoffHours = booking.location.bookingPolicy?.cancellationCutoffHours ?? 12;
    if (booking.startsAt.getTime() - now.getTime() < cutoffHours * 3_600_000) {
      throw new AppError("CANCELLATION_NOT_ALLOWED", `Changes must be made at least ${cutoffHours} hours before the session. Contact the club for help.`);
    }
  }
  return { staff };
}

export async function cancelBooking(actor: Actor | null, bookingId: string, input: unknown = {}, opts: { now?: Date } = {}): Promise<BookingView> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const booking = await loadBooking(bookingId);
  const { staff } = await assertCanChange(a, booking, now, "cancel");

  let game = null as GameCascade | null;
  const updated = await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: a.id, cancellationReason: parsed.data.reason } });
    await tx.payment.updateMany({ where: { bookingId, status: "PAID" }, data: { status: "REFUNDED", refundedAt: now } });
    await tx.payment.updateMany({ where: { bookingId, status: "PENDING" }, data: { status: "CANCELLED" } });
    game = await cancelGameForBooking(tx, bookingId, a.id, now);
    await audit({ actorId: a.id, action: "booking.cancelled", entityType: "Booking", entityId: bookingId, locationId: booking.locationId, metadata: { byStaff: staff && booking.playerId !== a.id, reason: parsed.data.reason } }, tx);
    return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: bookingSelect });
  });
  if (booking.playerId && booking.playerId !== a.id) {
    await notify(booking.playerId, {
      type: "booking.cancelled",
      url: `/app/bookings/${bookingId}`,
      data: { code: booking.confirmationCode, club: booking.location.name, when: formatInZone(booking.startsAt, booking.location.timezone), reasonSuffix: suffix(parsed.data.reason ? `Reason: ${parsed.data.reason}` : ""), bookingId },
    });
  }
  if (game) {
    const g: GameCascade = game;
    await notifyMany(g.userIds, {
      type: "game.cancelled",
      url: `/app/play/${g.code}`,
      groupKey: g.gameId,
      data: { code: g.code, club: booking.location.name, when: formatInZone(booking.startsAt, booking.location.timezone), reasonSuffix: " The court booking was cancelled.", gameId: g.gameId },
    });
  }
  return updated;
}

/** Moves a booking to a new slot atomically: the old booking is cancelled and a linked new one created. */
export async function rescheduleBooking(actor: Actor | null, bookingId: string, input: unknown, opts: { now?: Date } = {}): Promise<BookingView> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const old = await loadBooking(bookingId);
  const { staff } = await assertCanChange(a, old, now, "reschedule");
  const newCourt = await db.court.findUnique({ where: { id: parsed.data.courtId }, select: { locationId: true } });
  if (!newCourt) throw notFound("Court");
  if (newCourt.locationId !== old.locationId) throw validation("Rescheduling must stay within the same location.");
  const slot = await validateSlot(parsed.data, { now, staff, excludeBookingId: old.id });
  let movedGame = null as GameCascade | null;

  try {
    const created = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Court" WHERE "id" IN (${old.courtId}, ${parsed.data.courtId}) FOR UPDATE`;
        await tx.booking.update({ where: { id: old.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: a.id, cancellationReason: "Rescheduled" } });
        const clash = await tx.booking.findFirst({ where: { courtId: parsed.data.courtId, status: { in: ACTIVE }, startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } }, select: { id: true } });
        if (clash) throw new AppError("SLOT_UNAVAILABLE", "That slot was just taken. Pick another time.");

        let code = confirmationCode();
        for (let i = 0; i < 5 && (await tx.booking.findUnique({ where: { confirmationCode: code }, select: { id: true } })); i++) code = confirmationCode();
        const paid = old.payments.find((p) => p.status === "PAID");
        const b = await tx.booking.create({
          data: {
            confirmationCode: code,
            courtId: parsed.data.courtId,
            locationId: old.locationId,
            playerId: old.playerId,
            guestName: old.guestName,
            guestPhone: old.guestPhone,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            durationMinutes: parsed.data.durationMinutes,
            status: "CONFIRMED",
            source: old.source,
            priceCents: slot.quote.totalCents,
            notes: old.notes,
            createdById: a.id,
            rescheduledFromId: old.id,
            participants: { create: old.participants.map((p) => ({ userId: p.user?.id ?? null, guestName: p.guestName, role: p.role, status: p.status })) },
            payments: paid ? undefined : { create: { amountCents: slot.quote.totalCents, status: "PENDING", method: "NONE" } },
          },
          select: bookingSelect,
        });
        if (paid) await tx.payment.update({ where: { id: paid.id }, data: { bookingId: b.id } });
        await tx.payment.updateMany({ where: { bookingId: old.id, status: "PENDING" }, data: { status: "CANCELLED" } });
        movedGame = await moveGameToBooking(tx, old.id, { id: b.id, courtId: b.courtId, startsAt: b.startsAt, endsAt: b.endsAt }, a.id);
        await audit({ actorId: a.id, action: "booking.rescheduled", entityType: "Booking", entityId: b.id, locationId: old.locationId, metadata: { from: old.id, fromStartsAt: old.startsAt, toStartsAt: slot.startsAt, courtId: parsed.data.courtId } }, tx);
        return tx.booking.findUniqueOrThrow({ where: { id: b.id }, select: bookingSelect });
      },
      { isolationLevel: "ReadCommitted" },
    );
    if (created.playerId && created.playerId !== a.id) {
      await notify(created.playerId, {
        type: "booking.rescheduled",
        url: `/app/bookings/${created.id}`,
        data: { code: created.confirmationCode, club: created.location.name, court: created.court.name, when: formatInZone(created.startsAt, created.location.timezone), bookingId: created.id },
      });
    }
    if (movedGame) {
      const g: GameCascade = movedGame;
      await notifyMany(g.userIds, {
        type: "game.moved",
        url: `/app/play/${g.code}`,
        groupKey: g.gameId,
        data: { code: g.code, club: created.location.name, court: created.court.name, when: formatInZone(created.startsAt, created.location.timezone), gameId: g.gameId },
      });
    }
    return created;
  } catch (e) {
    if (isOverlapError(e)) throw new AppError("SLOT_UNAVAILABLE", "That slot was just taken. Pick another time.");
    throw e;
  }
}

/** Staff mark attendance after the start time. */
export async function setBookingStatus(actor: Actor | null, bookingId: string, status: "COMPLETED" | "NO_SHOW", opts: { now?: Date } = {}): Promise<BookingView> {
  const booking = await loadBooking(bookingId);
  const a = await requirePermission(actor, "booking.manage", { locationId: booking.locationId });
  const now = opts.now ?? new Date();
  if (!["CONFIRMED", "COMPLETED", "NO_SHOW"].includes(booking.status)) throw validation(`A ${booking.status.toLowerCase()} booking cannot be marked ${status.toLowerCase().replace("_", "-")}.`);
  if (booking.startsAt > now) throw validation("Attendance can only be recorded once the session has started.");
  return db.$transaction(async (tx) => {
    const b = await tx.booking.update({ where: { id: bookingId }, data: { status }, select: bookingSelect });
    await audit({ actorId: a.id, action: `booking.${status.toLowerCase()}`, entityType: "Booking", entityId: bookingId, locationId: booking.locationId }, tx);
    return b;
  });
}

/** Records payment taken at the venue. Real providers will write Payment rows through webhooks later. */
export async function recordPayment(actor: Actor | null, bookingId: string, input: unknown, opts: { now?: Date } = {}): Promise<BookingView> {
  const booking = await loadBooking(bookingId);
  const a = await requirePermission(actor, "payment.manage", { locationId: booking.locationId });
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  if (booking.status === "CANCELLED") throw validation("Cannot take payment for a cancelled booking.");
  const pending = booking.payments.find((p) => p.status === "PENDING");
  const now = opts.now ?? new Date();
  return db.$transaction(async (tx) => {
    if (pending) await tx.payment.update({ where: { id: pending.id }, data: { status: parsed.data.status, method: parsed.data.method, paidAt: now } });
    else await tx.payment.create({ data: { bookingId, amountCents: booking.priceCents, status: parsed.data.status, method: parsed.data.method, paidAt: now } });
    await audit({ actorId: a.id, action: "payment.recorded", entityType: "Booking", entityId: bookingId, locationId: booking.locationId, metadata: parsed.data }, tx);
    return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: bookingSelect });
  });
}
