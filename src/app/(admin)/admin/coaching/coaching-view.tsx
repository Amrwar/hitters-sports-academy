"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { CalendarDays, Check, ClipboardList, GraduationCap, Plus, StickyNote, Users, X } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Switch, StatTile } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { TimeSelect } from "@/components/ui/time-select";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { money, PaymentStatusBadge } from "@/components/patterns/booking-status";
import { LessonStatusBadge, ProgramStatusBadge, scheduleText } from "@/components/patterns/academy";
import { DAY_NAMES, formatInZone, minutesToHHMM, todayISO, addDaysISO } from "@/lib/time";
import { ATTENDANCE_STATUSES } from "@/lib/catalog";
import type { TrainerView } from "@/server/services/trainers";
import type { LessonView, Student } from "@/server/services/lessons";
import type { EnrollmentView, ProgramView } from "@/server/services/programs";
import { addProgressNoteAction, addTimeOffAction, markAttendanceAction, markLessonAttendanceAction, recordAcademyPaymentAction, removeTimeOffAction, respondToLessonRequestAction, setTrainerAvailabilityAction, updateTrainerProfileAction, cancelLessonAction } from "@/server/actions/academy";
import { listProgramEnrollmentsAction } from "@/server/actions/academy-reads";

type TrainerData = { profile: TrainerView; upcoming: LessonView[]; requests: LessonView[]; past: LessonView[]; students: Student[]; programs: ProgramView[] };
type Props = {
  viewerId: string;
  levelLabels: Record<string, string>;
  trainer: TrainerData | null;
  clubs: { id: string; name: string; timezone: string }[];
  selectedClubId: string | null;
  dateISO: string | null;
  clubLessons: LessonView[];
  initialTab: string;
};
type Tab = "calendar" | "availability" | "students" | "programs" | "history" | "club";

