import { Suspense } from "react";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listPublicLocations } from "@/server/services/locations";
import { getBooking } from "@/server/services/bookings";
import { BookingFlow } from "./booking-flow";

export const dynamic = "force-dynamic";

export default async function BookPage({ searchParams }: { searchParams: Promise<{ location?: string; reschedule?: string }> }) {
  const actor = await requireActorOrRedirect("/app/book");
  const { location, reschedule } = await searchParams;
  const locations = await listPublicLocations();
  const rescheduling = reschedule ? await getBooking(actor, reschedule).catch(() => null) : null;
  const initialLocationId = rescheduling?.locationId ?? locations.find((l) => l.slug === location || l.id === location)?.id ?? locations.find((l) => l.status === "ACTIVE")?.id ?? null;
  return (
    <Suspense fallback={null}>
      <BookingFlow
        locations={locations.filter((l) => l.status === "ACTIVE").map((l) => ({ id: l.id, slug: l.slug, name: l.name, timezone: l.timezone, allowedDurations: l.bookingPolicy?.allowedDurations ?? [60, 90, 120], advanceDays: l.bookingPolicy?.advanceBookingDays ?? 14 }))}
        initialLocationId={initialLocationId}
        rescheduling={rescheduling ? { id: rescheduling.id, code: rescheduling.confirmationCode, courtName: rescheduling.court.name, startsAt: rescheduling.startsAt } : null}
        emailVerified={!!actor.emailVerifiedAt}
      />
    </Suspense>
  );
}
