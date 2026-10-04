"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { addDaysISO, DAY_NAMES, dayOfWeekISO, minutesToHHMM } from "@/lib/time";
import type { LocationSchedule, Slot } from "@/server/services/availability";
import { addCourtClosureAction, closeLocationCourtsAction } from "@/server/actions/admin";
import { count } from "@/lib/text";

type Props = { locations: { id: string; name: string; timezone: string }[]; schedule: LocationSchedule | null; canManage: boolean };

const STYLE: Record<Slot["status"], string> = {
  available: "border-line/10 bg-surface-2 text-fg hover:border-blue-400/60",
  booked: "border-blue-400/40 bg-brand-gradient text-white shadow-glow-sm hover:brightness-110",
  past: "border-transparent bg-line/[0.04] text-fg-subtle/50",
  too_soon: "border-blue-400/20 bg-blue-500/5 text-fg-subtle",
  outside_window: "border-dashed border-line/15 bg-transparent text-fg-subtle",
  closed: "border-warning/30 bg-warning/10 text-warning",
  maintenance: "border-warning/20 bg-warning/5 text-warning/60",
  inactive: "border-transparent bg-line/[0.03] text-fg-subtle/40",
  location_closed: "border-transparent bg-line/[0.03] text-fg-subtle/40",
};

const LABEL: Record<Slot["status"], string> = {
  available: "Available",
  booked: "Booked",
  past: "Past",
  too_soon: "Inside min. notice",
  outside_window: "Beyond booking window",
  closed: "Closed",
  maintenance: "Maintenance",
  inactive: "Inactive court",
  location_closed: "Location closed",
};

