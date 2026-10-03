"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { CalendarPlus, Check, MapPin } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { LevelBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { PlayerPicker, type PickedPlayer } from "@/components/patterns/player-picker";
import { GAME_COST_MODES, GAME_FORMATS, GAME_VISIBILITY, MATCH_TYPES } from "@/lib/catalog";
import { formatInZone } from "@/lib/time";
import { createGameAction } from "@/server/actions/game-sessions";

type BookingOption = { id: string; code: string; startsAt: string; endsAt: string; timezone: string; location: string; court: string; priceCents: number; currency: string; durationMinutes: number };

export function NewGameForm({ bookings, preselect, levels }: { bookings: BookingOption[]; preselect: string | null; levels: { level: PlayerLevel; label: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [bookingId, setBookingId] = useState<string | null>(bookings.find((b) => b.id === preselect)?.id ?? (bookings.length === 1 ? bookings[0].id : null));
  const [format, setFormat] = useState<"DOUBLES" | "SINGLES" | "OPEN">("DOUBLES");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [chosenLevels, setChosenLevels] = useState<PlayerLevel[]>([]);
  const [matchType, setMatchType] = useState("ANY");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [openToRequests, setOpenToRequests] = useState(false);
  const [costMode, setCostMode] = useState("SPLIT_EVENLY");
  const [costPerPlayer, setCostPerPlayer] = useState("");
  const [invites, setInvites] = useState<PickedPlayer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const booking = bookings.find((b) => b.id === bookingId) ?? null;
  const players = format === "OPEN" ? maxPlayers : (GAME_FORMATS.find((f) => f.value === format)?.players ?? 4);
  const share = booking && costMode === "SPLIT_EVENLY" ? Math.ceil(booking.priceCents / players) : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!booking) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await createGameAction({
      bookingId: booking.id,
      format,
      maxPlayers: format === "OPEN" ? maxPlayers : undefined,
      levels: chosenLevels,
      matchType,
      visibility,
      openToRequests,
      costMode,
      costPerPlayerCents: costMode === "FIXED_PER_PLAYER" ? Math.round(Number(costPerPlayer || 0) * 100) : null,
      description: String(f.get("description") ?? ""),
      notes: String(f.get("notes") ?? ""),
      inviteUserIds: invites.map((p) => p.id),
    });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: "Game created", description: invites.length ? `${invites.length} invitation${invites.length === 1 ? "" : "s"} sent. Publish when you're ready.` : "Invite players, then publish." });
      router.push(`/app/play/${res.data.code}`);
      return;
    }
    setFields(res.fields ?? {});
    setError(res.message);
  }

  if (bookings.length === 0) {
    return (
      <div>
        <PageHeader back="/app/play" eyebrow="New game" title="Organize a game" />
        <EmptyState
          icon={<CalendarPlus />}
          title="Book a court first"
          description="A game lives on one of your court bookings. Reserve a slot and come back to invite players."
          action={
            <Button href="/app/book" leftIcon={<CalendarPlus />}>
              Book a court
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader back="/app/play" eyebrow="New game" title="Organize a game" />
      <form onSubmit={submit} className="space-y-6" noValidate>
        <section>
          <div className="mb-2 text-overline uppercase text-blue-300">1 · Court booking</div>
          <div className="space-y-2">
            {bookings.map((b) => {
              const on = b.id === bookingId;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBookingId(b.id)}
                  aria-pressed={on}
                  className={`w-full rounded-lg border p-3.5 text-left transition-all ${on ? "border-blue-400/60 bg-blue-500/10 shadow-glow-sm" : "border-line/10 bg-surface-1 hover:border-line/30"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-bold">{formatInZone(new Date(b.startsAt), b.timezone, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="flex items-center gap-1 text-caption text-fg-muted">
                        <MapPin size={12} /> {b.location} · {b.court} · {b.durationMinutes} min · {money(b.priceCents, b.currency)}
                      </div>
                    </div>
                    {on && <Check size={18} className="text-blue-300" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-caption text-fg-subtle">
            Need another slot?{" "}
            <a href="/app/book" className="font-semibold text-blue-300">
              Book a court
            </a>
          </div>
        </section>

        <section className="space-y-4">
          <div className="text-overline uppercase text-blue-300">2 · Format and players</div>
          <Field label="Format" hint={GAME_FORMATS.find((f) => f.value === format)?.hint}>
            {() => <Tabs variant="pill" fullWidth value={format} onChange={setFormat} items={GAME_FORMATS.map((f) => ({ value: f.value, label: f.label }))} />}
          </Field>
          {format === "OPEN" && (
            <Field label="Players (including you)" error={fields.maxPlayers}>
              {(id) => <Input id={id} type="number" min={2} max={16} value={maxPlayers} onChange={(e) => setMaxPlayers(Math.max(2, Math.min(16, Number(e.target.value) || 2)))} />}
            </Field>
          )}
          <Field label="Levels welcome" hint="Leave all unselected for any level.">
            {() => (
              <div className="flex gap-2">
                {levels.map((l) => {
                  const on = chosenLevels.includes(l.level);
                  return (
                    <button
                      key={l.level}
                      type="button"
                      aria-pressed={on}
                      title={l.label}
                      onClick={() => setChosenLevels(on ? chosenLevels.filter((x) => x !== l.level) : [...chosenLevels, l.level])}
                      className={`rounded-md border p-1 transition-all ${on ? "border-blue-400/60 shadow-glow-sm" : "border-line/10 opacity-50 hover:opacity-100"}`}
                    >
                      <LevelBadge level={l.level} size="lg" label={l.label} />
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
          <Field label="Game type">{(id) => <Select id={id} value={matchType} onChange={(e) => setMatchType(e.target.value)} options={MATCH_TYPES.map((m) => ({ value: m.value, label: m.label }))} />}</Field>
          <Field label="Invite players" hint="They must accept the invitation themselves; nobody is added automatically.">
            {() => <PlayerPicker value={invites} onChange={setInvites} max={players - 1} />}
          </Field>
        </section>

        <section className="space-y-4">
          <div className="text-overline uppercase text-blue-300">3 · Who can see it</div>
          <Field label="Visibility" hint={GAME_VISIBILITY.find((v) => v.value === visibility)?.hint}>
            {() => <Tabs variant="pill" fullWidth value={visibility} onChange={setVisibility} items={GAME_VISIBILITY.map((v) => ({ value: v.value, label: v.label }))} />}
          </Field>
          <Switch checked={openToRequests} onChange={setOpenToRequests} label="Open remaining spots" description="Players who are not invited may ask to join. You decide who gets in." />
        </section>

        <section className="space-y-4">
          <div className="text-overline uppercase text-blue-300">4 · Cost</div>
          <Field label="How is the court paid?" hint={GAME_COST_MODES.find((c) => c.value === costMode)?.hint}>
            {(id) => <Select id={id} value={costMode} onChange={(e) => setCostMode(e.target.value)} options={GAME_COST_MODES.map((c) => ({ value: c.value, label: c.label }))} />}
          </Field>
          {costMode === "FIXED_PER_PLAYER" && (
            <Field label="Amount per player (EGP)" error={fields.costPerPlayerCents}>
              {(id) => <Input id={id} type="number" min={0} step={10} value={costPerPlayer} onChange={(e) => setCostPerPlayer(e.target.value)} placeholder="150" />}
            </Field>
          )}
          {share !== null && booking && (
            <Card variant="outline" padding="sm" className="text-body-sm text-fg-muted">
              {money(booking.priceCents, booking.currency)} ÷ {players} players = <span className="font-bold text-fg tabular">{money(share, booking.currency)}</span> each, paid at the venue.
            </Card>
          )}
        </section>

        <section className="space-y-4">
          <div className="text-overline uppercase text-blue-300">5 · Details</div>
          <Field label="Title or description (optional)" error={fields.description}>
            {(id) => <Input id={id} name="description" maxLength={500} placeholder="Tuesday night doubles, friendly but fast" />}
          </Field>
          <Field label="Notes for players (optional)" hint="Only invited and confirmed players see this." error={fields.notes}>
            {(id) => <Textarea id={id} name="notes" maxLength={500} placeholder="Meet at reception 10 minutes early. I'll bring balls." />}
          </Field>
        </section>

        {error && (
          <Alert tone="danger" title="Could not create the game">
            {error}
          </Alert>
        )}
        <Button type="submit" size="xl" fullWidth loading={busy} disabled={!booking}>
          {booking ? "Create game" : "Choose a booking"}
        </Button>
      </form>
    </div>
  );
}
