import { CalendarPlus, CalendarX } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyBookings } from "@/server/services/bookings";
import { BookingRow } from "@/components/patterns/booking-row";
import { ScopeTabs } from "./scope-tabs";

export const dynamic = "force-dynamic";

export default async function MyBookingsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const actor = await requireActorOrRedirect("/app/bookings");
  const { scope } = await searchParams;
  const current = scope === "past" ? "past" : "upcoming";
  const items = await listMyBookings(actor, current);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Reservations" title="My bookings" action={<Button size="sm" href="/app/book" leftIcon={<CalendarPlus />}>Book</Button>} />
      <ScopeTabs current={current} />
      {items.length === 0 ? (
        current === "upcoming" ? (
          <EmptyState icon={<CalendarPlus />} title="No upcoming bookings" description="Reserve a court at any HITTERS club in a few taps." action={<Button href="/app/book">Book a court</Button>} />
        ) : (
          <EmptyState icon={<CalendarX />} title="No past bookings" description="Your completed and cancelled bookings will appear here." />
        )
      ) : (
        <div className="space-y-2.5">
          {items.map((b) => (
            <BookingRow key={b.id} booking={b} href={`/app/bookings/${b.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
