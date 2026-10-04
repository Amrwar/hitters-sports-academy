"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Clock, Copy, Plus, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Chip, Switch } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/states";
import { TimeSelect } from "@/components/ui/time-select";
import { useToast } from "@/components/ui/toast";
import { COURT_STATUSES, COURT_TYPES, DURATION_OPTIONS } from "@/lib/catalog";
import { DAY_NAMES, formatInZone, utcToLocalInput } from "@/lib/time";
import type { getCourt } from "@/server/services/courts";
import { addCourtClosureAction, removeCourtClosureAction, setCourtAvailabilityAction, updateCourtAction } from "@/server/actions/admin";

type Court = Awaited<ReturnType<typeof getCourt>>;
type Row = { open: boolean; opensAt: number; closesAt: number; slotMinutes: number; price: number };

function rowsFrom(court: Court): Row[] {
  return Array.from({ length: 7 }, (_, day) => {
    const w = court.availability.find((a) => a.dayOfWeek === day);
    return w ? { open: true, opensAt: w.opensAt, closesAt: w.closesAt, slotMinutes: w.slotMinutes, price: Math.round(w.priceCents / 100) } : { open: false, opensAt: 7 * 60, closesAt: 24 * 60, slotMinutes: 60, price: 450 };
  });
}

export function CourtAdmin({ court, canManage, canAvailability }: { court: Court; canManage: boolean; canAvailability: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(court));
  const [durations, setDurations] = useState<number[]>(court.durationsMinutes);
  const tz = court.location.timezone;

  async function run<T>(label: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string> }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      setFields({});
      toast({ tone: "success", title: label });
      router.refresh();
      return true;
    }
    setFields(res.fields ?? {});
    toast({ tone: "danger", title: res.message });
    return false;
  }

  async function saveDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run("Court saved", () => updateCourtAction(court.id, { name: f.get("name"), type: f.get("type"), status: f.get("status"), surface: f.get("surface"), description: f.get("description"), sortOrder: f.get("sortOrder"), durationsMinutes: durations }));
  }

  async function saveAvailability() {
    const payload = rows.flatMap((r, dayOfWeek) => (r.open ? [{ dayOfWeek, opensAt: r.opensAt, closesAt: r.closesAt, slotMinutes: r.slotMinutes, priceCents: Math.round(r.price * 100) }] : []));
    await run("Weekly hours saved", () => setCourtAvailabilityAction(court.id, payload));
  }

  function copyToAll(i: number) {
    setRows((rs) => rs.map((r, j) => (j === i ? r : { ...rs[i] })));
  }

  async function addClosure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const ok = await run("Closure added", () => addCourtClosureAction(court.id, { startLocal: String(f.get("startLocal")), endLocal: String(f.get("endLocal")), reason: String(f.get("reason") ?? "") || undefined }));
    if (ok) formEl.reset();
  }

  const upcoming = court.closures.filter((c) => new Date(c.endsAt) > new Date());
  const past = court.closures.filter((c) => new Date(c.endsAt) <= new Date());

  return (
    <AdminShell
      title={court.name}
      breadcrumb={["Operations", "Courts", court.location.name.replace("HITTERS ", ""), court.name]}
      actions={
        <>
          <StatusBadge status={court.status === "ACTIVE" ? "available" : court.status === "MAINTENANCE" ? "maintenance" : "paused"} />
          <Button variant="secondary" href={`/admin/courts?location=${court.locationId}`}>
            All courts
          </Button>
          <Button variant="secondary" href={`/admin/calendar?location=${court.locationId}`} leftIcon={<CalendarRange />}>
            Calendar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        {/* Details */}
        <form onSubmit={saveDetails} className="space-y-4">
          <Card>
            <CardHeader title="Court details" description={`${court.location.name} · ${tz}`} />
            <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={fields.name}>{(id) => <Input id={id} name="name" defaultValue={court.name} required invalid={!!fields.name} />}</Field>
              <Field label="Type">{(id) => <Select id={id} name="type" defaultValue={court.type} options={COURT_TYPES.map((t) => ({ value: t.value, label: t.label }))} />}</Field>
              <Field label="Status" hint="Maintenance hides all slots; use closures for fixed periods.">{(id) => <Select id={id} name="status" defaultValue={court.status} options={COURT_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />}</Field>
              <Field label="Surface" error={fields.surface}>{(id) => <Input id={id} name="surface" defaultValue={court.surface ?? ""} placeholder="Artificial turf" />}</Field>
              <Field label="Display order" error={fields.sortOrder}>{(id) => <Input id={id} name="sortOrder" type="number" min={0} defaultValue={court.sortOrder} />}</Field>
              <div className="sm:col-span-2">
                <div className="mb-2 text-body-sm font-semibold text-fg-muted">Booking durations</div>
                <div className="flex flex-wrap gap-2">
                  {DURATION_OPTIONS.map((d) => (
                    <Chip key={d} selected={durations.includes(d)} disabled={!canManage} onClick={() => setDurations((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b)))}>
                      {d} min
                    </Chip>
                  ))}
                </div>
                <p className="mt-1 text-caption text-fg-subtle">{durations.length === 0 ? `Using the location policy: ${(court.location.bookingPolicy?.allowedDurations ?? [60, 90, 120]).join(", ")} min.` : "Overrides the location policy for this court."}</p>
              </div>
              <Field label="Description" className="sm:col-span-2" error={fields.description}>{(id) => <Textarea id={id} name="description" defaultValue={court.description ?? ""} maxLength={500} placeholder="Shown to players." />}</Field>
            </fieldset>
            {canManage && (
              <Button type="submit" loading={busy} className="mt-4" fullWidth>
                Save details
              </Button>
            )}
          </Card>
        </form>

        {/* Weekly template */}
        <Card>
          <CardHeader title="Weekly operating hours" description="Base hourly rate per day. Location opening hours cap these windows." action={<Badge tone="brand">{tz}</Badge>} />
          <div className="divide-y divide-line/10 rounded-lg border border-line/10">
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 px-3 py-3 sm:grid-cols-[96px_auto_1fr] sm:items-center">
                <div className="flex items-center justify-between sm:block">
                  <span className="text-body-sm font-bold">{DAY_NAMES[i].slice(0, 3)}</span>
                  <span className="sm:hidden">
                    <Switch checked={r.open} disabled={!canAvailability} onChange={(open) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, open } : x)))} />
                  </span>
                </div>
                <span className="hidden sm:block">
                  <Switch checked={r.open} disabled={!canAvailability} onChange={(open) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, open } : x)))} />
                </span>
                {r.open ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <TimeSelect value={r.opensAt} onChange={(opensAt) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, opensAt } : x)))} max={23 * 60 + 30} disabled={!canAvailability} aria-label="Opens" />
                    <span className="text-caption text-fg-subtle">–</span>
                    <TimeSelect value={r.closesAt} onChange={(closesAt) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, closesAt } : x)))} min={30} disabled={!canAvailability} aria-label="Closes" />
                    <Select size="sm" value={String(r.slotMinutes)} disabled={!canAvailability} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, slotMinutes: Number(e.target.value) } : x)))} options={[30, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min slots` }))} aria-label="Slot length" className="w-32" />
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-fg-subtle">EGP</span>
                      <Input size="sm" type="number" min={0} value={r.price} disabled={!canAvailability} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} className="w-28 pl-11" aria-label="Hourly price" />
                    </div>
                    {canAvailability && (
                      <IconButton size="sm" variant="ghost" label="Copy to all days" onClick={() => copyToAll(i)}>
                        <Copy />
                      </IconButton>
                    )}
                    {r.closesAt <= r.opensAt && <span className="text-caption text-danger">Closes before it opens</span>}
                  </div>
                ) : (
                  <span className="text-body-sm text-fg-subtle">Closed</span>
                )}
              </div>
            ))}
          </div>
          {canAvailability && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setRows(rowsFrom(court))} disabled={busy}>
                Reset
              </Button>
              <Button loading={busy} onClick={saveAvailability} leftIcon={<Clock />}>
                Save weekly hours
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Closures */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        {canManage && (
          <Card>
            <CardHeader title="Block a period" description={`Temporary closure for maintenance or events. Times are in ${tz}.`} />
            <form onSubmit={addClosure} className="space-y-4">
              <Field label="From" error={fields.startLocal}>{(id) => <Input id={id} name="startLocal" type="datetime-local" required invalid={!!fields.startLocal} />}</Field>
              <Field label="Until" error={fields.endLocal}>{(id) => <Input id={id} name="endLocal" type="datetime-local" required invalid={!!fields.endLocal} />}</Field>
              <Field label="Reason" error={fields.reason}>{(id) => <Input id={id} name="reason" placeholder="Resurfacing" maxLength={500} />}</Field>
              <Button type="submit" loading={busy} leftIcon={<Plus />} fullWidth>
                Add closure
              </Button>
            </form>
          </Card>
        )}
        <Card>
          <CardHeader title="Closures" description="You cannot add a closure that overlaps an existing one. Back-to-back periods are fine." />
          {upcoming.length === 0 ? (
            <EmptyState compact icon={<CalendarRange />} title="No upcoming closures" description="The court follows its weekly hours." />
          ) : (
            <ul className="divide-y divide-line/10">
              {upcoming.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-bold">
                      {formatInZone(new Date(c.startsAt), tz)} → {formatInZone(new Date(c.endsAt), tz)}
                    </div>
                    <div className="text-caption text-fg-muted">
                      {c.reason ?? "No reason given"} · <span className="tabular">{utcToLocalInput(new Date(c.startsAt), tz).replace("T", " ")}</span>
                    </div>
                  </div>
                  {new Date(c.startsAt) <= new Date() && <Badge tone="warning" dot>Active now</Badge>}
                  {canManage && (
                    <IconButton size="sm" variant="ghost" label="Remove closure" className="text-danger hover:bg-danger/10" disabled={busy} onClick={() => run("Closure removed", () => removeCourtClosureAction(court.id, c.id))}>
                      <Trash2 />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && <p className="mt-3 text-caption text-fg-subtle">{past.length} past closure{past.length > 1 ? "s" : ""} in the last 7 days.</p>}
        </Card>
      </div>
      {court.location.status !== "ACTIVE" && (
        <Alert tone="warning" className="mt-4" title="Location is not active">
          Players cannot see or book this court until the location is active.
        </Alert>
      )}
    </AdminShell>
  );
}