export function CoachingView({ viewerId, levelLabels, trainer, clubs, selectedClubId, dateISO, clubLessons, initialTab }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>((["calendar", "availability", "students", "programs", "history", "club"].includes(initialTab) ? initialTab : trainer ? "calendar" : "club") as Tab);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ playerId: string; name: string; lessonId?: string } | null>(null);
  const [cancel, setCancel] = useState<LessonView | null>(null);

  async function act(key: string, label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast({ tone: "success", title: label });
    else toast({ tone: "danger", title: "Could not do that", description: res.message });
    router.refresh();
    return res.ok;
  }

  const items = [
    ...(trainer
      ? [
          { value: "calendar" as Tab, label: "My calendar", icon: <CalendarDays />, count: trainer.upcoming.length + trainer.requests.length },
          { value: "availability" as Tab, label: "Availability" },
          { value: "students" as Tab, label: "Students", icon: <Users />, count: trainer.students.length },
          { value: "programs" as Tab, label: "My programs", icon: <GraduationCap />, count: trainer.programs.length },
          { value: "history" as Tab, label: "History" },
        ]
      : []),
    ...(clubs.length ? [{ value: "club" as Tab, label: "Club lessons", icon: <ClipboardList /> }] : []),
  ];

  const LessonTable = ({ rows, viewer, actions }: { rows: LessonView[]; viewer: "trainer" | "staff"; actions?: (l: LessonView) => React.ReactNode }) =>
    rows.length === 0 ? (
      <EmptyState compact icon={<CalendarDays />} title="Nothing here" description="Lessons appear as players book inside your availability." />
    ) : (
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>{viewer === "trainer" ? "Player" : "Player · coach"}</TH>
              <TH>Club</TH>
              <TH>Focus</TH>
              <TH>Price</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((l) => (
              <TR key={l.id}>
                <TD>
                  <div className="font-semibold">{formatInZone(new Date(l.startsAt), l.location.timezone, { weekday: "short", day: "numeric", month: "short" })}</div>
                  <div className="text-caption tabular text-fg-muted">
                    {formatInZone(new Date(l.startsAt), l.location.timezone, { hour: "2-digit", minute: "2-digit" })} · {l.durationMinutes} min · {l.code}
                  </div>
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Avatar name={l.player.name} src={l.player.playerProfile?.photoUrl} size="xs" />
                    <span className="font-semibold">{l.player.name}</span>
                    {l.player.playerProfile?.level && <LevelBadge level={l.player.playerProfile.level as PlayerLevel} size="sm" label={levelLabels[l.player.playerProfile.level]} />}
                  </div>
                  {viewer === "staff" && <div className="text-caption text-fg-muted">with {l.trainer.user.name}</div>}
                </TD>
                <TD className="text-fg-muted">{l.location.name.replace("HITTERS ", "")}</TD>
                <TD className="max-w-56 truncate text-fg-muted" title={l.focus ?? ""}>
                  {l.focus ?? "—"}
                </TD>
                <TD className="tabular">
                  {l.redemption ? <Badge size="sm" tone="info">Credit</Badge> : money(l.priceCents, l.currency)} {l.payments[0] && !l.redemption && <PaymentStatusBadge status={l.payments[0].status} size="sm" />}
                </TD>
                <TD>
                  <LessonStatusBadge status={l.status} size="sm" />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">{actions?.(l)}</div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    );

  const trainerActions = (l: LessonView) => {
    const started = new Date(l.startsAt) <= new Date();
    return (
      <>
        {l.status === "REQUESTED" && (
          <>
            <Button size="sm" variant="secondary" leftIcon={<X />} loading={busy === l.id} onClick={() => act(l.id, "Request declined", () => respondToLessonRequestAction(l.id, "DECLINE"))}>
              Decline
            </Button>
            <Button size="sm" leftIcon={<Check />} loading={busy === l.id} onClick={() => act(l.id, "Lesson confirmed", () => respondToLessonRequestAction(l.id, "ACCEPT"))}>
              Accept
            </Button>
          </>
        )}
        {l.status === "CONFIRMED" && started && (
          <>
            <Button size="sm" variant="secondary" loading={busy === l.id} onClick={() => act(l.id, "Marked no-show", () => markLessonAttendanceAction(l.id, "NO_SHOW"))}>
              No-show
            </Button>
            <Button size="sm" loading={busy === l.id} onClick={() => act(l.id, "Lesson completed", () => markLessonAttendanceAction(l.id, "COMPLETED"))}>
              Completed
            </Button>
          </>
        )}
        {l.status === "CONFIRMED" && !started && (
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setCancel(l)}>
            Cancel
          </Button>
        )}
        {["CONFIRMED", "COMPLETED"].includes(l.status) && (
          <IconButton size="sm" variant="ghost" label="Add note" onClick={() => setNote({ playerId: l.playerId, name: l.player.name, lessonId: l.id })}>
            <StickyNote />
          </IconButton>
        )}
      </>
    );
  };

  return (
    <AdminShell title="Coaching" breadcrumb={["Operations", "Coaching"]}>
      {trainer && (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <StatTile label="Upcoming lessons" value={trainer.upcoming.length} />
          <StatTile label="Requests" value={trainer.requests.length} tone={trainer.requests.length ? "brand" : "default"} />
          <StatTile label="Students" value={trainer.students.length} />
          <StatTile label="Programs" value={trainer.programs.filter((p) => ["OPEN", "FULL", "IN_PROGRESS"].includes(p.status)).length} />
        </div>
      )}
      {!trainer && clubs.length === 0 && <EmptyState icon={<GraduationCap />} title="No coaching data" description="This page shows a trainer's calendar or the lessons at clubs you manage." />}
      {items.length > 0 && <Tabs value={tab} onChange={setTab} items={items} />}

      {trainer && tab === "calendar" && (
        <div className="mt-5 space-y-6">
          {trainer.requests.length > 0 && (
            <Card>
              <CardHeader title="Requests waiting for you" description="Players asked for these times; accept or decline." />
              <LessonTable rows={trainer.requests} viewer="trainer" actions={trainerActions} />
            </Card>
          )}
          <Card>
            <CardHeader title="Upcoming lessons" description="Mark attendance once a lesson has started. Completed lessons join the player's training history." />
            <LessonTable rows={trainer.upcoming.filter((l) => l.status !== "REQUESTED")} viewer="trainer" actions={trainerActions} />
          </Card>
          {trainer.programs.filter((p) => ["OPEN", "FULL", "IN_PROGRESS"].includes(p.status)).length > 0 && (
            <Card>
              <CardHeader title="Program sessions this month" />
              <ul className="divide-y divide-line/10 text-body-sm">
                {trainer.programs
                  .filter((p) => ["OPEN", "FULL", "IN_PROGRESS"].includes(p.status))
                  .flatMap((p) => p.sessions.filter((s) => s.status === "SCHEDULED" && new Date(s.endsAt) >= new Date()).slice(0, 3).map((s) => ({ p, s })))
                  .sort((a, b) => new Date(a.s.startsAt).getTime() - new Date(b.s.startsAt).getTime())
                  .slice(0, 8)
                  .map(({ p, s }) => (
                    <li key={s.id} className="flex items-center gap-3 py-2">
                      <span className="w-44 font-semibold tabular">{formatInZone(new Date(s.startsAt), p.location.timezone)}</span>
                      <span className="flex-1 truncate">
                        {p.name} · session {s.index}
                      </span>
                      <span className="text-fg-muted">{p.enrolledCount} players</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {trainer && tab === "availability" && <AvailabilityEditor trainer={trainer.profile} clubs={trainer.profile.locations.map((l) => ({ id: l.location.id, name: l.location.name, timezone: l.location.timezone }))} onSaved={() => router.refresh()} />}

      {trainer && tab === "students" && (
        <Card className="mt-5">
          <CardHeader title="Assigned students" description="Players with a lesson or an enrollment in your programs. Notes you write are private unless you share them." />
          {trainer.students.length === 0 ? (
            <EmptyState compact icon={<Users />} title="No students yet" />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Player</TH>
                    <TH>Level</TH>
                    <TH>Lessons</TH>
                    <TH>Last</TH>
                    <TH>Next</TH>
                    <TH>Programs</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {trainer.students.map((s) => (
                    <TR key={s.user.id}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Avatar name={s.user.name} src={s.user.photoUrl} size="xs" /> <span className="font-semibold">{s.user.name}</span>
                        </div>
                      </TD>
                      <TD>{s.user.level ? <LevelBadge level={s.user.level as PlayerLevel} size="sm" label={levelLabels[s.user.level]} /> : "—"}</TD>
                      <TD className="tabular">
                        {s.completed} / {s.lessons}
                      </TD>
                      <TD className="text-fg-muted">{s.lastLessonAt ? formatInZone(new Date(s.lastLessonAt), clubs[0]?.timezone ?? "Africa/Cairo", { day: "numeric", month: "short" }) : "—"}</TD>
                      <TD className="text-fg-muted">{s.nextLessonAt ? formatInZone(new Date(s.nextLessonAt), clubs[0]?.timezone ?? "Africa/Cairo") : "—"}</TD>
                      <TD className="text-fg-muted">{s.programs.join(", ") || "—"}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" href={`/admin/members?q=${encodeURIComponent(s.user.name)}`}>
                            Profile
                          </Button>
                          <Button size="sm" variant="secondary" leftIcon={<StickyNote />} onClick={() => setNote({ playerId: s.user.id, name: s.user.name })}>
                            Note
                          </Button>
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

      {trainer && tab === "programs" && <TrainerPrograms programs={trainer.programs} levelLabels={levelLabels} />}

      {trainer && tab === "history" && (
        <Card className="mt-5">
          <CardHeader title="Lesson history" />
          <LessonTable rows={trainer.past} viewer="trainer" actions={(l) => (["CONFIRMED"].includes(l.status) ? trainerActions(l) : ["COMPLETED"].includes(l.status) ? <IconButton size="sm" variant="ghost" label="Add note" onClick={() => setNote({ playerId: l.playerId, name: l.player.name, lessonId: l.id })}><StickyNote /></IconButton> : null)} />
        </Card>
      )}

      {tab === "club" && clubs.length > 0 && (
        <Card className="mt-5">
          <CardHeader
            title="Lessons at the club"
            description="Every coach's lessons at this club. Record venue payments here."
            action={
              <div className="flex items-end gap-2">
                <Select value={selectedClubId ?? ""} onChange={(e) => router.push(`/admin/coaching?tab=club&location=${e.target.value}`)} options={clubs.map((c) => ({ value: c.id, label: c.name }))} size="sm" />
                <Input type="date" size="sm" value={dateISO ?? ""} onChange={(e) => router.push(`/admin/coaching?tab=club&location=${selectedClubId}&date=${e.target.value || "all"}`)} />
                <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/coaching?tab=club&location=${selectedClubId}&date=all`)}>
                  All upcoming
                </Button>
                <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/coaching?tab=club&location=${selectedClubId}&date=${todayISO(clubs.find((c) => c.id === selectedClubId)?.timezone ?? "Africa/Cairo")}`)}>
                  Today
                </Button>
              </div>
            }
          />
          <LessonTable
            rows={clubLessons}
            viewer="staff"
            actions={(l) => (
              <>
                {l.payments[0]?.status === "PENDING" && (
                  <Button size="sm" variant="secondary" loading={busy === l.id} onClick={() => act(l.id, "Payment recorded", () => recordAcademyPaymentAction({ lessonId: l.id }, { method: "CARD" }))}>
                    Paid by card
                  </Button>
                )}
                {["REQUESTED", "CONFIRMED"].includes(l.status) && new Date(l.startsAt) > new Date() && (
                  <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setCancel(l)}>
                    Cancel
                  </Button>
                )}
                <Button size="sm" variant="ghost" href={`/app/lessons/${l.id}`}>
                  Open
                </Button>
              </>
            )}
          />
        </Card>
      )}

      <Modal open={!!note} onClose={() => setNote(null)} title={note ? `Note about ${note.name}` : ""} description="Private notes stay with you and club staff. Shared notes are shown to the player.">
        <form
          className="space-y-4 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note) return;
            const f = new FormData(e.currentTarget);
            const ok = await act("note", "Note saved", () => addProgressNoteAction({ playerId: note.playerId, lessonId: note.lessonId, body: String(f.get("body") ?? ""), visibility: f.get("shared") ? "SHARED" : "PRIVATE" }));
            if (ok) setNote(null);
          }}
        >
          <Field label="Progress note">{(id) => <Textarea id={id} name="body" required minLength={2} maxLength={2000} placeholder="Serve toss drifting left; worked on contact point. Next: bandeja depth." />}</Field>
          <label className="flex items-center gap-2 text-body-sm">
            <input type="checkbox" name="shared" className="size-4 accent-blue-500" /> Share with the player
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNote(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy === "note"}>
              Save note
            </Button>
          </div>
        </form>
      </Modal>
      <Modal open={!!cancel} onClose={() => setCancel(null)} title={cancel ? `Cancel lesson ${cancel.code}?` : ""} description="The player is notified and any package credit is returned." size="sm">
        <form
          className="space-y-4 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!cancel) return;
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
            const ok = await act(cancel.id, "Lesson cancelled", () => cancelLessonAction(cancel.id, reason || undefined));
            if (ok) setCancel(null);
          }}
        >
          <Field label="Reason">{(id) => <Textarea id={id} name="reason" maxLength={500} placeholder="Illness, court closed…" />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancel(null)}>
              Keep
            </Button>
            <Button type="submit" variant="danger" loading={!!cancel && busy === cancel.id}>
              Cancel lesson
            </Button>
          </div>
        </form>
      </Modal>
      {void viewerId}
    </AdminShell>
  );
}

/* ------------------------------------------------------------------ Availability editor */

function AvailabilityEditor({ trainer, clubs, onSaved }: { trainer: TrainerView; clubs: { id: string; name: string; timezone: string }[]; onSaved: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(trainer.availability.map((w) => ({ locationId: w.locationId, dayOfWeek: w.dayOfWeek, startMinutes: w.startMinutes, endMinutes: w.endMinutes })));
  const [autoConfirm, setAutoConfirm] = useState(trainer.autoConfirm);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const tz = clubs[0]?.timezone ?? "Africa/Cairo";

  async function save() {
    setBusy(true);
    const res = await setTrainerAvailabilityAction(trainer.id, rows);
    const res2 = autoConfirm !== trainer.autoConfirm ? await updateTrainerProfileAction(trainer.id, { autoConfirm }) : { ok: true as const, message: undefined };
    setBusy(false);
    if (res.ok && res2.ok) {
      toast({ tone: "success", title: "Availability saved" });
      onSaved();
    } else {
      const failed = !res.ok ? res : !res2.ok ? res2 : null;
      toast({ tone: "danger", title: "Could not save", description: failed?.message });
    }
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Weekly coaching hours" description="Players can only book inside these windows. One window per club per block; windows must not overlap." action={<Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={() => setRows([...rows, { locationId: clubs[0]?.id ?? "", dayOfWeek: 1, startMinutes: 9 * 60, endMinutes: 13 * 60 }])}>Add window</Button>} />
        <div className="space-y-2">
          {rows.length === 0 && <div className="text-body-sm text-fg-muted">No windows yet: you are not bookable until you add some.</div>}
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-2">
              <Select size="sm" value={String(r.dayOfWeek)} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dayOfWeek: Number(e.target.value) } : x)))} options={DAY_NAMES.map((d, k) => ({ value: String(k), label: d }))} />
              <Select size="sm" value={r.locationId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, locationId: e.target.value } : x)))} options={clubs.map((c) => ({ value: c.id, label: c.name.replace("HITTERS ", "") }))} />
              <TimeSelect value={r.startMinutes} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, startMinutes: v, endMinutes: Math.max(x.endMinutes, v + 60) } : x)))} min={6 * 60} max={23 * 60} />
              <TimeSelect value={r.endMinutes} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, endMinutes: v } : x)))} min={7 * 60} max={24 * 60} />
              <IconButton size="sm" variant="ghost" label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <X />
              </IconButton>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-line/10 pt-4">
          <Switch checked={autoConfirm} onChange={setAutoConfirm} label="Confirm lessons automatically" description="Off: every booking arrives as a request you accept or decline." />
          <Button onClick={save} loading={busy}>
            Save
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Time off" description="Blocks you out of booking." action={<Button size="sm" variant="secondary" leftIcon={<Plus />} onClick={() => setOff(true)}>Add</Button>} />
        <ul className="divide-y divide-line/10 text-body-sm">
          {trainer.timeOff.filter((o) => new Date(o.endsAt) >= new Date()).map((o) => (
            <li key={o.id} className="flex items-center gap-2 py-2">
              <span className="flex-1">
                {formatInZone(new Date(o.startsAt), tz)} – {formatInZone(new Date(o.endsAt), tz)}
                {o.reason ? <span className="text-fg-muted"> · {o.reason}</span> : null}
              </span>
              <IconButton size="sm" variant="ghost" label="Remove" onClick={async () => { const r = await removeTimeOffAction(trainer.id, o.id); if (r.ok) onSaved(); }}>
                <X />
              </IconButton>
            </li>
          ))}
          {trainer.timeOff.filter((o) => new Date(o.endsAt) >= new Date()).length === 0 && <li className="py-2 text-fg-muted">No time off planned.</li>}
        </ul>
      </Card>
      <Modal open={off} onClose={() => setOff(false)} title="Add time off" size="sm">
        <form
          className="space-y-4 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const r = await addTimeOffAction(trainer.id, { startLocal: String(f.get("start")), endLocal: String(f.get("end")), reason: String(f.get("reason") ?? "") || undefined });
            if (r.ok) {
              toast({ tone: "success", title: "Time off added" });
              setOff(false);
              onSaved();
            } else toast({ tone: "danger", title: "Could not add", description: r.message });
          }}
        >
          <Field label="From">{(id) => <Input id={id} name="start" type="datetime-local" required defaultValue={`${addDaysISO(todayISO(tz), 1)}T09:00`} />}</Field>
          <Field label="To">{(id) => <Input id={id} name="end" type="datetime-local" required defaultValue={`${addDaysISO(todayISO(tz), 1)}T18:00`} />}</Field>
          <Field label="Reason (optional)">{(id) => <Input id={id} name="reason" maxLength={200} />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOff(false)}>
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ Trainer's programs with attendance */

