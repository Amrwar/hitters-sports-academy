"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Plus, Wrench } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { CourtView } from "@/server/services/courts";
import { createCourtAction, setCourtStatusAction } from "@/server/actions/admin";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

type Props = { locations: { id: string; name: string }[]; selectedId: string | null; courts: CourtView[]; canManage: boolean };

export function CourtsAdmin({ locations, selectedId, courts, canManage }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<CourtView | null>(null);
  const [add, setAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function setStatus(court: CourtView, status: "ACTIVE" | "MAINTENANCE") {
    setBusy(true);
    const res = await setCourtStatusAction(court.id, status);
    setBusy(false);
    if (res.ok) toast({ tone: status === "ACTIVE" ? "success" : "warning", title: `${court.name} ${status === "ACTIVE" ? "back in service" : "closed for maintenance"}` });
    else toast({ tone: "danger", title: res.message });
    router.refresh();
  }

  async function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) return;
    const form = new FormData(e.currentTarget);
    form.set("locationId", selectedId);
    setBusy(true);
    const res = await createCourtAction(form);
    setBusy(false);
    if (res.ok) {
      setAdd(false);
      setFields({});
      toast({ tone: "success", title: `${res.data.name} added` });
      router.refresh();
    } else {
      setFields(res.fields ?? {});
      toast({ tone: "danger", title: res.message });
    }
  }

  return (
    <AdminShell title="Courts" breadcrumb={["Operations", "Courts"]} actions={canManage && selectedId ? <Button leftIcon={<Plus />} onClick={() => setAdd(true)}>Add court</Button> : undefined}>
      {locations.length === 0 ? (
        <EmptyState icon={<LayoutGrid />} title="No locations in your scope" />
      ) : (
        <>
          <Tabs variant="pill" value={selectedId ?? ""} onChange={(id) => router.push(`/admin/courts?location=${id}`)} items={locations.map((l) => ({ value: l.id, label: l.name.replace("HITTERS ", "") }))} className="w-fit max-w-full overflow-x-auto" />
          {courts.length === 0 ? (
            <EmptyState className="mt-5" icon={<LayoutGrid />} title="No courts yet" description="Add the first court for this location." action={canManage ? <Button leftIcon={<Plus />} onClick={() => setAdd(true)}>Add court</Button> : undefined} />
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {courts.map((c) => {
                const maintenance = c.status === "MAINTENANCE";
                const today = c.availability.find((a) => a.dayOfWeek === new Date().getDay());
                return (
                  <Card key={c.id} variant={maintenance ? "outline" : "default"}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`flex size-11 items-center justify-center rounded-md ${maintenance ? "bg-warning/10 text-warning" : "bg-brand/10 text-brand"}`}>{maintenance ? <Wrench size={20} /> : <LayoutGrid size={20} />}</span>
                        <div>
                          <div className="text-h4">{c.name}</div>
                          <div className="text-caption capitalize text-fg-muted">{c.type.toLowerCase()}</div>
                        </div>
                      </div>
                      <StatusBadge status={c.status === "ACTIVE" ? "available" : c.status === "MAINTENANCE" ? "maintenance" : "paused"} />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {[
                        ["Today", today ? `${hhmm(today.opensAt)}–${hhmm(today.closesAt)}` : "Closed"],
                        ["Rate", today ? `EGP ${Math.round(today.priceCents / 100)}` : "—"],
                        ["Peak", today?.peakPriceCents ? `EGP ${Math.round(today.peakPriceCents / 100)}` : "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-md bg-surface-2 p-2">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">{k}</dt>
                          <dd className="text-body-sm font-bold tabular">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {DAY.map((d, i) => (
                        <Badge key={d} size="sm" tone={c.availability.some((a) => a.dayOfWeek === i) ? "brand" : "neutral"}>
                          {d}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-line/10 pt-3">
                      <Badge tone={maintenance ? "warning" : "success"} dot>
                        {maintenance ? "Closed for bookings" : "Accepting bookings"}
                      </Badge>
                      {canManage && c.status !== "INACTIVE" && <Switch checked={!maintenance} disabled={busy} onChange={() => (maintenance ? setStatus(c, "ACTIVE") : setPending(c))} />}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        tone="danger"
        title={`Close ${pending?.name ?? ""} for maintenance?`}
        description="The court stops accepting bookings until it is reopened."
        confirmLabel="Close court"
        loading={busy}
        onConfirm={async () => {
          if (pending) await setStatus(pending, "MAINTENANCE");
          setPending(null);
        }}
      />

      <Modal open={add} onClose={() => setAdd(false)} title="Add court" description="Availability can be configured after the court exists.">
        <form onSubmit={submitAdd} className="space-y-4">
          <Field label="Name" error={fields.name}>{(id) => <Input id={id} name="name" placeholder="Court 7" required invalid={!!fields.name} />}</Field>
          <Field label="Type" error={fields.type}>
            {(id) => (
              <Select
                id={id}
                name="type"
                defaultValue="INDOOR"
                options={[
                  { value: "INDOOR", label: "Indoor" },
                  { value: "OUTDOOR", label: "Outdoor" },
                  { value: "PANORAMIC", label: "Panoramic" },
                ]}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2 pb-2">
            <Button type="button" variant="ghost" onClick={() => setAdd(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Add court
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
