"use client";

import { ArrowRight, CalendarDays, Check, Percent, Users, Wallet, X } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { StatTile } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { locations, matches, money, players } from "@/data/mock";

const occupancy = [12, 18, 25, 30, 42, 55, 48, 40, 52, 70, 88, 96, 94, 82, 60, 35, 20];
const hours = ["07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23"];

const todays = [
  { id: "B-1042", who: "Amr Hefny", level: "B", loc: "New Cairo", court: "Court 2", time: "19:00", dur: 90, status: "confirmed", amount: 675 },
  { id: "B-1043", who: "Laila Mansour", level: "B", loc: "Sheikh Zayed", court: "Court 1", time: "18:30", dur: 60, status: "confirmed", amount: 500 },
  { id: "B-1044", who: "Karim Adel", level: "C", loc: "New Cairo", court: "Court 5", time: "21:00", dur: 90, status: "pending", amount: 675 },
  { id: "B-1045", who: "Salma Youssef", level: "A", loc: "New Cairo", court: "Court 1", time: "17:00", dur: 120, status: "confirmed", amount: 900 },
  { id: "B-1046", who: "Youssef Tarek", level: "D", loc: "Maadi", court: "Court 3", time: "10:00", dur: 60, status: "cancelled", amount: 400 },
] as const;

export default function AdminDashboard() {
  const { toast } = useToast();
  const requests = matches.filter((m) => m.status === "open").slice(0, 3);

  return (
    <AdminShell title="Dashboard" breadcrumb={["Overview", "Dashboard"]} actions={<Button href="/admin/bookings" rightIcon={<ArrowRight />}>Open bookings</Button>}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile size="lg" label="Bookings today" value={42} delta={{ value: "+12% vs last Thu" }} icon={<CalendarDays />} />
        <StatTile size="lg" label="Occupancy" value="78%" delta={{ value: "+6 pts" }} icon={<Percent />} />
        <StatTile size="lg" label="Revenue MTD" value={money(412500)} delta={{ value: "+18% MoM" }} icon={<Wallet />} tone="brand" />
        <StatTile size="lg" label="Active members" value="1,284" delta={{ value: "-1.2% churn", positive: false }} icon={<Users />} />
      </div>

      <Alert tone="warning" title="Court 4 · New Cairo is under maintenance" className="mt-5" action={<Button size="sm" variant="secondary" href="/admin/courts">Manage courts</Button>}>
        Resurfacing until Friday. 9 bookings were moved automatically.
      </Alert>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Occupancy chart */}
        <Card>
          <CardHeader title="Occupancy by hour" description="All locations · today" action={<Badge tone="brand">Live</Badge>} />
          <div className="flex h-44 items-end gap-1.5">
            {occupancy.map((v, i) => (
              <div key={i} className="group flex h-full flex-1 flex-col items-center gap-1.5" title={`${hours[i]}:00 · ${v}%`}>
                <div className="relative w-full flex-1 overflow-hidden rounded-t-xs bg-brand/10">
                  <div className={`absolute inset-x-0 bottom-0 rounded-t-xs transition-all ${v >= 85 ? "bg-brand-gradient shadow-glow-sm" : "bg-brand/60"}`} style={{ height: `${v}%` }} />
                </div>
                <span className="text-[10px] font-semibold tabular text-fg-subtle">{hours[i]}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Join requests */}
        <Card>
          <CardHeader title="Pending join requests" description="Need organiser approval" />
          <ul className="divide-y divide-line/10">
            {requests.map((m) => {
              const requester = players[(m.playerIds.length + 1) % players.length];
              return (
                <li key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar name={requester.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-sm font-bold">{requester.name}</div>
                    <div className="truncate text-caption text-fg-muted">
                      {m.title} · {m.date} {m.time}
                    </div>
                  </div>
                  <LevelBadge level={requester.level} size="sm" />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="text-success hover:bg-success/10" aria-label="Approve" onClick={() => toast({ tone: "success", title: `${requester.name.split(" ")[0]} approved` })}>
                      <Check />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" aria-label="Decline" onClick={() => toast({ tone: "warning", title: "Request declined" })}>
                      <X />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card padding="none">
          <CardHeader title="Today's bookings" className="px-5 pt-5" action={<Button variant="link" size="sm" href="/admin/bookings">View all</Button>} />
          <TableWrap className="rounded-none border-0 border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Ref</TH>
                  <TH>Player</TH>
                  <TH>Club · court</TH>
                  <TH>Time</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {todays.map((b) => (
                  <TR key={b.id} interactive>
                    <TD className="whitespace-nowrap font-semibold tabular text-fg-muted">{b.id}</TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={b.who} size="xs" />
                        <span className="font-semibold">{b.who}</span>
                        <LevelBadge level={b.level} size="sm" />
                      </div>
                    </TD>
                    <TD className="text-fg-muted">
                      {b.loc} · {b.court}
                    </TD>
                    <TD className="tabular">
                      {b.time} · {b.dur}m
                    </TD>
                    <TD>
                      <StatusBadge status={b.status} />
                    </TD>
                    <TD numeric className="font-semibold">
                      {money(b.amount)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader title="Location performance" description="Occupancy this week" />
          <ul className="space-y-4">
            {locations.map((l, i) => {
              const pct = [82, 74, 61, 45][i];
              return (
                <li key={l.slug}>
                  <div className="mb-1.5 flex items-center justify-between text-body-sm">
                    <span className="font-semibold">{l.name.replace("HITTERS ", "")}</span>
                    <span className="tabular text-fg-muted">
                      {pct}% · {l.courts} courts
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line/10">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
