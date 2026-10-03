"use client";

import { useState } from "react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";

export default function AdminSettings() {
  const { toast } = useToast();
  const [autoApprove, setAutoApprove] = useState(false);
  const [peak, setPeak] = useState(true);

  return (
    <AdminShell title="Settings" breadcrumb={["Settings"]} actions={<Button onClick={() => toast({ tone: "success", title: "Settings saved" })}>Save changes</Button>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Academy" description="Organisation-wide details" />
          <div className="space-y-4">
            <Field label="Academy name">{(id) => <Input id={id} defaultValue="HITTERS Sports Academy" />}</Field>
            <Field label="Support email">{(id) => <Input id={id} type="email" defaultValue="hello@hitters.academy" />}</Field>
            <Field label="Default timezone">{(id) => <Select id={id} defaultValue="Africa/Cairo" options={[{ value: "Africa/Cairo", label: "Africa/Cairo (GMT+2)" }, { value: "Europe/Madrid", label: "Europe/Madrid" }]} />}</Field>
            <Field label="Cancellation policy" hint="Shown to players before they pay.">
              {(id) => <Textarea id={id} defaultValue="Free cancellation up to 12 hours before the booking. Later cancellations are charged in full." />}
            </Field>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Booking rules" />
            <div className="space-y-5">
              <Switch label="Peak pricing" description="+25% between 18:00 and 21:00" checked={peak} onChange={setPeak} />
              <Switch label="Auto-approve join requests" description="Skip organiser approval when levels match exactly" checked={autoApprove} onChange={setAutoApprove} />
              <Field label="Booking window (days ahead)">{(id) => <Input id={id} type="number" defaultValue={14} />}</Field>
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
