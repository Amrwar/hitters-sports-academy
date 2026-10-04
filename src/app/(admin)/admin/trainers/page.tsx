import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { accessibleLocationIds } from "@/lib/auth/authorize";
import { listTrainerCandidates, listTrainersInScope } from "@/server/services/trainers";
import { listManagedLocations } from "@/server/services/locations";
import { getLevelDefinitions } from "@/server/services/levels";
import { TrainersAdmin } from "./trainers-admin";

export const metadata = { title: "Coaches" };

export const dynamic = "force-dynamic";

export default async function AdminTrainersPage() {
  const actor = await requireStaffOrRedirect();
  const [trainers, candidates, locations, levels, manage] = await Promise.all([listTrainersInScope(actor).catch(() => []), listTrainerCandidates(actor), listManagedLocations(actor), getLevelDefinitions(), accessibleLocationIds(actor, "trainer.manage")]);
  const manageable = locations.filter((l) => manage === "all" || manage.includes(l.id));
  return <TrainersAdmin trainers={trainers} candidates={candidates} locations={manageable.map((l) => ({ id: l.id, name: l.name }))} levels={levels.map((l) => ({ level: l.level, label: l.label }))} canManage={manage === "all" || manage.length > 0} viewerId={actor.id} />;
}
