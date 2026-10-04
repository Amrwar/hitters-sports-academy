import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { getFinanceReport } from "@/server/services/finance";
import { FinanceView } from "./finance-view";

export const metadata = { title: "Finance" };

export const dynamic = "force-dynamic";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ weeks?: string; location?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const params = await searchParams;
  const weeks = Math.min(52, Math.max(1, Number(params.weeks) || 8));
  const report = await getFinanceReport(actor, { weeks, locationId: params.location });
  return <FinanceView report={report} weeks={weeks} locationId={params.location} />;
}
