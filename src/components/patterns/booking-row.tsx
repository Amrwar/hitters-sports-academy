import Link from "next/link";
import { ChevronRight, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { BookingStatusBadge, money } from "@/components/patterns/booking-status";
import { formatInZone, utcToZoned, minutesToHHMM } from "@/lib/time";
import type { BookingView } from "@/server/services/bookings";

/**
 * A booking in a list.
 *
 * The date block reads as a calendar tile (day, number, month) rather than cramming the time into it, so the
 * time can lead the detail line where it belongs beside the court. `featured` lifts the soonest booking out
 * of the stack, because in a list of three the next one is the only one most people are looking for.
 */
export function BookingRow({ booking, href, showPlayer, featured }: { booking: BookingView; href: string; showPlayer?: boolean; featured?: boolean }) {
  const tz = booking.location.timezone;
  const at = new Date(booking.startsAt);
  const z = utcToZoned(at, tz);
  const day = formatInZone(at, tz, { weekday: "short" });
  const month = formatInZone(at, tz, { month: "short" });
  const paid = booking.payments[0]?.status === "PAID";
  const title = showPlayer ? (booking.player?.name ?? booking.guestName ?? "Guest") : booking.location.name;

  return (
    <Link href={href} className="group block">
      <Card variant="interactive" padding="none" className={cn("overflow-hidden", featured && "border-blue-400/40 shadow-glow-sm")}>
        <div className="flex items-stretch">
          {/* Calendar tile. A thin brand rail on the featured card does the highlighting without shouting. */}
          <div className={cn("relative flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-line/10 py-3.5", featured ? "bg-brand-gradient text-white" : "bg-surface-2")}>
            <span className={cn("text-[10px] font-bold uppercase tracking-[0.14em]", featured ? "text-white/70" : "text-fg-subtle")}>{day}</span>
            <span className="text-h2 leading-none tabular">{Number(z.dateISO.slice(8))}</span>
            <span className={cn("text-[10px] font-semibold uppercase tracking-wider", featured ? "text-white/70" : "text-fg-subtle")}>{month}</span>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-body font-bold">{title}</span>
                <BookingStatusBadge status={booking.status} size="sm" />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-fg-muted">
                <span className="inline-flex items-center gap-1.5 font-semibold text-fg [&_svg]:size-3.5 [&_svg]:text-blue-300">
                  <Clock />
                  <span className="tabular">{minutesToHHMM(z.minutes)}</span>
                  <span className="font-normal text-fg-muted">· {booking.durationMinutes} min</span>
                </span>
                <span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:text-fg-subtle">
                  <MapPin />
                  {showPlayer ? `${booking.location.name.replace("HITTERS ", "")} · ` : ""}
                  {booking.court.name}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-caption">
                <span className="font-bold tabular text-fg">{money(booking.priceCents, booking.currency)}</span>
                <span className={cn("font-semibold", paid ? "text-success" : "text-fg-muted")}>{paid ? "Paid" : "Pay at the venue"}</span>
                <span className="ml-auto tabular text-fg-subtle">{booking.confirmationCode}</span>
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
