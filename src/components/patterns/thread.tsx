"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Lock, Send, ShieldAlert } from "lucide-react";
import type { MessageThreadKind } from "@prisma/client";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { MESSAGE_REPORT_REASONS } from "@/lib/validation/schemas";
import { postMessageAction, reportMessageAction } from "@/server/actions/notifications";
import { count } from "@/lib/text";

export type ThreadMemberDto = { id: string; name: string; level: string | null; photoUrl: string | null; role: "ORGANIZER" | "COACH" | "PLAYER" };
export type ThreadMessageDto = { id: string; body: string; createdAt: string; deleted: boolean; senderId: string; senderName: string; senderPhoto: string | null; reportedByMe: boolean };

export type ThreadDto = {
  kind: MessageThreadKind;
  subjectId: string;
  label: string;
  locked: boolean;
  canPost: boolean;
  readOnlyReason: string | null;
  members: ThreadMemberDto[];
  messages: ThreadMessageDto[];
  /** The page this thread is embedded in, so a post refreshes the right route. */
  path: string;
};

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The group chat for a game or a program. Members are shown by name, photo and level only: this panel is the
 * reason nobody has to hand out a phone number to organise a match.
 */
export function Thread({ thread, meId }: { thread: ThreadDto; meId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [reporting, setReporting] = useState<ThreadMessageDto | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread.messages.length]);

  const send = () => {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await postMessageAction(thread.kind, thread.subjectId, text, thread.path);
      if (res.ok) {
        setBody("");
        router.refresh();
      } else toast({ tone: "danger", title: res.message });
    });
  };

  return (
    <div id="chat" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {thread.members.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-2 rounded-full border border-line/10 bg-surface-2 py-1 pl-1 pr-3">
            <Avatar name={m.name} src={m.photoUrl} size="xs" ring={m.id === meId} />
            <span className="text-caption font-semibold text-fg">{m.id === meId ? "You" : m.name.split(" ")[0]}</span>
            {m.role !== "PLAYER" && <span className="text-caption text-fg-subtle">{m.role === "COACH" ? "Coach" : "Organizer"}</span>}
            {m.level && <span className="text-caption text-fg-subtle">{m.level}</span>}
          </span>
        ))}
      </div>

      <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-line/10 bg-surface-1 p-3.5">
        {thread.messages.length === 0 && <p className="py-6 text-center text-body-sm text-fg-muted">No messages yet. Say hello, agree who brings the balls.</p>}
        {thread.messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.id} className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
              {!mine && <Avatar name={m.senderName} src={m.senderPhoto} size="sm" />}
              <div className={cn("min-w-0 max-w-[78%]")}>
                <div className={cn("flex items-baseline gap-2", mine && "justify-end")}>
                  <span className="text-caption font-semibold text-fg">{mine ? "You" : m.senderName.split(" ")[0]}</span>
                  <span className="text-caption text-fg-subtle">{time(m.createdAt)}</span>
                </div>
                <div className={cn("mt-1 rounded-lg px-3 py-2 text-body-sm", m.deleted ? "border border-dashed border-line/20 text-fg-subtle" : mine ? "bg-brand-gradient text-white" : "bg-surface-2 text-fg")}>
                  {m.deleted ? "This message was removed by the club." : m.body}
                </div>
                {!mine && !m.deleted && (
                  <button
                    type="button"
                    onClick={() => setReporting(m)}
                    disabled={m.reportedByMe}
                    className="mt-1 inline-flex items-center gap-1 text-caption text-fg-subtle transition-colors hover:text-danger disabled:opacity-60 [&_svg]:size-3"
                  >
                    <Flag />
                    {m.reportedByMe ? "Reported" : "Report"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {thread.canPost ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={body}
            maxLength={2000}
            placeholder={`Message ${thread.label}`}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-caption text-fg-subtle">Visible to the {count(thread.members.length, "person", "people")} in this lineup. Phone numbers stay private.</p>
            <Button size="sm" leftIcon={<Send />} loading={pending} onClick={send} disabled={!body.trim()}>
              Send
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-line/10 bg-surface-2 p-3 text-body-sm text-fg-muted">
          {thread.locked ? <Lock className="size-4 shrink-0" /> : <ShieldAlert className="size-4 shrink-0" />}
          {thread.readOnlyReason ?? "You cannot post here."}
        </div>
      )}

      <ReportDialog message={reporting} path={thread.path} onClose={() => setReporting(null)} />
    </div>
  );
}

function ReportDialog({ message, path, onClose }: { message: ThreadMessageDto | null; path: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState<string>(MESSAGE_REPORT_REASONS[0]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  return (
    <Modal
      open={!!message}
      onClose={onClose}
      title="Report this message"
      description="A manager at the club reviews reports. The sender is not told who reported them."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                if (!message) return;
                const res = await reportMessageAction(message.id, { reason, note }, path);
                if (res.ok) {
                  toast({ tone: "success", title: "Reported", description: "The club will review it." });
                  onClose();
                  router.refresh();
                } else toast({ tone: "danger", title: res.message });
              })
            }
          >
            Send report
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {message && (
          <div className="rounded-lg border border-line/10 bg-surface-2 p-3">
            <Badge tone="neutral">{message.senderName}</Badge>
            <p className="mt-2 text-body-sm text-fg-muted">{message.body}</p>
          </div>
        )}
        <Field label="Reason" required>
          {(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} options={MESSAGE_REPORT_REASONS.map((r) => ({ value: r, label: r }))} />}
        </Field>
        <Field label="Anything else" hint="Optional, up to 500 characters">
          {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}
