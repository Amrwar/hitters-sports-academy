import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { accessibleLocationIds } from "@/lib/auth/authorize";
import { listPackages, listPurchasesInScope } from "@/server/services/packages";
import { listTrainersInScope } from "@/server/services/trainers";
import { listManagedLocations } from "@/server/services/locations";
import { listUsers } from "@/server/services/users";
import { PackagesAdmin } from "./packages-admin";

export const metadata = { title: "Packages" };

export const dynamic = "force-dynamic";

export default async function AdminPackagesPage() {
  const actor = await requireStaffOrRedirect();
  const manage = await accessibleLocationIds(actor, "package.manage");
  const canManage = manage === "all" || manage.length > 0;
  const [catalog, purchases, trainers, locations] = await Promise.all([listPackages(actor, { includeInactive: true }), canManage ? listPurchasesInScope(actor).catch(() => []) : [], listTrainersInScope(actor).catch(() => []), listManagedLocations(actor)]);
  const members = canManage ? await listUsers(actor, { pageSize: 200 }).then((r) => r.items.map((u) => ({ id: u.id, name: u.name, email: u.email }))).catch(() => []) : [];
  return (
    <PackagesAdmin
      catalog={catalog}
      purchases={purchases}
      trainers={trainers.map((t) => ({ id: t.id, name: t.user.name }))}
      locations={locations.filter((l) => manage === "all" || manage.includes(l.id)).map((l) => ({ id: l.id, name: l.name }))}
      members={members}
      canManage={canManage}
      isGlobal={!!actor.globalRole}
    />
  );
}
