import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { listReports } from "@/server/services/messaging";
import { ModerationView, type ReportDto } from "./moderation-view";

export const metadata = { title: "Moderation" };

export const dynamic = "force-dynamic";

export default async function AdminModerationPage() {
  const actor = await requireStaffOrRedirect();
  const rows = await listReports(actor).catch(() => []);
  const reports: ReportDto[] = rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    note: r.note,
    status: r.status,
    outcome: r.outcome,
    createdAt: r.createdAt.toISOString(),
    reviewedBy: r.reviewedBy?.name ?? null,
    reporterName: r.reporter.name,
    senderName: r.message.sender.name,
    messageBody: r.message.body,
    messageAt: r.message.createdAt.toISOString(),
    messageRemoved: !!r.message.deletedAt,
    threadId: r.message.thread.id,
    threadLabel: r.threadLabel,
    threadLocked: r.threadLocked,
  }));
  return <ModerationView reports={reports} />;
}
