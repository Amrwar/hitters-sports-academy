import { notFound } from "next/navigation";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { isAppError } from "@/lib/errors";
import { getBooking } from "@/server/services/bookings";
import { BookingDetail } from "./booking-detail";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActorOrRedirect();
  const { id } = await params;
  try {
    const booking = await getBooking(actor, id);
    return <BookingDetail booking={booking} viewerId={actor.id} />;
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
