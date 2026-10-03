import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyPurchases, listPackages } from "@/server/services/packages";
import { PackagesView } from "./packages-view";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const actor = await requireActorOrRedirect("/app/packages");
  const [purchases, catalog] = await Promise.all([listMyPurchases(actor), listPackages(actor)]);
  return <PackagesView purchases={purchases} catalog={catalog} />;
}
