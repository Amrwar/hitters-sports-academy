import { Search, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/button";
import { LocationCard } from "@/components/patterns/cards";
import { locations } from "@/data/mock";

export default function LocationsPage() {
  const sorted = [...locations].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return (
    <div>
      <PageHeader eyebrow="Clubs" title="Locations" />
      <div className="flex gap-2">
        <Input placeholder="Search by area or club" leading={<Search />} aria-label="Search locations" />
        <IconButton label="Filters" variant="secondary">
          <SlidersHorizontal />
        </IconButton>
      </div>
      <div className="mt-5 space-y-4">
        {sorted.map((l) => (
          <LocationCard key={l.slug} location={l} />
        ))}
      </div>
    </div>
  );
}
