"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck, Clock, MapPin } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { DateStrip } from "@/components/ui/calendar";
import { ConfirmDialog } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { ConfirmationState } from "@/components/ui/states";
import { CourtSlotGrid } from "@/components/patterns/court-slot-grid";
import { courts, locations, money, slotStatus } from "@/data/mock";

type Duration = "60" | "90" | "120";

function BookingFlow() {
  const params = useSearchParams();
  const [locationSlug, setLocationSlug] = useState(params.get("location") ?? locations[0].slug);
  const [date, setDate] = useState(() => new Date());
  const [duration, setDuration] = useState<Duration>("90");
  const [selected, setSelected] = useState<{ courtId: string; slot: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const location = locations.find((l) => l.slug === locationSlug)!;
  const dayIndex = Math.round((date.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const locCourts = courts.filter((c) => c.locationSlug === locationSlug);
  const gridCourts = locCourts.length ? locCourts : courts.map((c) => ({ ...c, locationSlug }));
  const court = gridCourts.find((c) => c.id === selected?.courtId);
  const peak = selected ? slotStatus(selected.courtId, selected.slot, dayIndex) === "peak" : false;

  const price = useMemo(() => {
    const base = location.priceFrom * (Number(duration) / 60);
    return Math.round(peak ? base * 1.25 : base);
  }, [location, duration, peak]);

  function book() {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setConfirm(false);
      setDone(true);
    }, 900);
  }

  if (done && selected && court) {
    return (
      <ConfirmationState
        title="Court booked"
        description={`${location.name} · ${court.name} · ${date.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })} at ${selected.slot} for ${duration} minutes.`}
        action={<Button size="lg" href="/app/play">Find players for this slot</Button>}
        secondaryAction={
          <Button size="lg" variant="ghost" href="/app">
            Back to home
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 pb-28">
      <PageHeader eyebrow="Step 1 · Club" title="Book a court" />

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {locations.map((l) => (
          <Chip
            key={l.slug}
            icon={<MapPin />}
            selected={l.slug === locationSlug}
            onClick={() => {
              setLocationSlug(l.slug);
              setSelected(null);
            }}
          >
            {l.name.replace("HITTERS ", "")}
          </Chip>
        ))}
      </div>

      <section>
        <div className="mb-2 text-overline uppercase text-blue-300">Step 2 · Date</div>
        <DateStrip
          value={date}
          onChange={(d) => {
            setDate(d);
            setSelected(null);
          }}
        />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-overline uppercase text-blue-300">Step 3 · Court & time</span>
          <span className="text-caption text-fg-subtle">Peak 18:00 – 21:00 · +25%</span>
        </div>
        <CourtSlotGrid courts={gridCourts} dayIndex={dayIndex} selected={selected} onSelect={setSelected} />
      </section>

      <section>
        <div className="mb-2 text-overline uppercase text-blue-300">Step 4 · Duration</div>
        <Tabs
          variant="pill"
          fullWidth
          value={duration}
          onChange={setDuration}
          items={[
            { value: "60", label: "60 min" },
            { value: "90", label: "90 min" },
            { value: "120", label: "120 min" },
          ]}
        />
      </section>

      {gridCourts.some((c) => c.status === "maintenance") && (
        <Alert tone="warning" title="Court 4 is under maintenance">
          Resurfacing until Friday. Other courts are unaffected.
        </Alert>
      )}

      {/* Summary bar pinned above the bottom navigation */}
      <div className="fixed inset-x-0 bottom-[104px] z-30 mx-auto max-w-app px-4">
        <Card variant={selected ? "brand" : "default"} padding="md" className="shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {selected && court ? (
                <>
                  <div className="flex items-center gap-1.5 text-caption text-white/80">
                    <CalendarCheck size={14} /> {date.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                  <div className="truncate text-h4">
                    {court.name} · {selected.slot}
                  </div>
                  <div className="text-caption text-white/80">
                    {location.name.replace("HITTERS ", "")} · {duration} min{peak && " · peak rate"}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-caption text-fg-subtle">
                    <Clock size={14} /> No slot selected
                  </div>
                  <div className="text-body font-semibold text-fg-muted">Pick a court and time above</div>
                </>
              )}
            </div>
            <div className="text-right">
              <div className="text-h3 tabular">{money(price)}</div>
              <Button size="sm" disabled={!selected} onClick={() => setConfirm(true)} variant={selected ? "volt" : "primary"} className="mt-1">
                Confirm
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={book}
        loading={loading}
        title="Confirm booking"
        description={`${court?.name} at ${selected?.slot} for ${duration} minutes. ${money(price)} will be charged to your saved card.`}
        confirmLabel={`Pay ${money(price)}`}
      />
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookingFlow />
    </Suspense>
  );
}
