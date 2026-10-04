import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { getAnalytics } from "@/server/services/analytics";
import { AnalyticsView } from "./analytics-view";

export const metadata = { title: "Analytics" };

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const { weeks } = await searchParams;
  const parsed = Number(weeks);
  const window = [4, 8, 12, 26].includes(parsed) ? parsed : 8;
  const report = await getAnalytics(actor, { weeks: window });
  return <AnalyticsView report={report} weeks={window} />;
}
