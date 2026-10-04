import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyPairs } from "@/server/services/pairs";
import { getLevelDefinitions } from "@/server/services/levels";
import { PairsView } from "./pairs-view";

export const metadata = { title: "Pairs" };

export const dynamic = "force-dynamic";

export default async function PairsPage() {
  const actor = await requireActorOrRedirect("/app/play/pairs");
  const [pairs, levels] = await Promise.all([listMyPairs(actor), getLevelDefinitions()]);
  return <PairsView viewerId={actor.id} pairs={pairs} levelLabels={Object.fromEntries(levels.map((l) => [l.level, l.label]))} />;
}
