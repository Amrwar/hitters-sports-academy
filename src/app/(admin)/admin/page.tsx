import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { redirect } from "next/navigation";
import { accessibleLocationIds, can } from "@/lib/auth/authorize";
import { db } from "@/lib/db";
import { listBookingsInScope } from "@/server/services/bookings";
import { listManagedLocations } from "@/server/services/locations";
import { DashboardView } from "./dashboard-view";

export const metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const actor = await requireStaffOrRedirect();

  // A coach's dashboard is their own calendar, not the club's operations. Someone who coaches and does
  // nothing else lands on Coaching; a manager who also coaches still gets the club view, because running
  // the club is the larger part of their job.
  const [coachesHere, runsTheClub] = await Promise.all([can(actor, "trainer.self"), can(actor, "booking.manage")]);
  if (coachesHere && !runsTheClub) redirect("/admin/coaching");

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(dayStart.getUTCHours() - 3, 0, 0, 0); // generous window: today in any supported zone
  const dayEnd = new Date(dayStart.getTime() + 30 * 3_600_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const scope = await accessibleLocationIds(actor, "booking.read");
  const locWhere = scope === "all" ? {} : { locationId: { in: scope } };
  const canRead = scope === "all" || scope.length > 0;

  const [locations, today, monthAgg, members, unverified] = await Promise.all([
    listManagedLocations(actor),
    canRead ? listBookingsInScope(actor, { from: dayStart, to: dayEnd, take: 100 }) : Promise.resolve([]),
    canRead
      ? db.booking.aggregate({ where: { ...locWhere, status: { in: ["CONFIRMED", "COMPLETED"] }, startsAt: { gte: monthStart } }, _sum: { priceCents: true }, _count: { _all: true } })
      : Promise.resolve({ _sum: { priceCents: 0 }, _count: { _all: 0 } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { status: "ACTIVE", emailVerifiedAt: null } }),
  ]);
  const slotsToday = locations.reduce((n, l) => n + l.activeCourts * 17, 0);
  const occupancy = slotsToday ? Math.round((today.filter((b) => b.status !== "CANCELLED").length / slotsToday) * 100) : 0;

  return (
    <DashboardView
      today={today}
      now={now.getTime()}
      stats={{ bookingsToday: today.filter((b) => b.status !== "CANCELLED").length, occupancy, revenueMtdCents: monthAgg._sum.priceCents ?? 0, bookingsMtd: monthAgg._count._all, members, unverified }}
      locations={locations.map((l) => ({ id: l.id, name: l.name, activeCourts: l.activeCourts, courts: l._count.courts }))}
    />
  );
}
