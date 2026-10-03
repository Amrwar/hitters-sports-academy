import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { todayISO } from "@/lib/time";
import { listManagedLocations } from "@/server/services/locations";
import { listCourts } from "@/server/services/courts";
import { listLocationBookings } from "@/server/services/bookings";
import { listUsers } from "@/server/services/users";
import { BookingsAdmin } from "./bookings-admin";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ location?: string; date?: string; status?: string; q?: string; all?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const sp = await searchParams;
  const locations = await listManagedLocations(actor);
  const selected = locations.find((l) => l.id === sp.location) ?? locations[0];
  if (!selected) return <BookingsAdmin locations={[]} selectedId={null} dateISO={null} status={null} query="" result={{ items: [], total: 0 }} courts={[]} members={[]} canManage={false} canPay={false} />;
  const dateISO = sp.all === "1" ? null : sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayISO(selected.timezone);
  const status = sp.status && ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(sp.status) ? (sp.status as "CONFIRMED") : null;
  const [result, courts, canManage, canPay] = await Promise.all([
    listLocationBookings(actor, { locationId: selected.id, dateISO: dateISO ?? undefined, status: status ?? undefined, q: sp.q || undefined }).catch(() => ({ items: [], total: 0 })),
    listCourts(actor, selected.id),
    can(actor, "booking.manage", { locationId: selected.id }),
    can(actor, "payment.manage", { locationId: selected.id }),
  ]);
  const members = canManage ? await listUsers(actor, { pageSize: 100 }).then((r) => r.items.map((u) => ({ id: u.id, name: u.name, email: u.email }))).catch(() => []) : [];
  return (
    <BookingsAdmin
      locations={locations.map((l) => ({ id: l.id, name: l.name, timezone: l.timezone }))}
      selectedId={selected.id}
      dateISO={dateISO}
      status={status}
      query={sp.q ?? ""}
      result={result}
      courts={courts.filter((c) => c.status !== "INACTIVE").map((c) => ({ id: c.id, name: c.name, durations: c.durationsMinutes }))}
      members={members}
      canManage={canManage}
      canPay={canPay}
    />
  );
}
