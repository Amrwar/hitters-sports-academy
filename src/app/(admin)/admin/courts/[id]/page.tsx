import { notFound } from "next/navigation";
import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { isAppError } from "@/lib/errors";
import { getCourt } from "@/server/services/courts";
import { CourtAdmin } from "./court-admin";

export const metadata = { title: "Court" };

export const dynamic = "force-dynamic";

export default async function AdminCourtPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { id } = await params;
  try {
    const court = await getCourt(actor, id);
    const [canManage, canAvailability] = await Promise.all([can(actor, "court.manage", { locationId: court.locationId }), can(actor, "availability.manage", { locationId: court.locationId })]);
    return <CourtAdmin court={court} canManage={canManage} canAvailability={canAvailability} />;
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
