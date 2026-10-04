"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { Plus, UserPlus, X } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TimeSelect } from "@/components/ui/time-select";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { money, PaymentStatusBadge } from "@/components/patterns/booking-status";
import { EnrollmentBadge, ProgramStatusBadge, scheduleText } from "@/components/patterns/academy";
import { PROGRAM_CATEGORIES } from "@/lib/catalog";
import { DAY_NAMES, formatInZone } from "@/lib/time";
import type { EnrollmentView, ProgramView, ScheduleSlot } from "@/server/services/programs";
import { cancelEnrollmentAction, createProgramAction, enrollAction, recordAcademyPaymentAction, setProgramStatusAction, updateProgramAction } from "@/server/actions/academy";
import { count } from "@/lib/text";

type Props = {
  programs: ProgramView[];
  trainers: { id: string; name: string; locationIds: string[] }[];
  locations: { id: string; name: string; timezone: string }[];
  courts: Record<string, { id: string; name: string }[]>;
  levels: { level: PlayerLevel; label: string }[];
  members: { id: string; name: string; email: string }[];
  canManage: boolean;
  selectedId: string | null;
  roster: EnrollmentView[];
  viewerId: string;
};

export function ProgramsAdmin({ programs, trainers, locations, courts, levels, members, canManage, selectedId, roster, viewerId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<ProgramView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelP, setCancelP] = useState<ProgramView | null>(null);
  const selected = programs.find((p) => p.id === selectedId) ?? null;

  async function act(key: string, label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast({ tone: "success", title: label });
    else toast({ tone: "danger", title: "Could not do that", description: res.message });
    router.refresh();
    return res.ok;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const schedule: ScheduleSlot[] = [0, 1, 2].map((i) => ({ dayOfWeek: Number(f.get(`day-${i}`)), startMinutes: Number(f.get(`start-${i}`)), durationMinutes: Number(f.get(`dur-${i}`)) })).filter((s, i) => f.get(`on-${i}`) && s.durationMinutes > 0);
    const data = {
      name: String(f.get("name") ?? ""),
      category: String(f.get("category") ?? "GROUP_COACHING"),
      description: String(f.get("description") ?? ""),
      levels: levels.map((l) => l.level).filter((l) => f.get(`level-${l}`)),
      minAge: f.get("minAge") ? Number(f.get("minAge")) : null,
      maxAge: f.get("maxAge") ? Number(f.get("maxAge")) : null,
      trainerId: String(f.get("trainerId") ?? ""),
      locationId: String(f.get("locationId") ?? ""),
      courtId: String(f.get("courtId") ?? "") || undefined,
      startsOn: String(f.get("startsOn") ?? ""),
      endsOn: String(f.get("endsOn") ?? ""),
      schedule,
      sessionsCount: Number(f.get("sessionsCount") || 0),
      capacity: Number(f.get("capacity") || 0),
      priceCents: Math.round(Number(f.get("price") || 0) * 100),
      allowWaitlist: !!f.get("allowWaitlist"),
      cancellationCutoffHours: Number(f.get("cutoff") || 72),
      enrollmentRules: String(f.get("enrollmentRules") ?? ""),
      cancellationRules: String(f.get("cancellationRules") ?? ""),
    };
    setBusy("form");
    setError(null);
    const res = edit ? await updateProgramAction(edit.id, data) : await createProgramAction(data);
    setBusy(null);
    if (res.ok) {
      toast({ tone: "success", title: edit ? "Program updated" : "Program created as a draft", description: edit ? undefined : "Open it when you are ready to take enrollments." });
      setCreate(false);
      setEdit(null);
      router.refresh();
    } else setError(res.message + (res.fields ? ` (${Object.values(res.fields).join(", ")})` : ""));
  }

  const Form = ({ p }: { p: ProgramView | null }) => {
    const [locationId, setLocationId] = useState(p?.locationId ?? locations[0]?.id ?? "");
    const slots = ((p?.schedule as ScheduleSlot[]) ?? [{ dayOfWeek: 2, startMinutes: 18 * 60, durationMinutes: 90 }]).slice(0, 3);
    return (
      <form onSubmit={submit} className="space-y-4 pb-2">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} name="name" required defaultValue={p?.name ?? ""} placeholder="Intermediate Tuesdays" />}</Field>
          <Field label="Category">{(id) => <Select id={id} name="category" defaultValue={p?.category ?? "GROUP_COACHING"} options={PROGRAM_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />}</Field>
          <Field label="Club">{(id) => <Select id={id} name="locationId" value={locationId} onChange={(e) => setLocationId(e.target.value)} options={locations.map((l) => ({ value: l.id, label: l.name }))} />}</Field>
          <Field label="Trainer">{(id) => <Select id={id} name="trainerId" required defaultValue={p?.trainerId ?? ""} placeholder="Choose" options={trainers.filter((t) => t.locationIds.includes(locationId)).map((t) => ({ value: t.id, label: t.name }))} />}</Field>
          <Field label="Court (optional)">{(id) => <Select id={id} name="courtId" defaultValue={p?.sessions[0]?.court?.id ?? ""} options={[{ value: "", label: "Any court" }, ...(courts[locationId] ?? []).map((c) => ({ value: c.id, label: c.name }))]} />}</Field>
          <Field label="Capacity">{(id) => <Input id={id} name="capacity" type="number" min={1} max={60} required defaultValue={p?.capacity ?? 8} />}</Field>
          <Field label="Starts on">{(id) => <Input id={id} name="startsOn" type="date" required defaultValue={p ? p.startsOn.toISOString().slice(0, 10) : ""} />}</Field>
          <Field label="Ends on">{(id) => <Input id={id} name="endsOn" type="date" required defaultValue={p ? p.endsOn.toISOString().slice(0, 10) : ""} />}</Field>
          <Field label="Number of sessions">{(id) => <Input id={id} name="sessionsCount" type="number" min={1} max={100} required defaultValue={p?.sessionsCount ?? 8} />}</Field>
          <Field label="Price (EGP, full program)">{(id) => <Input id={id} name="price" type="number" min={0} step={50} required defaultValue={p ? p.priceCents / 100 : 3000} />}</Field>
        </div>
        <Field label="Weekly schedule" hint="Sessions are generated on these weekdays between the dates until the number of sessions is reached.">
          {() => (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2">
                  <input type="checkbox" name={`on-${i}`} className="size-4 accent-blue-500" defaultChecked={!!slots[i]} />
                  <Select size="sm" name={`day-${i}`} defaultValue={String(slots[i]?.dayOfWeek ?? 2)} options={DAY_NAMES.map((d, k) => ({ value: String(k), label: d }))} />
                  <TimeSelectField name={`start-${i}`} initial={slots[i]?.startMinutes ?? 18 * 60} />
                  <Select size="sm" name={`dur-${i}`} defaultValue={String(slots[i]?.durationMinutes ?? 90)} options={[60, 90, 120].map((d) => ({ value: String(d), label: `${d} min` }))} />
                </div>
              ))}
            </div>
          )}
        </Field>
        <Field label="Level requirement" hint="None = any level.">
          {() => (
            <div className="flex flex-wrap gap-3">
              {levels.map((l) => (
                <label key={l.level} className="flex items-center gap-2 text-body-sm">
                  <input type="checkbox" name={`level-${l.level}`} className="size-4 accent-blue-500" defaultChecked={p?.levels.includes(l.level)} /> {l.level} · {l.label}
                </label>
              ))}
            </div>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Min age">{(id) => <Input id={id} name="minAge" type="number" min={3} max={99} defaultValue={p?.minAge ?? ""} />}</Field>
          <Field label="Max age">{(id) => <Input id={id} name="maxAge" type="number" min={3} max={99} defaultValue={p?.maxAge ?? ""} />}</Field>
          <Field label="Withdrawal cutoff (hours)">{(id) => <Input id={id} name="cutoff" type="number" min={0} defaultValue={p?.cancellationCutoffHours ?? 72} />}</Field>
        </div>
        <Field label="Description">{(id) => <Textarea id={id} name="description" maxLength={2000} defaultValue={p?.description ?? ""} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Enrollment rules">{(id) => <Textarea id={id} name="enrollmentRules" maxLength={1000} defaultValue={p?.enrollmentRules ?? ""} placeholder="Official level B required. Rackets provided." />}</Field>
          <Field label="Cancellation rules">{(id) => <Textarea id={id} name="cancellationRules" maxLength={1000} defaultValue={p?.cancellationRules ?? ""} placeholder="Full refund up to 72 hours before the first session." />}</Field>
        </div>
        <label className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" name="allowWaitlist" className="size-4 accent-blue-500" defaultChecked={p?.allowWaitlist ?? true} /> Waitlist when full
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => { setCreate(false); setEdit(null); }}>
            Cancel
          </Button>
          <Button type="submit" loading={busy === "form"}>
            {p ? "Save" : "Create draft"}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <AdminShell title="Programs" breadcrumb={["People", "Programs"]} actions={canManage ? <Button leftIcon={<Plus />} onClick={() => setCreate(true)}>Create program</Button> : undefined}>
      {programs.length === 0 ? (
        <EmptyState title="No programs" description="Create beginner, junior, competitive or intensive programs and open them for enrollment." action={canManage ? <Button leftIcon={<Plus />} onClick={() => setCreate(true)}>Create program</Button> : undefined} />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Program</TH>
                <TH>Levels</TH>
                <TH>Coach · club</TH>
                <TH>Schedule</TH>
                <TH className="min-w-44">Enrollment</TH>
                <TH className="text-right">Price</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {programs.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-caption text-fg-subtle">
                      {p.code} · {PROGRAM_CATEGORIES.find((c) => c.value === p.category)?.label}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex gap-1">{p.levels.length ? p.levels.map((l) => <LevelBadge key={l} level={l} size="sm" />) : <Badge size="sm">Any</Badge>}</div>
                  </TD>
                  <TD className="text-fg-muted">
                    {p.trainer.user.name} · {p.location.name.replace("HITTERS ", "")}
                  </TD>
                  <TD className="text-fg-muted">
                    <div>{scheduleText(p.schedule)}</div>
                    <div className="text-caption">
                      {formatInZone(new Date(p.startsOn), "UTC", { day: "numeric", month: "short" })} – {formatInZone(new Date(p.endsOn), "UTC", { day: "numeric", month: "short" })} · {count(p.sessionsCount, "session")}
                    </div>
                  </TD>
                  <TD>
                    <ProgressBar value={p.enrolledCount} max={p.capacity} label={`${p.enrolledCount} / ${p.capacity}${p.waitlistCount ? ` · ${p.waitlistCount} waiting` : ""}`} tone={p.spotsLeft === 0 ? "success" : "brand"} />
                  </TD>
                  <TD className="text-right tabular">{money(p.priceCents, p.currency)}</TD>
                  <TD>
                    <ProgramStatusBadge status={p.status} size="sm" />
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant={selectedId === p.id ? "primary" : "ghost"} onClick={() => router.push(`/admin/programs?program=${p.id}`)}>
                        Roster
                      </Button>
                      {canManage && p.status === "DRAFT" && (
                        <Button size="sm" variant="secondary" loading={busy === p.id} onClick={() => act(p.id, "Program open for enrollment", () => setProgramStatusAction(p.id, "OPEN"))}>
                          Open
                        </Button>
                      )}
                      {canManage && !["COMPLETED", "CANCELLED"].includes(p.status) && (
                        <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>
                          Edit
                        </Button>
                      )}
                      {canManage && !["COMPLETED", "CANCELLED"].includes(p.status) && (
                        <IconButton size="sm" variant="ghost" label="Cancel program" onClick={() => setCancelP(p)}>
                          <X />
                        </IconButton>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      {selected && (
        <Card className="mt-5">
          <CardHeader
            title={`${selected.name} · roster`}
            description={`${selected.enrolledCount} enrolled of ${selected.capacity}${selected.waitlistCount ? `, ${selected.waitlistCount} on the waitlist` : ""}. Payments are taken at the venue.`}
            action={
              canManage && ["OPEN", "FULL"].includes(selected.status) ? (
                <form
                  className="flex items-end gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const playerId = String(new FormData(e.currentTarget).get("playerId") ?? "");
                    if (playerId) await act("enroll", "Member enrolled", () => enrollAction(selected.id, playerId));
                  }}
                >
                  <Select size="sm" name="playerId" placeholder="Enroll a member" options={members.map((m) => ({ value: m.id, label: `${m.name} · ${m.email}` }))} />
                  <Button size="sm" type="submit" leftIcon={<UserPlus />} loading={busy === "enroll"}>
                    Enroll
                  </Button>
                </form>
              ) : undefined
            }
          />
          {roster.length === 0 ? (
            <div className="text-body-sm text-fg-muted">Nobody has enrolled yet.</div>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Player</TH>
                    <TH>Level</TH>
                    <TH>Status</TH>
                    <TH>Attendance</TH>
                    <TH>Payment</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {roster.map((e) => (
                    <TR key={e.id}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Avatar name={e.player.name} size="xs" /> <span className="font-semibold">{e.player.name}</span>
                        </div>
                      </TD>
                      <TD>{e.player.playerProfile?.level ? <LevelBadge level={e.player.playerProfile.level} size="sm" /> : "—"}</TD>
                      <TD>
                        <EnrollmentBadge status={e.status} position={e.position} />
                      </TD>
                      <TD className="tabular text-fg-muted">
                        {e.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length} / {selected.sessions.filter((s) => s.status === "COMPLETED").length}
                      </TD>
                      <TD>{e.payments[0] ? <PaymentStatusBadge status={e.payments[0].status} size="sm" /> : "—"}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          {e.payments[0]?.status === "PENDING" && canManage && (
                            <Button size="sm" variant="secondary" loading={busy === e.id} onClick={() => act(e.id, "Payment recorded", () => recordAcademyPaymentAction({ enrollmentId: e.id }, { method: "CARD" }))}>
                              Paid by card
                            </Button>
                          )}
                          {["ENROLLED", "WAITLISTED"].includes(e.status) && canManage && (
                            <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" loading={busy === e.id} onClick={() => act(e.id, "Removed", () => cancelEnrollmentAction(e.id, "Removed by the club"))}>
                              Remove
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      )}

      <Modal open={create} onClose={() => setCreate(false)} title="Create a program" description="Saved as a draft; open it to take enrollments." size="lg">
        <Form p={null} />
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit ${edit.name}` : ""} description="If you change the dates or the schedule, the sessions are rebuilt, as long as no attendance has been marked yet." size="lg">
        {edit && <Form p={edit} />}
      </Modal>
      <Modal open={!!cancelP} onClose={() => setCancelP(null)} title={cancelP ? `Cancel ${cancelP.name}?` : ""} description="Everyone enrolled or waitlisted is notified and any payment is refunded." size="sm">
        <form
          className="space-y-4 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!cancelP) return;
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
            const ok = await act(cancelP.id, "Program cancelled", () => setProgramStatusAction(cancelP.id, "CANCELLED", reason || undefined));
            if (ok) setCancelP(null);
          }}
        >
          <Field label="Reason">{(id) => <Textarea id={id} name="reason" maxLength={500} />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelP(null)}>
              Keep
            </Button>
            <Button type="submit" variant="danger" loading={!!cancelP && busy === cancelP.id}>
              Cancel program
            </Button>
          </div>
        </form>
      </Modal>
      {void viewerId}
    </AdminShell>
  );
}

function TimeSelectField({ name, initial }: { name: string; initial: number }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <input type="hidden" name={name} value={v} />
      <TimeSelect value={v} onChange={setV} min={6 * 60} max={23 * 60} />
    </>
  );
}
