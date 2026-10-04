"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Percent, Users, Wallet } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { StatTile } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { BookingStatusBadge, PaymentStatusBadge, money } from "@/components/patterns/booking-status";
import { formatInZone } from "@/lib/time";
import { count, verbS } from "@/lib/text";
import type { BookingView } from "@/server/services/bookings";

type Props = {
  today: BookingView[];
  stats: { bookingsToday: number; occupancy: number; revenueMtdCents: number; bookingsMtd: number; members: number; unverified: number };
  locations: { id: string; name: string; activeCourts: number; courts: number }[];
};

export function DashboardView({ today, stats, locations }: Props) {
  const router = useRouter();
  const byHour = new Map<number, number>();
  for (const b of today) {
    if (b.status === "CANCELLED") continue;
    const h = Number(formatInZone(new Date(b.startsAt), b.location.timezone, { hour: "2-digit", hour12: false }).slice(0, 2));
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  const hours = Array.from({ length: 17 }, (_, i) => i + 7);
  const maxHour = Math.max(1, ...hours.map((h) => byHour.get(h) ?? 0));
  const byLocation = locations.map((l) => ({ ...l, count: today.filter((b) => b.locationId === l.id && b.status !== "CANCELLED").length }));

  return (
    <AdminShell title="Dashboard" breadcrumb={["Overview", "Dashboard"]} actions={<Button href="/admin/bookings" rightIcon={<ArrowRight />}>Open bookings</Button>}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile size="lg" label="Bookings today" value={stats.bookingsToday} icon={<CalendarDays />} />
        <StatTile size="lg" label="Occupancy today" value={`${stats.occupancy}%`} icon={<Percent />} delta={{ value: "of available hours" }} />
        <StatTile size="lg" label="Revenue this month" value={money(stats.revenueMtdCents)} icon={<Wallet />} tone="brand" delta={{ value: count(stats.bookingsMtd, "booking") }} />
        <StatTile size="lg" label="Active members" value={stats.members.toLocaleString("en")} icon={<Users />} delta={stats.unverified ? { value: `${stats.unverified} unverified`, positive: false } : undefined} />
      </div>

      {stats.unverified > 0 && (
        <Alert tone="info" className="mt-5" title={`${count(stats.unverified, "member")} still ${verbS(stats.unverified, "need")} to verify their email`}>
          Unverified members can browse but cannot reserve courts.
        </Alert>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Bookings by hour" description="Today · all your locations" action={<Badge tone="brand">Live</Badge>} />
          <div className="flex h-44 items-end gap-1.5">
            {hours.map((h) => {
              const v = byHour.get(h) ?? 0;
              return (
                <div key={h} className="group flex h-full flex-1 flex-col items-center gap-1.5" title={`${String(h).padStart(2, "0")}:00 · ${count(v, "booking")}`}>
                  <div className="relative w-full flex-1 border-b border-line/15">
                    <div
                      className={`absolute inset-x-0 bottom-0 rounded-t-xs transition-all ${v === 0 ? "bg-line/10" : v === maxHour ? "bg-brand-gradient shadow-glow-sm" : "bg-brand/70"}`}
                      style={{ height: v === 0 ? "2px" : `${Math.max(6, (v / maxHour) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold tabular text-fg-subtle">{String(h).padStart(2, "0")}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Locations today" description="Excludes cancelled bookings" />
          <ul className="space-y-4">
            {byLocation.map((l) => {
              const pct = l.activeCourts ? Math.min(100, Math.round((l.count / (l.activeCourts * 17)) * 100)) : 0;
              return (
                <li key={l.id}>
                  <div className="mb-1.5 flex items-center justify-between text-body-sm">
                    <span className="font-semibold">{l.name.replace("HITTERS ", "")}</span>
                    <span className="tabular text-fg-muted">
                      {count(l.count, "booking")} · {l.activeCourts}/{l.courts} courts
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line/10">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
            {byLocation.length === 0 && <li className="text-body-sm text-fg-muted">No clubs assigned to you yet.</li>}
          </ul>
        </Card>
      </div>

      <Card padding="none" className="mt-5">
        <CardHeader title="Today's bookings" className="px-5 pt-5" action={<Button variant="link" size="sm" href="/admin/bookings">View all</Button>} />
        {today.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState compact icon={<CalendarDays />} title="No bookings today" description="New reservations appear here as they come in." action={<Button href="/admin/bookings">Open bookings</Button>} />
          </div>
        ) : (
          <TableWrap className="rounded-none border-0 border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Player</TH>
                  <TH>Club · court</TH>
                  <TH>Time</TH>
                  <TH>Status</TH>
                  <TH>Payment</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {today.map((b) => (
                  <TR key={b.id} interactive onClick={() => router.push(`/admin/bookings/${b.id}`)}>
                    <TD className="whitespace-nowrap font-semibold tabular text-fg-muted">{b.confirmationCode}</TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={b.player?.name ?? b.guestName ?? "Guest"} size="xs" />
                        <span className="font-semibold">{b.player?.name ?? b.guestName ?? "Guest"}</span>
                      </div>
                    </TD>
                    <TD className="text-fg-muted">
                      {b.location.name.replace("HITTERS ", "")} · {b.court.name}
                    </TD>
                    <TD className="whitespace-nowrap tabular">
                      {formatInZone(new Date(b.startsAt), b.location.timezone, { hour: "2-digit", minute: "2-digit" })} · {b.durationMinutes} min
                    </TD>
                    <TD>
                      <BookingStatusBadge status={b.status} />
                    </TD>
                    <TD>{b.payments[0] ? <PaymentStatusBadge status={b.payments[0].status} /> : "—"}</TD>
                    <TD numeric className="font-semibold">
                      {money(b.priceCents, b.currency)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </AdminShell>
  );
}
