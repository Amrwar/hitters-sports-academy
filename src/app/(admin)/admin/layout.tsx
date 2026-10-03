import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { AdminActorProvider } from "@/components/nav/admin-actor";

export const dynamic = "force-dynamic";

/** Gate for the whole admin area. Pages and actions re-check specific permissions. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaffOrRedirect();
  const roleLabel = actor.globalRole ? ROLE_LABEL[actor.globalRole] : actor.memberships.length === 1 ? ROLE_LABEL[actor.memberships[0].role] : `${actor.memberships.length} roles`;
  return (
    <AdminActorProvider
      value={{
        id: actor.id,
        name: actor.name,
        email: actor.email,
        roleLabel,
        isGlobal: !!actor.globalRole,
        isSuperAdmin: actor.globalRole === "SUPER_ADMIN",
        locationIds: actor.memberships.map((m) => m.locationId),
      }}
    >
      {children}
    </AdminActorProvider>
  );
}
