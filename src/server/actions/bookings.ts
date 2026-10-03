"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import * as bookings from "@/server/services/bookings";
import { getLocationSchedule, type LocationSchedule } from "@/server/services/availability";

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

const PLAYER_PATHS = ["/app", "/app/bookings", "/app/profile", "/admin/bookings", "/admin/calendar", "/admin"];

export async function getScheduleAction(locationId: string, dateISO: string): Promise<ActionResult<LocationSchedule>> {
  return run(async () => getLocationSchedule(await getActor(), locationId, dateISO));
}

export async function quoteBookingAction(input: { courtId: string; dateISO: string; startMinutes: number; durationMinutes: number }): Promise<ActionResult<bookings.BookingQuote>> {
  return run(async () => bookings.quoteBooking(await getActor(), input));
}

export async function createBookingAction(input: Record<string, unknown>): Promise<ActionResult<bookings.BookingView>> {
  return run(async () => bookings.createBooking(await getActor(), input), PLAYER_PATHS);
}

export async function cancelBookingAction(bookingId: string, reason?: string): Promise<ActionResult<bookings.BookingView>> {
  return run(async () => bookings.cancelBooking(await getActor(), bookingId, { reason }), [...PLAYER_PATHS, `/app/bookings/${bookingId}`, `/admin/bookings/${bookingId}`]);
}

export async function rescheduleBookingAction(bookingId: string, input: { courtId: string; dateISO: string; startMinutes: number; durationMinutes: number }): Promise<ActionResult<bookings.BookingView>> {
  return run(async () => bookings.rescheduleBooking(await getActor(), bookingId, input), [...PLAYER_PATHS, `/app/bookings/${bookingId}`]);
}

export async function setBookingStatusAction(bookingId: string, status: "COMPLETED" | "NO_SHOW"): Promise<ActionResult<bookings.BookingView>> {
  return run(async () => bookings.setBookingStatus(await getActor(), bookingId, status), ["/admin/bookings", `/admin/bookings/${bookingId}`, "/admin"]);
}

export async function recordPaymentAction(bookingId: string, input: { method: "CASH" | "CARD" | "WALLET"; status?: "PAID" | "WAIVED" }): Promise<ActionResult<bookings.BookingView>> {
  return run(async () => bookings.recordPayment(await getActor(), bookingId, input), ["/admin/bookings", `/admin/bookings/${bookingId}`, `/app/bookings/${bookingId}`]);
}
