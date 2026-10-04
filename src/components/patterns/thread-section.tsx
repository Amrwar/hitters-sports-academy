import { MessageSquare } from "lucide-react";
import type { MessageThreadKind } from "@prisma/client";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getThread } from "@/server/services/messaging";
import type { Actor } from "@/lib/auth/authorize";
import { Thread, type ThreadDto } from "./thread";

/**
 * Server wrapper that loads one thread and hands it to the client chat. Renders nothing when the viewer is
 * not entitled to the conversation, so a page can include it unconditionally.
 */
export async function ThreadSection({ actor, kind, subjectId, path }: { actor: Actor; kind: MessageThreadKind; subjectId: string; path: string }) {
  const view = await getThread(actor, kind, subjectId).catch(() => null);
  if (!view) return null;

  const dto: ThreadDto = {
    kind,
    subjectId,
    label: view.label,
    locked: view.locked,
    canPost: view.canPost,
    readOnlyReason: view.readOnlyReason,
    members: view.members,
    messages: view.messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      deleted: !!m.deletedAt,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderPhoto: m.sender.playerProfile?.photoUrl ?? null,
      reportedByMe: m.reports.some((r) => r.reporterId === actor.id),
    })),
    path,
  };

  return (
    <section>
      <SectionHeader
        title="Group chat"
        action={
          <Badge tone="neutral" dot>
            {view.messages.length} message{view.messages.length === 1 ? "" : "s"}
          </Badge>
        }
      />
      <Card>
        {view.messages.length === 0 && !view.canPost ? (
          <p className="flex items-center gap-2 text-body-sm text-fg-muted">
            <MessageSquare className="size-4 shrink-0" />
            {view.readOnlyReason ?? "The chat opens once the lineup is set."}
          </p>
        ) : (
          <Thread thread={dto} meId={actor.id} />
        )}
      </Card>
    </section>
  );
}
