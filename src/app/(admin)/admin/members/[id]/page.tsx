import { notFound } from "next/navigation";
import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { isAppError } from "@/lib/errors";
import { getUser } from "@/server/services/users";
import { getProfile, getPlayerHistory } from "@/server/services/profiles";
import { getAssessmentOverview, listPlayerAssessments, type AssessmentView } from "@/server/services/assessments";
import { getLevelDefinitions } from "@/server/services/levels";
import { listManagedLocations } from "@/server/services/locations";
import { MemberDetail } from "./member-detail";

export const dynamic = "force-dynamic";

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { id } = await params;
  try {
    const user = await getUser(actor, id);
    if (!user.playerProfile) notFound();
    const profileId = user.playerProfile.id;
    const [profile, history, assessments, overview, levels, locations] = await Promise.all([
      getProfile(actor, profileId),
      getPlayerHistory(actor, profileId).catch(() => ({ bookings: [], matches: [], training: [] })),
      listPlayerAssessments(actor, profileId).catch(() => [] as AssessmentView[]),
      getAssessmentOverview(actor, profileId).catch(() => null),
      getLevelDefinitions(),
      listManagedLocations(actor),
    ]);
    const homeLoc = profile.homeLocationId;
    const [canOverride, recordable, trainable] = await Promise.all([
      actor.globalRole ? can(actor, "level.override") : homeLoc ? can(actor, "level.override", { locationId: homeLoc }) : Promise.resolve(false),
      Promise.all(locations.map(async (l) => ((await can(actor, "assessment.create", { locationId: l.id })) ? l.id : null))),
      Promise.all(locations.map(async (l) => ((await can(actor, "training.record", { locationId: l.id })) ? l.id : null))),
    ]);
    return (
      <MemberDetail
        user={user}
        profile={profile}
        history={history}
        assessments={assessments as AssessmentView[]}
        overview={overview}
        levels={levels}
        locations={locations.map((l) => ({ id: l.id, name: l.name, timezone: l.timezone }))}
        canOverride={canOverride && user.id !== actor.id}
        recordAt={recordable.filter((x): x is string => !!x)}
        trainAt={trainable.filter((x): x is string => !!x)}
        viewerId={actor.id}
      />
    );
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
