import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { listManagedLocations } from "@/server/services/locations";
import { LocationsAdmin } from "./locations-admin";

export const dynamic = "force-dynamic";

export default async function AdminLocationsPage() {
  const actor = await requireStaffOrRedirect();
  const [locations, canCreate] = await Promise.all([listManagedLocations(actor), can(actor, "location.create")]);
  return <LocationsAdmin locations={locations} canCreate={canCreate} />;
}
