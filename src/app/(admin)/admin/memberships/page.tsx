import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { listMemberships, listPlans } from "@/server/services/memberships";
import { MembershipsView } from "./memberships-view";

export const metadata = { title: "Memberships" };

export const dynamic = "force-dynamic";

type Status = "ACTIVE" | "PENDING" | "EXPIRED" | "CANCELLED";
const isStatus = (v: string | undefined): v is Status => v === "ACTIVE" || v === "PENDING" || v === "EXPIRED" || v === "CANCELLED";

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const params = await searchParams;
  const status = isStatus(params.status) ? params.status : undefined;
  const [plans, members] = await Promise.all([listPlans(actor, { includeInactive: true }), listMemberships(actor, { status })]);
  return <MembershipsView plans={plans} members={members} status={status ?? ""} />;
}
