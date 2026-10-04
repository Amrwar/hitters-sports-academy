import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { getMyProfile, getPlayerHistory } from "@/server/services/profiles";
import { listPublicLocations } from "@/server/services/locations";
import { getAssessmentOverview, listPlayerAssessments } from "@/server/services/assessments";
import { getLevelDefinitions } from "@/server/services/levels";
import { outstandingForPlayer } from "@/server/services/payments";
import { creditBalance } from "@/server/services/credits";
import { myMembership } from "@/server/services/memberships";
import { ProfileView } from "./profile-view";

export const metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActorOrRedirect("/app/profile");
  const { tab } = await searchParams;
  const profile = await getMyProfile(actor);
  const [locations, overview, history, assessments, levels, owed, credit, membership] = await Promise.all([
    listPublicLocations(),
    getAssessmentOverview(actor, profile.id),
    getPlayerHistory(actor, profile.id),
    listPlayerAssessments(actor, profile.id),
    getLevelDefinitions(),
    outstandingForPlayer(actor.id),
    creditBalance(actor.id),
    myMembership(actor),
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
      billing={{ owedCents: owed.amountCents, creditCents: credit, membership: membership?.status === "ACTIVE" ? membership.plan.name : membership ? "Awaiting payment" : null }}
    />
  );
}
