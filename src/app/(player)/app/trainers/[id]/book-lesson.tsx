"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Field, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { addDaysISO, longDate, minutesToHHMM, plainDate, todayISO } from "@/lib/time";
import type { TrainerDay } from "@/server/services/trainers";
import { bookLessonAction, getTrainerDayAction } from "@/server/actions/academy";
import { count } from "@/lib/text";

type Props = {
  trainer: { id: string; name: string; rateCents: number; currency: string; durations: number[]; autoConfirm: boolean; levels: PlayerLevel[] };
  locations: { id: string; name: string; timezone: string }[];
  eligible: boolean;
  myLevel: PlayerLevel | null;
  credits: { id: string; name: string; creditsLeft: number; trainerId: string | null; locationId: string | null; expiresAt: string }[];
};

/** Availability picker and booking for a private lesson; slots come from the same service that validates the booking. */
export function BookLessonPanel({ trainer, locations, eligible, myLevel, credits }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const tz = locations.find((l) => l.id === locationId)?.timezone ?? "Africa/Cairo";
  const [dateISO, setDateISO] = useState(() => todayISO(tz));
  const [day, setDay] = useState<TrainerDay | null>(null);
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(trainer.durations[0]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usable = credits.filter((c) => (!c.trainerId || c.trainerId === trainer.id) && (!c.locationId || c.locationId === locationId));
  const [purchaseId, setPurchaseId] = useState<string>("");
  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(tz), i));

  useEffect(() => {
    setStart(null);
    startTransition(async () => {
      const res = await getTrainerDayAction(trainer.id, locationId, dateISO);
      setDay(res.ok ? res.data : null);
    });
  }, [trainer.id, locationId, dateISO]);

  const slot = day?.slots.find((s) => s.startMinutes === start) ?? null;
  const durations = slot ? trainer.durations.filter((d) => slot.durations.includes(d)) : trainer.durations;
  const price = Math.round((trainer.rateCents * duration) / 60);

  async function book(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (start === null) return;
    const focus = String(new FormData(e.currentTarget).get("focus") ?? "");
    setBusy(true);
    setError(null);
    const res = await bookLessonAction({ trainerId: trainer.id, locationId, dateISO, startMinutes: start, durationMinutes: duration, focus: focus || undefined, purchaseId: purchaseId || undefined });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: res.data.status === "REQUESTED" ? "Lesson requested" : "Lesson booked", description: `${res.data.code} · ${trainer.name}` });
      setConfirm(false);
      router.push(`/app/lessons/${res.data.id}`);
    } else setError(res.message);
  }

  if (!eligible) {
    return (
      <Alert tone="warning" title={myLevel ? `${trainer.name} coaches levels ${trainer.levels.join(", ")}` : "This coach works with assessed players"} action={myLevel ? undefined : <Button size="sm" variant="secondary" href="/app/profile?tab=assessment">Get assessed</Button>}>
        {myLevel ? `Your official level is ${myLevel}. Pick a coach who takes your level.` : `Levels ${trainer.levels.join(", ")}. Request a free assessment to unlock private lessons.`}
      </Alert>
    );
  }

  return (
    <section>
      <SectionHeader eyebrow="Availability" title="Book a private lesson" />
      {locations.length > 1 && (
        <Field label="Club" className="mb-3">
          {(id) => <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)} options={locations.map((l) => ({ value: l.id, label: l.name }))} />}
        </Field>
      )}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {days.map((d, i) => {
          const dt = new Date(`${d}T12:00:00Z`);
          return (
            <button key={d} type="button" aria-pressed={dateISO === d} onClick={() => setDateISO(d)} className={`flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border py-2.5 transition-all ${dateISO === d ? "border-blue-300/40 bg-brand-gradient text-white shadow-glow-sm" : "border-line/10 bg-surface-1 text-fg-muted hover:border-line/25 hover:text-fg"}`}>
              <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{i === 0 ? "Today" : dt.toLocaleString("en", { weekday: "short", timeZone: "UTC" })}</span>
              <span className="text-h4 tabular">{dt.getUTCDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-h-12">
        {pending && !day ? (
          <div className="flex items-center gap-2 text-body-sm text-fg-muted">
            <Spinner size={16} /> Loading times
          </div>
        ) : day && day.open && day.slots.some((s) => s.available) ? (
          <div className={`flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`}>
            {day.slots.map((s) => (
              <Chip key={s.startMinutes} selected={start === s.startMinutes} disabled={!s.available} title={s.reason} onClick={() => { setStart(s.startMinutes); if (!s.durations.includes(duration)) setDuration(s.durations[0]); }}>
                {minutesToHHMM(s.startMinutes)}
              </Chip>
            ))}
          </div>
        ) : (
          <Card variant="outline" padding="sm" className="text-body-sm text-fg-muted">
            {day && !day.open ? `${trainer.name} does not coach here on this day.` : "No free times on this day. Try another date."}
          </Card>
        )}
      </div>
      {trainer.durations.length > 1 && (
        <div className="mt-3 flex gap-2">
          {trainer.durations.map((d) => (
            <Chip key={d} selected={duration === d} disabled={!durations.includes(d)} onClick={() => setDuration(d)}>
              {d} min · {money(Math.round((trainer.rateCents * d) / 60), trainer.currency)}
            </Chip>
          ))}
        </div>
      )}
      <Button size="lg" fullWidth className="mt-4" disabled={start === null} onClick={() => setConfirm(true)}>
        {start !== null ? `Book ${minutesToHHMM(start)} · ${money(price, trainer.currency)}` : "Select a time"}
      </Button>
      {!trainer.autoConfirm && <p className="mt-2 text-center text-caption text-fg-subtle">{trainer.name} confirms each request personally.</p>}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={trainer.autoConfirm ? "Confirm your lesson" : "Request this lesson"} description={`${trainer.name} · ${longDate(dateISO)} at ${start !== null ? minutesToHHMM(start) : ""} · ${duration} min`} size="sm">
        <form onSubmit={book} className="space-y-4 pb-2">
          {error && (
            <Alert tone="danger" title="Could not book">
              {error}
            </Alert>
          )}
          {usable.length > 0 && (
            <Field label="Pay with" hint="Credits are deducted now and refunded if you cancel in time.">
              {(id) => <Select id={id} value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)} options={[{ value: "", label: `Pay at the venue · ${money(price, trainer.currency)}` }, ...usable.map((c) => ({ value: c.id, label: `${c.name} · ${count(c.creditsLeft, "credit")} left, valid until ${plainDate(c.expiresAt)}` }))]} />}
            </Field>
          )}
          <Field label="What do you want to work on? (optional)">{(id) => <Textarea id={id} name="focus" maxLength={500} placeholder="Bandeja, net positioning, serve consistency" />}</Field>
          <p className="text-caption text-fg-subtle">Free cancellation or rescheduling up to 12 hours before the lesson.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>
              Back
            </Button>
            <Button type="submit" loading={busy}>
              {trainer.autoConfirm ? "Book lesson" : "Send request"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
