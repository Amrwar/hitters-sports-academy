import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BookingStatusBadge, money } from "@/components/patterns/booking-status";
import { formatInZone, utcToZoned, minutesToHHMM } from "@/lib/time";
import type { BookingView } from "@/server/services/bookings";

/** Compact booking card used in lists (player and admin). */
export function BookingRow({ booking, href, showPlayer }: { booking: BookingView; href: string; showPlayer?: boolean }) {
  const tz = booking.location.timezone;
  const z = utcToZoned(new Date(booking.startsAt), tz);
  const dayLabel = formatInZone(new Date(booking.startsAt), tz, { weekday: "short" });
  return (
    <Link href={href} className="block">
      <Card variant="interactive" padding="sm">
        <div className="flex items-center gap-3">
          <div className="flex w-14 shrink-0 flex-col items-center rounded-md bg-surface-2 py-2 ring-1 ring-inset ring-line/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">{dayLabel}</span>
            <span className="text-h4 tabular">{minutesToHHMM(z.minutes)}</span>
            <span className="text-[10px] text-fg-subtle">{Number(z.dateISO.slice(8))}/{Number(z.dateISO.slice(5, 7))}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-bold">{showPlayer ? (booking.player?.name ?? booking.guestName ?? "Guest") : booking.location.name}</div>
            <div className="truncate text-caption text-fg-muted">
              {showPlayer ? `${booking.location.name.replace("HITTERS ", "")} · ` : ""}
              {booking.court.name} · {booking.durationMinutes} min · <span className="tabular">{money(booking.priceCents, booking.currency)}</span>
              {booking.payments[0]?.status === "PAID" ? " · paid" : ""}
            </div>
            <div className="mt-0.5 text-[11px] tabular text-fg-subtle">{booking.confirmationCode}</div>
          </div>
          <BookingStatusBadge status={booking.status} size="sm" />
        </div>
      </Card>
    </Link>
  );
}
