"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PlayerPicker, type PickedPlayer } from "@/components/patterns/player-picker";
import type { PairView } from "@/server/services/pairs";
import { dissolvePairAction, proposePairAction, respondToPairAction } from "@/server/actions/matchmaking";
import { label } from "@/lib/catalog";

export function PairsView({ viewerId, pairs, levelLabels }: { viewerId: string; pairs: PairView[]; levelLabels: Record<string, string> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [create, setCreate] = useState(false);
  const [partner, setPartner] = useState<PickedPlayer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dissolve, setDissolve] = useState<PairView | null>(null);

  const active = pairs.filter((p) => p.status === "ACTIVE");
  const incoming = pairs.filter((p) => p.status === "PENDING" && p.createdById !== viewerId);
  const sent = pairs.filter((p) => p.status === "PENDING" && p.createdById === viewerId);
  const other = (p: PairView) => (p.playerAId === viewerId ? p.playerB : p.playerA);

  async function act(key: string, label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast({ tone: "success", title: label });
    else toast({ tone: "danger", title: "That did not go through", description: res.message });
    router.refresh();
    return res.ok;
  }

  async function propose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!partner[0]) return;
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    const ok = await act("create", "Pair proposed", () => proposePairAction({ partnerUserId: partner[0].id, name: name || undefined }));
    if (ok) {
      setCreate(false);
      setPartner([]);
    }
  }

  const PairRow = ({ p, actions }: { p: PairView; actions: React.ReactNode }) => {
    const o = other(p);
    return (
      <Card padding="sm" className="flex items-center gap-3">
        <Avatar name={o.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-body-sm font-bold">{p.name?.trim() || `You & ${o.name.split(" ")[0]}`}</span>
            {o.playerProfile?.level ? <LevelBadge level={o.playerProfile.level} size="sm" label={levelLabels[o.playerProfile.level]} /> : <Badge size="sm">No level yet</Badge>}
          </div>
          <div className="text-caption text-fg-muted">
            {o.name}
            {o.playerProfile?.side ? ` · ${label("side", o.playerProfile.side)}` : ""}
          </div>
        </div>
        {actions}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader back="/app/play" eyebrow="Matchmaking" title="My pairs" action={<Button size="sm" leftIcon={<Plus />} onClick={() => setCreate(true)}>New pair</Button>} />

      <Card variant="brand" padding="md" className="court-line">
        <div className="relative text-body-sm text-white/85">
          A pair is two players who join together. Request both spots of a game at once, or open a challenge for another pair to take on. Both players must confirm, and a pair is never split.
        </div>
      </Card>

      {incoming.length > 0 && (
        <section>
          <SectionHeader eyebrow="Waiting for you" title="Pair invitations" />
          <div className="space-y-2">
            {incoming.map((p) => (
              <PairRow
                key={p.id}
                p={p}
                actions={
                  <div className="flex gap-1">
                    <IconButton variant="secondary" size="sm" label="Decline" onClick={() => act(p.id, "Pair declined", () => respondToPairAction(p.id, "DECLINE"))}>
                      <X />
                    </IconButton>
                    <IconButton variant="primary" size="sm" label="Confirm pair" onClick={() => act(p.id, "Pair confirmed", () => respondToPairAction(p.id, "ACCEPT"))}>
                      <Check />
                    </IconButton>
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader eyebrow="Confirmed" title="Active pairs" />
        {active.length ? (
          <div className="space-y-2">
            {active.map((p) => (
              <PairRow
                key={p.id}
                p={p}
                actions={
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" href={`/app/play/find?pair=${p.id}`}>
                      Find a match
                    </Button>
                    <IconButton variant="ghost" size="sm" label="End pair" onClick={() => setDissolve(p)}>
                      <X />
                    </IconButton>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={<Users />} title="No pairs yet" description="Invite a regular partner. Once they confirm you can request two spots together." action={<Button size="sm" leftIcon={<Plus />} onClick={() => setCreate(true)}>Propose a pair</Button>} />
        )}
      </section>

      {sent.length > 0 && (
        <section>
          <SectionHeader eyebrow="Sent" title="Awaiting confirmation" />
          <div className="space-y-2">
            {sent.map((p) => (
              <PairRow key={p.id} p={p} actions={<Button size="sm" variant="ghost" loading={busy === p.id} onClick={() => act(p.id, "Proposal withdrawn", () => dissolvePairAction(p.id))}>Withdraw</Button>} />
            ))}
          </div>
        </section>
      )}

      <Modal open={create} onClose={() => setCreate(false)} title="Propose a pair" description="Your partner confirms from their Play tab. Nothing is sent to organizers until then.">
        <form onSubmit={propose} className="space-y-4 pb-2">
          <Field label="Partner">{() => <PlayerPicker value={partner} onChange={setPartner} max={1} />}</Field>
          <Field label="Pair name (optional)">{(id) => <Input id={id} name="name" maxLength={60} placeholder="The Lobs" />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!partner[0]} loading={busy === "create"}>
              Send proposal
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!dissolve}
        onClose={() => setDissolve(null)}
        title="End this pair?"
        description="Open pair requests are withdrawn. Games you already joined are not affected."
        confirmLabel="End pair"
        tone="danger"
        loading={!!dissolve && busy === dissolve.id}
        onConfirm={async () => {
          if (!dissolve) return;
          const ok = await act(dissolve.id, "Pair ended", () => dissolvePairAction(dissolve.id));
          if (ok) setDissolve(null);
        }}
      />
    </div>
  );
}
