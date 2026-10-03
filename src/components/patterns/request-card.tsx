"use client";

import { useState } from "react";
import type { PlayerLevel } from "@prisma/client";
import { Check, History, Users, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { MatchReasons, RequestStatusBadge } from "@/components/patterns/match-reasons";
import type { RequestReview } from "@/server/services/matchmaking";

type Props = {
  request: RequestReview;
  levels: Record<string, string>;
  spotsLeft: number;
  onDecide: (requestId: string, decision: "ACCEPT" | "DECLINE", note?: string) => Promise<boolean>;
  busy?: boolean;
};

/** Organizer's review card: who is asking, their level, the spots they need, compatibility now, and history. */
export function RequestReviewCard({ request: r, levels, spotsLeft, onDecide, busy }: Props) {
  const [decline, setDecline] = useState(false);
  const open = r.status === "PENDING" || r.status === "WAITLISTED";
  const fits = spotsLeft >= r.spots;
  return (
    <Card padding="md" className={open ? "" : "opacity-70"}>
      <div className="flex items-start gap-3">
        <div className="flex -space-x-2">
          {r.members.map((m) => (
            <Avatar key={m.id} name={m.name} size="md" className="rounded-full ring-2 ring-surface-1" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-bold">{r.members.map((m) => m.name).join(" & ")}</span>
            {r.members.map((m) => m.level && <LevelBadge key={m.id} level={m.level as PlayerLevel} size="sm" label={levels[m.level]} />)}
            <RequestStatusBadge status={r.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-fg-muted">
            <span className="flex items-center gap-1">
              <Users size={12} /> {r.kind === "PAIR" ? `Pair · ${r.pair?.name?.trim() || "both spots"}` : "Solo · 1 spot"}
            </span>
            {r.members.map((m) => m.side && <span key={m.id}>{m.name.split(" ")[0]}: {m.side.toLowerCase()} side</span>)}
            {r.user.playerProfile?.yearsPlaying != null && <span>{r.user.playerProfile.yearsPlaying} yrs</span>}
            <span className="flex items-center gap-1">
              <History size={12} /> {r.playedTogether === null ? "History private" : r.playedTogether === 0 ? "First game together" : `${r.playedTogether} game${r.playedTogether === 1 ? "" : "s"} together`}
            </span>
          </div>
        </div>
      </div>
      {r.message && <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-body-sm text-fg-muted">&ldquo;{r.message}&rdquo;</p>}
      <div className="mt-3">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">Compatibility now</div>
        {r.current.eligible || r.current.blockers.every((b) => b.startsWith("The game is full")) ? (
          <MatchReasons reasons={r.current.reasons} compact />
        ) : (
          <Badge tone="danger" size="sm">
            {r.current.blockers[0]}
          </Badge>
        )}
      </div>
      {r.decisionNote && <p className="mt-2 text-caption text-fg-subtle">Note: {r.decisionNote}</p>}
      {open && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="secondary" leftIcon={<X />} className="flex-1" disabled={busy} onClick={() => setDecline(true)}>
            Decline
          </Button>
          <Button size="sm" leftIcon={<Check />} className="flex-1" loading={busy} disabled={!fits} title={fits ? undefined : `Needs ${r.spots} spot${r.spots === 1 ? "" : "s"}, ${spotsLeft} left`} onClick={() => onDecide(r.id, "ACCEPT")}>
            {fits ? (r.kind === "PAIR" ? "Accept both" : "Accept") : "No room"}
          </Button>
        </div>
      )}
      <Modal open={decline} onClose={() => setDecline(false)} title="Decline this request?" description="They are notified. A short reason is kinder." size="sm">
        <form
          className="space-y-4 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") ?? "");
            const ok = await onDecide(r.id, "DECLINE", note || undefined);
            if (ok) setDecline(false);
          }}
        >
          <Field label="Reason (optional)">{(id) => <Textarea id={id} name="note" maxLength={300} placeholder="Keeping the regulars this week" />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDecline(false)}>
              Keep
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Decline
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
