"use client";

import { useState } from "react";
import { BellOff, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { NotificationItem } from "@/components/patterns/cards";
import { notifications as seed } from "@/data/mock";

export default function NotificationsPage() {
  const [items, setItems] = useState(seed);
  const unread = items.filter((n) => !n.read);
  const earlier = items.filter((n) => n.read);

  return (
    <div className="space-y-6">
      <PageHeader
        back="/app"
        title="Notifications"
        action={
          unread.length > 0 && (
            <Button size="sm" variant="ghost" leftIcon={<CheckCheck />} onClick={() => setItems(items.map((n) => ({ ...n, read: true })))}>
              Mark all read
            </Button>
          )
        }
      />
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
