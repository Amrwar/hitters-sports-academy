import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { accessibleLocationIds } from "@/lib/auth/authorize";
import { listStaff } from "@/server/services/staff";
import { listManagedLocations } from "@/server/services/locations";
import { listUsers } from "@/server/services/users";
import { StaffAdmin } from "./staff-admin";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const actor = await requireStaffOrRedirect();
  const manageScope = await accessibleLocationIds(actor, "staff.manage");
  const [memberships, locations, users] = await Promise.all([
    listStaff(actor).catch(() => []),
    listManagedLocations(actor),
    manageScope === "all" || manageScope.length ? listUsers(actor, { pageSize: 100 }).then((r) => r.items) : Promise.resolve([]),
  ]);
  const grantable = manageScope === "all" ? locations : locations.filter((l) => manageScope.includes(l.id));
  return (
    <StaffAdmin
      memberships={memberships}
      locations={grantable.map((l) => ({ id: l.id, name: l.name }))}
      users={users.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
      canGrant={manageScope === "all" || manageScope.length > 0}
    />
  );
}
