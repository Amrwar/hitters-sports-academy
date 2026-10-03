"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { LevelDefinition } from "@prisma/client";
import { CalendarCheck, ClipboardCheck, Clock, History, LogOut, MapPin, Settings, ShieldCheck, Swords, Trophy, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Chip, StatTile } from "@/components/ui/misc";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { BookingRow } from "@/components/patterns/booking-row";
import { MATCH_TYPES, PREFERRED_TIMES, preferredTimeLabel, TRAINING_KINDS } from "@/lib/catalog";
import { formatInZone } from "@/lib/time";
import type { ProfileView as Profile, PlayerHistory } from "@/server/services/profiles";
import type { AssessmentOverview, PlayerAssessmentView } from "@/server/services/assessments";
import { updateProfileAction } from "@/server/actions/profile";
import { changePasswordAction, logoutAction } from "@/server/actions/auth";
import { cancelAssessmentRequestAction, requestAssessmentAction } from "@/server/actions/assessments";

type Tab = "overview" | "assessment" | "history" | "settings";
type Props = {
  profile: Profile;
  overview: AssessmentOverview;
  history: PlayerHistory;
  assessments: PlayerAssessmentView[];
  levels: LevelDefinition[];
  locations: { id: string; name: string; status: string }[];
  isStaff: boolean;
  initialTab: Tab;
};

const KIND_LABEL = { INITIAL: "Initial assessment", REASSESSMENT: "Reassessment", LEVEL_CHANGE: "Level change" } as const;

