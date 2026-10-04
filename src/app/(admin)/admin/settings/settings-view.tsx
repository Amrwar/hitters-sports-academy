"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { updateMatchmakingConfigAction } from "@/server/actions/matchmaking";
import { updateAcademySettingsAction } from "@/server/actions/admin";
import type { AcademyProfile } from "@/server/services/academy-settings";

type Matchmaking = { allowAdjacentLevels: boolean; requestExpiryHours: number; maxOpenRequests: number };

const TIMEZONES = ["Africa/Cairo", "Europe/Madrid", "Europe/London", "Asia/Dubai", "Asia/Riyadh"];

export function SettingsView({
  matchmaking,
  academy,
  canConfigure,
  canConfigureAcademy,
}: {
  matchmaking: Matchmaking;
  academy: AcademyProfile;
  canConfigure: boolean;
  canConfigureAcademy: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [mm, setMm] = useState(matchmaking);
  const [ac, setAc] = useState(academy);
  const [busy, setBusy] = useState(false);

  const mmDirty = JSON.stringify(mm) !== JSON.stringify(matchmaking);
  const acDirty = JSON.stringify(ac) !== JSON.stringify(academy);
  const dirty = (canConfigure && mmDirty) || (canConfigureAcademy && acDirty);

  /** One Save for the page. Each section is only sent when it actually changed. */
  async function save() {
    setBusy(true);
    const results: { label: string; ok: boolean; message?: string }[] = [];
    if (canConfigure && mmDirty) {
      const res = await updateMatchmakingConfigAction(mm);
      results.push({ label: "Matchmaking rules", ok: res.ok, message: res.ok ? undefined : res.message });
    }
    if (canConfigureAcademy && acDirty) {
      const res = await updateAcademySettingsAction({ ...ac, tagline: ac.tagline ?? "", supportPhone: ac.supportPhone ?? "" });
      results.push({ label: "Academy details", ok: res.ok, message: res.ok ? undefined : res.message });
    }
    setBusy(false);
    const failed = results.find((r) => !r.ok);
    if (failed) toast({ tone: "danger", title: `Could not save ${failed.label.toLowerCase()}`, description: failed.message });
    else if (results.length) {
      toast({ tone: "success", title: results.length === 1 ? `${results[0].label} saved` : "Settings saved" });
      router.refresh();
    }
  }

  return (
    <AdminShell
      title="Settings"
      breadcrumb={["Settings"]}
      actions={
        canConfigure || canConfigureAcademy ? (
          <Button onClick={save} loading={busy} disabled={!dirty}>
            {dirty ? "Save changes" : "Saved"}
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Matchmaking rules" description="Academy-wide. The engine is rules-based and deterministic: every recommendation explains itself." />
            <div className="space-y-5">
              <Switch
                label="Allow adjacent levels"
                description="When on, a game whose organizer picked 'Adjacent levels welcome' also matches one rank above or below. Off = exact official level only."
                checked={mm.allowAdjacentLevels}
                onChange={(v) => setMm({ ...mm, allowAdjacentLevels: v })}
                disabled={!canConfigure}
              />
              <Field label="Join requests expire after (hours)" hint="Requests always expire when the game starts.">
                {(id) => <Input id={id} type="number" min={1} max={336} value={mm.requestExpiryHours} onChange={(e) => setMm({ ...mm, requestExpiryHours: Number(e.target.value) || 1 })} disabled={!canConfigure} />}
              </Field>
              <Field label="Open requests per player" hint="Pending or waitlisted requests a player may hold at once.">
                {(id) => <Input id={id} type="number" min={1} max={20} value={mm.maxOpenRequests} onChange={(e) => setMm({ ...mm, maxOpenRequests: Number(e.target.value) || 1 })} disabled={!canConfigure} />}
              </Field>
              {!canConfigure && (
                <Alert tone="info" title="Read-only">
                  Only the Super Admin and Academy Owner change matchmaking rules.
                </Alert>
              )}
            </div>
          </Card>
          <Alert tone="info" title="How matching ranks games">
            Games are ranked by level fit first, then by how close the club is to the player's home and preferred clubs, then by how well the time suits them. A game that completes a lineup edges ahead of one that does not. Two games that score the same are ordered by start time.
          </Alert>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Academy" description="Your name, how players reach you, and the policy they agree to." />
            <div className="space-y-4">
              <Field label="Academy name" required>
                {(id) => <Input id={id} value={ac.name} maxLength={120} onChange={(e) => setAc({ ...ac, name: e.target.value })} disabled={!canConfigureAcademy} />}
              </Field>
              <Field label="Tagline" hint="One line, used under the name wherever the academy is introduced.">
                {(id, describedBy) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    value={ac.tagline ?? ""}
                    maxLength={200}
                    placeholder="Premium padel across Egypt"
                    onChange={(e) => setAc({ ...ac, tagline: e.target.value })}
                    disabled={!canConfigureAcademy}
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Support email" required>
                  {(id) => <Input id={id} type="email" value={ac.supportEmail} maxLength={160} onChange={(e) => setAc({ ...ac, supportEmail: e.target.value })} disabled={!canConfigureAcademy} />}
                </Field>
                <Field label="Support phone">
                  {(id) => (
                    <Input
                      id={id}
                      type="tel"
                      value={ac.supportPhone ?? ""}
                      maxLength={40}
                      placeholder="+20 100 000 0000"
                      onChange={(e) => setAc({ ...ac, supportPhone: e.target.value })}
                      disabled={!canConfigureAcademy}
                    />
                  )}
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Default timezone" hint="Used for new clubs and anything not tied to one.">
                  {(id, describedBy) => (
                    <Select
                      id={id}
                      aria-describedby={describedBy}
                      value={ac.defaultTimezone}
                      onChange={(e) => setAc({ ...ac, defaultTimezone: e.target.value })}
                      options={TIMEZONES.map((tz) => ({ value: tz, label: tz.replace("_", " ") }))}
                      disabled={!canConfigureAcademy}
                    />
                  )}
                </Field>
                <Field label="Currency">
                  {(id) => (
                    <Select
                      id={id}
                      value={ac.currency}
                      onChange={(e) => setAc({ ...ac, currency: e.target.value })}
                      options={[
                        { value: "EGP", label: "EGP · Egyptian pound" },
                        { value: "AED", label: "AED · UAE dirham" },
                        { value: "SAR", label: "SAR · Saudi riyal" },
                        { value: "EUR", label: "EUR · Euro" },
                      ]}
                      disabled={!canConfigureAcademy}
                    />
                  )}
                </Field>
              </div>
              <Field label="Cancellation policy" hint="Shown to players before they confirm a booking." required>
                {(id, describedBy) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    rows={3}
                    value={ac.cancellationPolicy}
                    maxLength={600}
                    onChange={(e) => setAc({ ...ac, cancellationPolicy: e.target.value })}
                    disabled={!canConfigureAcademy}
                  />
                )}
              </Field>
              {!canConfigureAcademy && (
                <Alert tone="info" title="Read only">
                  Only the Super Admin and Academy Owner change academy details.
                </Alert>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Pricing and payments" description="Where the money settings live" />
            <ul className="space-y-3 text-body-sm text-fg-muted">
              <li className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-400" />
                Court rates, peak hours, weekend and member adjustments are set per club under Locations, then Pricing, because every venue prices differently.
              </li>
              <li className="flex gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-400" />
                Lesson, program and package prices are set on each of those records.
              </li>
            </ul>
            <Button variant="secondary" size="sm" href="/admin/locations" className="mt-4">
              Open pricing
            </Button>
          </Card>
          <Alert tone="info" title="Payments are recorded, not collected">
            Every booking, lesson and package already carries a payment record marked pay at venue. Connecting a provider turns those into online checkout and refunds without changing the rest of the system.
          </Alert>
        </div>
      </div>
    </AdminShell>
  );
}
