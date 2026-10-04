"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Clock, MapPin, Receipt } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/modal";
import { ConfirmationState, LoadingState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { DAY_SHORT, addDaysISO, dayOfWeekISO, longDate, minutesToHHMM, todayISO } from "@/lib/time";
import type { LocationSchedule, Slot } from "@/server/services/availability";
import type { BookingQuote, BookingView } from "@/server/services/bookings";
import { createBookingAction, getScheduleAction, quoteBookingAction, rescheduleBookingAction } from "@/server/actions/bookings";
import { money } from "@/components/patterns/booking-status";

type Loc = { id: string; slug: string; name: string; timezone: string; allowedDurations: number[]; advanceDays: number };
type Props = { locations: Loc[]; initialLocationId: string | null; rescheduling: { id: string; code: string; courtName: string; startsAt: Date } | null; emailVerified: boolean };

const ERROR_TITLES: Record<string, string> = {
  SLOT_UNAVAILABLE: "Slot no longer available",
  COURT_UNAVAILABLE: "Court unavailable",
  BOOKING_CONFLICT: "Booking conflict",
  INVALID_DURATION: "Invalid duration",
  LOCATION_CLOSED: "Location closed",
  CANCELLATION_NOT_ALLOWED: "Change not allowed",
  FORBIDDEN: "Not allowed",
  VALIDATION: "Check your selection",
};

export function BookingFlow({ locations, initialLocationId, rescheduling, emailVerified }: Props) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(initialLocationId);
  const location = locations.find((l) => l.id === locationId) ?? null;
  const [dateISO, setDateISO] = useState(() => (location ? todayISO(location.timezone) : todayISO("Africa/Cairo")));
  const [schedule, setSchedule] = useState<LocationSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ courtId: string; startMinutes: number } | null>(null);
  const [duration, setDuration] = useState<number>(location?.allowedDurations.includes(90) ? 90 : (location?.allowedDurations[0] ?? 60));
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<BookingView | null>(null);

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    const res = await getScheduleAction(locationId, dateISO);
    setLoading(false);
    if (res.ok) setSchedule(res.data);
    else {
      setSchedule(null);
      setError({ code: res.code, message: res.message });
    }
  }, [locationId, dateISO]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-quote whenever the selection changes.
  useEffect(() => {
    if (!selected) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setError(null);
    void quoteBookingAction({ courtId: selected.courtId, dateISO, startMinutes: selected.startMinutes, durationMinutes: duration }).then((res) => {
      if (cancelled) return;
      setQuoting(false);
      if (res.ok) setQuote(res.data);
      else {
        setQuote(null);
        setError({ code: res.code, message: res.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected, duration, dateISO]);

  const days = useMemo(() => {
    const start = location ? todayISO(location.timezone) : dateISO;
    return Array.from({ length: Math.min(location?.advanceDays ?? 14, 21) + 1 }, (_, i) => addDaysISO(start, i));
  }, [location, dateISO]);

  const courtsWithSlots = schedule?.courts.filter((c) => c.slots.length > 0) ?? [];
  const selectedCourt = schedule?.courts.find((c) => c.court.id === selected?.courtId);

  /** A duration is bookable from the selected start only if every covered slot is free. */
  function spanIsFree(court: LocationSchedule["courts"][number], start: number, dur: number): boolean {
    const step = court.slotMinutes ?? 60;
    for (let t = start; t < start + dur; t += step) {
      const s = court.slots.find((x) => x.startMinutes === t);
      if (!s || s.status !== "available") return false;
    }
    return true;
  }

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    const input = { courtId: selected.courtId, dateISO, startMinutes: selected.startMinutes, durationMinutes: duration };
    const res = rescheduling ? await rescheduleBookingAction(rescheduling.id, input) : await createBookingAction(input);
    setSubmitting(false);
    setConfirm(false);
    if (res.ok) {
      setDone(res.data);
      router.refresh();
    } else {
      setError({ code: res.code, message: res.message });
      void load();
    }
  }

  if (done) {
    return (
      <ConfirmationState
        title={rescheduling ? "Booking moved" : "Court booked"}
        description={`${done.location.name} · ${done.court.name} · ${new Date(done.startsAt).toLocaleString("en-GB", { timeZone: done.location.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} for ${done.durationMinutes} minutes. Confirmation ${done.confirmationCode}.`}
        action={<Button size="lg" href={`/app/bookings/${done.id}`}>View booking</Button>}
        secondaryAction={
          <Button size="lg" variant="ghost" href="/app">
            Back to home
          </Button>
        }
      />
    );
  }

  if (locations.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Reservations" title="Book a court" />
        <Alert tone="info" title="No clubs are open for booking yet" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      <PageHeader eyebrow={rescheduling ? `Rescheduling ${rescheduling.code}` : "Step 1 · Club"} title={rescheduling ? "Pick a new time" : "Book a court"} back={rescheduling ? `/app/bookings/${rescheduling.id}` : undefined} />

      {!emailVerified && (
        <Alert tone="warning" title="Verify your email to book">
          You can browse availability, but bookings need a verified email. Use the banner above to resend the link.
        </Alert>
      )}

      {!rescheduling && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          {locations.map((l) => (
            <Chip
              key={l.id}
              icon={<MapPin />}
              selected={l.id === locationId}
              onClick={() => {
                setLocationId(l.id);
                setSelected(null);
                setDateISO(todayISO(l.timezone));
                setDuration(l.allowedDurations.includes(90) ? 90 : l.allowedDurations[0]);
              }}
            >
              {l.name.replace("HITTERS ", "")}
            </Chip>
          ))}
        </div>
      )}

      <section>
        <div className="mb-2 text-overline uppercase text-blue-300">Step 2 · Date</div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="listbox" aria-label="Select date">
          {days.map((d, i) => {
            const sel = d === dateISO;
            return (
              <button
                key={d}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => {
                  setDateISO(d);
                  setSelected(null);
                }}
                className={cn(
                  "flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border py-2.5 transition-all",
                  sel ? "border-blue-300/40 bg-brand-gradient text-white shadow-glow-sm" : "border-line/10 bg-surface-1 text-fg-muted hover:border-line/25 hover:text-fg",
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{i === 0 ? "Today" : DAY_SHORT[dayOfWeekISO(d)]}</span>
                <span className="text-h4 tabular">{Number(d.slice(8))}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-overline uppercase text-blue-300">Step 3 · Court & time</span>
          {location && <span className="text-caption text-fg-subtle">{location.timezone}</span>}
        </div>
        {!schedule && !error ? (
          <LoadingState label="Checking availability" />
        ) : error && !schedule ? (
          <Alert tone="danger" title={ERROR_TITLES[error.code] ?? "Unavailable"}>
            {error.message}
          </Alert>
        ) : courtsWithSlots.length === 0 ? (
          <Alert tone="info" title="Closed on this day">
            No courts have hours on this date. Try another day.
          </Alert>
        ) : (
          <SlotGrid courts={courtsWithSlots} selected={selected} duration={duration} spanIsFree={spanIsFree} onSelect={(courtId, startMinutes) => setSelected({ courtId, startMinutes })} />
        )}
      </section>

      <section>
        <div className="mb-2 text-overline uppercase text-blue-300">Step 4 · Duration</div>
        <Tabs
          variant="pill"
          fullWidth
          value={String(duration)}
          onChange={(v) => setDuration(Number(v))}
          items={(quote?.allowedDurations ?? location?.allowedDurations ?? [60, 90, 120]).map((d) => ({ value: String(d), label: `${d} min`, disabled: !!selected && !!selectedCourt && !spanIsFree(selectedCourt, selected.startMinutes, d) }))}
        />
      </section>

      {error && schedule && (
        <Alert tone="danger" title={ERROR_TITLES[error.code] ?? "Something went wrong"}>
          {error.message}
        </Alert>
      )}

      {/* Price review, pinned above the bottom navigation */}
      <div className="fixed inset-x-0 bottom-[104px] z-30 mx-auto max-w-app px-4">
        <Card variant={quote ? "brand" : "default"} padding="md" className="shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {quote && selected ? (
                <>
                  <div className="flex items-center gap-1.5 text-caption text-white/80">
                    <CalendarCheck size={14} /> {DAY_SHORT[dayOfWeekISO(dateISO)]} {Number(dateISO.slice(8))} · {minutesToHHMM(selected.startMinutes)}–{minutesToHHMM(selected.startMinutes + duration)}
                  </div>
                  <div className="truncate text-h4">
                    {quote.court.name} · {quote.location.name.replace("HITTERS ", "")}
                  </div>
                  <div className="text-caption text-white/80">
                    {duration} min{quote.quote.adjustments.map((a) => ` · ${a.name} ${a.deltaCents > 0 ? "+" : ""}${money(a.deltaCents)}`).join("")}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-caption text-fg-subtle">
                    <Clock size={14} /> {quoting ? "Checking price…" : "No slot selected"}
                  </div>
                  <div className="text-body font-semibold text-fg-muted">Pick a court and time above</div>
                </>
              )}
            </div>
            <div className="text-right">
              <div className="text-h3 tabular">{quote ? money(quote.quote.totalCents) : "—"}</div>
              <Button size="sm" disabled={!quote || !emailVerified || quoting} loading={quoting} onClick={() => setConfirm(true)} variant={quote ? "volt" : "primary"} className="mt-1" leftIcon={<Receipt />}>
                {rescheduling ? "Move" : "Review"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={submit}
        loading={submitting}
        title={rescheduling ? "Confirm new time" : "Confirm booking"}
        description={
          quote && selected
            ? `${quote.court.name} at ${quote.location.name} on ${longDate(dateISO)} ${minutesToHHMM(selected.startMinutes)}–${minutesToHHMM(selected.startMinutes + duration)}. Total ${money(quote.quote.totalCents)}, payable at the venue. Free cancellation up to ${quote.cancellationCutoffHours} hours before.`
            : ""
        }
        confirmLabel={rescheduling ? "Move booking" : `Confirm · ${quote ? money(quote.quote.totalCents) : ""}`}
      />
    </div>
  );
}

const CELL: Record<Slot["status"], string> = {
  available: "border-line/10 bg-surface-2 text-fg-muted hover:border-blue-400/60 hover:text-fg",
  booked: "border-transparent bg-line/[0.06] text-fg-subtle/60",
  past: "border-transparent bg-line/[0.03] text-fg-subtle/35",
  too_soon: "border-transparent bg-line/[0.03] text-fg-subtle/45",
  outside_window: "border-dashed border-line/10 text-fg-subtle/45",
  closed: "border-warning/20 bg-warning/5 text-warning/60",
  maintenance: "border-warning/20 bg-warning/5 text-warning/50",
  inactive: "border-transparent bg-line/[0.02] text-fg-subtle/35",
  location_closed: "border-transparent bg-line/[0.02] text-fg-subtle/35",
};

/** What an unbookable cell shows. An empty cell reads as a failed render; a mark reads as "not this one". */
const CELL_MARK: Partial<Record<Slot["status"], string>> = {
  booked: "·",
  past: "·",
  too_soon: "·",
  outside_window: "·",
  inactive: "·",
  location_closed: "·",
  closed: "!",
  maintenance: "!",
};

function SlotGrid({ courts, selected, duration, spanIsFree, onSelect }: { courts: LocationSchedule["courts"]; selected: { courtId: string; startMinutes: number } | null; duration: number; spanIsFree: (c: LocationSchedule["courts"][number], start: number, dur: number) => boolean; onSelect: (courtId: string, startMinutes: number) => void }) {
  const columns = [...new Set(courts.flatMap((c) => c.slots.map((s) => s.startMinutes)))].sort((a, b) => a - b);
  const scroller = useRef<HTMLDivElement>(null);

  // The first hour anyone can still book. On an afternoon visit that sits far right of the opening hour,
  // so without this the grid opens on a screen of hours that have already gone.
  const firstBookable = columns.findIndex((m) => courts.some((c) => c.slots.find((x) => x.startMinutes === m)?.status === "available"));

  useEffect(() => {
    const el = scroller.current;
    if (!el || firstBookable < 1) return;
    el.scrollLeft = Math.max(0, (firstBookable - 1) * 60); // 56px column + 4px gap, keeping one column of context
  }, [firstBookable, courts]);

  return (
    <div ref={scroller} className="overflow-x-auto no-scrollbar -mx-4 px-4">
      <div className="min-w-max">
        <div className="mb-2 grid gap-1" style={{ gridTemplateColumns: `88px repeat(${columns.length}, 56px)` }}>
          <div className="sticky -left-4 z-20 -ml-4 bg-canvas pl-4" />
          {columns.map((m) => (
            <div key={m} className="text-center text-[11px] font-semibold tabular text-fg-subtle">
              {minutesToHHMM(m)}
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {courts.map((c) => (
            <div key={c.court.id} className="grid items-center gap-1" style={{ gridTemplateColumns: `88px repeat(${columns.length}, 56px)` }}>
              <div className="sticky -left-4 z-20 -ml-4 bg-canvas py-0.5 pl-4 pr-2 shadow-[6px_0_6px_-6px_rgb(0_0_0/0.5)]">
                <div className="truncate text-body-sm font-bold">{c.court.name}</div>
                <div className="text-[11px] capitalize text-fg-subtle">{c.court.type.toLowerCase()}</div>
              </div>
              {columns.map((m) => {
                const s = c.slots.find((x) => x.startMinutes === m);
                if (!s) return <div key={m} className="h-10" />;
                const isSel = selected?.courtId === c.court.id && selected.startMinutes === m;
                const inSpan = selected?.courtId === c.court.id && m > selected.startMinutes && m < selected.startMinutes + duration;
                const bookable = s.status === "available";
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!bookable}
                    aria-pressed={isSel}
                    aria-label={`${c.court.name} ${minutesToHHMM(m)} ${s.status}`}
                    title={s.reason ?? undefined}
                    onClick={() => onSelect(c.court.id, m)}
                    className={cn(
                      "h-10 rounded-sm border text-[11px] font-semibold transition-all",
                      isSel || inSpan ? "border-blue-300/60 bg-brand-gradient text-white shadow-glow-sm" : CELL[s.status],
                      isSel && "scale-[1.04]",
                      s.booking?.mine && "border-volt/50 text-volt",
                    )}
                  >
                    {isSel ? "✓" : s.booking?.mine ? "You" : s.status === "available" && s.priceCents != null ? Math.round(s.priceCents / 100) : (CELL_MARK[s.status] ?? "")}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-caption text-fg-muted">
          <Legend className="border-line/10 bg-surface-2" label="Available, price in EGP" />
          <Legend className="border-blue-300/60 bg-brand-gradient" label="Your selection" />
          <Legend className="border-volt/50 bg-surface-2" label="Already yours" />
          <Legend className="border-transparent bg-line/[0.08]" label="Taken or gone" />
          <Legend className="border-warning/20 bg-warning/10" label="Court closed" />
        </div>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-[3px] border", className)} /> {label}
    </span>
  );
}
