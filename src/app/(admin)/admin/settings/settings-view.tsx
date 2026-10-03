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

type Matchmaking = { allowAdjacentLevels: boolean; requestExpiryHours: number; maxOpenRequests: number };

export function SettingsView({ matchmaking, canConfigure }: { matchmaking: Matchmaking; canConfigure: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [mm, setMm] = useState(matchmaking);
  const [busy, setBusy] = useState(false);
  const [peak, setPeak] = useState(true);

  async function save() {
    setBusy(true);
    const res = await updateMatchmakingConfigAction(mm);
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: "Matchmaking rules saved" });
      router.refresh();
    } else toast({ tone: "danger", title: "Could not save", description: res.message });
  }

  return (
    <AdminShell title="Settings" breadcrumb={["Settings"]} actions={canConfigure ? <Button onClick={save} loading={busy}>Save changes</Button> : undefined}>
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
                <Alert tone="info" title="Read only">
                  Only the Super Admin and Academy Owner change matchmaking rules.
                </Alert>
              )}
            </div>
          </Card>
          <Alert tone="info" title="How matching ranks games">
            Exact level 40 · any-level game 25 · adjacent 15 · home club 30 · preferred club 25 · selected club 20 · inside the time window 20 · preferred time 10 · completes the lineup 8. Ties break on start time, then game code.
          </Alert>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Academy" description="Organisation-wide details (sample until the growth phase)" />
            <div className="space-y-4">
              <Field label="Academy name">{(id) => <Input id={id} defaultValue="HITTERS Sports Academy" />}</Field>
              <Field label="Support email">{(id) => <Input id={id} type="email" defaultValue="hello@hitters.academy" />}</Field>
              <Field label="Default timezone">{(id) => <Select id={id} defaultValue="Africa/Cairo" options={[{ value: "Africa/Cairo", label: "Africa/Cairo (GMT+2)" }, { value: "Europe/Madrid", label: "Europe/Madrid" }]} />}</Field>
              <Field label="Cancellation policy" hint="Shown to players before they pay.">
                {(id) => <Textarea id={id} defaultValue="Free cancellation up to 12 hours before the booking. Later cancellations are charged in full." />}
              </Field>
              <Switch label="Peak pricing" description="Managed per location under Locations › Pricing" checked={peak} onChange={setPeak} />
            </div>
          </Card>
          <Alert tone="info" title="Payments not connected">
            Connect a payment provider to enable online checkout and refunds.
          </Alert>
        </div>
      </div>
    </AdminShell>
  );
}
