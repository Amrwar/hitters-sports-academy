"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { LevelDefinition } from "@prisma/client";
import { ClipboardCheck, GraduationCap, MapPin, Phone, Mail, ShieldAlert, Swords } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge, StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { BookingRow } from "@/components/patterns/booking-row";
import { MATCH_TYPES, preferredTimeLabel, TRAINING_KINDS } from "@/lib/catalog";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { formatInZone } from "@/lib/time";
import type { UserSummary } from "@/server/services/users";
import type { PlayerHistory, ProfileView } from "@/server/services/profiles";
import type { AssessmentOverview, AssessmentView } from "@/server/services/assessments";
import { createAssessmentAction, recordLevelChangeAction, recordTrainingAction } from "@/server/actions/assessments";

type Props = {
  user: UserSummary;
  profile: ProfileView;
  history: PlayerHistory;
  assessments: AssessmentView[];
  overview: AssessmentOverview | null;
  levels: LevelDefinition[];
  locations: { id: string; name: string; timezone: string }[];
  canOverride: boolean;
  recordAt: string[];
  trainAt: string[];
  viewerId: string;
};

const KIND_LABEL: Record<string, string> = { INITIAL: "Initial", REASSESSMENT: "Reassessment", LEVEL_CHANGE: "Level change" };

