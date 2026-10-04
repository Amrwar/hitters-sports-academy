import Link from "next/link";
import { BellOff, Settings2 } from "lucide-react";
import type { NotificationCategory } from "@prisma/client";
import { PageHeader } from "@/components/nav/player-nav";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyNotifications, type NotificationGroup } from "@/server/services/notifications";
import { MarkAllRead, NotificationRow, type Row } from "./notification-rows";

export const metadata = { title: "Notifications" };

function relative(date: Date) {
  const m = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}

const isCategory = (v: string | undefined): v is NotificationCategory => !!v && NOTIFICATION_CATEGORIES.some((c) => c.value === v);

const toRow = (g: NotificationGroup): Row => ({
  key: g.key,
  id: g.latest.id,
  category: g.latest.category,
  title: g.latest.title,
  body: g.latest.body,
  time: relative(g.latest.createdAt),
  read: g.unread === 0,
  count: g.count,
  url: g.latest.url ?? "/app/notifications",
});

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const actor = await requireActorOrRedirect("/app/notifications");
  const { c } = await searchParams;
  const category = isCategory(c) ? c : undefined;
  const { groups, unread } = await listMyNotifications(actor, { category });

  const rows = groups.map(toRow);
  const fresh = rows.filter((r) => !r.read);
  const earlier = rows.filter((r) => r.read);
  const tabs = [{ value: undefined as NotificationCategory | undefined, label: "All" }, ...NOTIFICATION_CATEGORIES.map((x) => ({ value: x.value, label: x.label }))];

  return (
    <div className="space-y-6">
      <PageHeader
        back="/app"
        title="Notifications"
        action={
          <div className="flex items-center gap-1">
            {unread > 0 && <MarkAllRead category={category} />}
            <Link href="/app/notifications/preferences" aria-label="Notification settings" className="flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
              <Settings2 className="size-5" />
            </Link>
          </div>
        }
      />

      <nav aria-label="Filter by category" className="-mx-4 overflow-x-auto px-4 pb-1 no-scrollbar [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]">
        <div className="flex w-max gap-2 pr-6">
        {tabs.map((t) => {
          const active = t.value === category;
          return (
            <Link
              key={t.label}
              href={t.value ? `/app/notifications?c=${t.value}` : "/app/notifications"}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-body-sm font-semibold transition-all",
                active ? "border-blue-300/40 bg-brand-gradient text-white shadow-glow-sm" : "border-line/10 bg-surface-2 text-fg-muted hover:border-line/25 hover:text-fg",
              )}
            >
              {t.label}
            </Link>
          );
        })}
        </div>
      </nav>

      {rows.length === 0 && (
        <EmptyState
          icon={<BellOff />}
          title={category ? "Nothing here yet" : "You're all caught up"}
          description={category ? "Try another category, or check back after your next session." : "We'll let you know when a game needs you or a booking changes."}
        />
      )}

      {fresh.length > 0 && (
        <section>
          <SectionHeader title="New" action={<Badge tone="brand">{unread}</Badge>} />
          <div className="space-y-2.5">
            {fresh.map((r) => (
              <NotificationRow key={r.key} row={r} />
            ))}
          </div>
        </section>
      )}

      {earlier.length > 0 && (
        <section>
          <SectionHeader title="Earlier" />
          <div className="space-y-2.5">
            {earlier.map((r) => (
              <NotificationRow key={r.key} row={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
