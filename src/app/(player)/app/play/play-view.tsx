"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { Check, Compass, Filter, Plus, Swords, X } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Chip } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { GameCard } from "@/components/patterns/game-card";
import { LEVELS } from "@/lib/tokens";
import { todayISO } from "@/lib/time";
import type { GameView } from "@/server/services/game-sessions";
import { discoverGamesAction, respondToInviteAction } from "@/server/actions/game-sessions";

type Props = {
  viewerId: string;
  viewerLevel: PlayerLevel | null;
  initialTab: "mine" | "discover";
  mine: GameView[];
  open: GameView[];
  locations: { id: string; name: string; timezone: string }[];
};

export function PlayView({ viewerId, viewerLevel, initialTab, mine, open, locations }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<"mine" | "discover">(initialTab);
  const [level, setLevel] = useState<PlayerLevel | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [today, setToday] = useState(false);
  const [list, setList] = useState<GameView[]>(open);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const invitations = mine.filter((g) => g.participants.some((p) => p.userId === viewerId && p.status === "INVITED"));
  const games = mine.filter((g) => !invitations.includes(g));

  function refilter(next: { level?: PlayerLevel | null; locationId?: string | null; today?: boolean }) {
    const l = next.level === undefined ? level : next.level;
    const loc = next.locationId === undefined ? locationId : next.locationId;
    const t = next.today === undefined ? today : next.today;
    setLevel(l);
    setLocationId(loc);
    setToday(t);
    startTransition(async () => {
      const tz = locations.find((x) => x.id === loc)?.timezone ?? locations[0]?.timezone ?? "Africa/Cairo";
      const res = await discoverGamesAction({ level: l ?? undefined, locationId: loc ?? undefined, dateISO: t ? todayISO(tz) : undefined });
      if (res.ok) setList(res.data);
    });
  }

  async function respond(g: GameView, response: "ACCEPT" | "DECLINE") {
    setBusy(g.id);
    const res = await respondToInviteAction(g.id, response);
    setBusy(null);
    if (res.ok) toast({ tone: "success", title: response === "ACCEPT" ? "You're in" : "Invitation declined", description: response === "ACCEPT" ? `${res.data.acceptedCount} of ${res.data.maxPlayers} players confirmed.` : undefined });
    else toast({ tone: "danger", title: res.code === "SESSION_FULL" ? "Game is full" : "Could not respond", description: res.message });
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Games"
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
          { value: "mine", label: "My games", count: mine.length },
          { value: "discover", label: "Discover", count: list.length },
        ]}
      />

      {tab === "mine" && (
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
                        <Button size="sm" variant="secondary" leftIcon={<X />} loading={busy === g.id} onClick={() => respond(g, "DECLINE")}>
                          No
                        </Button>
                        <Button size="sm" leftIcon={<Check />} loading={busy === g.id} onClick={() => respond(g, "ACCEPT")}>
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
                  <GameCard key={g.id} game={g} viewerId={viewerId} href={`/app/play/${g.code}`} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Swords />}
                title="No games yet"
                description="Book a court, invite your friends and open the remaining spots to other players."
                action={
                  <Button leftIcon={<Plus />} href="/app/play/new">
                    Organize a game
                  </Button>
                }
                secondaryAction={
                  <Button variant="ghost" leftIcon={<Compass />} onClick={() => setTab("discover")}>
                    Discover open games
                  </Button>
                }
              />
            )}
          </section>
        </div>
      )}

      {tab === "discover" && (
        <div className="mt-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            <Chip icon={<Filter />} selected={today} onClick={() => refilter({ today: !today })}>
              Today
            </Chip>
            {viewerLevel && (
              <Chip selected={level === viewerLevel} onClick={() => refilter({ level: level === viewerLevel ? null : viewerLevel })}>
                My level
              </Chip>
            )}
            {LEVELS.map((l) => (
              <Chip key={l} selected={level === l} onClick={() => refilter({ level: level === l ? null : l })}>
                Level {l}
              </Chip>
            ))}
          </div>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            <Chip selected={locationId === null} onClick={() => refilter({ locationId: null })}>
              All clubs
            </Chip>
            {locations.map((l) => (
              <Chip key={l.id} selected={locationId === l.id} onClick={() => refilter({ locationId: locationId === l.id ? null : l.id })}>
                {l.name}
              </Chip>
            ))}
          </div>
          <div className={`mt-4 space-y-3 ${pending ? "opacity-60" : ""}`}>
            {list.length ? (
              list.map((g) => <GameCard key={g.id} game={g} viewerId={viewerId} href={`/app/play/${g.code}`} />)
            ) : (
              <EmptyState
                icon={<Compass />}
                title="No open games right now"
                description="Organizers open their spare spots here. Join requests arrive in the next release; until then ask the organizer for an invitation."
                action={
                  <Button leftIcon={<Plus />} href="/app/play/new">
                    Open your own
                  </Button>
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
