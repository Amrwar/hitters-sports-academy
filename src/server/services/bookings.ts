import type { BookingSource, BookingStatus, Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { dayOfWeekISO, formatInZone, utcToZoned, zonedToUtc } from "@/lib/time";
import { bookingListSchema, bookingRequestSchema, cancelBookingSchema, createBookingSchema, fieldErrors, recordPaymentSchema, type BookingRequest, type OpeningHours } from "@/lib/validation/schemas";
import { quotePrice, type Quote } from "./pricing";
import { createInvoice, recalculateInvoice } from "./invoices";
import { memberTier } from "./memberships";
import { cancellationCharge, getPaymentPolicy } from "./payment-policy";
import { depositFor } from "@/lib/payments/money";
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

type ValidateOpts = { now?: Date; excludeBookingId?: string; staff?: boolean; /** Whose membership prices this slot. A guest booking has none. */ playerId?: string | null };

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
    const windowDays = policy.advanceBookingDays + (await memberTier(opts.playerId, { now })).priorityBookingDays;
    if (startsAt.getTime() > now.getTime() + windowDays * 86_400_000) throw new AppError("SLOT_UNAVAILABLE", `You can book up to ${windowDays} days ahead.`);
  }

  const clash = await db.booking.findFirst({
    where: { courtId: court.id, status: { in: ACTIVE }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(opts.excludeBookingId ? { NOT: { id: opts.excludeBookingId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError("SLOT_UNAVAILABLE", "That slot is no longer available.");

  const rules = await db.pricingRule.findMany({ where: { locationId: loc.id, active: true } });
  const tier = await memberTier(opts.playerId, { now });
  const quote = quotePrice({
    rules,
    courtId: court.id,
    baseHourlyCents: window.priceCents,
    dateISO: req.dateISO,
    dayOfWeek,
    startMinutes: req.startMinutes,
    durationMinutes: req.durationMinutes,
    isMember: tier.isMember,
    membershipTier: tier.tier,
  });

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
  return validateSlot(parsed.data, { now: opts.now, staff, playerId: a.id });
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

  const slot = await validateSlot(req, { now, staff, playerId });
  const policy = await getPaymentPolicy(locationId);

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
        // The money record is raised in the same transaction as the reservation: a booking that exists
        // with nothing owed against it is a booking the club cannot bill for.
        await createInvoice(
          tx,
          {
            playerId,
            guestName,
            guestPhone,
            locationId,
            bookingId: created.id,
            createdById: a.id,
            depositCents: depositFor(slot.quote.totalCents, policy.depositPercent),
            lines: [
              { kind: "COURT", description: `${slot.court.name} \u00b7 ${slot.location.name} \u00b7 ${formatInZone(slot.startsAt, slot.location.timezone)} \u00b7 ${req.durationMinutes} min`, unitCents: slot.quote.baseCents },
              ...slot.quote.adjustments.map((adj) => ({ kind: (adj.deltaCents < 0 ? "DISCOUNT" : "COURT") as "DISCOUNT" | "COURT", description: adj.name, unitCents: Math.abs(adj.deltaCents) * (adj.deltaCents < 0 ? -1 : 1) })),
            ],
          },
          now,
        );
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
        data: { code: booking.confirmationCode, club: slot.location.name, court: slot.court.name, when: formatInZone(booking.startsAt, slot.location.timezone), duration: req.durationMinutes, bookingId: booking.id },
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

/**
 * Settles the money on a cancelled booking, according to the club's policy.
 *
 * Three outcomes, and the receipt explains which one happened:
 *
 * - Cancelled in good time, or nothing was paid: the invoice is voided and nothing changes hands.
 * - Cancelled late: a fee line is added, so the invoice shows what was kept and why, and the rest goes
 *   back. A club that keeps money without a line explaining it gets asked about it at the desk.
 * - Cancelled inside the no-refund window: the whole amount is kept, again as a line on the document.
 *
 * A late fee is charged whoever cancels, including a receptionist doing it for a player who rang up,
 * because the player is still the one who changed their mind. A club cancelling its own booking waives
 * it explicitly: nothing in the actor distinguishes "the court flooded" from "they called to cancel",
 * so the person at the desk says which it is.
 *
 * Failures are swallowed deliberately — a refund that cannot be reached must not leave a booking the
 * player thinks is cancelled still sitting on a court.
 */
async function settleCancelledBooking(
  actor: Actor,
  booking: BookingView,
  opts: { now: Date; staff: boolean; noShow: boolean; reason: string | null; waiveFee?: boolean },
): Promise<{ feeCents: number; refundedCents: number }> {
  const invoice = await db.invoice.findFirst({ where: { bookingId: booking.id, voidedAt: null }, select: { id: true, totalCents: true, paidCents: true, refundedCents: true } });
  if (!invoice) return { feeCents: 0, refundedCents: 0 };

  const paid = Math.max(0, invoice.paidCents - invoice.refundedCents);
  const { voidInvoice } = await import("./invoices");
  if (paid === 0) {
    await voidInvoice(actor, invoice.id, opts.noShow ? "No-show" : "Booking cancelled", { now: opts.now }).catch(() => undefined);
    return { feeCents: 0, refundedCents: 0 };
  }

  // Only staff may waive the fee, and only by saying so.
  const waived = !!opts.waiveFee && opts.staff;
  const policy = await getPaymentPolicy(booking.locationId);
  const cutoffHours = booking.location.bookingPolicy?.cancellationCutoffHours ?? 12;
  const hoursBeforeStart = (booking.startsAt.getTime() - opts.now.getTime()) / 3_600_000;
  const charge = waived
    ? { chargeCents: 0, refundCents: paid, reason: null }
    : cancellationCharge({ policy, totalCents: paid, hoursBeforeStart, cancellationCutoffHours: cutoffHours, noShow: opts.noShow });

  try {
    const { refundWithFee } = await import("./refunds");
    await refundWithFee(actor, invoice.id, {
      feeCents: charge.chargeCents,
      feeDescription: charge.reason ?? (opts.noShow ? "No-show fee" : "Cancellation fee"),
      reason: opts.reason ?? (opts.noShow ? "No-show" : "Booking cancelled"),
      now: opts.now,
      key: `booking-cancel:${booking.id}`,
    });
  } catch {
    // Left for the finance screen to pick up: the booking is cancelled either way.
    return { feeCents: charge.chargeCents, refundedCents: 0 };
  }
  return { feeCents: charge.chargeCents, refundedCents: charge.refundCents };
}

export async function cancelBooking(actor: Actor | null, bookingId: string, input: unknown = {}, opts: { now?: Date } = {}): Promise<BookingView> {
  const a = await requireActor(actor);
  const now = opts.now ?? new Date();
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const booking = await loadBooking(bookingId);
  const { staff } = await assertCanChange(a, booking, now, "cancel");

  const settlement = await settleCancelledBooking(a, booking, { now, staff, noShow: false, reason: parsed.data.reason ?? null, waiveFee: parsed.data.waiveFee });

  let game = null as GameCascade | null;
  const updated = await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: a.id, cancellationReason: parsed.data.reason } });
    // Anything still owed is cancelled; what was paid has already been dealt with by the policy above.
    await tx.payment.updateMany({ where: { bookingId, status: "PENDING" }, data: { status: "CANCELLED" } });
    game = await cancelGameForBooking(tx, bookingId, a.id, now);
    await audit({ actorId: a.id, action: "booking.cancelled", entityType: "Booking", entityId: bookingId, locationId: booking.locationId, metadata: { byStaff: staff && booking.playerId !== a.id, reason: parsed.data.reason, waiveFee: parsed.data.waiveFee, feeCents: settlement.feeCents, refundedCents: settlement.refundedCents } }, tx);
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
  const slot = await validateSlot(parsed.data, { now, staff, excludeBookingId: old.id, playerId: old.playerId });
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

        const invoice = await tx.invoice.findFirst({ where: { bookingId: old.id, voidedAt: null }, select: { id: true } });
        if (invoice) {
          await tx.invoice.update({ where: { id: invoice.id }, data: { bookingId: b.id } });
          await tx.payment.updateMany({ where: { invoiceId: invoice.id }, data: { bookingId: b.id } });
          await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id, kind: "COURT" } });
          await tx.invoiceLine.create({
            data: {
              invoiceId: invoice.id,
              kind: "COURT",
              description: `${slot.court.name} \u00b7 ${slot.location.name} \u00b7 ${formatInZone(slot.startsAt, slot.location.timezone)} \u00b7 ${parsed.data.durationMinutes} min`,
              quantity: 1,
              unitCents: slot.quote.totalCents,
              amountCents: slot.quote.totalCents,
              sortOrder: 0,
            },
          });
          await recalculateInvoice(tx, invoice.id, now);
        }
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

/**
 * Records money taken at the desk for a booking.
 *
 * Kept as a booking-shaped entry point because that is where a receptionist is standing, but the money
 * itself goes through the invoice: one path, one idempotency key, one audit entry, whatever is being
 * paid for. A booking raised before invoices existed has none, so one is raised now rather than letting
 * the desk fail on old data.
 */
export async function recordPayment(actor: Actor | null, bookingId: string, input: unknown, opts: { now?: Date } = {}): Promise<BookingView> {
  const booking = await loadBooking(bookingId);
  await requirePermission(actor, "payment.manage", { locationId: booking.locationId });
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  if (booking.status === "CANCELLED") throw validation("Cannot take payment for a cancelled booking.");
  const now = opts.now ?? new Date();

  const invoiceId = await ensureBookingInvoice(booking, actor?.id ?? null, now);
  const { takePayment } = await import("./payments");
  await takePayment(actor, invoiceId, { method: parsed.data.method, waive: parsed.data.status === "WAIVED" }, { now });
  return loadBooking(bookingId);
}

/** Raises the invoice a booking should already have. Only old bookings reach this. */
async function ensureBookingInvoice(booking: BookingView, actorId: string | null, now: Date): Promise<string> {
  const existing = await db.invoice.findFirst({ where: { bookingId: booking.id, voidedAt: null }, select: { id: true } });
  if (existing) return existing.id;
  return db.$transaction(async (tx) => {
    const created = await createInvoice(
      tx,
      {
        playerId: booking.playerId,
        guestName: booking.guestName,
        guestPhone: booking.guestPhone,
        locationId: booking.locationId,
        bookingId: booking.id,
        createdById: actorId,
        lines: [{ kind: "COURT", description: `${booking.court.name} \u00b7 ${booking.location.name} \u00b7 ${formatInZone(booking.startsAt, booking.location.timezone)} \u00b7 ${booking.durationMinutes} min`, unitCents: booking.priceCents }],
      },
      now,
    );
    return created.id;
  });
}
