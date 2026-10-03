import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { listManagedLocations } from "@/server/services/locations";
import { listCourts } from "@/server/services/courts";
import { CourtsAdmin } from "./courts-admin";

export const dynamic = "force-dynamic";

export default async function AdminCourtsPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { location } = await searchParams;
  const locations = await listManagedLocations(actor);
  const selected = locations.find((l) => l.id === location) ?? locations[0];
  const [courts, canManage] = selected ? await Promise.all([listCourts(actor, selected.id), can(actor, "court.manage", { locationId: selected.id })]) : [[], false];
  return <CourtsAdmin locations={locations.map((l) => ({ id: l.id, name: l.name }))} selectedId={selected?.id ?? null} courts={courts} canManage={canManage} />;
}