export function MemberDetail({ user, profile, history, assessments, overview, levels, locations, canOverride, recordAt, trainAt, viewerId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<"assessments" | "bookings" | "training">("assessments");
  const [assess, setAssess] = useState(false);
  const [change, setChange] = useState(false);
  const [train, setTrain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const levelMap = Object.fromEntries(levels.map((l) => [l.level, l]));
  const isSelf = user.id === viewerId;

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

  return (
    <AdminShell
      title={user.name}
      breadcrumb={["People", "Members", user.name]}
      actions={
        <>
          {!isSelf && recordAt.length > 0 && (
            <Button variant="secondary" leftIcon={<ClipboardCheck />} onClick={() => setAssess(true)}>
              Record assessment
            </Button>
          )}
          {canOverride && (
            <Button variant="secondary" leftIcon={<ShieldAlert />} onClick={() => setChange(true)}>
              Change level
            </Button>
          )}
          {trainAt.length > 0 && (
            <Button leftIcon={<GraduationCap />} onClick={() => setTrain(true)}>
              Add training
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-4">
              {profile.photoUrl ? (
                <span className="relative size-16 shrink-0 overflow-hidden rounded-full">
                  <Image src={profile.photoUrl} alt="" fill sizes="64px" className="object-cover" unoptimized />
                </span>
              ) : (
                <Avatar name={user.name} size="lg" />
              )}
              <div className="min-w-0">
                <div className="text-h3">{user.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {profile.level ? <LevelBadge level={profile.level} size="sm" withLabel label={levelMap[profile.level]?.label} /> : <Badge>Unassessed</Badge>}
                  <StatusBadge status={user.status === "ACTIVE" ? "active" : user.status === "SUSPENDED" ? "paused" : "expired"} />
                  {user.globalRole && (
                    <Badge tone="volt" size="sm">
                      {ROLE_LABEL[user.globalRole]}
                    </Badge>
                  )}
                  {user.memberships.map((m) => (
                    <Badge key={`${m.locationId}-${m.role}`} tone="brand" size="sm">
                      {ROLE_LABEL[m.role]} · {m.location.name.replace("HITTERS ", "")}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <ul className="mt-4 divide-y divide-line/10 text-body-sm">
              <li className="flex items-center gap-3 py-2">
                <Mail size={16} className="text-blue-300 light:text-blue-600" /> <span className="text-fg-muted">Email</span> <span className="ml-auto font-semibold">{user.email}</span>
              </li>
              <li className="flex items-center gap-3 py-2">
                <Phone size={16} className="text-blue-300 light:text-blue-600" /> <span className="text-fg-muted">Phone</span> <span className="ml-auto font-semibold tabular">{user.phone ?? "—"}</span>
              </li>
              <li className="flex items-center gap-3 py-2">
                <MapPin size={16} className="text-blue-300 light:text-blue-600" /> <span className="text-fg-muted">Home club</span> <span className="ml-auto font-semibold">{profile.homeLocation?.name ?? "—"}</span>
              </li>
              <li className="flex items-center gap-3 py-2">
                <Swords size={16} className="text-blue-300 light:text-blue-600" /> <span className="text-fg-muted">Prefers</span>{" "}
                <span className="ml-auto text-right font-semibold">
                  {MATCH_TYPES.find((m) => m.value === profile.matchType)?.label} · {profile.side.toLowerCase()} side
                  {profile.selfLevel ? ` · self ${profile.selfLevel}` : ""}
                </span>
              </li>
            </ul>
            {profile.preferredTimes.length > 0 && <div className="mt-3 text-caption text-fg-muted">Plays {profile.preferredTimes.map(preferredTimeLabel).join(", ").toLowerCase()}</div>}
            {profile.bio && <p className="mt-3 text-body-sm text-fg-muted">{profile.bio}</p>}
          </Card>

          {overview && (
            <Card>
              <CardHeader title="Assessment status" />
              {overview.openRequest ? (
                <Alert tone={overview.status === "scheduled" ? "success" : "info"} title={overview.status === "scheduled" ? "Scheduled" : "Requested"} action={<Button size="sm" variant="secondary" href="/admin/assessments">Open queue</Button>}>
                  {overview.openRequest.location.name}
                  {overview.openRequest.scheduledAt ? ` · ${formatInZone(new Date(overview.openRequest.scheduledAt), overview.openRequest.location.timezone)}` : ""}
                  {overview.openRequest.assessor ? ` · ${overview.openRequest.assessor.name}` : ""}
                </Alert>
              ) : (
                <p className="text-body-sm text-fg-muted">{overview.status === "assessed" ? `${overview.count} assessment${overview.count === 1 ? "" : "s"} on record.` : "No request in progress."}</p>
              )}
            </Card>
          )}
        </div>

        <div>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "assessments", label: "Assessments", count: assessments.length },
              { value: "bookings", label: "Bookings", count: history.bookings.length },
              { value: "training", label: "Training", count: history.training.length },
            ]}
          />
          <div className="mt-4 space-y-3">
            {tab === "assessments" &&
              (assessments.length === 0 ? (
                <EmptyState compact icon={<ClipboardCheck />} title="No assessments" />
              ) : (
                assessments.map((a) => (
                  <Card key={a.id} padding="sm">
                    <div className="flex items-start gap-3">
                      <LevelBadge level={a.level} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-body-sm font-bold">
                          {levelMap[a.level]?.label}
                          <Badge size="sm" tone={a.kind === "LEVEL_CHANGE" ? "warning" : a.kind === "REASSESSMENT" ? "info" : "brand"}>
                            {KIND_LABEL[a.kind]}
                          </Badge>
                          {a.previousLevel && a.previousLevel !== a.level && <span className="font-normal text-fg-muted">from {a.previousLevel}</span>}
                        </div>
                        <div className="text-caption text-fg-muted">
                          {a.assessor.name} · {a.location.name.replace("HITTERS ", "")} · {new Date(a.assessedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                        {a.scores && typeof a.scores === "object" && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Object.entries(a.scores as Record<string, number>).map(([k, v]) => (
                              <Badge key={k} size="sm">
                                {k} {v}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {a.notes && <div className="mt-1 text-caption text-fg-muted">Player notes: {a.notes}</div>}
                        {a.staffNotes && <div className="mt-1 text-caption text-warning-600">Staff notes: {a.staffNotes}</div>}
                      </div>
                    </div>
                  </Card>
                ))
              ))}
            {tab === "bookings" &&
              (history.bookings.length === 0 ? <EmptyState compact icon={<Swords />} title="No bookings" /> : history.bookings.map((b) => <BookingRow key={b.id} booking={b} href={`/admin/bookings/${b.id}`} />))}
            {tab === "training" &&
              (history.training.length === 0 ? (
                <EmptyState compact icon={<GraduationCap />} title="No training recorded" />
              ) : (
                history.training.map((t) => (
                  <Card key={t.id} padding="sm">
                    <div className="text-body-sm font-bold">{t.title}</div>
                    <div className="text-caption text-fg-muted">
                      {TRAINING_KINDS.find((k) => k.value === t.kind)?.label} · {t.location?.name.replace("HITTERS ", "") ?? ""} · {t.trainer?.name ?? ""} · {new Date(t.heldAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })} · {t.durationMinutes} min
                    </div>
                    {t.notes && <div className="mt-1 text-caption text-fg-muted">{t.notes}</div>}
                  </Card>
                ))
              ))}
          </div>
        </div>
      </div>

      {/* Record assessment (walk-in, no request) */}
      <Modal open={assess} onClose={() => setAssess(false)} title={`Record assessment · ${user.name}`} description="Assigns the official level and notifies the player." size="lg">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const scores: Record<string, number> = {};
            for (const k of ["serve", "volley", "bandeja", "movement", "tactics"]) {
              const v = String(f.get(`score_${k}`) ?? "");
              if (v !== "") scores[k] = Number(v);
            }
            const ok = await act("Assessment recorded", () => createAssessmentAction({ playerProfileId: profile.id, locationId: f.get("locationId"), level: f.get("level"), notes: f.get("notes"), staffNotes: f.get("staffNotes"), scores: Object.keys(scores).length ? scores : undefined }));
            if (ok) setAssess(false);
          }}
        >
          <Field label="Location" error={fields.locationId}>{(id) => <Select id={id} name="locationId" required defaultValue={recordAt.includes(profile.homeLocationId ?? "") ? profile.homeLocationId! : recordAt[0]} options={locations.filter((l) => recordAt.includes(l.id)).map((l) => ({ value: l.id, label: l.name }))} />}</Field>
          <Field label="Official level" error={fields.level}>{(id) => <Select id={id} name="level" required defaultValue={profile.level ?? profile.selfLevel ?? levels.at(-1)?.level} options={levels.map((l) => ({ value: l.level, label: `${l.level} · ${l.label}` }))} />}</Field>
          {["serve", "volley", "bandeja", "movement", "tactics"].map((k) => (
            <Field key={k} label={`${k.charAt(0).toUpperCase() + k.slice(1)} (0–10)`}>{(id) => <Input id={id} name={`score_${k}`} type="number" min={0} max={10} step={0.5} />}</Field>
          ))}
          <Field label="Notes for the player" className="sm:col-span-2">{(id) => <Textarea id={id} name="notes" maxLength={2000} />}</Field>
          <Field label="Staff notes" className="sm:col-span-2">{(id) => <Textarea id={id} name="staffNotes" maxLength={2000} />}</Field>
          <div className="flex justify-end gap-2 pb-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setAssess(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Assign level
            </Button>
          </div>
        </form>
      </Modal>

      {/* Level change */}
      <Modal open={change} onClose={() => setChange(false)} title="Change official level" description="A manager correction without a formal assessment. Recorded in the player's history and the audit log." size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await act("Level changed", () => recordLevelChangeAction({ playerProfileId: profile.id, level: String(f.get("level")), reason: String(f.get("reason") ?? "") }));
            if (ok) setChange(false);
          }}
        >
          <Field label="New level" error={fields.level}>{(id) => <Select id={id} name="level" required defaultValue={profile.level ?? ""} placeholder="Choose" options={levels.map((l) => ({ value: l.level, label: `${l.level} · ${l.label}` }))} />}</Field>
          <Field label="Reason" hint="Shown to the player." error={fields.reason}>{(id) => <Textarea id={id} name="reason" required minLength={5} maxLength={500} invalid={!!fields.reason} />}</Field>
          <div className="flex justify-end gap-2 pb-2">
            <Button type="button" variant="ghost" onClick={() => setChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Change level
            </Button>
          </div>
        </form>
      </Modal>

      {/* Training */}
      <Modal open={train} onClose={() => setTrain(false)} title={`Add training · ${user.name}`} description="Appears in the player's training history.">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await act("Training recorded", () => recordTrainingAction({ playerProfileId: profile.id, locationId: f.get("locationId"), kind: f.get("kind"), title: f.get("title"), heldAt: f.get("heldAt"), durationMinutes: f.get("durationMinutes"), notes: f.get("notes") }));
            if (ok) setTrain(false);
          }}
        >
          <Field label="Location" className="sm:col-span-2">{(id) => <Select id={id} name="locationId" required defaultValue={trainAt[0]} options={locations.filter((l) => trainAt.includes(l.id)).map((l) => ({ value: l.id, label: l.name }))} />}</Field>
          <Field label="Kind">{(id) => <Select id={id} name="kind" defaultValue="PRIVATE" options={TRAINING_KINDS.map((k) => ({ value: k.value, label: k.label }))} />}</Field>
          <Field label="Duration (min)">{(id) => <Input id={id} name="durationMinutes" type="number" min={15} max={480} defaultValue={60} />}</Field>
          <Field label="Title" className="sm:col-span-2" error={fields.title}>{(id) => <Input id={id} name="title" required placeholder="Volley and bandeja session" maxLength={120} />}</Field>
          <Field label="Held at" className="sm:col-span-2" error={fields.heldAt}>{(id) => <Input id={id} name="heldAt" type="datetime-local" required />}</Field>
          <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} name="notes" maxLength={1000} />}</Field>
          <div className="flex justify-end gap-2 pb-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setTrain(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
