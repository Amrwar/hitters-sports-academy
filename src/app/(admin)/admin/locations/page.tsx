import { MapPin, Plus, Star } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CourtBackdrop } from "@/components/patterns/cards";
import { locations, money } from "@/data/mock";

export default function AdminLocations() {
  return (
    <AdminShell title="Locations" breadcrumb={["Operations", "Locations"]} actions={<Button leftIcon={<Plus />}>Add location</Button>}>
      <div className="grid gap-4 md:grid-cols-2">
        {locations.map((l, i) => (
          <Card key={l.slug} padding="none" variant="interactive" href="/admin/courts">
            <CourtBackdrop src={l.image} overlay="soft" className="h-36">
              <div className="flex h-36 flex-col justify-end p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-h4">{l.name}</div>
                    <div className="flex items-center gap-1 text-caption text-blue-100/80">
                      <MapPin size={12} /> {l.address}
                    </div>
                  </div>
                  <Badge tone="success" dot className="bg-white/15 text-white ring-white/20">
                    Open
                  </Badge>
                </div>
              </div>
            </CourtBackdrop>
            <dl className="grid grid-cols-4 divide-x divide-line/10 text-center">
              {[
                ["Courts", `${l.courts}`],
                ["Occupancy", `${[82, 74, 61, 45][i]}%`],
                ["Rating", l.rating.toFixed(1)],
                ["Rev. MTD", money([168, 121, 74, 49][i] * 1000).replace("EGP ", "")],
              ].map(([k, v]) => (
                <div key={k} className="p-3">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">{k}</dt>
                  <dd className="mt-0.5 flex items-center justify-center gap-1 text-body font-bold tabular">
                    {k === "Rating" && <Star size={12} className="fill-volt-600 text-volt-600" />}
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
