import { Clock, LayoutGrid, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CourtBackdrop } from "@/components/patterns/cards";
import { facilityLabel } from "@/lib/catalog";
import { minutesToHHMM } from "@/lib/time";
import type { LocationCard } from "@/server/services/locations";
import { count } from "@/lib/text";

const FALLBACK = "/brand/court-net.jpg";

/** Player-facing location card backed by the database. */
export function LiveLocationCard({ location, compact }: { location: LocationCard; compact?: boolean }) {
  const photo = location.photos[0]?.url ?? FALLBACK;
  const comingSoon = location.status === "COMING_SOON";
  return (
    <Card variant="interactive" padding="none" href={`/app/locations/${location.slug}`}>
      <CourtBackdrop src={photo} overlay="soft" className={compact ? "h-32" : "h-44"}>
        <div className="flex flex-col justify-between p-4" style={{ minHeight: compact ? 128 : 176 }}>
          <div className="flex justify-between">
            <Badge tone={comingSoon ? "warning" : "brand"}>{comingSoon ? "Coming soon" : `${location.activeCourts} court${location.activeCourts === 1 ? "" : "s"} open`}</Badge>
            {location.openToday && !comingSoon && (
              <Badge className="bg-navy-950/60 text-white backdrop-blur">
                <Clock size={12} /> {minutesToHHMM(location.openToday.opensAt)}–{location.openToday.closesAt === 1440 ? "24:00" : minutesToHHMM(location.openToday.closesAt)}
              </Badge>
            )}
          </div>
          <div className="text-white">
            <div className="text-h4">{location.name}</div>
            <div className="flex items-center gap-1 text-caption text-blue-100/80">
              <MapPin size={12} /> {location.area}, {location.city}
            </div>
          </div>
        </div>
      </CourtBackdrop>
      <div className="flex items-center justify-between px-4 py-3 text-body-sm">
        <div className="flex min-w-0 items-center gap-1.5 text-fg-muted">
          <LayoutGrid size={14} className="shrink-0" />
          <span className="truncate">{location.facilities.slice(0, 3).map(facilityLabel).join(" · ") || `${count(location._count.courts, "court")}`}</span>
        </div>
        {location.priceFromCents != null && (
          <div className="shrink-0">
            <span className="text-fg-subtle">from </span>
            <span className="font-bold text-fg tabular">EGP {Math.round(location.priceFromCents / 100)}</span>
            <span className="text-fg-subtle">/h</span>
          </div>
        )}
      </div>
    </Card>
  );
}

