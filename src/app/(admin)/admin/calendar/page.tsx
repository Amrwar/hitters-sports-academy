import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { todayISO } from "@/lib/time";
import { listManagedLocations } from "@/server/services/locations";
import { getLocationSchedule } from "@/server/services/availability";
import { CalendarView } from "./calendar-view";

export const metadata = { title: "Court calendar" };

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<{ location?: string; date?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { location, date } = await searchParams;
  const locations = await listManagedLocations(actor);
  const selected = locations.find((l) => l.id === location) ?? locations[0];
  if (!selected) return <CalendarView locations={[]} schedule={null} canManage={false} />;
  const dateISO = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO(selected.timezone);
  const [schedule, canManage] = await Promise.all([getLocationSchedule(actor, selected.id, dateISO), can(actor, "court.manage", { locationId: selected.id })]);
  return <CalendarView locations={locations.map((l) => ({ id: l.id, name: l.name, timezone: l.timezone }))} schedule={schedule} canManage={canManage} />;
}
