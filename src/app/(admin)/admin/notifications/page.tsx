import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { accessibleLocationIds, can } from "@/lib/auth/authorize";
import { db } from "@/lib/db";
import { deliveryStats, listTemplates } from "@/server/services/notifications";
import { NotificationsView, type DeliveryStat, type TemplateDto } from "./notifications-view";

export const metadata = { title: "Notifications" };

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const actor = await requireStaffOrRedirect();
  const [canConfigure, canAnnounce, scope] = await Promise.all([can(actor, "notification.configure"), can(actor, "announcement.send"), accessibleLocationIds(actor, "announcement.send")]);

  const [templates, stats, locations] = await Promise.all([
    canConfigure ? listTemplates(actor) : Promise.resolve([]),
    canConfigure ? deliveryStats(actor) : Promise.resolve([]),
    db.location.findMany({
      where: { status: "ACTIVE", ...(scope === "all" ? {} : { id: { in: scope } }) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const dto: TemplateDto[] = templates.map((t) => ({
    type: t.type,
    category: t.category,
    title: t.title,
    body: t.body,
    enabled: t.enabled,
    channels: t.channels,
    vars: t.vars,
    defaults: t.defaults,
    updatedBy: t.updatedBy?.name ?? null,
  }));

  return (
    <NotificationsView
      templates={dto}
      stats={stats as DeliveryStat[]}
      locations={locations}
      canConfigure={canConfigure}
      canAnnounce={canAnnounce}
      academyWide={scope === "all"}
    />
  );
}
