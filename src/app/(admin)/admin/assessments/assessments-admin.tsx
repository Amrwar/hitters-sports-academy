"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { LevelDefinition } from "@prisma/client";
import { CalendarClock, ClipboardCheck, ListChecks, Settings2, XCircle } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatInZone, utcToLocalInput } from "@/lib/time";
import type { AssessmentRequestView } from "@/server/services/assessments";
import { cancelAssessmentRequestAction, createAssessmentAction, scheduleAssessmentAction, updateLevelDefinitionsAction } from "@/server/actions/assessments";

type Recent = { id: string; kind: string; level: "A" | "B" | "C" | "D"; previousLevel: "A" | "B" | "C" | "D" | null; assessedAt: Date; location: { name: string }; assessor: { name: string }; playerProfile: { id: string; user: { id: string; name: string } } };
type Props = {
  locations: { id: string; name: string; timezone: string }[];
  selectedId: string | null;
  open: AssessmentRequestView[];
  completed: AssessmentRequestView[];
  recent: Recent[];
  levels: LevelDefinition[];
  canConfigure: boolean;
  assessors: { locationId: string; id: string; name: string }[];
  caps: Record<string, { schedule: boolean; record: boolean }>;
  isGlobal: boolean;
  initialTab: "queue" | "history" | "levels";
  viewerId: string;
};

const KIND_LABEL: Record<string, string> = { INITIAL: "Initial", REASSESSMENT: "Reassessment", LEVEL_CHANGE: "Level change" };

