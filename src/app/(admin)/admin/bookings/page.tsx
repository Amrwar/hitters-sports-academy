"use client";

import { useState } from "react";
import { CalendarDays, Download, MoreHorizontal, Plus, Search } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { LevelBadge, StatusBadge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { Calendar } from "@/components/ui/calendar";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { locations, money } from "@/data/mock";
import type { Level } from "@/lib/tokens";

type Status = "all" | "confirmed" | "pending" | "cancelled" | "completed";

const rows: { id: string; who: string; level: Level; loc: string; court: string; date: string; time: string; dur: number; status: Exclude<Status, "all">; amount: number; paid: boolean }[] = [
  { id: "B-1042", who: "Amr Hefny", level: "B", loc: "new-cairo", court: "Court 2", date: "2 Oct", time: "19:00", dur: 90, status: "confirmed", amount: 675, paid: true },
  { id: "B-1043", who: "Laila Mansour", level: "B", loc: "sheikh-zayed", court: "Court 1", date: "2 Oct", time: "18:30", dur: 60, status: "confirmed", amount: 500, paid: true },
  { id: "B-1044", who: "Karim Adel", level: "C", loc: "new-cairo", court: "Court 5", date: "2 Oct", time: "21:00", dur: 90, status: "pending", amount: 675, paid: false },
  { id: "B-1045", who: "Salma Youssef", level: "A", loc: "new-cairo", court: "Court 1", date: "2 Oct", time: "17:00", dur: 120, status: "confirmed", amount: 900, paid: true },
  { id: "B-1046", who: "Youssef Tarek", level: "D", loc: "maadi", court: "Court 3", date: "3 Oct", time: "10:00", dur: 60, status: "cancelled", amount: 400, paid: false },
  { id: "B-1047", who: "Omar Farouk", level: "A", loc: "north-coast", court: "Court 2", date: "4 Oct", time: "20:00", dur: 90, status: "pending", amount: 900, paid: false },
  { id: "B-1048", who: "Nour El Din", level: "B", loc: "new-cairo", court: "Court 6", date: "28 Sep", time: "20:00", dur: 90, status: "completed", amount: 675, paid: true },
  { id: "B-1049", who: "Hana Sherif", level: "C", loc: "maadi", court: "Court 1", date: "27 Sep", time: "08:00", dur: 60, status: "completed", amount: 400, paid: true },
];

export default function AdminBookings() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("all");
  const [loc, setLoc] = useState("all");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const list = rows.filter((r) => (status === "all" || r.status === status) && (loc === "all" || r.loc === loc));
  const count = (s: Status) => rows.filter((r) => s === "all" || r.status === s).length;

  return (
    <AdminShell
      title="Bookings"
      breadcrumb={["Operations", "Bookings"]}
      actions={
        <>
          <Button variant="secondary" leftIcon={<Download />}>
            Export
          </Button>
          <Button leftIcon={<Plus />}>New booking</Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Card padding="sm" className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <Input size="sm" placeholder="Search by player or reference" leading={<Search />} aria-label="Search bookings" />
            </div>
            <div className="w-full md:w-56">
              <Select size="sm" value={loc} onChange={(e) => setLoc(e.target.value)} options={[{ value: "all", label: "All locations" }, ...locations.map((l) => ({ value: l.slug, label: l.name }))]} aria-label="Location" />
            </div>
          </Card>

          <Tabs
            value={status}
            onChange={setStatus}
            items={[
              { value: "all", label: "All", count: count("all") },
              { value: "confirmed", label: "Confirmed", count: count("confirmed") },
              { value: "pending", label: "Pending", count: count("pending") },
              { value: "completed", label: "Completed", count: count("completed") },
              { value: "cancelled", label: "Cancelled", count: count("cancelled") },
            ]}
          />

          {list.length ? (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Ref</TH>
                    <TH>Player</TH>
                    <TH>Location</TH>
                    <TH>Court</TH>
                    <TH>Date · time</TH>
                    <TH>Status</TH>
                    <TH>Payment</TH>
                    <TH className="text-right">Amount</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {list.map((r) => (
                    <TR key={r.id} interactive>
                      <TD className="whitespace-nowrap font-semibold tabular text-fg-muted">{r.id}</TD>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.who} size="xs" />
                          <span className="font-semibold">{r.who}</span>
                          <LevelBadge level={r.level} size="sm" />
                        </div>
                      </TD>
                      <TD className="text-fg-muted">{locations.find((l) => l.slug === r.loc)?.name.replace("HITTERS ", "")}</TD>
                      <TD>{r.court}</TD>
                      <TD className="tabular">
                        {r.date} · {r.time} · {r.dur}m
                      </TD>
                      <TD>
                        <StatusBadge status={r.status} />
                      </TD>
                      <TD>
                        <StatusBadge status={r.paid ? "active" : "pending"} />
                      </TD>
                      <TD numeric className="font-semibold">
                        {money(r.amount)}
                      </TD>
                      <TD className="w-12">
                        <Dropdown
                          trigger={
                            <IconButton variant="ghost" size="sm" label="Row actions">
                              <MoreHorizontal />
                            </IconButton>
                          }
                          items={[
                            { label: "View details" },
                            { label: "Reschedule", icon: <CalendarDays /> },
                            { label: "Mark as paid", onSelect: () => toast({ tone: "success", title: `${r.id} marked as paid` }) },
                            { label: "Cancel booking", tone: "danger", onSelect: () => toast({ tone: "danger", title: `${r.id} cancelled`, description: "Player has been notified." }) },
                          ]}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState icon={<CalendarDays />} title="No bookings match" description="Change the status or location filter." action={<Button variant="secondary" onClick={() => { setStatus("all"); setLoc("all"); }}>Clear filters</Button>} />
          )}
        </div>

        <div className="space-y-4">
          <Calendar value={date} onChange={setDate} marked={[new Date(), new Date(Date.now() + 86_400_000 * 2)]} />
          <Card>
            <div className="text-overline uppercase text-fg-subtle">Selected day</div>
            <div className="mt-1 text-h3">{date?.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}</div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-body-sm">
              <div className="rounded-md bg-surface-2 p-3">
                <dt className="text-caption text-fg-subtle">Bookings</dt>
                <dd className="text-h3 tabular">42</dd>
              </div>
              <div className="rounded-md bg-surface-2 p-3">
                <dt className="text-caption text-fg-subtle">Revenue</dt>
                <dd className="text-h3 tabular">{money(27900)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
