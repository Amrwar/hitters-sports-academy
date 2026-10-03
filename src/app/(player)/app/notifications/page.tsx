import { BellOff } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { NotificationItem } from "@/components/patterns/cards";
import type { Notification as UiNotification } from "@/data/mock";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyNotifications } from "@/server/services/notifications";
import { MarkAllReadButton } from "./mark-all-read";

function relative(date: Date) {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}

const kindOf = (type: string): UiNotification["kind"] =>
  type.startsWith("assessment") ? "system" : type.startsWith("staff") ? "system" : type.startsWith("booking") ? "booking" : type.startsWith("match") || type.startsWith("game") || type.startsWith("pair") ? "match" : type.startsWith("payment") ? "payment" : type.startsWith("program") ? "program" : "system";

export default async function NotificationsPage() {
  const actor = await requireActorOrRedirect("/app/notifications");
  const { items } = await listMyNotifications(actor);
  const toUi = (n: (typeof items)[number]): UiNotification => ({
    id: n.id,
    kind: kindOf(n.type),
    title: n.title,
    body: n.body,
    time: relative(n.createdAt),
    read: !!n.readAt,
    href: n.type.startsWith("staff") ? "/admin" : n.type.startsWith("game") && (n.data as { code?: string } | null)?.code ? `/app/play/${(n.data as { code: string }).code}` : n.type.startsWith("pair") ? "/app/play/pairs" : n.type.startsWith("booking") && (n.data as { bookingId?: string } | null)?.bookingId ? `/app/bookings/${(n.data as { bookingId: string }).bookingId}` : "/app/profile",
  });
  const unread = items.filter((n) => !n.readAt).map(toUi);
  const earlier = items.filter((n) => n.readAt).map(toUi);

  return (
    <div className="space-y-6">
      <PageHeader back="/app" title="Notifications" action={unread.length > 0 ? <MarkAllReadButton /> : undefined} />
      {items.length === 0 && <EmptyState icon={<BellOff />} title="You're all caught up" description="We'll let you know when a session needs you or a booking changes." />}
      {unread.length > 0 && (
        <section>
          <SectionHeader title="New" />
          <div className="space-y-2.5">
            {unread.map((n) => (
              <NotificationItem key={n.id} item={n} />
            ))}
          </div>
        </section>
      )}
      {earlier.length > 0 && (
        <section>
          <SectionHeader title="Earlier" />
          <div className="space-y-2.5">
            {earlier.map((n) => (
              <NotificationItem key={n.id} item={n} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
