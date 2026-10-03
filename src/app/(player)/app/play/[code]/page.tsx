import { notFound } from "next/navigation";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { isAppError } from "@/lib/errors";
import { getGameSession } from "@/server/services/game-sessions";
import { getLevelDefinitions } from "@/server/services/levels";
import { GameDetail } from "./game-view";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const actor = await requireActorOrRedirect(`/app/play/${code}`);
  const game = await getGameSession(actor, code.toUpperCase()).catch((e) => {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) return null;
    throw e;
  });
  if (!game) notFound();
  const [levels, staff] = await Promise.all([getLevelDefinitions(), can(actor, "session.manage", { locationId: game.locationId })]);
  return <GameDetail game={game} viewerId={actor.id} staffCanManage={staff} levels={Object.fromEntries(levels.map((l) => [l.level, l.label]))} />;
}
