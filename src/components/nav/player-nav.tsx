"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarPlus, ChevronLeft, GraduationCap, Home, MessageSquare, Swords, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { Monogram, Wordmark } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import type { ReactNode } from "react";

const items = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/play", label: "Play", icon: Swords },
  { href: "/app/book", label: "Book", icon: CalendarPlus, primary: true },
  { href: "/app/programs", label: "Academy", icon: GraduationCap },
  { href: "/app/profile", label: "Profile", icon: User },
];

/** Mobile-first bottom tab bar with the glowing Book action in the centre. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app safe-bottom" aria-label="Primary">
      <div className="mx-3 mb-3 flex items-end justify-between rounded-xl border border-line/10 bg-surface-1/90 px-2 pb-2 pt-2 shadow-lg backdrop-blur-xl">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
          if (primary) {
            return (
              <Link key={href} href={href} aria-label={label} className="group -mt-7 flex flex-1 flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex size-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow-md ring-4 ring-canvas transition-transform group-active:scale-95",
                    active && "shadow-glow-lg",
                  )}
                >
                  <Icon size={24} />
                </span>
                <span className={cn("text-[11px] font-semibold", active ? "text-fg" : "text-fg-subtle")}>{label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex flex-1 flex-col items-center gap-1 rounded-md py-1.5 text-[11px] font-semibold transition-colors", active ? "text-fg" : "text-fg-subtle hover:text-fg-muted")}
            >
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-all", active && "bg-blue-500/20 text-blue-200")}>
                <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type TopBarProps = { unread?: number; userName: string };

/** Player app header: brand on the left, notifications and profile on the right. */
export function PlayerTopBar({ unread = 0, userName }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/10 bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-app items-center justify-between px-4">
        <Link href="/app" className="flex items-center gap-2.5 text-white" aria-label="HITTERS home">
          <Monogram height={20} glow />
          <Wordmark height={14} className="hidden min-[360px]:block" />
        </Link>
        <div className="flex items-center gap-2">
          <IconButton variant="ghost" size="md" label="Messages" href="/app/messages">
            <MessageSquare />
          </IconButton>
          <IconButton variant="ghost" size="md" label={unread ? `${unread} unread notifications` : "Notifications"} href="/app/notifications" className="relative">
            <Bell />
            {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-volt ring-2 ring-canvas" />}
          </IconButton>
          <Link href="/app/profile" aria-label="Your profile">
            <Avatar name={userName} size="sm" ring />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Secondary page header with a back link for drill-down screens. */
export function PageHeader({ title, back, action, eyebrow }: { title: ReactNode; back?: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {back && (
        <IconButton variant="secondary" size="sm" label="Back" href={back}>
          <ChevronLeft />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="text-overline uppercase text-blue-300">{eyebrow}</div>}
        <h1 className="truncate text-h2">{title}</h1>
      </div>
      {action}
    </div>
  );
}
