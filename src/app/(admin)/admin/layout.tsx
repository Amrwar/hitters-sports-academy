import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/authorize";
import { ADMIN_NAV_PERMISSIONS } from "@/lib/auth/admin-nav";
import { AdminActorProvider } from "@/components/nav/admin-actor";
import { countUnread } from "@/server/services/notifications";
import { countOpenReports } from "@/server/services/messaging";
import type { Actor } from "@/lib/auth/authorize";

export const dynamic = "force-dynamic";

/**
 * Which admin pages this staff member may open.
 *
 * Checked unscoped: a manager at one club still needs Bookings in the sidebar, and the page itself
 * narrows what they see to their own clubs. A permission check that failed is treated as a no, because
 * the alternative is showing a link that errors.
 */
async function allowedNavHrefs(actor: Actor): Promise<string[]> {
  const entries = Object.entries(ADMIN_NAV_PERMISSIONS);
  const results = await Promise.all(
    entries.map(async ([href, permissions]) => {
      for (const permission of permissions) {
        if (await can(actor, permission).catch(() => false)) return href;
      }
      return null;
    }),
  );
  return results.filter((href): href is string => href !== null);
}

/** Gate for the whole admin area. Pages and actions re-check specific permissions. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaffOrRedirect();
  const [unread, openReports, navHrefs] = await Promise.all([countUnread(actor).catch(() => 0), countOpenReports(actor).catch(() => 0), allowedNavHrefs(actor)]);
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
        unread,
        openReports,
        navHrefs,
      }}
    >
      {children}
    </AdminActorProvider>
  );
}
