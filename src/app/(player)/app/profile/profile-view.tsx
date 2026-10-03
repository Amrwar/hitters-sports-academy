"use client";

import { useState, type FormEvent } from "react";
import { CalendarCheck, History, LogOut, Settings, ShieldCheck, Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { StatTile } from "@/components/ui/misc";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { BookingRow } from "@/components/patterns/booking-row";
import type { BookingView } from "@/server/services/bookings";
import { LEVEL_LABEL } from "@/lib/tokens";
import type { ProfileView as Profile } from "@/server/services/profiles";
import { updateProfileAction } from "@/server/actions/profile";
import { changePasswordAction, logoutAction } from "@/server/actions/auth";

type Tab = "bookings" | "history" | "settings";

export function ProfileView({ profile, locations, isStaff, upcoming }: { profile: Profile; locations: { id: string; name: string }[]; isStaff: boolean; upcoming: BookingView[] }) {
  const [tab, setTab] = useState<Tab>("bookings");
  const memberSince = new Date(profile.user.createdAt).toLocaleDateString("en", { month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={profile.user.name} size="xl" ring />
          <div>
            <h1 className="text-h2">{profile.user.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              {profile.level ? <LevelBadge level={profile.level} size="sm" withLabel /> : <Badge>Not yet assessed</Badge>}
            </div>
            <div className="mt-1 text-caption text-fg-muted">
              {profile.side.charAt(0) + profile.side.slice(1).toLowerCase()} side · Member since {memberSince}
            </div>
          </div>
        </div>
        {isStaff && (
          <Button size="sm" variant="secondary" href="/admin" leftIcon={<ShieldCheck />}>
            Admin
          </Button>
        )}
      </div>

      <Card variant="brand" padding="md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-overline uppercase text-white/80">Home club</div>
            <div className="text-h3">{profile.homeLocation?.name ?? "Choose your club"}</div>
            <div className="text-caption text-white/75">{profile.user.emailVerifiedAt ? "Email verified" : "Email not verified"}</div>
          </div>
          <Badge className="bg-white/15 text-white" dot tone={profile.user.emailVerifiedAt ? "success" : "warning"}>
            {profile.user.emailVerifiedAt ? "Active" : "Pending"}
          </Badge>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Level" value={profile.level ?? "—"} className="p-3" />
        <StatTile label="Assessments" value={profile.assessments.length} className="p-3" />
        <StatTile label="Visibility" value={<span className="text-h4 capitalize">{profile.visibility.toLowerCase()}</span>} className="p-3" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        fullWidth
        items={[
          { value: "bookings", label: "Bookings", icon: <CalendarCheck /> },
          { value: "history", label: "Levels", icon: <History /> },
          { value: "settings", label: "Settings", icon: <Settings /> },
        ]}
      />

      {tab === "bookings" && (
        <div className="space-y-5">
          <section>
            <SectionHeader title="Upcoming" action={<Button variant="link" size="sm" href="/app/bookings">History</Button>} />
            {upcoming.length === 0 ? (
              <EmptyState compact icon={<CalendarCheck />} title="No upcoming bookings" action={<Button href="/app/book">Book a court</Button>} />
            ) : (
              <div className="space-y-2.5">
                {upcoming.map((b) => (
                  <BookingRow key={b.id} booking={b} href={"/app/bookings/" + b.id} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-2.5">
          {profile.assessments.length === 0 && <EmptyState compact icon={<Trophy />} title="No assessments yet" description="Book a free assessment with a coach to get your A/B/C/D level." action={<Button href="/app/trainers">Find a coach</Button>} />}
          {profile.assessments.map((a) => (
            <Card key={a.id} padding="sm">
              <div className="flex items-center gap-3">
                <LevelBadge level={a.level} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-bold">
                    {LEVEL_LABEL[a.level]}
                    {a.previousLevel && <span className="font-normal text-fg-muted"> · from {a.previousLevel}</span>}
                  </div>
                  <div className="text-caption text-fg-muted">
                    {a.location.name} · {a.assessor.name} · {new Date(a.assessedAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "settings" && <SettingsForm profile={profile} locations={locations} />}
    </div>
  );
}

function SettingsForm({ profile, locations }: { profile: Profile; locations: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pwSaving, setPwSaving] = useState(false);
  const [pwFields, setPwFields] = useState<Record<string, string>>({});

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const res = await updateProfileAction(profile.id, new FormData(e.currentTarget));
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
          <Field label="Name" error={fields.name}>{(id) => <Input id={id} name="name" defaultValue={profile.user.name} invalid={!!fields.name} />}</Field>
          <Field label="Phone" error={fields.phone}>{(id) => <Input id={id} name="phone" type="tel" defaultValue={profile.user.phone ?? ""} placeholder="01x xxxx xxxx" invalid={!!fields.phone} />}</Field>
          <Field label="Preferred side" error={fields.side}>
            {(id) => (
              <Select
                id={id}
                name="side"
                defaultValue={profile.side}
                options={[
                  { value: "LEFT", label: "Left" },
                  { value: "RIGHT", label: "Right" },
                  { value: "BOTH", label: "Both" },
                ]}
              />
            )}
          </Field>
          <Field label="Home club" error={fields.homeLocationId}>
            {(id) => <Select id={id} name="homeLocationId" defaultValue={profile.homeLocationId ?? ""} options={[{ value: "", label: "No home club" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />}
          </Field>
          <Field label="Profile visibility" hint="Who can see your profile and invite you." error={fields.visibility}>
            {(id) => (
              <Select
                id={id}
                name="visibility"
                defaultValue={profile.visibility}
                options={[
                  { value: "PUBLIC", label: "Everyone" },
                  { value: "MEMBERS", label: "HITTERS members" },
                  { value: "PRIVATE", label: "Only me and staff" },
                ]}
              />
            )}
          </Field>
          <Field label="Bio" error={fields.bio}>{(id) => <Textarea id={id} name="bio" defaultValue={profile.bio ?? ""} maxLength={500} placeholder="Tell other players about your game." invalid={!!fields.bio} />}</Field>
          <Button type="submit" loading={saving} fullWidth>
            Save changes
          </Button>
        </Card>
      </form>

      <form onSubmit={changePw}>
        <Card padding="md" className="space-y-4">
          <div className="text-h4">Change password</div>
          <Field label="Current password" error={pwFields.currentPassword}>{(id) => <Input id={id} name="currentPassword" type="password" autoComplete="current-password" invalid={!!pwFields.currentPassword} />}</Field>
          <Field label="New password" hint="At least 10 characters with a letter and a number." error={pwFields.newPassword}>
            {(id) => <Input id={id} name="newPassword" type="password" autoComplete="new-password" invalid={!!pwFields.newPassword} />}
          </Field>
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
