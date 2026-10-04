"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { Plus } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { TRAINER_LANGUAGES, TRAINER_SPECIALTIES } from "@/lib/catalog";
import type { TrainerView } from "@/server/services/trainers";
import { createTrainerProfileAction, updateTrainerProfileAction } from "@/server/actions/academy";

type Props = {
  trainers: TrainerView[];
  candidates: { id: string; name: string; email: string; locationIds: string[] }[];
  locations: { id: string; name: string }[];
  levels: { level: PlayerLevel; label: string }[];
  canManage: boolean;
  viewerId: string;
};

export function TrainersAdmin({ trainers, candidates, locations, levels, canManage, viewerId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<TrainerView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function readForm(f: FormData) {
    return {
      title: String(f.get("title") ?? ""),
      bio: String(f.get("bio") ?? ""),
      photoUrl: String(f.get("photoUrl") ?? ""),
      hourlyRateCents: Math.round(Number(f.get("rate") || 0) * 100),
      durationsMinutes: String(f.get("durations") ?? "60").split(",").map((x) => Number(x.trim())).filter(Boolean),
      levels: levels.map((l) => l.level).filter((l) => f.get(`level-${l}`)),
      specialties: TRAINER_SPECIALTIES.filter((s) => f.get(`spec-${s}`)),
      languages: TRAINER_LANGUAGES.filter((s) => f.get(`lang-${s}`)),
      qualifications: String(f.get("qualifications") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      yearsExperience: f.get("years") ? Number(f.get("years")) : null,
      autoConfirm: !!f.get("autoConfirm"),
      status: String(f.get("status") ?? "ACTIVE"),
      locationIds: locations.map((l) => l.id).filter((id) => f.get(`loc-${id}`)),
    };
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = readForm(f);
    setBusy(true);
    setError(null);
    const res = edit ? await updateTrainerProfileAction(edit.id, data) : await createTrainerProfileAction({ ...data, userId: String(f.get("userId") ?? "") });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: edit ? "Trainer updated" : "Trainer profile created" });
      setCreate(false);
      setEdit(null);
      router.refresh();
    } else setError(res.message + (res.fields ? ` (${Object.values(res.fields).join(", ")})` : ""));
  }

  const Form = ({ t }: { t: TrainerView | null }) => (
    <form onSubmit={submit} className="space-y-4 pb-2">
      {error && <Alert tone="danger">{error}</Alert>}
      {!t && (
        <Field label="Staff member" hint="Grant the Trainer role on the Staff page first.">
          {(id) => <Select id={id} name="userId" required placeholder="Choose a trainer" options={candidates.map((c) => ({ value: c.id, label: `${c.name} · ${c.email}` }))} />}
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">{(id) => <Input id={id} name="title" required defaultValue={t?.title ?? ""} placeholder="Head coach" />}</Field>
        <Field label="Hourly rate (EGP)">{(id) => <Input id={id} name="rate" type="number" min={0} step={50} required defaultValue={t ? t.hourlyRateCents / 100 : 800} />}</Field>
        <Field label="Lesson lengths (minutes, comma-separated)">{(id) => <Input id={id} name="durations" defaultValue={t?.durationsMinutes.join(", ") ?? "60, 90"} />}</Field>
        <Field label="Years of experience">{(id) => <Input id={id} name="years" type="number" min={0} max={60} defaultValue={t?.yearsExperience ?? ""} />}</Field>
      </div>
      <Field label="Biography">{(id) => <Textarea id={id} name="bio" maxLength={2000} defaultValue={t?.bio ?? ""} />}</Field>
      <Field label="Photo URL" hint="An https image link. Leave empty to show their initials.">
        {(id) => (
          <div className="flex items-center gap-3">
            <Avatar name={t?.user.name ?? "Coach"} src={t?.photoUrl} size="md" />
            <Input id={id} name="photoUrl" type="url" maxLength={500} defaultValue={t?.photoUrl ?? ""} placeholder="https://..." className="flex-1" />
          </div>
        )}
      </Field>
      <Field label="Qualifications (comma separated)">{(id) => <Input id={id} name="qualifications" defaultValue={t?.qualifications.join(", ") ?? ""} placeholder="FIP Level 2, PTR Certified" />}</Field>
      <Field label="Clubs">
        {() => (
          <div className="flex flex-wrap gap-3">
            {locations.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" name={`loc-${l.id}`} className="size-4 accent-blue-500" defaultChecked={t ? t.locations.some((x) => x.location.id === l.id) : locations.length === 1} /> {l.name.replace("HITTERS ", "")}
              </label>
            ))}
          </div>
        )}
      </Field>
      <Field label="Eligible levels" hint="None selected = every level.">
        {() => (
          <div className="flex flex-wrap gap-3">
            {levels.map((l) => (
              <label key={l.level} className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" name={`level-${l.level}`} className="size-4 accent-blue-500" defaultChecked={t?.levels.includes(l.level)} /> {l.level} · {l.label}
              </label>
            ))}
          </div>
        )}
      </Field>
      <Field label="Specialties">
        {() => (
          <div className="flex flex-wrap gap-3">
            {TRAINER_SPECIALTIES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" name={`spec-${s}`} className="size-4 accent-blue-500" defaultChecked={t?.specialties.includes(s)} /> {s}
              </label>
            ))}
          </div>
        )}
      </Field>
      <Field label="Languages">
        {() => (
          <div className="flex flex-wrap gap-3">
            {TRAINER_LANGUAGES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" name={`lang-${s}`} className="size-4 accent-blue-500" defaultChecked={t?.languages.includes(s)} /> {s}
              </label>
            ))}
          </div>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" name="autoConfirm" className="size-4 accent-blue-500" defaultChecked={t?.autoConfirm ?? true} /> Confirm lessons automatically
        </label>
        {t && <Field label="Status">{(id) => <Select id={id} name="status" defaultValue={t.status} options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive (hidden)" }]} />}</Field>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => { setCreate(false); setEdit(null); }}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {t ? "Save" : "Create profile"}
        </Button>
      </div>
    </form>
  );

  return (
    <AdminShell title="Trainers" breadcrumb={["People", "Trainers"]} actions={canManage ? <Button leftIcon={<Plus />} onClick={() => setCreate(true)} disabled={candidates.length === 0} title={candidates.length ? undefined : "Grant the Trainer role on the Staff page first"}>New trainer profile</Button> : undefined}>
      {trainers.length === 0 ? (
        <EmptyState title="No trainer profiles" description="Grant a staff member the Trainer role, then create their coaching profile here." action={canManage ? <Button leftIcon={<Plus />} onClick={() => setCreate(true)} disabled={candidates.length === 0}>New trainer profile</Button> : undefined} />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Trainer</TH>
                <TH>Clubs</TH>
                <TH>Levels</TH>
                <TH>Specialties</TH>
                <TH className="text-right">Rate</TH>
                <TH className="text-right">Lessons</TH>
                <TH>Booking</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {trainers.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={t.user.name} src={t.photoUrl} size="sm" />
                      <div>
                        <div className="font-semibold">{t.user.name}</div>
                        <div className="text-caption text-fg-subtle">{t.title}</div>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-fg-muted">{t.locations.map((l) => l.location.name.replace("HITTERS ", "")).join(", ")}</TD>
                  <TD>
                    <div className="flex gap-1">{t.levels.length ? t.levels.map((l) => <LevelBadge key={l} level={l} size="sm" />) : <Badge size="sm">All</Badge>}</div>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {t.specialties.slice(0, 3).map((s) => (
                        <Badge key={s} size="sm">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD className="text-right tabular">{money(t.hourlyRateCents, t.currency)}/h</TD>
                  <TD className="text-right tabular">{t._count.lessons}</TD>
                  <TD>
                    <Badge size="sm" tone={t.autoConfirm ? "success" : "warning"}>
                      {t.autoConfirm ? "Instant" : "On request"}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge size="sm" tone={t.status === "ACTIVE" ? "success" : "neutral"} dot>
                      {t.status === "ACTIVE" ? "Active" : "Inactive"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" href={`/app/trainers/${t.id}`}>
                        View
                      </Button>
                      {(canManage || t.userId === viewerId) && (
                        <Button size="sm" variant="secondary" onClick={() => setEdit(t)}>
                          Edit
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
      <Modal open={create} onClose={() => setCreate(false)} title="New trainer profile" description="Public coaching profile for a staff member who holds the Trainer role." size="lg">
        <Form t={null} />
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Edit ${edit.user.name}` : ""} size="lg">
        {edit && <Form t={edit} />}
      </Modal>
    </AdminShell>
  );
}
