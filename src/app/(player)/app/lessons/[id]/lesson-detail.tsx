"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, Navigation, Receipt, StickyNote, Target, XCircle } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { Chip } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PaymentStatusBadge, money } from "@/components/patterns/booking-status";
import { LessonStatusBadge } from "@/components/patterns/academy";
import { addDaysISO, formatInZone, minutesToHHMM, todayISO } from "@/lib/time";
import type { LessonView } from "@/server/services/lessons";
import type { TrainerDay } from "@/server/services/trainers";
import { cancelLessonAction, getTrainerDayAction, rescheduleLessonAction } from "@/server/actions/academy";
import { label } from "@/lib/catalog";

export function LessonDetail({ lesson, viewerId, levels }: { lesson: LessonView; viewerId: string; levels: Record<string, string> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tz = lesson.location.timezone;
  const start = new Date(lesson.startsAt);
  const end = new Date(lesson.endsAt);
  const active = lesson.status === "CONFIRMED" || lesson.status === "REQUESTED";
  const isPlayer = lesson.playerId === viewerId;
  const freeUntil = new Date(start.getTime() - 12 * 3_600_000);
  const canChange = active && start > new Date() && (!isPlayer || new Date() < freeUntil);
  const payment = lesson.payments[0];

  async function cancel(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await cancelLessonAction(lesson.id, String(form.get("reason") ?? "") || undefined);
    setBusy(false);
    if (res.ok) {
      setCancelOpen(false);
      toast({ tone: "success", title: "Lesson cancelled", description: lesson.redemption ? "Your credit was returned to the package." : undefined });
      router.refresh();
    } else setError(res.message);
  }

  return (
    <div className="space-y-6">
      <PageHeader back={isPlayer ? "/app/lessons" : "/admin/coaching"} eyebrow={lesson.code} title={isPlayer ? lesson.trainer.user.name : lesson.player.name} action={<LessonStatusBadge status={lesson.status} />} />
      <Card variant={active ? "brand" : "default"} padding="lg" className={active ? "court-line" : ""}>
        <div className="relative">
          <div className={`text-overline uppercase ${active ? "text-white/80" : "text-fg-subtle"}`}>{formatInZone(start, tz, { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="mt-2 text-display tabular">
            {formatInZone(start, tz, { hour: "2-digit", minute: "2-digit" })}
            <span className={`text-h3 ${active ? "text-white/70" : "text-fg-muted"}`}> – {formatInZone(end, tz, { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="mt-1 text-body-lg font-semibold">{lesson.location.name}</div>
          <div className={`flex items-center gap-1 text-body-sm ${active ? "text-white/80" : "text-fg-muted"}`}>
            <MapPin size={14} /> Private lesson · {lesson.durationMinutes} min · {lesson.location.address}
          </div>
          {active && (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" href={`https://maps.google.com/?q=${encodeURIComponent(lesson.location.address)}`} leftIcon={<Navigation />}>
                Directions
              </Button>
              {canChange && (
                <Button variant="outline" className="border-white/40 text-white hover:bg-white/10" leftIcon={<CalendarClock />} onClick={() => setMoveOpen(true)}>
                  Reschedule
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {lesson.status === "REQUESTED" && <Alert tone="info" title="Waiting for the coach">{lesson.trainer.user.name} confirms requests personally. You will be notified.</Alert>}
      {lesson.status === "CANCELLED" && (
        <Alert tone="danger" title="This lesson was cancelled">
          {lesson.cancellationReason ?? "No reason recorded."}
          {lesson.rescheduledTo && (
            <>
              {" "}
              It was moved to{" "}
              <a className="font-semibold underline" href={`/app/lessons/${lesson.rescheduledTo.id}`}>
                {lesson.rescheduledTo.code}
              </a>
              .
            </>
          )}
        </Alert>
      )}
      {lesson.status === "NO_SHOW" && <Alert tone="warning" title="Marked as no-show">The coach waited but the lesson did not take place.</Alert>}

      <Card padding="sm">
        <div className="flex items-center gap-3 px-1 py-2">
          <Avatar name={isPlayer ? lesson.trainer.user.name : lesson.player.name} src={isPlayer ? lesson.trainer.photoUrl : lesson.player.playerProfile?.photoUrl} size="md" ring />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-body-sm font-bold">
              {isPlayer ? lesson.trainer.user.name : lesson.player.name}
              {!isPlayer && lesson.player.playerProfile?.level && <LevelBadge level={lesson.player.playerProfile.level} size="sm" label={levels[lesson.player.playerProfile.level]} />}
            </div>
            <div className="text-caption text-fg-muted">{isPlayer ? lesson.trainer.title : lesson.player.playerProfile?.side ? label("side", lesson.player.playerProfile.side) : "Player"}</div>
          </div>
          {isPlayer && (
            <Button size="sm" variant="ghost" href={`/app/trainers/${lesson.trainerId}`}>
              Profile
            </Button>
          )}
        </div>
        <ul className="divide-y divide-line/10 text-body-sm">
          <li className="flex items-center gap-3 py-2.5">
            <Receipt size={16} className="text-blue-300" /> <span className="text-fg-muted">Price</span>
            <span className="ml-auto flex items-center gap-2 font-semibold tabular">
              {lesson.redemption ? (
                <>
                  1 credit <Badge size="sm" tone={lesson.redemption.refundedAt ? "neutral" : "success"}>{lesson.redemption.refundedAt ? "Refunded" : lesson.redemption.purchase.name}</Badge>
                </>
              ) : (
                <>
                  {money(lesson.priceCents, lesson.currency)} {payment && <PaymentStatusBadge status={payment.status} size="sm" />}
                </>
              )}
            </span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <CalendarClock size={16} className="text-blue-300" /> <span className="text-fg-muted">Free changes</span>
            <span className="ml-auto text-right font-semibold">{active ? (new Date() < freeUntil ? `until ${formatInZone(freeUntil, tz)}` : "window passed") : "—"}</span>
          </li>
          {lesson.focus && (
            <li className="flex items-start gap-3 py-2.5">
              <Target size={16} className="mt-0.5 text-blue-300" /> <span className="text-fg-muted">Focus</span> <span className="ml-auto text-right font-semibold">{lesson.focus}</span>
            </li>
          )}
        </ul>
      </Card>

      {lesson.notes.length > 0 && (
        <section>
          <SectionHeader eyebrow="From your coach" title="Notes" />
          <div className="space-y-2">
            {lesson.notes.map((n) => (
              <Card key={n.id} padding="md">
                <div className="flex items-start gap-3">
                  <StickyNote size={16} className="mt-0.5 shrink-0 text-blue-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm">{n.body}</p>
                    <div className="mt-1 text-caption text-fg-subtle">{formatInZone(new Date(n.createdAt), tz, { day: "numeric", month: "short" })}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {canChange && (
        <Button variant="ghost" fullWidth leftIcon={<XCircle />} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setCancelOpen(true)}>
          Cancel lesson
        </Button>
      )}

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this lesson?" description={lesson.redemption ? "The credit returns to your package." : "Nothing is charged for a cancellation inside the free window."} size="sm">
        <form action={cancel} className="space-y-4 pb-2">
          {error && <Alert tone="danger" title="Cancellation not allowed">{error}</Alert>}
          <Field label="Reason (optional)">{(id) => <Textarea id={id} name="reason" placeholder="Let the coach know why" maxLength={500} />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep lesson
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Cancel lesson
            </Button>
          </div>
        </form>
      </Modal>
      <RescheduleModal open={moveOpen} onClose={() => setMoveOpen(false)} lesson={lesson} />
    </div>
  );
}

function RescheduleModal({ open, onClose, lesson }: { open: boolean; onClose: () => void; lesson: LessonView }) {
  const router = useRouter();
  const { toast } = useToast();
  const tz = lesson.location.timezone;
  const [dateISO, setDateISO] = useState(() => todayISO(tz));
  const [day, setDay] = useState<TrainerDay | null>(null);
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(tz), i));
  useEffect(() => {
    if (!open) return;
    setStart(null);
    startTransition(async () => {
      const res = await getTrainerDayAction(lesson.trainerId, lesson.locationId, dateISO);
      setDay(res.ok ? res.data : null);
    });
  }, [open, dateISO, lesson.trainerId, lesson.locationId]);
  async function move() {
    if (start === null) return;
    setBusy(true);
    setError(null);
    const res = await rescheduleLessonAction(lesson.id, { dateISO, startMinutes: start, durationMinutes: lesson.durationMinutes });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: "Lesson moved", description: res.data.code });
      onClose();
      router.push(`/app/lessons/${res.data.id}`);
    } else setError(res.message);
  }
  return (
    <Modal open={open} onClose={onClose} title="Reschedule" description={`Same coach, same club, ${lesson.durationMinutes} min. Pick a new time.`}>
      <div className="space-y-3 pb-2">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
          {days.map((d) => (
            <Chip key={d} selected={dateISO === d} onClick={() => setDateISO(d)}>
              {d.slice(5)}
            </Chip>
          ))}
        </div>
        {pending && !day ? (
          <div className="flex items-center gap-2 text-body-sm text-fg-muted">
            <Spinner size={16} /> Loading times
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {day?.slots.filter((s) => s.available && s.durations.includes(lesson.durationMinutes)).map((s) => (
              <Chip key={s.startMinutes} selected={start === s.startMinutes} onClick={() => setStart(s.startMinutes)}>
                {minutesToHHMM(s.startMinutes)}
              </Chip>
            ))}
            {day && !day.slots.some((s) => s.available) && <span className="text-body-sm text-fg-muted">No free times on this day.</span>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={move} disabled={start === null} loading={busy}>
            Move lesson
          </Button>
        </div>
      </div>
    </Modal>
  );
}
