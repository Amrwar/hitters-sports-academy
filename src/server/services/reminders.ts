/**
 * Time-driven notifications: the reminders nobody triggers by clicking something.
 *
 * Everything here is safe to run as often as you like. Each reminder carries a dedupe key built from the
 * booking or lesson id, and its catalogue entry has a quiet window measured in days, so a second run inside
 * the window finds the earlier notification and sends nothing. That is what keeps "do not spam users" true
 * even if a cron fires every five minutes.
 */
import { db } from "@/lib/db";
import { formatInZone } from "@/lib/time";
import { notify, notifyMany, dispatchPendingDeliveries } from "./notifications";

export type ReminderRun = { bookings: number; lessons: number; programs: number; dispatched: number };

/** The window a reminder covers: sessions starting between now and now + hours. */
const DEFAULT_HOURS = 24;

export async function sendDueReminders(opts: { now?: Date; hours?: number } = {}): Promise<ReminderRun> {
  const now = opts.now ?? new Date();
  const until = new Date(now.getTime() + (opts.hours ?? DEFAULT_HOURS) * 3_600_000);

  const [bookings, lessons, programSessions] = await Promise.all([
    db.booking.findMany({
      where: { status: { in: ["CONFIRMED", "PENDING"] }, startsAt: { gt: now, lte: until }, playerId: { not: null } },
      select: { id: true, playerId: true, confirmationCode: true, startsAt: true, court: { select: { name: true } }, location: { select: { name: true, timezone: true } } },
      take: 500,
    }),
    db.lesson.findMany({
      where: { status: "CONFIRMED", startsAt: { gt: now, lte: until } },
      select: {
        id: true,
        code: true,
        playerId: true,
        startsAt: true,
        durationMinutes: true,
        trainer: { select: { userId: true, user: { select: { name: true } } } },
        location: { select: { name: true, timezone: true } },
      },
      take: 500,
    }),
    db.programSession.findMany({
      where: { startsAt: { gt: now, lte: until }, program: { status: { in: ["OPEN", "FULL", "IN_PROGRESS"] } } },
      select: {
        id: true,
        startsAt: true,
        program: {
          select: {
            id: true,
            name: true,
            location: { select: { name: true, timezone: true } },
            trainer: { select: { userId: true } },
            enrollments: { where: { status: "ENROLLED" }, select: { playerId: true } },
          },
        },
      },
      take: 200,
    }),
  ]);

  let bookingCount = 0;
  for (const b of bookings) {
    if (!b.playerId) continue; // A walk-in booking has nobody to remind.
    const res = await notify(b.playerId, {
      type: "booking.reminder",
      url: `/app/bookings/${b.id}`,
      dedupeKey: `booking.reminder:${b.id}`,
      data: { code: b.confirmationCode, club: b.location.name, court: b.court.name, when: formatInZone(b.startsAt, b.location.timezone), bookingId: b.id },
    }).catch(() => null);
    if (res?.created) bookingCount++;
  }

  let lessonCount = 0;
  for (const l of lessons) {
    const data = { coach: l.trainer.user.name, club: l.location.name, when: formatInZone(l.startsAt, l.location.timezone), duration: l.durationMinutes, code: l.code, lessonId: l.id };
    const player = await notify(l.playerId, { type: "lesson.reminder", url: `/app/lessons/${l.id}`, dedupeKey: `lesson.reminder:${l.id}`, data }).catch(() => null);
    const coach = await notify(l.trainer.userId, { type: "lesson.reminder", url: "/admin/coaching", dedupeKey: `lesson.reminder:coach:${l.id}`, data }).catch(() => null);
    lessonCount += (player?.created ? 1 : 0) + (coach?.created ? 1 : 0);
  }

  // A program session reminder reuses the lesson wording: same shape, same quiet window, one per session.
  let programCount = 0;
  for (const s of programSessions) {
    const p = s.program;
    const recipients = [...p.enrollments.map((e) => e.playerId), p.trainer.userId];
    programCount += await notifyMany(recipients, {
      type: "lesson.reminder",
      url: `/app/programs/${p.id}`,
      dedupeKey: `program.session.reminder:${s.id}`,
      data: { coach: "your coach", club: p.location.name, when: formatInZone(s.startsAt, p.location.timezone), code: p.name },
    }).catch(() => 0);
  }

  // Anything queued for a channel that is now live goes out in the same pass.
  const { attempted } = await dispatchPendingDeliveries();
  return { bookings: bookingCount, lessons: lessonCount, programs: programCount, dispatched: attempted };
}
