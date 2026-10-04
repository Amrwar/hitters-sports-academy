"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CalendarCheck, CheckCheck, GraduationCap, Megaphone, MessageSquare, Users, Wallet } from "lucide-react";
import type { NotificationCategory } from "@prisma/client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { markCategoryReadAction, markReadAction } from "@/server/actions/notifications";

export type Row = {
  key: string;
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  time: string;
  read: boolean;
  count: number;
  url: string;
};

const icon: Record<NotificationCategory, React.ReactNode> = {
  BOOKING: <CalendarCheck />,
  MATCHMAKING: <Users />,
  TRAINING: <GraduationCap />,
  ACADEMY: <Megaphone />,
  MESSAGING: <MessageSquare />,
  BILLING: <Wallet />,
};

/** One row in the centre. Tapping it marks the whole group read, then follows the link. */
export function NotificationRow({ row }: { row: Row }) {
  const router = useRouter();
  const [read, setRead] = useState(row.read);
  return (
    <button
      type="button"
      onClick={() => {
        setRead(true);
        void markReadAction(row.id).then(() => router.push(row.url));
      }}
      className={cn(
        "flex w-full gap-3 rounded-lg border p-3.5 text-left transition-colors",
        read ? "border-line/10 bg-surface-1 hover:bg-surface-2" : "border-blue-400/30 bg-blue-500/10 hover:bg-blue-500/15",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md [&_svg]:size-5", read ? "bg-line/10 text-fg-muted" : "bg-brand-gradient text-white shadow-glow-sm")}>
        {icon[row.category] ?? <Bell />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className={cn("text-body-sm font-bold", !read && "text-fg")}>{row.title}</span>
          <span className="shrink-0 text-caption text-fg-subtle">{row.time}</span>
        </span>
        <span className="mt-0.5 block text-body-sm text-fg-muted">{row.body}</span>
        {row.count > 1 && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-line/10 px-2 py-0.5 text-caption font-semibold text-fg-muted">
            <BellRing className="size-3" />
            {row.count} updates
          </span>
        )}
      </span>
      {!read && <span className="mt-2 size-2 shrink-0 rounded-full bg-volt" aria-label="Unread" />}
    </button>
  );
}

/** Clears the unread badge for whatever the player is currently looking at. */
export function MarkAllRead({ category }: { category?: NotificationCategory }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      leftIcon={<CheckCheck />}
      loading={pending}
      onClick={() =>
        start(async () => {
          await markCategoryReadAction(category);
          router.refresh();
        })
      }
    >
      Mark all read
    </Button>
  );
}
