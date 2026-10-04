import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { getMyProfile, getPlayerHistory } from "@/server/services/profiles";
import { listPublicLocations } from "@/server/services/locations";
import { getAssessmentOverview, listPlayerAssessments } from "@/server/services/assessments";
import { getLevelDefinitions } from "@/server/services/levels";
import { ProfileView } from "./profile-view";

export const metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActorOrRedirect("/app/profile");
  const { tab } = await searchParams;
  const profile = await getMyProfile(actor);
  const [locations, overview, history, assessments, levels] = await Promise.all([
    listPublicLocations(),
    getAssessmentOverview(actor, profile.id),
    getPlayerHistory(actor, profile.id),
    listPlayerAssessments(actor, profile.id),
    getLevelDefinitions(),
  ]);
  return (
    <ProfileView
      profile={profile}
      overview={overview}
      history={history}
      assessments={assessments}
      levels={levels}
      locations={locations.map((l) => ({ id: l.id, name: l.name, status: l.status }))}
      isStaff={!!actor.globalRole || actor.memberships.length > 0}
      initialTab={tab === "assessment" || tab === "history" || tab === "settings" ? tab : "overview"}
    />
  );
}
