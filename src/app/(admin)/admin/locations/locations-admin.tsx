"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { CourtBackdrop } from "@/components/patterns/cards";
import type { LocationView } from "@/server/services/locations";
import { createLocationAction } from "@/server/actions/admin";

const PHOTOS = ["/brand/court-net.jpg", "/brand/court-rackets.jpg", "/brand/court-line.jpg", "/brand/court-handles.jpg"];

export function LocationsAdmin({ locations, canCreate }: { locations: LocationView[]; canCreate: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await createLocationAction(new FormData(e.currentTarget));
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setFields({});
      toast({ tone: "success", title: `${res.data.name} created` });
      router.refresh();
    } else {
      setFields(res.fields ?? {});
      toast({ tone: "danger", title: res.message });
    }
  }

  return (
    <AdminShell title="Locations" breadcrumb={["Operations", "Locations"]} actions={canCreate ? <Button leftIcon={<Plus />} onClick={() => setOpen(true)}>Add location</Button> : undefined}>
      {locations.length === 0 ? (
        <EmptyState icon={<MapPin />} title="No locations in your scope" description="Ask an academy owner to add you to a location." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {locations.map((l, i) => (
            <Card key={l.id} padding="none" variant="interactive" href={`/admin/courts?location=${l.id}`}>
              <CourtBackdrop src={PHOTOS[i % PHOTOS.length]} overlay="soft" className="h-36">
                <div className="flex h-36 flex-col justify-end p-4 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-h4">{l.name}</div>
                      <div className="flex items-center gap-1 text-caption text-blue-100/80">
                        <MapPin size={12} /> {l.address}
                      </div>
                    </div>
                    <StatusBadge status={l.status === "ACTIVE" ? "active" : l.status === "COMING_SOON" ? "pending" : "paused"} />
                  </div>
                </div>
              </CourtBackdrop>
              <dl className="grid grid-cols-4 divide-x divide-line/10 text-center">
                {[
                  ["Courts", `${l._count.courts}`],
                  ["Staff", `${l._count.memberships}`],
                  ["Home players", `${l._count.homePlayers}`],
                  ["Timezone", l.timezone.split("/")[1] ?? l.timezone],
                ].map(([k, v]) => (
                  <div key={k} className="p-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">{k}</dt>
                    <dd className="mt-0.5 truncate text-body font-bold tabular">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add location" description="Creates a new HITTERS club. Courts are added afterwards." size="lg">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={fields.name}>{(id) => <Input id={id} name="name" placeholder="HITTERS Heliopolis" required invalid={!!fields.name} />}</Field>
          <Field label="Slug" hint="Used in links" error={fields.slug}>{(id) => <Input id={id} name="slug" placeholder="heliopolis" required invalid={!!fields.slug} />}</Field>
          <Field label="City" error={fields.city}>{(id) => <Input id={id} name="city" placeholder="Cairo" required invalid={!!fields.city} />}</Field>
          <Field label="Area" error={fields.area}>{(id) => <Input id={id} name="area" placeholder="Heliopolis" required invalid={!!fields.area} />}</Field>
          <Field label="Address" className="sm:col-span-2" error={fields.address}>{(id) => <Input id={id} name="address" placeholder="Street, district" required invalid={!!fields.address} />}</Field>
          <Field label="Phone" error={fields.phone}>{(id) => <Input id={id} name="phone" type="tel" placeholder="+20 2 …" invalid={!!fields.phone} />}</Field>
          <Field label="Status" error={fields.status}>
            {(id) => (
              <Select
                id={id}
                name="status"
                defaultValue="COMING_SOON"
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "COMING_SOON", label: "Coming soon" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
              />
            )}
          </Field>
          <input type="hidden" name="timezone" value="Africa/Cairo" />
          <div className="flex justify-end gap-2 pb-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create location
            </Button>
          </div>
        </form>
      </Modal>
      <Badge className="mt-6">Occupancy and revenue appear once booking launches</Badge>
    </AdminShell>
  );
}
