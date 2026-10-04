import Link from "next/link";
import { ChevronRight, GraduationCap, MessageSquare, Users } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyThreads } from "@/server/services/messaging";

export const metadata = { title: "Messages" };

const when = (d: Date | null) => (d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No messages yet");

export default async function MessagesPage() {
  const actor = await requireActorOrRedirect("/app/messages");
  const threads = await listMyThreads(actor);

  return (
    <div className="space-y-5">
      <PageHeader back="/app" title="Messages" />
      <p className="text-body-sm text-fg-muted">Every game you are playing and every program you are in has its own conversation. Nobody sees anyone else&apos;s phone number or email.</p>

      {threads.length === 0 && <EmptyState icon={<MessageSquare />} title="No conversations yet" description="Join a game or enroll in a program and its chat opens here." action={<Button href="/app/play/find">Find a game</Button>} />}

      <div className="space-y-2.5">
        {threads.map((t) => (
          <Link
            key={`${t.kind}:${t.subjectId}`}
            href={`${t.href}#chat`}
            className="flex items-center gap-3 rounded-lg border border-line/10 bg-surface-1 p-3.5 transition-colors hover:border-blue-400/40 hover:bg-surface-2"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-line/10 text-fg-muted [&_svg]:size-5">{t.kind === "GAME" ? <Users /> : <GraduationCap />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-body-sm font-bold text-fg">{t.label}</span>
                <span className="shrink-0 text-caption text-fg-subtle">{when(t.lastAt)}</span>
              </span>
              <span className="mt-0.5 block truncate text-body-sm text-fg-muted">{t.lastBody ? `${t.lastSender}: ${t.lastBody}` : "Start the conversation"}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
          </Link>
        ))}
      </div>
    </div>
  );
}