export function CalendarView({ locations, schedule, canManage }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [block, setBlock] = useState<{ courtId: string; courtName: string; slot: Slot } | null>(null);
  const [closeAll, setCloseAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = (locationId: string, dateISO: string) => router.push(`/admin/calendar?location=${locationId}&date=${dateISO}`);

  const columns = useMemo(() => {
    if (!schedule) return [] as number[];
    const set = new Set<number>();
    for (const c of schedule.courts) for (const s of c.slots) set.add(s.startMinutes);
    return [...set].sort((a, b) => a - b);
  }, [schedule]);

  const stats = useMemo(() => {
    const all = schedule?.courts.flatMap((c) => c.slots) ?? [];
    return { total: all.length, available: all.filter((s) => s.status === "available").length, booked: all.filter((s) => s.status === "booked").length, closed: all.filter((s) => s.status === "closed" || s.status === "maintenance").length };
  }, [schedule]);

  if (!schedule) {
    return (
      <AdminShell title="Court calendar" breadcrumb={["Operations", "Calendar"]}>
        <EmptyState icon={<CalendarRange />} title="No clubs assigned to you yet" description="Ask an academy owner to give you access to a location." />
      </AdminShell>
    );
  }

  const tz = schedule.location.timezone;
  const dateLabel = `${DAY_NAMES[dayOfWeekISO(schedule.dateISO)]}, ${new Date(schedule.dateISO + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;

  async function submitBlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!block) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const res = await addCourtClosureAction(block.courtId, { startLocal: String(f.get("startLocal")), endLocal: String(f.get("endLocal")), reason: String(f.get("reason") ?? "") || undefined });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: `${block.courtName} blocked` });
      setBlock(null);
      router.refresh();
    } else toast({ tone: "danger", title: res.message });
  }

  async function submitCloseAll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const res = await closeLocationCourtsAction(schedule!.location.id, { startLocal: String(f.get("startLocal")), endLocal: String(f.get("endLocal")), reason: String(f.get("reason") ?? "") || undefined });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: `${count(res.data.count, "court")} closed` });
      setCloseAll(false);
      router.refresh();
    } else toast({ tone: "danger", title: res.message });
  }

  return (
    <AdminShell
      title="Court calendar"
      breadcrumb={["Operations", "Calendar", schedule.location.name.replace("HITTERS ", "")]}
      actions={
        canManage ? (
          <Button variant="secondary" leftIcon={<Lock />} onClick={() => setCloseAll(true)}>
            Close all courts for a period
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs variant="pill" value={schedule.location.id} onChange={(id) => go(id, schedule.dateISO)} items={locations.map((l) => ({ value: l.id, label: l.name.replace("HITTERS ", "") }))} className="w-fit max-w-full overflow-x-auto" />
        <div className="flex items-center gap-2">
          <IconButton size="sm" variant="secondary" label="Previous day" onClick={() => go(schedule.location.id, addDaysISO(schedule.dateISO, -1))}>
            <ChevronLeft />
          </IconButton>
          <Input size="sm" type="date" value={schedule.dateISO} onChange={(e) => e.target.value && go(schedule.location.id, e.target.value)} aria-label="Date" className="w-40" />
          <IconButton size="sm" variant="secondary" label="Next day" onClick={() => go(schedule.location.id, addDaysISO(schedule.dateISO, 1))}>
            <ChevronRight />
          </IconButton>
          <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/calendar?location=${schedule.location.id}`)}>
            Today
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm text-fg-muted">
        <span className="font-bold text-fg">{dateLabel}</span>
        <span>· {tz}</span>
        <Badge tone="brand">{stats.available} available</Badge>
        <Badge tone="success">{stats.booked} booked</Badge>
        <Badge tone="warning">{stats.closed} closed</Badge>
        <Badge>{count(stats.total, "slot")}</Badge>
      </div>

      {schedule.courts.length === 0 ? (
        <EmptyState className="mt-5" icon={<CalendarRange />} title="No courts" description="Add courts to this location first." action={<Button href={`/admin/courts?location=${schedule.location.id}`}>Manage courts</Button>} />
      ) : columns.length === 0 ? (
        <EmptyState className="mt-5" icon={<CalendarRange />} title="Closed on this day" description="No court has operating hours for this date, or the location is closed." />
      ) : (
        <Card padding="none" className="mt-4 overflow-x-auto">
          <div className="min-w-max p-3">
            <div className="grid gap-1" style={{ gridTemplateColumns: `140px repeat(${columns.length}, 64px)` }}>
              <div />
              {columns.map((m) => (
                <div key={m} className="pb-1 text-center text-[11px] font-semibold tabular text-fg-subtle">
                  {minutesToHHMM(m)}
                </div>
              ))}
              {schedule.courts.map((c) => (
                <RowFor key={c.court.id} schedule={c} columns={columns} canManage={canManage} onBlock={(slot) => setBlock({ courtId: c.court.id, courtName: c.court.name, slot })} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-caption text-fg-muted">
              {(["available", "booked", "closed", "maintenance", "too_soon", "outside_window", "past"] as Slot["status"][]).map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cn("size-3 rounded-[3px] border", STYLE[s])} /> {LABEL[s]}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Modal open={!!block} onClose={() => setBlock(null)} title={`Block ${block?.courtName ?? ""}`} description={`Creates a closure. Times are in ${tz}.`}>
        {block && (
          <form onSubmit={submitBlock} className="space-y-4">
            <Field label="From">{(id) => <Input id={id} name="startLocal" type="datetime-local" required defaultValue={`${schedule.dateISO}T${minutesToHHMM(block.slot.startMinutes)}`} />}</Field>
            <Field label="Until">{(id) => <Input id={id} name="endLocal" type="datetime-local" required defaultValue={`${block.slot.endMinutes >= 1440 ? addDaysISO(schedule.dateISO, 1) : schedule.dateISO}T${minutesToHHMM(block.slot.endMinutes)}`} />}</Field>
            <Field label="Reason">{(id) => <Input id={id} name="reason" placeholder="Private event" />}</Field>
            <div className="flex justify-end gap-2 pb-2">
              <Button type="button" variant="ghost" onClick={() => setBlock(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Block period
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={closeAll} onClose={() => setCloseAll(false)} title="Close all courts" description={`Every active court at ${schedule.location.name} gets a closure. If a court is already closed for part of this period, nothing is saved. Remove that closure first.`}>
        <form onSubmit={submitCloseAll} className="space-y-4">
          <Field label="From">{(id) => <Input id={id} name="startLocal" type="datetime-local" required defaultValue={`${schedule.dateISO}T09:00`} />}</Field>
          <Field label="Until">{(id) => <Input id={id} name="endLocal" type="datetime-local" required defaultValue={`${schedule.dateISO}T18:00`} />}</Field>
          <Field label="Reason">{(id) => <Input id={id} name="reason" placeholder="Tournament day" />}</Field>
          <div className="flex justify-end gap-2 pb-2">
            <Button type="button" variant="ghost" onClick={() => setCloseAll(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Close courts
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}

function RowFor({ schedule, columns, canManage, onBlock }: { schedule: LocationSchedule["courts"][number]; columns: number[]; canManage: boolean; onBlock: (slot: Slot) => void }) {
  const byStart = new Map(schedule.slots.map((s) => [s.startMinutes, s]));
  return (
    <>
      <div className="flex flex-col justify-center pr-2">
        <span className="truncate text-body-sm font-bold">{schedule.court.name}</span>
        <span className="text-[11px] text-fg-subtle">
          {schedule.open ? `${minutesToHHMM(schedule.open.opensAt)}–${schedule.open.closesAt === 1440 ? "24:00" : minutesToHHMM(schedule.open.closesAt)}` : "Closed"}
          {schedule.slotMinutes ? ` · ${schedule.slotMinutes}m` : ""}
        </span>
      </div>
      {columns.map((m) => {
        const s = byStart.get(m);
        if (!s) return <div key={m} className="h-12 rounded-sm bg-line/[0.02]" />;
        const clickable = canManage && (s.status === "available" || s.status === "too_soon" || s.status === "outside_window");
        if (s.status === "booked" && s.booking) {
          const label = s.booking.label ?? "Booked";
          return (
            <a
              key={m}
              href={"/admin/bookings/" + s.booking.id}
              title={minutesToHHMM(s.startMinutes) + "–" + minutesToHHMM(s.endMinutes) + " · Booked · " + label}
              className={cn("flex h-12 flex-col items-center justify-center overflow-hidden rounded-sm border px-1 text-[11px] font-semibold transition-all", STYLE.booked)}
            >
              <span className="w-full truncate text-center">{label.split(" ")[0]}</span>
              <span className="text-[9px] uppercase tracking-wider text-white/70">booked</span>
            </a>
          );
        }
        return (
          <button
            key={m}
            type="button"
            disabled={!clickable}
            onClick={() => onBlock(s)}
            title={`${minutesToHHMM(s.startMinutes)}–${minutesToHHMM(s.endMinutes)} · ${LABEL[s.status]}${s.reason ? ` · ${s.reason}` : ""}${s.priceCents != null ? ` · EGP ${Math.round(s.priceCents / 100)}` : ""}`}
            className={cn("flex h-12 flex-col items-center justify-center rounded-sm border text-[11px] font-semibold transition-all", STYLE[s.status], clickable && "cursor-pointer", !clickable && "cursor-default")}
          >
            {s.status === "closed" ? <Lock size={12} /> : s.priceCents != null && s.status !== "past" ? <span className="tabular">{Math.round(s.priceCents / 100)}</span> : <span>—</span>}
            {s.peak && s.status === "available" && <span className="text-[9px] uppercase tracking-wider text-blue-300 light:text-blue-700">peak</span>}
          </button>
        );
      })}
    </>
  );
}
