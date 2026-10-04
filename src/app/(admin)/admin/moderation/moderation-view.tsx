"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, LockOpen, ShieldCheck, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/states";
import { Field, Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { decideReportAction, setThreadLockAction } from "@/server/actions/notifications";

export type ReportDto = {
  id: string;
  reason: string;
  note: string | null;
  status: "OPEN" | "ACTIONED" | "DISMISSED";
  outcome: string | null;
  createdAt: string;
  reviewedBy: string | null;
  reporterName: string;
  senderName: string;
  messageBody: string;
  messageAt: string;
  messageRemoved: boolean;
  threadId: string;
  threadLabel: string;
  threadLocked: boolean;
};

const tone = { OPEN: "warning", ACTIONED: "danger", DISMISSED: "neutral" } as const;

export function ModerationView({ reports }: { reports: ReportDto[] }) {
  const [status, setStatus] = useState<"OPEN" | "ACTIONED" | "DISMISSED">("OPEN");
  const rows = reports.filter((r) => r.status === status);
  return (
    <AdminShell title="Moderation" breadcrumb={["Communication", "Moderation"]}>
      <div className="space-y-5">
        <Alert tone="info" title="Reported messages from game and program chats">
          Players never see each other&apos;s phone number or email, so a chat is the only channel between them. Removing a message hides it for everyone and tells the sender; locking a conversation makes it
          read-only.
        </Alert>
        <Tabs
          items={[
            { value: "OPEN" as const, label: `Open (${reports.filter((r) => r.status === "OPEN").length})` },
            { value: "ACTIONED" as const, label: "Actioned" },
            { value: "DISMISSED" as const, label: "Dismissed" },
          ]}
          value={status}
          onChange={setStatus}
        />
        {rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title={status === "OPEN" ? "Nothing to review" : "Nothing here"} description={status === "OPEN" ? "Reported messages land here for a decision." : undefined} />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function ReportCard({ report }: { report: ReportDto }) {
  const router = useRouter();
  const { toast } = useToast();
  const [outcome, setOutcome] = useState("");
  const [pending, start] = useTransition();

  const decide = (decision: "ACTIONED" | "DISMISSED", removeMessage: boolean) =>
    start(async () => {
      const res = await decideReportAction(report.id, { decision, removeMessage, outcome });
      if (res.ok) {
        toast({ tone: "success", title: decision === "ACTIONED" ? (res.data.removed ? "Message removed" : "Report actioned") : "Report dismissed" });
        router.refresh();
      } else toast({ tone: "danger", title: res.message });
    });

  const lock = (locked: boolean) =>
    start(async () => {
      const res = await setThreadLockAction(report.threadId, locked);
      if (res.ok) {
        toast({ tone: "success", title: locked ? "Conversation locked" : "Conversation unlocked" });
        router.refresh();
      } else toast({ tone: "danger", title: res.message });
    });

  return (
    <Card>
      <CardHeader
        title={report.threadLabel}
        description={`Reported by ${report.reporterName} · ${new Date(report.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone[report.status]}>{report.status.toLowerCase()}</Badge>
            {report.threadLocked && <Badge tone="neutral">locked</Badge>}
          </div>
        }
      />
      <div className="space-y-4">
        <div>
          <div className="text-overline uppercase text-blue-300/70">Reason</div>
          <p className="mt-1 text-body-sm text-fg">{report.reason}</p>
          {report.note && <p className="mt-1 text-body-sm text-fg-muted">{report.note}</p>}
        </div>
        <div className="rounded-lg border border-line/10 bg-surface-2 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-body-sm font-bold text-fg">{report.senderName}</span>
            <span className="text-caption text-fg-subtle">{new Date(report.messageAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <p className={report.messageRemoved ? "mt-1 text-body-sm italic text-fg-subtle" : "mt-1 text-body-sm text-fg-muted"}>{report.messageRemoved ? "Already removed" : report.messageBody}</p>
        </div>

        {report.status === "OPEN" ? (
          <div className="space-y-3">
            <Field label="Note for the record" hint="Stored on the report and in the audit log.">
              {(id) => <Input id={id} value={outcome} maxLength={500} placeholder="Warned the player; message removed." onChange={(e) => setOutcome(e.target.value)} />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="danger" leftIcon={<Trash2 />} loading={pending} onClick={() => decide("ACTIONED", true)}>
                Remove message
              </Button>
              <Button size="sm" variant="secondary" leftIcon={<Check />} loading={pending} onClick={() => decide("ACTIONED", false)}>
                Action without removing
              </Button>
              <Button size="sm" variant="ghost" loading={pending} onClick={() => decide("DISMISSED", false)}>
                Dismiss
              </Button>
              <Button size="sm" variant="ghost" leftIcon={report.threadLocked ? <LockOpen /> : <Lock />} loading={pending} onClick={() => lock(!report.threadLocked)}>
                {report.threadLocked ? "Unlock conversation" : "Lock conversation"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-caption text-fg-subtle">
            {report.reviewedBy ? `Reviewed by ${report.reviewedBy}.` : "Reviewed."} {report.outcome ?? ""}
          </p>
        )}
      </div>
    </Card>
  );
}
