import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listPlans, myMembership } from "@/server/services/memberships";
import { MembershipView } from "./membership-view";

export const metadata = { title: "Membership" };

export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const actor = await requireActorOrRedirect("/app/membership");
  const [plans, membership] = await Promise.all([listPlans(actor), myMembership(actor)]);
  return <MembershipView plans={plans} membership={membership} />;
}