export function ProfileView({ profile, overview, history, assessments, levels, locations, isStaff, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const levelMap = Object.fromEntries(levels.map((l) => [l.level, l]));
  const memberSince = new Date(profile.user.createdAt).toLocaleDateString("en", { month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          {profile.photoUrl ? (
            <span className="relative size-20 shrink-0 overflow-hidden rounded-full ring-2 ring-blue-400 ring-offset-2 ring-offset-canvas shadow-glow-sm">
              <Image src={profile.photoUrl} alt={profile.user.name} fill sizes="80px" className="object-cover" unoptimized />
            </span>
          ) : (
            <Avatar name={profile.user.name} size="xl" ring />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-h2">{profile.user.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {profile.level ? <LevelBadge level={profile.level} size="sm" withLabel label={levelMap[profile.level]?.label} /> : <Badge>Not yet assessed</Badge>}
              {profile.selfLevel && !profile.level && (
                <Badge size="sm" tone="info">
                  Self-reported {profile.selfLevel}
                </Badge>
              )}
            </div>
            <div className="mt-1 text-caption text-fg-muted">
              {profile.side.charAt(0) + profile.side.slice(1).toLowerCase()} side · {profile.homeLocation?.name.replace("HITTERS ", "") ?? "No home club"} · since {memberSince}
            </div>
          </div>
        </div>
        {isStaff && (
          <Button size="sm" variant="secondary" href="/admin" leftIcon={<ShieldCheck />}>
            Admin
          </Button>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        fullWidth
        items={[
          { value: "overview", label: "Overview", icon: <User /> },
          { value: "assessment", label: "Level", icon: <ClipboardCheck /> },
          { value: "history", label: "History", icon: <History /> },
          { value: "settings", label: "Settings", icon: <Settings /> },
        ]}
      />

      {tab === "overview" && <Overview profile={profile} overview={overview} history={history} levelMap={levelMap} onGoAssess={() => setTab("assessment")} />}
      {tab === "assessment" && <AssessmentTab profile={profile} overview={overview} assessments={assessments} levels={levels} locations={locations} />}
      {tab === "history" && <HistoryTab history={history} />}
      {tab === "settings" && <SettingsForm profile={profile} locations={locations} levels={levels} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Overview */

function Overview({ profile, overview, history, levelMap, onGoAssess }: { profile: Profile; overview: AssessmentOverview; history: PlayerHistory; levelMap: Record<string, LevelDefinition>; onGoAssess: () => void }) {
  return (
    <div className="space-y-5">
      <Card variant="brand" padding="md" className="court-line">
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-overline uppercase text-white/80">Official HITTERS level</div>
            <div className="text-h2">{profile.level ? `${profile.level} · ${levelMap[profile.level]?.label ?? ""}` : "Not assessed yet"}</div>
            <div className="text-caption text-white/75">
              {overview.status === "scheduled" && "Assessment scheduled"}
              {overview.status === "requested" && "Assessment requested"}
              {overview.status === "assessed" && profile.levelUpdatedAt && `Since ${new Date(profile.levelUpdatedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`}
              {overview.status === "none" && "Book a free assessment to get placed"}
            </div>
          </div>
          <Button size="sm" variant="secondary" className="shrink-0 border-transparent bg-white text-blue-700 hover:bg-blue-50" onClick={onGoAssess}>
            {overview.status === "none" ? "Get assessed" : "Details"}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Bookings" value={history.bookings.length} className="p-3" />
        <StatTile label="Matches" value={history.matches.length} className="p-3" />
        <StatTile label="Training" value={history.training.length} className="p-3" />
      </div>

      <section>
        <SectionHeader title="Playing preferences" />
        <Card padding="sm">
          <ul className="divide-y divide-line/10 text-body-sm">
            <li className="flex items-center gap-3 py-2.5">
              <Swords size={16} className="text-blue-300" /> <span className="text-fg-muted">Match type</span>
              <span className="ml-auto font-semibold">{MATCH_TYPES.find((m) => m.value === profile.matchType)?.label}</span>
            </li>
            <li className="flex items-center gap-3 py-2.5">
              <User size={16} className="text-blue-300" /> <span className="text-fg-muted">Side · style</span>
              <span className="ml-auto text-right font-semibold">
                {profile.side.charAt(0) + profile.side.slice(1).toLowerCase()}
                {profile.playStyle ? ` · ${profile.playStyle}` : ""}
              </span>
            </li>
            <li className="flex items-center gap-3 py-2.5">
              <Trophy size={16} className="text-blue-300" /> <span className="text-fg-muted">Experience</span>
              <span className="ml-auto font-semibold">{profile.yearsPlaying != null ? `${profile.yearsPlaying} year${profile.yearsPlaying === 1 ? "" : "s"}` : "—"}</span>
            </li>
            <li className="flex items-start gap-3 py-2.5">
              <Clock size={16} className="mt-0.5 text-blue-300" /> <span className="text-fg-muted">Usually plays</span>
              <span className="ml-auto max-w-[60%] text-right font-semibold">{profile.preferredTimes.length ? profile.preferredTimes.map(preferredTimeLabel).join(", ") : "—"}</span>
            </li>
            <li className="flex items-start gap-3 py-2.5">
              <MapPin size={16} className="mt-0.5 text-blue-300" /> <span className="text-fg-muted">Clubs</span>
              <span className="ml-auto max-w-[60%] text-right font-semibold">
                {[profile.homeLocation, ...profile.preferredLocations.filter((l) => l.id !== profile.homeLocationId)]
                  .filter(Boolean)
                  .map((l) => l!.name.replace("HITTERS ", ""))
                  .join(", ") || "—"}
              </span>
            </li>
          </ul>
        </Card>
      </section>

      {profile.bio && (
        <Card padding="md">
          <div className="text-caption font-bold uppercase tracking-wider text-fg-subtle">About</div>
          <p className="mt-1 text-body-sm text-fg-muted">{profile.bio}</p>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Assessment */

function AssessmentTab({ profile, overview, assessments, levels, locations }: { profile: Profile; overview: AssessmentOverview; assessments: PlayerAssessmentView[]; levels: LevelDefinition[]; locations: { id: string; name: string; status: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const levelMap = Object.fromEntries(levels.map((l) => [l.level, l]));
  const req = overview.openRequest;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const res = await requestAssessmentAction({ locationId: String(f.get("locationId")), note: String(f.get("note") ?? "") || undefined });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      toast({ tone: "success", title: "Assessment requested", description: "The club will schedule a time with you." });
      router.refresh();
    } else toast({ tone: "danger", title: res.message });
  }

  async function withdraw() {
    if (!req) return;
    setBusy(true);
    const res = await cancelAssessmentRequestAction(req.id);
    setBusy(false);
    if (res.ok) toast({ tone: "success", title: "Request withdrawn" });
    else toast({ tone: "danger", title: res.message });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card variant={profile.level ? "brand" : "default"} padding="lg" className={profile.level ? "court-line" : ""}>
        <div className="relative">
          <div className={`text-overline uppercase ${profile.level ? "text-white/80" : "text-blue-300"}`}>Official level</div>
          <div className="mt-2 flex items-center gap-4">
            {profile.level ? <LevelBadge level={profile.level} size="lg" /> : <span className="flex size-11 items-center justify-center rounded-sm bg-line/10 text-h3 font-extrabold text-fg-subtle">?</span>}
            <div>
              <div className="text-h3">{profile.level ? levelMap[profile.level]?.label : "Not assessed"}</div>
              <div className={`text-body-sm ${profile.level ? "text-white/80" : "text-fg-muted"}`}>{profile.level ? levelMap[profile.level]?.description : "An assessor places you after a short on-court session."}</div>
            </div>
          </div>
          {overview.latest && (
            <div className={`mt-4 text-caption ${profile.level ? "text-white/75" : "text-fg-subtle"}`}>
              {KIND_LABEL[overview.latest.kind]} by {overview.latest.assessor.name} at {overview.latest.location.name.replace("HITTERS ", "")} · {new Date(overview.latest.assessedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          )}
        </div>
      </Card>

      {req ? (
        <Alert tone={req.status === "SCHEDULED" ? "success" : "info"} title={req.status === "SCHEDULED" ? "Assessment scheduled" : "Assessment requested"} action={<Button size="sm" variant="secondary" loading={busy} onClick={withdraw}>Withdraw</Button>}>
          {req.status === "SCHEDULED" && req.scheduledAt
            ? `${req.location.name} · ${formatInZone(new Date(req.scheduledAt), req.location.timezone, { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${req.assessor ? ` with ${req.assessor.name}` : ""}.`
            : `${req.location.name} will contact you to book a time. Requested ${new Date(req.createdAt).toLocaleDateString("en", { day: "numeric", month: "short" })}.`}
        </Alert>
      ) : (
        <Button fullWidth size="lg" leftIcon={<ClipboardCheck />} onClick={() => setOpen(true)}>
          {profile.level ? "Request a reassessment" : "Request an assessment"}
        </Button>
      )}

      <section>
        <SectionHeader title="Level guide" />
        <div className="space-y-2">
          {levels.map((l) => (
            <Card key={l.level} padding="sm" className={profile.level === l.level ? "border-blue-400/50 shadow-glow-sm" : ""}>
              <div className="flex items-start gap-3">
                <LevelBadge level={l.level} size="md" />
                <div className="min-w-0">
                  <div className="text-body-sm font-bold">
                    {l.label} <span className="font-normal text-fg-subtle">· rank {l.rank}</span>
                  </div>
                  <div className="text-caption text-fg-muted">{l.description}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Assessment history" eyebrow={`${assessments.length} record${assessments.length === 1 ? "" : "s"}`} />
        {assessments.length === 0 ? (
          <EmptyState compact icon={<Trophy />} title="No assessments yet" description="Your results, assessors and dates will be listed here." />
        ) : (
          <div className="space-y-2.5">
            {assessments.map((a) => (
              <Card key={a.id} padding="sm">
                <div className="flex items-center gap-3">
                  <LevelBadge level={a.level} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-bold">
                      {KIND_LABEL[a.kind]}
                      {a.previousLevel && a.previousLevel !== a.level && <span className="font-normal text-fg-muted"> · from {a.previousLevel}</span>}
                    </div>
                    <div className="text-caption text-fg-muted">
                      {a.location.name.replace("HITTERS ", "")} · {a.assessor.name} · {new Date(a.assessedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                    {a.notes && <div className="mt-1 text-caption text-fg-muted">“{a.notes}”</div>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title={profile.level ? "Request a reassessment" : "Request an assessment"} description="A HITTERS assessor will schedule a short on-court session and record your official level.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Club">{(id) => <Select id={id} name="locationId" required defaultValue={profile.homeLocationId ?? ""} placeholder="Choose a club" options={locations.filter((l) => l.status === "ACTIVE").map((l) => ({ value: l.id, label: l.name }))} />}</Field>
          <Field label="Anything the assessor should know?">{(id) => <Textarea id={id} name="note" maxLength={500} placeholder="Previous racket sports, injuries, availability…" />}</Field>
          <div className="flex justify-end gap-2 pb-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Send request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ History */

function HistoryTab({ history }: { history: PlayerHistory }) {
  const [sub, setSub] = useState<"bookings" | "matches" | "training">("bookings");
  return (
    <div className="space-y-4">
      <Tabs
        variant="pill"
        fullWidth
        value={sub}
        onChange={setSub}
        items={[
          { value: "bookings", label: "Bookings", count: history.bookings.length },
          { value: "matches", label: "Matches", count: history.matches.length },
          { value: "training", label: "Training", count: history.training.length },
        ]}
      />
      {sub === "bookings" &&
        (history.bookings.length ? (
          <div className="space-y-2.5">
            {history.bookings.map((b) => (
              <BookingRow key={b.id} booking={b} href={`/app/bookings/${b.id}`} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={<CalendarCheck />} title="No bookings yet" action={<Button href="/app/book">Book a court</Button>} />
        ))}
      {sub === "matches" &&
        (history.matches.length ? (
          <div className="space-y-2.5">
            {history.matches.map((b) => (
              <Card key={b.id} padding="sm">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
                    <Swords size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-sm font-bold">
                      {b.location.name.replace("HITTERS ", "")} · {b.court.name}
                    </div>
                    <div className="text-caption text-fg-muted">
                      {formatInZone(new Date(b.startsAt), b.location.timezone)} · {b.participants.length} player{b.participants.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Badge size="sm">Played</Badge>
                </div>
              </Card>
            ))}
            <p className="text-center text-caption text-fg-subtle">Scores and results arrive with matchmaking.</p>
          </div>
        ) : (
          <EmptyState compact icon={<Swords />} title="No matches yet" description="Completed sessions you took part in appear here." />
        ))}
      {sub === "training" &&
        (history.training.length ? (
          <div className="space-y-2.5">
            {history.training.map((t) => (
              <Card key={t.id} padding="sm">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-volt/15 text-volt">
                    <Trophy size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-sm font-bold">{t.title}</div>
                    <div className="text-caption text-fg-muted">
                      {TRAINING_KINDS.find((k) => k.value === t.kind)?.label} · {t.location?.name.replace("HITTERS ", "") ?? ""} · {t.trainer?.name ?? ""} · {new Date(t.heldAt).toLocaleDateString("en", { day: "numeric", month: "short" })} · {t.durationMinutes} min
                    </div>
                    {t.notes && <div className="mt-1 text-caption text-fg-muted">{t.notes}</div>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState compact icon={<Trophy />} title="No training recorded" description="Sessions with HITTERS trainers are added by the coach." />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Settings */

function SettingsForm({ profile, locations, levels }: { profile: Profile; locations: { id: string; name: string; status: string }[]; levels: LevelDefinition[] }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<string[]>(profile.preferredTimes);
  const [prefLocs, setPrefLocs] = useState<string[]>(profile.preferredLocations.map((l) => l.id));
  const [pwSaving, setPwSaving] = useState(false);
  const [pwFields, setPwFields] = useState<Record<string, string>>({});

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: Record<string, unknown> = {};
    for (const k of ["name", "phone", "side", "bio", "visibility", "photoUrl", "matchType", "playStyle"]) input[k] = String(f.get(k) ?? "");
    input.homeLocationId = String(f.get("homeLocationId") ?? "") || null;
    input.selfLevel = String(f.get("selfLevel") ?? "") || null;
    input.yearsPlaying = String(f.get("yearsPlaying") ?? "") === "" ? null : Number(f.get("yearsPlaying"));
    input.preferredTimes = times;
    input.preferredLocationIds = prefLocs;
    setSaving(true);
    const res = await updateProfileAction(profile.id, input);
    setSaving(false);
    if (res.ok) {
      setFields({});
      toast({ tone: "success", title: "Profile saved" });
    } else {
      setFields(res.fields ?? {});
      toast({ tone: "danger", title: res.message });
    }
  }

  async function changePw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setPwSaving(true);
    const res = await changePasswordAction(new FormData(formEl));
    setPwSaving(false);
    if (res.ok) {
      setPwFields({});
      formEl.reset();
      toast({ tone: "success", title: "Password updated", description: "Other devices have been signed out." });
    } else {
      setPwFields(res.fields ?? {});
      toast({ tone: "danger", title: res.message });
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={save}>
        <Card padding="md" className="space-y-4">
          <div className="text-h4">Profile</div>
          <Field label="Photo URL" hint="Paste an https image link. Uploads arrive with the storage provider." error={fields.photoUrl}>{(id) => <Input id={id} name="photoUrl" type="url" defaultValue={profile.photoUrl ?? ""} placeholder="https://…" invalid={!!fields.photoUrl} />}</Field>
          <Field label="Name" error={fields.name}>{(id) => <Input id={id} name="name" defaultValue={profile.user.name} invalid={!!fields.name} />}</Field>
          <Field label="Phone" error={fields.phone}>{(id) => <Input id={id} name="phone" type="tel" defaultValue={profile.user.phone ?? ""} placeholder="01x xxxx xxxx" invalid={!!fields.phone} />}</Field>
          <Field label="Bio" error={fields.bio}>{(id) => <Textarea id={id} name="bio" defaultValue={profile.bio ?? ""} maxLength={500} placeholder="Tell other players about your game." invalid={!!fields.bio} />}</Field>
          <Field label="Profile visibility" hint="Who can see your profile and invite you." error={fields.visibility}>
            {(id) => (
              <Select id={id} name="visibility" defaultValue={profile.visibility} options={[{ value: "PUBLIC", label: "Everyone" }, { value: "MEMBERS", label: "HITTERS members" }, { value: "PRIVATE", label: "Only me and staff" }]} />
            )}
          </Field>
        </Card>

        <Card padding="md" className="mt-4 space-y-4">
          <div className="text-h4">Playing preferences</div>
          <Field label="Self-reported level" hint="Only an assessor can set your official level." error={fields.selfLevel}>
            {(id) => <Select id={id} name="selfLevel" defaultValue={profile.selfLevel ?? ""} options={[{ value: "", label: "Not sure" }, ...levels.map((l) => ({ value: l.level, label: `${l.level} · ${l.label}` }))]} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred side" error={fields.side}>{(id) => <Select id={id} name="side" defaultValue={profile.side} options={[{ value: "LEFT", label: "Left" }, { value: "RIGHT", label: "Right" }, { value: "BOTH", label: "Both" }]} />}</Field>
            <Field label="Match type" error={fields.matchType}>{(id) => <Select id={id} name="matchType" defaultValue={profile.matchType} options={MATCH_TYPES.map((m) => ({ value: m.value, label: m.label }))} />}</Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Play style" error={fields.playStyle}>{(id) => <Input id={id} name="playStyle" defaultValue={profile.playStyle ?? ""} placeholder="Net rusher" maxLength={80} />}</Field>
            <Field label="Years playing" error={fields.yearsPlaying}>{(id) => <Input id={id} name="yearsPlaying" type="number" min={0} max={60} defaultValue={profile.yearsPlaying ?? ""} />}</Field>
          </div>
          <div>
            <div className="mb-2 text-body-sm font-semibold text-fg-muted">Usually plays</div>
            <div className="flex flex-wrap gap-2">
              {PREFERRED_TIMES.map((t) => (
                <Chip key={t.key} selected={times.includes(t.key)} onClick={() => setTimes((s) => (s.includes(t.key) ? s.filter((k) => k !== t.key) : [...s, t.key]))}>
                  {t.label}
                </Chip>
              ))}
            </div>
            {fields.preferredTimes && <p className="mt-1 text-caption text-danger">{fields.preferredTimes}</p>}
          </div>
        </Card>

        <Card padding="md" className="mt-4 space-y-4">
          <div className="text-h4">Clubs</div>
          <Field label="Home club" error={fields.homeLocationId}>
            {(id) => <Select id={id} name="homeLocationId" defaultValue={profile.homeLocationId ?? ""} options={[{ value: "", label: "No home club" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />}
          </Field>
          <div>
            <div className="mb-2 text-body-sm font-semibold text-fg-muted">Also plays at</div>
            <div className="flex flex-wrap gap-2">
              {locations.map((l) => (
                <Chip key={l.id} icon={<MapPin />} selected={prefLocs.includes(l.id)} onClick={() => setPrefLocs((s) => (s.includes(l.id) ? s.filter((k) => k !== l.id) : s.length < 5 ? [...s, l.id] : s))}>
                  {l.name.replace("HITTERS ", "")}
                </Chip>
              ))}
            </div>
          </div>
          <Button type="submit" loading={saving} fullWidth>
            Save changes
          </Button>
        </Card>
      </form>

      <form onSubmit={changePw}>
        <Card padding="md" className="space-y-4">
          <div className="text-h4">Change password</div>
          <Field label="Current password" error={pwFields.currentPassword}>{(id) => <Input id={id} name="currentPassword" type="password" autoComplete="current-password" invalid={!!pwFields.currentPassword} />}</Field>
          <Field label="New password" hint="At least 10 characters with a letter and a number." error={pwFields.newPassword}>{(id) => <Input id={id} name="newPassword" type="password" autoComplete="new-password" invalid={!!pwFields.newPassword} />}</Field>
          <Button type="submit" variant="secondary" loading={pwSaving} fullWidth>
            Update password
          </Button>
        </Card>
      </form>

      <form action={logoutAction}>
        <Button type="submit" variant="ghost" fullWidth leftIcon={<LogOut />} className="text-danger hover:bg-danger/10 hover:text-danger">
          Sign out
        </Button>
      </form>
    </div>
  );
}
