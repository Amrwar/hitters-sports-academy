"use client";

import { useState } from "react";
import { LayoutGrid, Plus, Wrench } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { courts as seed, locations, type Court } from "@/data/mock";

export default function AdminCourts() {
  const { toast } = useToast();
  const [loc, setLoc] = useState(locations[0].slug);
  const [courts, setCourts] = useState<Court[]>(seed);
  const [pending, setPending] = useState<Court | null>(null);
  const list = courts.filter((c) => c.locationSlug === loc).length ? courts.filter((c) => c.locationSlug === loc) : courts.map((c) => ({ ...c, locationSlug: loc }));

  function toggle(c: Court) {
    if (c.status === "available") setPending(c);
    else {
      setCourts((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: "available" } : x)));
      toast({ tone: "success", title: `${c.name} back in service` });
    }
  }

  return (
    <AdminShell title="Courts" breadcrumb={["Operations", "Courts"]} actions={<Button leftIcon={<Plus />}>Add court</Button>}>
      <Tabs variant="pill" value={loc} onChange={setLoc} items={locations.map((l) => ({ value: l.slug, label: l.name.replace("HITTERS ", "") }))} className="w-fit max-w-full overflow-x-auto" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => {
          const maintenance = c.status === "maintenance";
          return (
            <Card key={c.id} variant={maintenance ? "outline" : "default"}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex size-11 items-center justify-center rounded-md ${maintenance ? "bg-warning/10 text-warning" : "bg-brand/10 text-brand"}`}>
                    {maintenance ? <Wrench size={20} /> : <LayoutGrid size={20} />}
                  </span>
                  <div>
                    <div className="text-h4">{c.name}</div>
                    <div className="text-caption text-fg-muted">{c.type}</div>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Today", "11 / 17"],
                  ["Occupancy", "76%"],
                  ["Revenue", "6.4k"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-surface-2 p-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">{k}</dt>
                    <dd className="text-body font-bold tabular">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-center justify-between border-t border-line/10 pt-3">
                <Badge tone={maintenance ? "warning" : "success"} dot>
                  {maintenance ? "Closed for bookings" : "Accepting bookings"}
                </Badge>
                <Switch checked={!maintenance} onChange={() => toggle(c)} />
              </div>
            </Card>
          );
        })}
      </div>
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        tone="danger"
        title={`Close ${pending?.name} for maintenance?`}
        description="Upcoming bookings on this court will be moved or refunded and players notified."
        confirmLabel="Close court"
        onConfirm={() => {
          setCourts((cs) => cs.map((x) => (x.id === pending?.id ? { ...x, status: "maintenance" } : x)));
          toast({ tone: "warning", title: `${pending?.name} closed`, description: "3 bookings moved to Court 5." });
          setPending(null);
        }}
      />
    </AdminShell>
  );
}
