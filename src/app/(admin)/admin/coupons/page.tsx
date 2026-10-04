import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { listCoupons } from "@/server/services/coupons";
import { CouponsView } from "./coupons-view";

export const metadata = { title: "Coupons" };

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const actor = await requireStaffOrRedirect();
  const coupons = await listCoupons(actor, { includeInactive: true });
  return <CouponsView coupons={coupons} />;
}