function TrainerPrograms({ programs, levelLabels }: { programs: ProgramView[]; levelLabels: Record<string, string> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState<{ program: ProgramView; sessionId: string } | null>(null);
  const [roster, setRoster] = useState<EnrollmentView[]>([]);
  const [marks, setMarks] = useState<Record<string, "PRESENT" | "ABSENT" | "LATE" | "EXCUSED">>({});
  const [busy, setBusy] = useState(false);

  async function openSession(program: ProgramView, sessionId: string) {
    const res = await listProgramEnrollmentsAction(program.id);
    if (!res.ok) return toast({ tone: "danger", title: "Could not load roster", description: res.message });
    const enrolled = res.data.filter((e) => e.status === "ENROLLED" || e.status === "COMPLETED");
    setRoster(enrolled);
    setMarks(Object.fromEntries(enrolled.map((e) => [e.id, e.attendance.find((a) => a.sessionId === sessionId)?.status ?? "PRESENT"])));
    setOpen({ program, sessionId });
  }

  async function save() {
    if (!open) return;
    setBusy(true);
    const res = await markAttendanceAction(open.sessionId, roster.map((e) => ({ enrollmentId: e.id, status: marks[e.id] })));
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: `Attendance saved for ${res.data.marked} players` });
      setOpen(null);
      router.refresh();
    } else toast({ tone: "danger", title: "Could not save", description: res.message });
  }

  return (
    <div className="mt-5 space-y-4">
      {programs.length === 0 && <EmptyState compact icon={<GraduationCap />} title="No programs assigned" description="Managers assign programs to you from Programs." />}
      {programs.map((p) => (
        <Card key={p.id}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                {p.name} <ProgramStatusBadge status={p.status} size="sm" />
              </span>
            }
            description={`${p.location.name.replace("HITTERS ", "")} · ${scheduleText(p.schedule)} · ${p.enrolledCount}/${p.capacity} enrolled${p.waitlistCount ? ` · ${p.waitlistCount} waitlisted` : ""} · ${p.levels.length ? p.levels.map((l) => levelLabels[l] ?? l).join(", ") : "any level"}`}
            action={
              <Button size="sm" variant="ghost" href={`/admin/programs?program=${p.id}`}>
                Roster
              </Button>
            }
          />
          <ul className="divide-y divide-line/10 text-body-sm">
            {p.sessions.map((s) => {
              const started = new Date(s.startsAt) <= new Date();
              return (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-caption font-bold tabular text-fg-subtle">{s.index}</span>
                  <span className="flex-1">{formatInZone(new Date(s.startsAt), p.location.timezone, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {s.status === "CANCELLED" ? (
                    <Badge size="sm" tone="danger">
                      Cancelled
                    </Badge>
                  ) : s._count.attendance > 0 ? (
                    <Badge size="sm" tone="success">
                      {s._count.attendance} marked
                    </Badge>
                  ) : null}
                  {started && s.status !== "CANCELLED" && (
                    <Button size="sm" variant={s._count.attendance ? "ghost" : "secondary"} onClick={() => openSession(p, s.id)}>
                      {s._count.attendance ? "Edit attendance" : "Mark attendance"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Attendance" description={open ? `${open.program.name} · session ${open.program.sessions.find((s) => s.id === open.sessionId)?.index}` : ""}>
        <div className="space-y-2 pb-2">
          {roster.map((e) => (
            <div key={e.id} className="flex items-center gap-3">
              <Avatar name={e.player.name} size="xs" />
              <span className="flex-1 text-body-sm font-semibold">{e.player.name}</span>
              <Select size="sm" value={marks[e.id]} onChange={(ev) => setMarks({ ...marks, [e.id]: ev.target.value as "PRESENT" })} options={ATTENDANCE_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
            </div>
          ))}
          {roster.length === 0 && <div className="text-body-sm text-fg-muted">Nobody is enrolled.</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={roster.length === 0}>
              Save attendance
            </Button>
          </div>
        </div>
      </Modal>
      {void minutesToHHMM}
    </div>
  );
}
