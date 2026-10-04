import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { listUsers } from "@/server/services/users";
import { listManagedLocations } from "@/server/services/locations";
import { MembersAdmin } from "./members-admin";

export const metadata = { title: "Members" };

export const dynamic = "force-dynamic";

export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { q, page } = await searchParams;
  const [result, locations, canSuspend, canAssess] = await Promise.all([
    listUsers(actor, { q, page: page ?? 1, pageSize: 50 }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 50 })),
    listManagedLocations(actor),
    can(actor, "users.suspend"),
    can(actor, "assessment.create"),
  ]);
  return <MembersAdmin users={result.items} total={result.total} query={q ?? ""} locations={locations.map((l) => ({ id: l.id, name: l.name }))} canSuspend={canSuspend} canAssess={canAssess} />;
}
