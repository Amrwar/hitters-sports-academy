import { notFound } from "next/navigation";
import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { isAppError } from "@/lib/errors";
import { getBooking } from "@/server/services/bookings";
import { db } from "@/lib/db";
import { AdminBookingDetail } from "./admin-booking-detail";

export const metadata = { title: "Booking" };

export const dynamic = "force-dynamic";

export default async function AdminBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { id } = await params;
  try {
    const booking = await getBooking(actor, id);
    const [canManage, canPay, logs] = await Promise.all([
      can(actor, "booking.manage", { locationId: booking.locationId }),
      can(actor, "payment.manage", { locationId: booking.locationId }),
      db.auditLog.findMany({ where: { entityType: "Booking", entityId: { in: [booking.id, booking.rescheduledFromId ?? ""] } }, orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } }),
    ]);
    return <AdminBookingDetail booking={booking} canManage={canManage} canPay={canPay} logs={logs.map((l) => ({ id: l.id, action: l.action, at: l.createdAt, by: l.actor?.name ?? "System" }))} />;
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
