import { notFound } from "next/navigation";
import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { isAppError } from "@/lib/errors";
import { getLocation } from "@/server/services/locations";
import { listCourts } from "@/server/services/courts";
import { listPricingRules } from "@/server/services/pricing";
import { LocationEditor } from "./location-editor";

export const dynamic = "force-dynamic";

export default async function AdminLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { id } = await params;
  try {
    const location = await getLocation(actor, id);
    const [courts, rules, canManage, canPrice] = await Promise.all([
      listCourts(actor, location.id),
      listPricingRules(actor, location.id, { includeInactive: true }),
      can(actor, "location.manage", { locationId: location.id }),
      can(actor, "finance.manage", { locationId: location.id }),
    ]);
    return <LocationEditor location={location} courts={courts.map((c) => ({ id: c.id, name: c.name }))} rules={rules} canManage={canManage} canPrice={canManage || canPrice} isGlobal={!!actor.globalRole} />;
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
