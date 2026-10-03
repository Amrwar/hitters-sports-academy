import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listPublicLocations } from "@/server/services/locations";
import { listMyPairs } from "@/server/services/pairs";
import { getMyProfile } from "@/server/services/profiles";
import { getLevelDefinitions } from "@/server/services/levels";
import { FindMatchView } from "./find-view";

export const dynamic = "force-dynamic";

export default async function FindMatchPage() {
  const actor = await requireActorOrRedirect("/app/play/find");
  const [locations, pairs, profile, levels] = await Promise.all([listPublicLocations(), listMyPairs(actor), getMyProfile(actor), getLevelDefinitions()]);
  return (
    <FindMatchView
      viewerId={actor.id}
      viewerLevel={profile.level}
      levelLabel={profile.level ? (levels.find((l) => l.level === profile.level)?.label ?? "") : ""}
      locations={locations.map((l) => ({ id: l.id, name: l.name.replace("HITTERS ", ""), timezone: l.timezone }))}
      defaultLocationIds={[profile.homeLocationId, ...profile.preferredLocations.map((l) => l.id)].filter((x): x is string => !!x)}
      pairs={pairs.filter((p) => p.status === "ACTIVE").map((p) => ({ id: p.id, label: p.name?.trim() || `with ${(p.playerAId === actor.id ? p.playerB : p.playerA).name.split(" ")[0]}` }))}
    />
  );
}
