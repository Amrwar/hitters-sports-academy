import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { accessibleLocationIds, can } from "@/lib/auth/authorize";
import { db } from "@/lib/db";
import { listAssessmentRequests } from "@/server/services/assessments";
import { getLevelDefinitions } from "@/server/services/levels";
import { listManagedLocations } from "@/server/services/locations";
import { AssessmentsAdmin } from "./assessments-admin";

export const dynamic = "force-dynamic";

export default async function AdminAssessmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; location?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { tab, location } = await searchParams;
  const locations = await listManagedLocations(actor);
  const readScope = await accessibleLocationIds(actor, "assessment.read");
  const canRead = readScope === "all" || readScope.length > 0;
  const selected = locations.find((l) => l.id === location) ?? null;

  const [open, done, levels, canConfigure, assessors, recent] = await Promise.all([
    canRead ? listAssessmentRequests(actor, { locationId: selected?.id, status: "OPEN" }).catch(() => []) : Promise.resolve([]),
    canRead ? listAssessmentRequests(actor, { locationId: selected?.id, status: "COMPLETED" }).catch(() => []) : Promise.resolve([]),
    getLevelDefinitions(),
    can(actor, "levels.configure"),
    canRead
      ? db.staffMembership.findMany({ where: { role: "ASSESSOR", status: "ACTIVE", ...(readScope === "all" ? {} : { locationId: { in: readScope } }) }, select: { locationId: true, user: { select: { id: true, name: true } } } })
      : Promise.resolve([]),
    canRead
      ? db.assessment.findMany({
          where: readScope === "all" ? {} : { locationId: { in: readScope } },
          orderBy: { assessedAt: "desc" },
          take: 40,
          select: { id: true, kind: true, level: true, previousLevel: true, assessedAt: true, location: { select: { name: true } }, assessor: { select: { name: true } }, playerProfile: { select: { id: true, user: { select: { id: true, name: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  // Which locations may the actor record or schedule at?
  const schedulable = await Promise.all(locations.map(async (l) => ({ id: l.id, schedule: await can(actor, "assessment.schedule", { locationId: l.id }), record: await can(actor, "assessment.create", { locationId: l.id }) })));

  return (
    <AssessmentsAdmin
      locations={locations.map((l) => ({ id: l.id, name: l.name, timezone: l.timezone }))}
      selectedId={selected?.id ?? null}
      open={open}
      completed={done}
      recent={recent}
      levels={levels}
      canConfigure={canConfigure}
      assessors={assessors.map((a) => ({ locationId: a.locationId, id: a.user.id, name: a.user.name }))}
      caps={Object.fromEntries(schedulable.map((s) => [s.id, { schedule: s.schedule, record: s.record }]))}
      isGlobal={!!actor.globalRole}
      initialTab={tab === "levels" || tab === "history" ? tab : "queue"}
      viewerId={actor.id}
    />
  );
}
