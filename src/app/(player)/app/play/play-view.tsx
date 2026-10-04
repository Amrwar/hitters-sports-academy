"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { Check, Compass, Inbox, Plus, Search, Swords, Users, X } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { GameCard } from "@/components/patterns/game-card";
import { MatchReasons, MatchStrength, RequestStatusBadge } from "@/components/patterns/match-reasons";
import { formatInZone } from "@/lib/time";
import type { GameView } from "@/server/services/game-sessions";
import type { Recommendation, RequestView } from "@/server/services/matchmaking";
import type { PairView } from "@/server/services/pairs";
import { respondToInviteAction } from "@/server/actions/game-sessions";
import { decideRequestAction, withdrawRequestAction } from "@/server/actions/matchmaking";

type Tab = "foryou" | "games" | "requests";
type Props = {
  viewerId: string;
  viewerLevel: PlayerLevel | null;
  levelLabels: Record<string, string>;
  initialTab: Tab;
  mine: GameView[];
  recommended: Recommendation[];
  nearMisses: { game: GameView; blockers: string[] }[];
  incoming: RequestView[];
  outgoing: RequestView[];
  pairs: PairView[];
};

export function PlayView({ viewerId, viewerLevel, levelLabels, initialTab, mine, recommended, nearMisses, incoming, outgoing, pairs }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);

  const invitations = mine.filter((g) => g.participants.some((p) => p.userId === viewerId && p.status === "INVITED"));
  const games = mine.filter((g) => !invitations.includes(g));
  const openOutgoing = outgoing.filter((r) => r.status === "PENDING" || r.status === "WAITLISTED");
  const pendingPairs = pairs.filter((p) => p.status === "PENDING" && p.createdById !== viewerId);
  const attention = invitations.length + incoming.length + pendingPairs.length;

  async function act(key: string, label: string, fn: () => Promise<{ ok: boolean; message?: string; code?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast({ tone: "success", title: label });
    else toast({ tone: "danger", title: res.code === "SESSION_FULL" ? "No room left" : "That did not go through", description: res.message });
    router.refresh();
    return res.ok;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Matchmaking"
        title="Play"
        action={
          <Button size="sm" leftIcon={<Plus />} href="/app/play/new">
            New game
          </Button>
        }
      />

      <Tabs
        variant="pill"
        fullWidth
        value={tab}
        onChange={setTab}
        items={[
          { value: "foryou", label: "For you", count: recommended.length },
          { value: "games", label: "My games", count: games.length + invitations.length },
          { value: "requests", label: "Requests", count: attention + openOutgoing.length },
        ]}
      />

      {tab === "foryou" && (
        <div className="mt-5 space-y-6">
          <Card variant="brand" padding="md" className="court-line">
            <div className="relative flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-white/15">
                <Search size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-h4">Find a match</div>
                <div className="text-body-sm text-white/80">Pick a date, time and clubs. We rank every open game for your level and explain why.</div>
              </div>
              <Button variant="secondary" size="sm" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" href="/app/play/find">
                Search
              </Button>
            </div>
          </Card>

          {!viewerLevel && (
            <Card variant="outline" padding="md" className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-fg-muted">Matchmaking needs your official level. Request an assessment to unlock recommendations.</span>
              <Button size="sm" variant="secondary" href="/app/profile?tab=assessment">
                Get assessed
              </Button>
            </Card>
          )}

          <section>
            <SectionHeader eyebrow="Recommended" title={viewerLevel ? `Open games for Level ${viewerLevel}` : "Open games"} action={<Button variant="link" size="sm" href="/app/play/find">Refine</Button>} />
            {recommended.length ? (
              <div className="space-y-3">
                {recommended.map(({ game, match }) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    viewerId={viewerId}
                    href={`/app/play/${game.code}`}
                    action={<MatchStrength score={match.score} />}
                    footer={<MatchReasons reasons={match.reasons} compact />}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Compass />}
                title="Nothing matches you right now"
                description={nearMisses.length ? `${nearMisses.length} game${nearMisses.length === 1 ? "" : "s"} nearby did not fit: ${nearMisses[0].blockers[0]}` : "Organizers open their spare spots here. Try a search with other days, or open your own game."}
                action={
                  <Button leftIcon={<Plus />} href="/app/play/new">
                    Open a game
                  </Button>
                }
                secondaryAction={
                  <Button variant="ghost" leftIcon={<Search />} href="/app/play/find">
                    Search by date
                  </Button>
                }
              />
            )}
          </section>

          <section>
            <SectionHeader eyebrow="Pairs" title="Play as a pair" action={<Button variant="link" size="sm" href="/app/play/pairs">Manage</Button>} />
            {pairs.filter((p) => p.status === "ACTIVE").length ? (
              <div className="flex flex-wrap gap-2">
                {pairs
                  .filter((p) => p.status === "ACTIVE")
                  .map((p) => {
                    const partner = p.playerAId === viewerId ? p.playerB : p.playerA;
                    return (
                      <Card key={p.id} padding="sm" className="flex items-center gap-2">
                        <Avatar name={partner.name} size="xs" />
                        <span className="text-body-sm font-semibold">{p.name?.trim() || `with ${partner.name.split(" ")[0]}`}</span>
                        {partner.playerProfile?.level && <LevelBadge level={partner.playerProfile.level} size="sm" label={levelLabels[partner.playerProfile.level]} />}
                      </Card>
                    );
                  })}
              </div>
            ) : (
              <Card variant="outline" padding="md" className="flex items-center justify-between gap-3">
                <span className="text-body-sm text-fg-muted">Team up with a regular partner to request two spots at once or challenge another pair.</span>
                <Button size="sm" variant="secondary" leftIcon={<Users />} href="/app/play/pairs">
                  Create a pair
                </Button>
              </Card>
            )}
          </section>
        </div>
      )}

      {tab === "games" && (
        <div className="mt-5 space-y-6">
          {invitations.length > 0 && (
            <section>
              <div className="mb-2 text-overline uppercase text-blue-300">Invitations</div>
              <div className="space-y-3">
                {invitations.map((g) => (
                  <GameCard
                    key={g.id}
                    game={g}
                    viewerId={viewerId}
                    href={`/app/play/${g.code}`}
                    action={
                      <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
                        <Button size="sm" variant="secondary" leftIcon={<X />} loading={busy === g.id} onClick={() => act(g.id, "Invitation declined", () => respondToInviteAction(g.id, "DECLINE"))}>
                          No
                        </Button>
                        <Button size="sm" leftIcon={<Check />} loading={busy === g.id} onClick={() => act(g.id, "You're in", () => respondToInviteAction(g.id, "ACCEPT"))}>
                          I&apos;m in
                        </Button>
                      </div>
                    }
                  />
                ))}
              </div>
            </section>
          )}
          <section>
            {invitations.length > 0 && <div className="mb-2 text-overline uppercase text-blue-300">Upcoming</div>}
            {games.length ? (
              <div className="space-y-3">
                {games.map((g) => (
                  <GameCard key={g.id} game={g} viewerId={viewerId} href={`/app/play/${g.code}`} action={g.organizerId === viewerId && g.pendingRequests > 0 ? <Badge tone="warning" dot>{g.pendingRequests} request{g.pendingRequests === 1 ? "" : "s"}</Badge> : undefined} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Swords />} title="No games yet" description="Book a court, invite your friends and open the remaining spots to compatible players." action={<Button leftIcon={<Plus />} href="/app/play/new">Organize a game</Button>} />
            )}
          </section>
        </div>
      )}

      {tab === "requests" && (
        <div className="mt-5 space-y-6">
          <section>
            <SectionHeader eyebrow="To your games" title="Players asking to join" />
            {incoming.length ? (
              <div className="space-y-3">
                {incoming.map((r) => {
                  const members = r.pair ? [r.pair.playerA, r.pair.playerB] : [r.user];
                  const fits = r.game.spotsLeft >= r.spots;
                  return (
                    <Card key={r.id} padding="md">
                      <div className="flex items-start gap-3">
                        <div className="flex -space-x-2">
                          {members.map((m) => (
                            <Avatar key={m.id} name={m.name} size="sm" className="rounded-full ring-2 ring-surface-1" />
                          ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-body-sm font-bold">{members.map((m) => m.name.split(" ")[0]).join(" & ")}</span>
                            {members.map((m) => m.playerProfile?.level && <LevelBadge key={m.id} level={m.playerProfile.level} size="sm" label={levelLabels[m.playerProfile.level]} />)}
                            <RequestStatusBadge status={r.status} />
                          </div>
                          <div className="text-caption text-fg-muted">
                            {r.kind === "PAIR" ? "Pair · 2 spots" : "Solo · 1 spot"} · {r.game.description?.trim() || r.game.code} · {formatInZone(new Date(r.game.startsAt), r.game.location.timezone)}
                          </div>
                          <MatchReasons reasons={r.reasons} compact className="mt-2" />
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="ghost" href={`/app/play/${r.game.code}`}>
                          Review
                        </Button>
                        <span className="flex-1" />
                        <Button size="sm" variant="secondary" leftIcon={<X />} loading={busy === r.id} onClick={() => act(r.id, "Request declined", () => decideRequestAction(r.id, { decision: "DECLINE" }))}>
                          Decline
                        </Button>
                        <Button size="sm" leftIcon={<Check />} loading={busy === r.id} disabled={!fits} title={fits ? undefined : "Not enough spots"} onClick={() => act(r.id, r.kind === "PAIR" ? "Pair accepted" : "Player accepted", () => decideRequestAction(r.id, { decision: "ACCEPT" }))}>
                          {r.kind === "PAIR" ? "Accept both" : "Accept"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card variant="outline" padding="md" className="text-body-sm text-fg-muted">
                No one is waiting on your games. Open spots to requests from a game page to let compatible players ask.
              </Card>
            )}
          </section>

          {pendingPairs.length > 0 && (
            <section>
              <SectionHeader eyebrow="Pairs" title="Pair invitations" action={<Button variant="link" size="sm" href="/app/play/pairs">Manage</Button>} />
              <div className="space-y-2">
                {pendingPairs.map((p) => {
                  const partner = p.playerAId === viewerId ? p.playerB : p.playerA;
                  return (
                    <Card key={p.id} padding="sm" className="flex items-center gap-3">
                      <Avatar name={partner.name} size="sm" />
                      <span className="min-w-0 flex-1 text-body-sm">
                        <span className="font-bold">{partner.name}</span> wants to play as a pair{p.name ? ` (${p.name})` : ""}.
                      </span>
                      <Button size="sm" variant="secondary" href="/app/play/pairs">
                        Respond
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <SectionHeader eyebrow="My requests" title="Games I asked to join" />
            {outgoing.length ? (
              <div className="space-y-3">
                {outgoing.map((r) => (
                  <Card key={r.id} padding="md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-sm font-bold">{r.game.description?.trim() || `${r.game.organizer.name.split(" ")[0]}'s game`}</span>
                          <RequestStatusBadge status={r.status} />
                          {r.kind === "PAIR" && (
                            <Badge size="sm" tone="info">
                              Pair
                            </Badge>
                          )}
                        </div>
                        <div className="text-caption text-fg-muted">
                          {formatInZone(new Date(r.game.startsAt), r.game.location.timezone)} · {r.game.location.name.replace("HITTERS ", "")} · {r.game.code}
                        </div>
                        <MatchReasons reasons={r.reasons} compact className="mt-2" />
                        {r.decisionNote && <p className="mt-1 text-caption text-fg-subtle">Organizer: {r.decisionNote}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Button size="sm" variant="ghost" href={`/app/play/${r.game.code}`}>
                          Open
                        </Button>
                        {(r.status === "PENDING" || r.status === "WAITLISTED") && (
                          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" loading={busy === r.id} onClick={() => act(r.id, "Request withdrawn", () => withdrawRequestAction(r.id))}>
                            Withdraw
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState compact icon={<Inbox />} title="No requests yet" description="Games you ask to join appear here with the organizer's answer." action={<Button size="sm" leftIcon={<Search />} href="/app/play/find">Find a match</Button>} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