export function AssessmentsAdmin({ locations, selectedId, open, completed, recent, levels, canConfigure, assessors, caps, isGlobal, initialTab, viewerId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [schedule, setSchedule] = useState<AssessmentRequestView | null>(null);
  const [record, setRecord] = useState<AssessmentRequestView | null>(null);
  const [decline, setDecline] = useState<AssessmentRequestView | null>(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const levelMap = Object.fromEntries(levels.map((l) => [l.level, l]));

  async function act(label: string, fn: () => Promise<{ ok: boolean; message?: string; fields?: Record<string, string> }>) {
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
    toast({ tone: "danger", title: res.message ?? "Action failed" });
    return false;
  }

  async function submitSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!schedule) return;
    const f = new FormData(e.currentTarget);
    const ok = await act("Assessment scheduled", () => scheduleAssessmentAction(schedule.id, { scheduledAt: String(f.get("scheduledAt")), assessorId: String(f.get("assessorId") ?? "") || undefined }));
    if (ok) setSchedule(null);
  }

  async function submitRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!record) return;
    const f = new FormData(e.currentTarget);
    const scores: Record<string, number> = {};
    for (const k of ["serve", "volley", "bandeja", "movement", "tactics"]) {
      const v = String(f.get(`score_${k}`) ?? "");
      if (v !== "") scores[k] = Number(v);
    }
    const ok = await act(`Level ${f.get("level")} recorded for ${record.playerProfile.user.name}`, () =>
      createAssessmentAction({ playerProfileId: record.playerProfile.id, locationId: record.locationId, level: f.get("level"), notes: f.get("notes"), staffNotes: f.get("staffNotes"), scores: Object.keys(scores).length ? scores : undefined, requestId: record.id }),
    );
    if (ok) setRecord(null);
  }

  const queueFor = (status: "REQUESTED" | "SCHEDULED") => open.filter((r) => r.status === status);

  return (
    <AdminShell
      title="Assessments"
      breadcrumb={["People", "Assessments"]}
      actions={
        locations.length > 1 ? (
          <Tabs variant="pill" value={selectedId ?? "all"} onChange={(id) => router.push(id === "all" ? "/admin/assessments" : `/admin/assessments?location=${id}`)} items={[{ value: "all", label: "All" }, ...locations.map((l) => ({ value: l.id, label: l.name.replace("HITTERS ", "") }))]} />
        ) : undefined
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "queue", label: "Queue", icon: <ListChecks />, count: open.length },
          { value: "history", label: "History", icon: <ClipboardCheck />, count: recent.length },
          { value: "levels", label: "Level definitions", icon: <Settings2 /> },
        ]}
      />

      {tab === "queue" && (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {(["REQUESTED", "SCHEDULED"] as const).map((status) => {
            const rows = queueFor(status);
            return (
              <Card key={status} padding="none">
                <CardHeader title={status === "REQUESTED" ? "Waiting to be scheduled" : "Scheduled"} description={status === "REQUESTED" ? "Players asked for an assessment" : "Record the result after the session"} className="px-5 pt-5" />
                {rows.length === 0 ? (
                  <div className="px-5 pb-5">
                    <EmptyState compact icon={status === "REQUESTED" ? <ListChecks /> : <CalendarClock />} title={status === "REQUESTED" ? "No new requests" : "Nothing scheduled"} />
                  </div>
                ) : (
                  <ul className="divide-y divide-line/10 border-t border-line/10">
                    {rows.map((r) => {
                      const cap = caps[r.locationId] ?? { schedule: false, record: false };
                      return (
                        <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                          <Avatar name={r.playerProfile.user.name} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <a href={`/admin/members/${r.playerProfile.user.id}`} className="text-body font-bold hover:underline">
                                {r.playerProfile.user.name}
                              </a>
                              <Badge size="sm" tone={r.kind === "REASSESSMENT" ? "info" : "brand"}>
                                {KIND_LABEL[r.kind]}
                              </Badge>
                              {r.playerProfile.level && <LevelBadge level={r.playerProfile.level} size="sm" />}
                              {r.playerProfile.selfLevel && (
                                <Badge size="sm">self-reported {r.playerProfile.selfLevel}</Badge>
                              )}
                            </div>
                            <div className="text-caption text-fg-muted">
                              {r.location.name.replace("HITTERS ", "")} · requested {new Date(r.createdAt).toLocaleDateString("en", { day: "numeric", month: "short" })}
                              {r.scheduledAt && ` · ${formatInZone(new Date(r.scheduledAt), r.location.timezone)}`}
                              {r.assessor && ` · ${r.assessor.name}`}
                            </div>
                            {r.note && <div className="mt-1 text-caption text-fg-muted">“{r.note}”</div>}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {cap.schedule && (
                              <Button size="sm" variant="secondary" leftIcon={<CalendarClock />} onClick={() => setSchedule(r)}>
                                {status === "REQUESTED" ? "Schedule" : "Reschedule"}
                              </Button>
                            )}
                            {cap.record && r.playerProfile.user.id !== viewerId && (
                              <Button size="sm" leftIcon={<ClipboardCheck />} onClick={() => setRecord(r)}>
                                Record
                              </Button>
                            )}
                            {cap.schedule && (
                              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" aria-label="Decline" onClick={() => setDecline(r)}>
                                <XCircle />
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === "history" && (
        <div className="mt-5">
          {recent.length === 0 ? (
            <EmptyState icon={<ClipboardCheck />} title="No assessments recorded yet" />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Player</TH>
                    <TH>Result</TH>
                    <TH>Kind</TH>
                    <TH>Assessor</TH>
                    <TH>Location</TH>
                    <TH>Date</TH>
                  </TR>
                </THead>
                <TBody>
                  {recent.map((a) => (
                    <TR key={a.id} interactive onClick={() => router.push(`/admin/members/${a.playerProfile.user.id}`)}>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={a.playerProfile.user.name} size="xs" />
                          <span className="font-semibold">{a.playerProfile.user.name}</span>
                        </div>
                      </TD>
                      <TD>
                        <span className="flex items-center gap-2">
                          <LevelBadge level={a.level} size="sm" label={levelMap[a.level]?.label} />
                          {a.previousLevel && a.previousLevel !== a.level && <span className="text-caption text-fg-muted">from {a.previousLevel}</span>}
                        </span>
                      </TD>
                      <TD>
                        <Badge size="sm" tone={a.kind === "LEVEL_CHANGE" ? "warning" : a.kind === "REASSESSMENT" ? "info" : "brand"}>
                          {KIND_LABEL[a.kind]}
                        </Badge>
                      </TD>
                      <TD className="text-fg-muted">{a.assessor.name}</TD>
                      <TD className="text-fg-muted">{a.location.name.replace("HITTERS ", "")}</TD>
                      <TD className="whitespace-nowrap text-fg-muted">{new Date(a.assessedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
          {completed.length > 0 && <p className="mt-3 text-caption text-fg-subtle">{completed.length} completed request{completed.length === 1 ? "" : "s"} in scope.</p>}
        </div>
      )}

      {tab === "levels" && <LevelsEditor levels={levels} canConfigure={canConfigure} isGlobal={isGlobal} />}

      {/* Schedule modal */}
      <Modal open={!!schedule} onClose={() => setSchedule(null)} title={`Schedule ${schedule?.playerProfile.user.name ?? ""}`} description={schedule ? `${schedule.location.name} · times in ${schedule.location.timezone}` : undefined}>
        {schedule && (
          <form onSubmit={submitSchedule} className="space-y-4">
            <Field label="Date and time" error={fields.scheduledAt}>{(id) => <Input id={id} name="scheduledAt" type="datetime-local" required defaultValue={schedule.scheduledAt ? utcToLocalInput(new Date(schedule.scheduledAt), schedule.location.timezone) : ""} invalid={!!fields.scheduledAt} />}</Field>
            <Field label="Assessor" hint="Only assessors at this location." error={fields.assessorId}>
              {(id) => <Select id={id} name="assessorId" defaultValue={schedule.assessor?.id ?? ""} options={[{ value: "", label: caps[schedule.locationId]?.record ? "Me" : "Assign later" }, ...assessors.filter((a) => a.locationId === schedule.locationId).map((a) => ({ value: a.id, label: a.name }))]} />}
            </Field>
            <div className="flex justify-end gap-2 pb-2">
              <Button type="button" variant="ghost" onClick={() => setSchedule(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save schedule
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Record modal */}
      <Modal open={!!record} onClose={() => setRecord(null)} title={`Record result · ${record?.playerProfile.user.name ?? ""}`} description="Assigns the official level, closes the request and notifies the player." size="lg">
        {record && (
          <form onSubmit={submitRecord} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Alert tone="info">
                {record.playerProfile.level ? `Current official level ${record.playerProfile.level}.` : "First official placement."}
                {record.playerProfile.selfLevel ? ` Player self-reports ${record.playerProfile.selfLevel}.` : ""}
              </Alert>
            </div>
            <Field label="Official level" className="sm:col-span-2" error={fields.level}>
              {(id) => <Select id={id} name="level" required defaultValue={record.playerProfile.selfLevel ?? record.playerProfile.level ?? levels.at(-1)?.level} options={levels.map((l) => ({ value: l.level, label: `${l.level} · ${l.label}` }))} />}
            </Field>
            {["serve", "volley", "bandeja", "movement", "tactics"].map((k) => (
              <Field key={k} label={`${k.charAt(0).toUpperCase() + k.slice(1)} (0–10)`}>{(id) => <Input id={id} name={`score_${k}`} type="number" min={0} max={10} step={0.5} />}</Field>
            ))}
            <Field label="Notes for the player" className="sm:col-span-2" error={fields.notes}>{(id) => <Textarea id={id} name="notes" maxLength={2000} placeholder="Strengths, what to work on" />}</Field>
            <Field label="Staff notes (not shown to the player)" className="sm:col-span-2" error={fields.staffNotes}>{(id) => <Textarea id={id} name="staffNotes" maxLength={2000} />}</Field>
            <div className="flex justify-end gap-2 pb-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setRecord(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Assign level
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!decline}
        onClose={() => setDecline(null)}
        tone="danger"
        title={`Decline ${decline?.playerProfile.user.name ?? ""}'s request?`}
        description="The player is notified and can request again."
        confirmLabel="Decline"
        loading={busy}
        onConfirm={async () => {
          if (decline) await act("Request declined", () => cancelAssessmentRequestAction(decline.id, "Declined by the club"));
          setDecline(null);
        }}
      />
    </AdminShell>
  );
}

function LevelsEditor({ levels, canConfigure, isGlobal }: { levels: LevelDefinition[]; canConfigure: boolean; isGlobal: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState(levels.map((l) => ({ level: l.level, rank: l.rank, label: l.label, description: l.description })));
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    const res = await updateLevelDefinitionsAction(rows);
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: "Level definitions saved" });
      router.refresh();
    } else toast({ tone: "danger", title: res.message });
  }

  return (
    <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        {rows.map((r, i) => (
          <Card key={r.level} padding="md">
            <fieldset disabled={!canConfigure} className="grid gap-3 sm:grid-cols-[auto_120px_1fr]">
              <div className="flex items-start pt-1">
                <LevelBadge level={r.level} size="lg" />
              </div>
              <Field label="Rank (1 = strongest)">{(id) => <Input id={id} type="number" min={1} max={4} value={r.rank} onChange={(e) => set(i, { rank: Number(e.target.value) })} />}</Field>
              <Field label="Label">{(id) => <Input id={id} value={r.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} />}</Field>
              <Field label="Description" className="sm:col-span-3">{(id) => <Textarea id={id} value={r.description} maxLength={500} onChange={(e) => set(i, { description: e.target.value })} className="min-h-20" />}</Field>
            </fieldset>
          </Card>
        ))}
      </div>
      <div className="space-y-4 self-start">
        <Alert tone="info" title="Ordering is configurable">
          Nothing in the platform assumes which letter is highest. Rank 1 is treated as the strongest wherever levels are compared; labels and descriptions appear on player profiles and in the assessment form.
        </Alert>
        {canConfigure ? (
          <Button loading={busy} fullWidth onClick={save}>
            Save level definitions
          </Button>
        ) : (
          <p className="text-body-sm text-fg-muted">{isGlobal ? "" : "Only academy owners and super admins can change level definitions."}</p>
        )}
      </div>
    </div>
  );
}
