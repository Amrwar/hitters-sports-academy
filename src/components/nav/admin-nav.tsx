"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Dumbbell,
  Package,
  Receipt,
  TicketPercent,
  Wallet,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  Swords,
  Users,
  UserSquare2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Monogram, Wordmark } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/ui/dropdown";
import { Badge } from "@/components/ui/badge";
import { useAdminActor } from "./admin-actor";
import { logoutAction } from "@/server/actions/auth";

const groups: { label: string; items: { href: string; label: string; icon: typeof Users; badge?: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
      { href: "/admin/calendar", label: "Calendar", icon: CalendarRange },
      { href: "/admin/games", label: "Games", icon: Swords },
      { href: "/admin/coaching", label: "Coaching", icon: Dumbbell },
      { href: "/admin/courts", label: "Courts", icon: LayoutGrid },
      { href: "/admin/locations", label: "Locations", icon: MapPin },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/finance", label: "Finance", icon: Wallet },
      { href: "/admin/finance/invoices", label: "Invoices", icon: Receipt },
      { href: "/admin/memberships", label: "Memberships", icon: BadgeCheck },
      { href: "/admin/coupons", label: "Coupons", icon: TicketPercent },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/moderation", label: "Moderation", icon: ShieldAlert },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/members", label: "Members", icon: Users },
      { href: "/admin/assessments", label: "Assessments", icon: ClipboardCheck },
      { href: "/admin/staff", label: "Staff", icon: UserSquare2 },
      { href: "/admin/trainers", label: "Trainers", icon: UserSquare2 },
      { href: "/admin/programs", label: "Programs", icon: GraduationCap },
      { href: "/admin/packages", label: "Packages", icon: Package },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const deepest = groups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label="Admin">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 px-3 text-overline uppercase text-blue-300/70">{g.label}</div>
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, icon: Icon, badge }) => {
              // Deepest match wins: /admin/finance/invoices lights Invoices, not Finance as well.
              const active = href === deepest;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex h-10 items-center gap-3 rounded-md px-3 text-body-sm font-semibold transition-all",
                      active ? "bg-brand-gradient text-white shadow-glow-sm" : "text-blue-100/70 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon size={18} className={cn(active ? "text-white" : "text-blue-300/80 group-hover:text-white")} />
                    <span className="flex-1">{label}</span>
                    {badge && (
                      <span className={cn("rounded-full px-1.5 text-[11px] font-bold tabular", active ? "bg-white/20" : "bg-white/10 text-blue-100")}>{badge}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarChrome({ onClose }: { onClose?: () => void }) {
  const me = useAdminActor();
  return (
    <div data-theme="dark" className="flex h-full flex-col bg-navy-gradient text-white">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Link href="/admin" className="flex items-center gap-2.5" aria-label="HITTERS admin">
          <Monogram height={20} glow />
          <Wordmark height={13} />
          <span className="ml-1 rounded-xs bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-200">Admin</span>
        </Link>
        {onClose && (
          <IconButton variant="ghost" size="sm" label="Close menu" onClick={onClose} className="lg:hidden">
            <X />
          </IconButton>
        )}
      </div>
      <NavLinks onNavigate={onClose} />
      <div className="border-t border-white/10 p-3">
        <Link href="/admin/settings" className="flex h-10 items-center gap-3 rounded-md px-3 text-body-sm font-semibold text-blue-100/70 hover:bg-white/5 hover:text-white">
          <Settings size={18} className="text-blue-300/80" /> Settings
        </Link>
        <div className="mt-2 flex items-center gap-3 rounded-md bg-white/5 p-2.5">
          <Avatar name={me.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body-sm font-bold">{me.name}</div>
            <div className="truncate text-caption text-blue-200/70">{me.roleLabel}</div>
          </div>
          <form action={logoutAction}>
            <IconButton type="submit" variant="ghost" size="sm" label="Sign out">
              <LogOut />
            </IconButton>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Desktop-first admin shell: fixed dark sidebar, light content area, drawer on small screens. */
/**
 * Admin search. A confirmation code goes to bookings, anything else to members, because those are the two
 * lists with a server-side query. It navigates rather than pretending to search in place.
 */
function AdminSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      className="hidden w-72 md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (!term) return;
        const isCode = /^[A-Za-z]{2}-[A-Za-z0-9]{4,}$/.test(term);
        router.push(`${isCode ? "/admin/bookings" : "/admin/members"}?q=${encodeURIComponent(term)}`);
      }}
      role="search"
    >
      <Input size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members or a booking code" leading={<Search />} aria-label="Search members or a booking code" />
    </form>
  );
}

export function AdminShell({ children, title, breadcrumb, actions }: { children: ReactNode; title: string; breadcrumb?: string[]; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const me = useAdminActor();
  return (
    <div data-theme="light" className="min-h-dvh bg-canvas text-fg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarChrome />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-lg animate-fade-in">
            <SidebarChrome onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-line/10 bg-surface-1/85 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <IconButton variant="ghost" size="sm" label="Open menu" onClick={() => setOpen(true)} className="lg:hidden">
              <Menu />
            </IconButton>
            <div className="min-w-0 flex-1">
              {breadcrumb && breadcrumb.length > 0 && (
                <div className="hidden items-center gap-1 text-caption text-fg-subtle sm:flex">
                  {breadcrumb.map((b, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight size={12} />}
                      {b}
                    </span>
                  ))}
                </div>
              )}
              <h1 className="truncate text-h4 sm:text-h3">{title}</h1>
            </div>
            {actions && <div className="hidden flex-wrap items-center gap-2 lg:flex">{actions}</div>}
            <AdminSearch />
            {me.openReports > 0 && (
              <IconButton variant="ghost" size="sm" label={`Moderation: ${me.openReports} reported message${me.openReports === 1 ? "" : "s"} waiting`} href="/admin/moderation" className="relative">
                <ShieldAlert />
                <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-surface-1" />
              </IconButton>
            )}
            <IconButton variant="ghost" size="sm" label={me.unread > 0 ? `Notifications: ${me.unread} unread` : "Notifications"} href="/app/notifications" className="relative">
              <Bell />
              {me.unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-surface-1" />}
            </IconButton>
            <Dropdown
              trigger={
                <button type="button" className="rounded-full" aria-label="Account menu">
                  <Avatar name={me.name} size="sm" />
                </button>
              }
              label={`Signed in as ${me.name.split(" ")[0]}`}
              items={[
                { label: "Player app", icon: <UserSquare2 />, onSelect: () => (window.location.href = "/app") },
                { label: "Settings", icon: <Settings />, onSelect: () => (window.location.href = "/admin/settings") },
                { label: "Sign out", icon: <LogOut />, tone: "danger", onSelect: () => void logoutAction() },
              ]}
            />
          </div>
        </header>
        <main className="mx-auto max-w-admin px-4 py-6 sm:px-6 lg:px-8">
          {/* On narrow screens the header has no room, so the same actions ride above the content instead. */}
          {actions && <div className="mb-5 flex flex-wrap items-center justify-end gap-2 lg:hidden">{actions}</div>}
          {children}
        </main>
      </div>
    </div>
  );
}

export function LiveBadge({ children }: { children: ReactNode }) {
  return (
    <Badge tone="volt" dot pulse>
      {children}
    </Badge>
  );
}
