"use client";

import { useState } from "react";
import { Filter, Plus, Swords, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Chip } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LevelBadge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { MatchCard, PlayerCard } from "@/components/patterns/cards";
import { locations, matches, players, type Match } from "@/data/mock";
import { LEVELS, type Level } from "@/lib/tokens";

type Mode = "all" | Match["mode"];
type View = "open" | "players" | "requests";

export default function PlayPage() {
  const { toast } = useToast();
  const [view, setView] = useState<View>("open");
  const [mode, setMode] = useState<Mode>("all");
  const [level, setLevel] = useState<Level | null>(null);
  const [todayOnly, setTodayOnly] = useState(false);
  const [requested, setRequested] = useState<string[]>([]);
  const [create, setCreate] = useState(false);
  const [newMode, setNewMode] = useState<Match["mode"]>("Solo");
  const [newLevels, setNewLevels] = useState<Level[]>(["B"]);

  const list = matches.filter(
    (m) => m.status !== "completed" && (mode === "all" || m.mode === mode) && (!level || m.levels.includes(level)) && (!todayOnly || m.date === "Today"),
  );
  const nearby = players.filter((p) => p.id !== "p-me").slice(0, 5);

  function request(m: Match) {
    setRequested((r) => [...r, m.id]);
    toast({ tone: "success", title: "Join request sent", description: `${m.title} · waiting for organiser approval.` });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Matchmaking"
        title="Find a match"
        action={
          <Button size="sm" leftIcon={<Plus />} onClick={() => setCreate(true)}>
            Create
          </Button>
        }
      />

      <Tabs
        variant="pill"
        fullWidth
        value={mode}
        onChange={setMode}
        items={[
          { value: "all", label: "All" },
          { value: "Solo", label: "Solo" },
          { value: "Pair", label: "Pair" },
          { value: "3+1", label: "3 + 1" },
        ]}
      />

      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        <Chip icon={<Filter />} selected={todayOnly} onClick={() => setTodayOnly(!todayOnly)}>
          Today
        </Chip>
        {LEVELS.map((l) => (
          <Chip key={l} selected={level === l} onClick={() => setLevel(level === l ? null : l)}>
            Level {l}
          </Chip>
        ))}
      </div>

      <Tabs
        className="mt-5"
        value={view}
        onChange={setView}
        items={[
          { value: "open", label: "Open sessions", icon: <Swords />, count: list.length },
          { value: "players", label: "Players", icon: <Users /> },
          { value: "requests", label: "My requests", count: requested.length },
        ]}
      />

      <div className="mt-4 space-y-3">
        {view === "open" &&
          (list.length ? (
            list.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                action={
                  m.status === "open" ? (
                    requested.includes(m.id) ? (
                      <StatusBadge status="pending" />
                    ) : (
                      <Button size="sm" onClick={() => request(m)}>
                        Request to join
                      </Button>
                    )
                  ) : undefined
                }
              />
            ))
          ) : (
            <EmptyState
              icon={<Swords />}
              title="No sessions match your filters"
              description="Try another level or open your own session and let players come to you."
              action={
                <Button leftIcon={<Plus />} onClick={() => setCreate(true)}>
                  Create a session
                </Button>
              }
              secondaryAction={
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLevel(null);
                    setTodayOnly(false);
                    setMode("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ))}

        {view === "players" &&
          nearby.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              compact
              action={
                <Button size="sm" variant="secondary" leftIcon={<UserPlus />} onClick={() => toast({ title: `Invite sent to ${p.name.split(" ")[0]}` })}>
                  Invite
                </Button>
              }
            />
          ))}

        {view === "requests" &&
          (requested.length ? (
            matches
              .filter((m) => requested.includes(m.id))
              .map((m) => <MatchCard key={m.id} match={m} action={<StatusBadge status="pending" />} />)
          ) : (
            <EmptyState compact icon={<UserPlus />} title="No pending requests" description="Sessions you ask to join will appear here until the organiser responds." />
          ))}
      </div>

      <Modal
        open={create}
        onClose={() => setCreate(false)}
        title="Create a session"
        description="Open a court and let HITTERS complete the four."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setCreate(false);
                toast({ tone: "success", title: "Session published", description: "We'll notify matching players nearby." });
              }}
            >
              Publish session
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Location">
            {(id) => <Select id={id} placeholder="Choose a club" options={locations.map((l) => ({ value: l.slug, label: l.name }))} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">{(id) => <Input id={id} type="date" />}</Field>
            <Field label="Time">{(id) => <Input id={id} type="time" defaultValue="19:00" />}</Field>
          </div>
          <Field label="I'm joining as" hint="Pair keeps you on the same side; 3+1 finds one more player.">
            {() => (
              <Tabs
                variant="pill"
                fullWidth
                value={newMode}
                onChange={setNewMode}
                items={[
                  { value: "Solo", label: "Solo" },
                  { value: "Pair", label: "Pair" },
                  { value: "3+1", label: "3 + 1" },
                ]}
              />
            )}
          </Field>
          <Field label="Levels welcome">
            {() => (
              <div className="flex gap-2">
                {LEVELS.map((l) => {
                  const on = newLevels.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setNewLevels(on ? newLevels.filter((x) => x !== l) : [...newLevels, l])}
                      className={`rounded-md border p-1 transition-all ${on ? "border-blue-400/60 shadow-glow-sm" : "border-line/10 opacity-50 hover:opacity-100"}`}
                    >
                      <LevelBadge level={l} size="lg" />
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
          <Field label="Session type">
            {(id) => (
              <Select
                id={id}
                defaultValue="Competitive"
                options={[
                  { value: "Friendly", label: "Friendly" },
                  { value: "Competitive", label: "Competitive" },
                  { value: "Training", label: "Training" },
                ]}
              />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}
