import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyGames } from "@/server/services/game-sessions";
import { findMatches, listIncomingRequests, listMyRequests } from "@/server/services/matchmaking";
import { listMyPairs } from "@/server/services/pairs";
import { getMyProfile } from "@/server/services/profiles";
import { getLevelDefinitions } from "@/server/services/levels";
import { PlayView } from "./play-view";

export const dynamic = "force-dynamic";

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActorOrRedirect("/app/play");
  const { tab } = await searchParams;
  const [mine, recommended, incoming, outgoing, pairs, profile, levels] = await Promise.all([
    listMyGames(actor, "upcoming"),
    findMatches(actor, { take: 10 }).catch(() => null),
    listIncomingRequests(actor),
    listMyRequests(actor),
    listMyPairs(actor),
    getMyProfile(actor),
    getLevelDefinitions(),
  ]);
  const initial = tab === "games" ? "games" : tab === "requests" ? "requests" : "foryou";
  return (
    <PlayView
      viewerId={actor.id}
      viewerLevel={profile.level}
      levelLabels={Object.fromEntries(levels.map((l) => [l.level, l.label]))}
      initialTab={initial}
      mine={mine}
      recommended={recommended?.items ?? []}
      nearMisses={recommended?.nearMisses ?? []}
      incoming={incoming}
      outgoing={outgoing}
      pairs={pairs}
    />
  );
}
