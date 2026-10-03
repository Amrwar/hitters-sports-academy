"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { CalendarDays, Compass, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { TimeSelect } from "@/components/ui/time-select";
import { Chip } from "@/components/ui/misc";
import { LevelBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { GameCard } from "@/components/patterns/game-card";
import { MatchReasons, MatchStrength } from "@/components/patterns/match-reasons";
import { addDaysISO, todayISO } from "@/lib/time";
import type { FindResult, Recommendation } from "@/server/services/matchmaking";
import { findMatchesAction, requestToJoinAction } from "@/server/actions/matchmaking";

type Props = {
  viewerId: string;
  viewerLevel: PlayerLevel | null;
  levelLabel: string;
  locations: { id: string; name: string; timezone: string }[];
  defaultLocationIds: string[];
  pairs: { id: string; label: string }[];
};

const DAY_LABEL = (iso: string, tz: string) => {
  const today = todayISO(tz);
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, 1)) return "Tomorrow";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en", { weekday: "short", day: "numeric", timeZone: "UTC" });
};

export function FindMatchView({ viewerId, viewerLevel, levelLabel, locations, defaultLocationIds, pairs }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const tz = locations[0]?.timezone ?? "Africa/Cairo";
  const [dateISO, setDateISO] = useState<string | null>(null);
  const [from, setFrom] = useState(17 * 60);
  const [to, setTo] = useState(22 * 60);
  const [anyTime, setAnyTime] = useState(true);
  const [locationIds, setLocationIds] = useState<string[]>(defaultLocationIds);
  const [kind, setKind] = useState<"SOLO" | "PAIR">("SOLO");
  const [pairId, setPairId] = useState<string>(pairs[0]?.id ?? "");
  const [result, setResult] = useState<FindResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<Recommendation | null>(null);
  const [busy, setBusy] = useState(false);

  const days = Array.from({ length: 10 }, (_, i) => addDaysISO(todayISO(tz), i));

  function search() {
    setError(null);
    startTransition(async () => {
      const res = await findMatchesAction({ dateISO: dateISO ?? undefined, startMinutes: anyTime ? undefined : from, endMinutes: anyTime ? undefined : to, locationIds, kind, pairId: kind === "PAIR" ? pairId || undefined : undefined });
      if (res.ok) setResult(res.data);
      else setError(res.message);
    });
  }

  // First results without touching anything: the player's own defaults.
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!requesting) return;
    const message = String(new FormData(e.currentTarget).get("message") ?? "");
    setBusy(true);
    const res = await requestToJoinAction(requesting.game.id, { kind, pairId: kind === "PAIR" ? pairId : undefined, message: message || undefined });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: res.data.status === "WAITLISTED" ? "Added to the waitlist" : "Request sent", description: "The organizer decides who joins. Track it under Play › Requests." });
      setRequesting(null);
      router.push(`/app/play/${requesting.game.code}`);
    } else toast({ tone: "danger", title: res.code === "NOT_ELIGIBLE" ? "Not eligible" : "Could not send", description: res.message });
  }

  return (
    <div>
      <PageHeader back="/app/play" eyebrow="Matchmaking" title="Find a match" action={viewerLevel ? <LevelBadge level={viewerLevel} size="md" label={levelLabel} /> : undefined} />

      {!viewerLevel && (
        <Alert tone="warning" title="You need an official level" className="mb-4" action={<Button size="sm" variant="secondary" href="/app/profile?tab=assessment">Request assessment</Button>}>
          Matchmaking ranks games by official level. Get assessed at any club and come back.
        </Alert>
      )}

      <Card padding="md" className="space-y-4">
        <div>
          <div className="mb-2 text-body-sm font-semibold text-fg-muted">Day</div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            <Chip icon={<CalendarDays />} selected={dateISO === null} onClick={() => setDateISO(null)}>
              Any day
            </Chip>
            {days.map((d) => (
              <Chip key={d} selected={dateISO === d} onClick={() => setDateISO(d)}>
                {DAY_LABEL(d, tz)}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-body-sm font-semibold text-fg-muted">
            <span>Time window</span>
            <button type="button" className="text-caption font-semibold text-blue-300" onClick={() => setAnyTime(!anyTime)}>
              {anyTime ? "Set a window" : "Any time"}
            </button>
          </div>
          {!anyTime && (
            <div className="grid grid-cols-2 gap-2">
              <TimeSelect value={from} onChange={(v) => setFrom(Math.min(v, to))} min={6 * 60} max={23 * 60} aria-label="From" />
              <TimeSelect value={to} onChange={(v) => setTo(Math.max(v, from))} min={6 * 60} max={24 * 60} aria-label="To" />
            </div>
          )}
          {anyTime && <div className="text-caption text-fg-subtle">Your preferred times from your profile boost the ranking.</div>}
        </div>
        <div>
          <div className="mb-2 text-body-sm font-semibold text-fg-muted">Clubs</div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            {locations.map((l) => {
              const on = locationIds.includes(l.id);
              return (
                <Chip key={l.id} selected={on} onClick={() => setLocationIds(on ? locationIds.filter((x) => x !== l.id) : [...locationIds, l.id])}>
                  {l.name}
                </Chip>
              );
            })}
          </div>
          <div className="mt-1 text-caption text-fg-subtle">Selected clubs rank first; other clubs still show so you never miss a game.</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Looking for">
            {() => (
              <Tabs
                variant="pill"
                fullWidth
                value={kind}
                onChange={setKind}
                items={[
                  { value: "SOLO", label: "One spot (solo)" },
                  { value: "PAIR", label: "Two spots (pair)", disabled: pairs.length === 0 },
                ]}
              />
            )}
          </Field>
          {kind === "PAIR" && <Field label="Pair">{(id) => <Select id={id} value={pairId} onChange={(e) => setPairId(e.target.value)} options={pairs.map((p) => ({ value: p.id, label: p.label }))} />}</Field>}
        </div>
        {pairs.length === 0 && (
          <div className="text-caption text-fg-subtle">
            <a href="/app/play/pairs" className="font-semibold text-blue-300">
              Create a pair
            </a>{" "}
            to request two spots at once or take on a challenge.
          </div>
        )}
        <Button size="lg" fullWidth leftIcon={<Search />} loading={pending} onClick={search} disabled={!viewerLevel}>
          Find matches
        </Button>
      </Card>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      <section className="mt-6">
        {pending && !result && <LoadingState label="Ranking open games" />}
        {result && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-overline uppercase text-blue-300">{result.items.length} match{result.items.length === 1 ? "" : "es"}</div>
              {result.seeker.adjacentAllowed && <span className="text-caption text-fg-subtle">Adjacent levels allowed by the academy</span>}
            </div>
            {result.items.length ? (
              <div className={`space-y-4 ${pending ? "opacity-60" : ""}`}>
                {result.items.map((rec) => (
                  <div key={rec.game.id} className="space-y-2">
                    <GameCard game={rec.game} viewerId={viewerId} href={`/app/play/${rec.game.code}`} action={<MatchStrength score={rec.match.score} />} />
                    <div className="flex items-start justify-between gap-3 px-1">
                      <MatchReasons reasons={rec.match.reasons} compact />
                      <Button size="sm" leftIcon={kind === "PAIR" ? <Users /> : undefined} onClick={() => setRequesting(rec)}>
                        {kind === "PAIR" ? "Request both spots" : "Request to join"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Compass />}
                title="No open games fit"
                description={result.nearMisses.length ? `Close but blocked: ${result.nearMisses[0].blockers[0]}` : "Try another day or any time, or open your own game and let players come to you."}
                action={<Button href="/app/play/new">Open a game</Button>}
              />
            )}
            {result.nearMisses.length > 0 && result.items.length > 0 && (
              <details className="mt-4 text-caption text-fg-subtle">
                <summary className="cursor-pointer">{result.nearMisses.length} game{result.nearMisses.length === 1 ? "" : "s"} hidden, and why</summary>
                <ul className="mt-2 space-y-1">
                  {result.nearMisses.map((n) => (
                    <li key={n.game.id} className="flex justify-between gap-3">
                      <span className="truncate">{n.game.description?.trim() || n.game.code}</span>
                      <span className="shrink-0">{n.blockers[0]}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <Modal open={!!requesting} onClose={() => setRequesting(null)} title={kind === "PAIR" ? "Request both spots" : "Request to join"} description={requesting ? `${requesting.game.description?.trim() || requesting.game.code} · the organizer reviews your profile and level before accepting.` : ""} size="sm">
        {requesting && (
          <form onSubmit={sendRequest} className="space-y-4 pb-2">
            <MatchReasons reasons={requesting.match.reasons} />
            <Field label="Message to the organizer (optional)">{(id) => <Textarea id={id} name="message" maxLength={300} placeholder="Left side, steady, happy to split the court" />}</Field>
            <Input type="hidden" name="kind" value={kind} readOnly />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRequesting(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Send request
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
