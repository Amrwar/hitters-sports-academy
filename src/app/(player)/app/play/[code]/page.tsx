import { notFound } from "next/navigation";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { isAppError } from "@/lib/errors";
import { getGameSession } from "@/server/services/game-sessions";
import { getLevelDefinitions } from "@/server/services/levels";
import { evaluateGameForActor, getMyRequestForGame, listSessionRequests } from "@/server/services/matchmaking";
import { listMyPairs } from "@/server/services/pairs";
import { ThreadSection } from "@/components/patterns/thread-section";
import { GameDetail } from "./game-view";

export const metadata = { title: "Game" };

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const actor = await requireActorOrRedirect(`/app/play/${code}`);
  const game = await getGameSession(actor, code.toUpperCase()).catch((e) => {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) return null;
    throw e;
  });
  if (!game) notFound();
  const organizer = game.organizerId === actor.id;
  const [levels, staff, staffReads, pairsAll, myRequest] = await Promise.all([getLevelDefinitions(), can(actor, "session.manage", { locationId: game.locationId }), can(actor, "session.read", { locationId: game.locationId }), listMyPairs(actor), getMyRequestForGame(actor, game.id)]);
  const pairs = pairsAll.filter((p) => p.status === "ACTIVE");
  const [solo, pair, requests] = await Promise.all([
    organizer ? null : evaluateGameForActor(actor, game, { kind: "SOLO" }).catch(() => null),
    organizer || pairs.length === 0 ? null : evaluateGameForActor(actor, game, { kind: "PAIR", pairId: pairs[0].id }).catch(() => null),
    organizer || staffReads ? listSessionRequests(actor, game.id).catch(() => []) : null,
  ]);
  return (
    <div className="space-y-8">
      <GameDetail
        game={game}
        viewerId={actor.id}
        staffCanManage={staff}
        levels={Object.fromEntries(levels.map((l) => [l.level, l.label]))}
        compat={{ solo, pair }}
        pairs={pairs.map((p) => ({ id: p.id, label: p.name?.trim() || `with ${(p.playerAId === actor.id ? p.playerB : p.playerA).name.split(" ")[0]}` }))}
        requests={requests}
        myRequest={myRequest}
      />
      <ThreadSection actor={actor} kind="GAME" subjectId={game.id} path={`/app/play/${code}`} />
    </div>
  );
}
