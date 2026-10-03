import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { accessibleLocationIds } from "@/lib/auth/authorize";
import { listPrograms, listProgramEnrollments } from "@/server/services/programs";
import { listTrainersInScope } from "@/server/services/trainers";
import { listManagedLocations } from "@/server/services/locations";
import { listCourts } from "@/server/services/courts";
import { listUsers } from "@/server/services/users";
import { getLevelDefinitions } from "@/server/services/levels";
import { ProgramsAdmin } from "./programs-admin";

export const dynamic = "force-dynamic";

export default async function AdminProgramsPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const sp = await searchParams;
  const manage = await accessibleLocationIds(actor, "program.manage");
  const canManage = manage === "all" || manage.length > 0;
  const [programs, trainers, locations, levels] = await Promise.all([
    canManage ? listPrograms(actor, { includeAll: true }) : listPrograms(actor),
    listTrainersInScope(actor).catch(() => []),
    listManagedLocations(actor),
    getLevelDefinitions(),
  ]);
  const manageable = locations.filter((l) => manage === "all" || manage.includes(l.id));
  const courts = Object.fromEntries(await Promise.all(manageable.map(async (l) => [l.id, (await listCourts(actor, l.id)).filter((c) => c.status !== "INACTIVE").map((c) => ({ id: c.id, name: c.name }))] as const)));
  const members = canManage ? await listUsers(actor, { pageSize: 200 }).then((r) => r.items.map((u) => ({ id: u.id, name: u.name, email: u.email }))).catch(() => []) : [];
  const selected = sp.program ? programs.find((p) => p.id === sp.program) ?? null : null;
  const roster = selected ? await listProgramEnrollments(actor, selected.id).catch(() => []) : [];
  return (
    <ProgramsAdmin
      programs={programs}
      trainers={trainers.map((t) => ({ id: t.id, name: t.user.name, locationIds: t.locations.map((l) => l.location.id) }))}
      locations={manageable.map((l) => ({ id: l.id, name: l.name, timezone: l.timezone }))}
      courts={courts}
      levels={levels.map((l) => ({ level: l.level, label: l.label }))}
      members={members}
      canManage={canManage}
      selectedId={selected?.id ?? null}
      roster={roster}
      viewerId={actor.id}
    />
  );
}
