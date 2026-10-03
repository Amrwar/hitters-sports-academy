import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { discoverGames, listMyGames } from "@/server/services/game-sessions";
import { listPublicLocations } from "@/server/services/locations";
import { getMyProfile } from "@/server/services/profiles";
import { PlayView } from "./play-view";

export const dynamic = "force-dynamic";

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActorOrRedirect("/app/play");
  const { tab } = await searchParams;
  const [mine, open, locations, profile] = await Promise.all([listMyGames(actor, "upcoming"), discoverGames(actor, {}), listPublicLocations(), getMyProfile(actor)]);
  return (
    <PlayView
      viewerId={actor.id}
      viewerLevel={profile.level}
      initialTab={tab === "discover" ? "discover" : "mine"}
      mine={mine}
      open={open}
      locations={locations.map((l) => ({ id: l.id, name: l.name.replace("HITTERS ", ""), timezone: l.timezone }))}
    />
  );
}
