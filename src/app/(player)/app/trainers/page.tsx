import type { PlayerLevel } from "@prisma/client";
import { CalendarCheck, Package, Users } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { TrainerCard } from "@/components/patterns/academy";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listTrainers } from "@/server/services/trainers";
import { listPublicLocations } from "@/server/services/locations";
import { getLevelDefinitions } from "@/server/services/levels";
import { getMyProfile } from "@/server/services/profiles";
import { FilterChips } from "./filter-chips";

export const metadata = { title: "Coaches" };

export const dynamic = "force-dynamic";

export default async function TrainersPage({ searchParams }: { searchParams: Promise<{ location?: string; level?: string }> }) {
  const actor = await requireActorOrRedirect("/app/trainers");
  const sp = await searchParams;
  const [locations, levels, profile] = await Promise.all([listPublicLocations(), getLevelDefinitions(), getMyProfile(actor)]);
  const level = ["A", "B", "C", "D"].includes(sp.level ?? "") ? (sp.level as PlayerLevel) : undefined;
  const trainers = await listTrainers(actor, { locationId: sp.location || undefined, level });
  return (
    <div>
      <PageHeader
        eyebrow="Academy"
        title="Private coaching"
        action={
          <Button size="sm" variant="secondary" leftIcon={<CalendarCheck />} href="/app/lessons">
            My lessons
          </Button>
        }
      />
      <FilterChips locations={locations.map((l) => ({ id: l.id, name: l.name.replace("HITTERS ", "") }))} selectedLocation={sp.location ?? null} selectedLevel={level ?? null} myLevel={profile.level} />
      <div className="mt-4 space-y-3">
        {trainers.length ? (
          trainers.map((t) => <TrainerCard key={t.id} trainer={t} levelLabels={Object.fromEntries(levels.map((l) => [l.level, l.label]))} href={`/app/trainers/${t.id}`} />)
        ) : (
          <EmptyState icon={<Users />} title="No coaches match" description="Try another club or level." />
        )}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="secondary" leftIcon={<Package />} href="/app/packages">
          Lesson packages
        </Button>
        <Button variant="secondary" href="/app/programs">
          Programs
        </Button>
      </div>
    </div>
  );
}
