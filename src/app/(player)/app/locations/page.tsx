import Link from "next/link";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { EmptyState } from "@/components/ui/states";
import { LiveLocationCard } from "@/components/patterns/live-location-card";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listPublicLocations } from "@/server/services/locations";

export const metadata = { title: "Clubs" };

export default async function LocationsPage() {
  await requireActorOrRedirect("/app/locations");
  const locations = await listPublicLocations();
  return (
    <div>
      <PageHeader eyebrow="Clubs" title="Locations" />
      {locations.length === 0 ? (
        <EmptyState icon={<MapPin />} title="No clubs open yet" description="New HITTERS locations will appear here." />
      ) : (
        <div className="space-y-4">
          {locations.map((l) => (
            <LiveLocationCard key={l.id} location={l} />
          ))}
        </div>
      )}
      <p className="mt-6 text-center text-caption text-fg-subtle">
        Can&apos;t find your club?{" "}
        <Link href="/app/profile" className="text-blue-300 underline-offset-2 hover:underline">
          Set a home club
        </Link>{" "}
        in your profile.
      </p>
    </div>
  );
}
