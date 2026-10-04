"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { CalendarDays, CheckCircle2, Clock, MapPin, Users, XCircle } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { money, PaymentStatusBadge } from "@/components/patterns/booking-status";
import { EnrollmentBadge, ProgramStatusBadge, scheduleText } from "@/components/patterns/academy";
import { programCategoryLabel } from "@/lib/catalog";
import { formatInZone } from "@/lib/time";
import type { EnrollmentView, ProgramView } from "@/server/services/programs";
import { cancelEnrollmentAction, enrollAction } from "@/server/actions/academy";
import { count } from "@/lib/text";

const ATT_TONE = { PRESENT: "success", LATE: "warning", ABSENT: "danger", EXCUSED: "neutral" } as const;

export function ProgramDetail({ program: p, enrollment, levels, myLevel }: { program: ProgramView; enrollment: EnrollmentView | null; levels: Record<string, string>; myLevel: PlayerLevel | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const tz = p.location.timezone;
  const inProgram = enrollment && (enrollment.status === "ENROLLED" || enrollment.status === "WAITLISTED");
  const canEnroll = !inProgram && (p.status === "OPEN" || p.status === "FULL") && (!p.enrollmentClosesAt || new Date(p.enrollmentClosesAt) > new Date());
  const levelOk = p.levels.length === 0 || (myLevel ? p.levels.includes(myLevel) : false);
  const full = p.spotsLeft === 0;
  const attended = enrollment ? enrollment.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length : 0;

  async function act(label: string, fn: () => Promise<{ ok: boolean; message?: string; code?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: label });
      setConfirm(false);
      setWithdraw(false);
      router.refresh();
    } else toast({ tone: "danger", title: res.code === "NOT_ELIGIBLE" ? "Not eligible" : res.code === "PROGRAM_FULL" ? "Program full" : "Could not do that", description: res.message });
  }

  return (
    <div className="space-y-6 pb-4">
      <PageHeader back="/app/programs" title={p.name} eyebrow={programCategoryLabel(p.category)} action={<ProgramStatusBadge status={p.status} />} />
      <Card variant="brand" padding="lg" className="court-line">
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">{p.levels.length ? p.levels.map((l) => <LevelBadge key={l} level={l} size="sm" label={levels[l]} />) : <Badge className="bg-white/15 text-white">Any level</Badge>}</div>
            {enrollment && inProgram && <EnrollmentBadge status={enrollment.status} position={enrollment.position} size="md" />}
          </div>
          <h2 className="mt-4 text-h1">{p.name}</h2>
          {p.description && <p className="mt-2 text-body text-white/85">{p.description}</p>}
          <div className="mt-5 flex items-end justify-between">
            <div>
              <div className="text-caption text-white/70">Full program · {count(p.sessionsCount, "session")}</div>
              <div className="text-h2 tabular">{money(p.priceCents, p.currency)}</div>
            </div>
            <div className="text-right text-caption text-white/70">{money(Math.round(p.priceCents / p.sessionsCount), p.currency)} per session · pay at the venue</div>
          </div>
        </div>
      </Card>

      {!inProgram && p.spotsLeft > 0 && p.spotsLeft <= 2 && p.status === "OPEN" && <Alert tone="warning" title={`Only ${p.spotsLeft} spot${p.spotsLeft > 1 ? "s" : ""} left`}>Enrollment closes when the group is full{p.allowWaitlist ? "; a waitlist opens after that" : ""}.</Alert>}
      {enrollment?.status === "WAITLISTED" && <Alert tone="info" title={`You are number ${enrollment.position} on the waitlist`}>You move in automatically when a place opens and we notify you.</Alert>}
      {enrollment?.status === "CANCELLED" && <Alert tone="warning" title="You withdrew from this program">{enrollment.cancelReason ?? ""} You can enroll again while places remain.</Alert>}

      <Card padding="sm">
        <ul className="divide-y divide-line/10 text-body-sm">
          <li className="flex items-center gap-3 py-2.5">
            <CalendarDays size={16} className="text-blue-300" /> <span className="text-fg-muted">Dates</span>
            <span className="ml-auto text-right font-semibold">
              {formatInZone(new Date(p.startsOn), "UTC", { day: "numeric", month: "short" })} – {formatInZone(new Date(p.endsOn), "UTC", { day: "numeric", month: "short" })}
            </span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Clock size={16} className="text-blue-300" /> <span className="text-fg-muted">Schedule</span> <span className="ml-auto text-right font-semibold">{scheduleText(p.schedule)}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <MapPin size={16} className="text-blue-300" /> <span className="text-fg-muted">Club</span> <span className="ml-auto font-semibold">{p.location.name}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Users size={16} className="text-blue-300" /> <span className="text-fg-muted">Group</span>
            <span className="ml-auto font-semibold">
              {p.enrolledCount} of {p.capacity}
              {p.waitlistCount ? ` · ${p.waitlistCount} waiting` : ""}
            </span>
          </li>
          {(p.minAge || p.maxAge) && (
            <li className="flex items-center gap-3 py-2.5">
              <span className="text-fg-muted">Ages</span> <span className="ml-auto font-semibold">{p.minAge ?? ""}{p.minAge && p.maxAge ? " to " : p.maxAge ? "up to " : "+"}{p.maxAge ?? ""}</span>
            </li>
          )}
        </ul>
        <div className="border-t border-line/10 px-1 pb-1 pt-3">
          <ProgressBar value={p.enrolledCount} max={p.capacity} label={`${p.enrolledCount} of ${p.capacity} enrolled`} tone={full ? "success" : "brand"} />
        </div>
      </Card>

      {(p.enrollmentRules || p.cancellationRules) && (
        <Card padding="md" className="space-y-3 text-body-sm">
          {p.enrollmentRules && (
            <div>
              <div className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Enrollment rules</div>
              <p className="mt-1 text-fg-muted">{p.enrollmentRules}</p>
            </div>
          )}
          <div>
            <div className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Cancellation</div>
            <p className="mt-1 text-fg-muted">{p.cancellationRules ?? `Withdraw free of charge up to ${p.cancellationCutoffHours} hours before the first session.`}</p>
          </div>
        </Card>
      )}

      <section>
        <SectionHeader title="Your coach" />
        <Card variant="interactive" padding="sm" href={`/app/trainers/${p.trainer.id}`}>
          <div className="flex items-center gap-3">
            <Avatar name={p.trainer.user.name} src={p.trainer.photoUrl} size="md" ring />
            <div className="min-w-0 flex-1">
              <div className="text-body font-bold">{p.trainer.user.name}</div>
              <div className="text-caption text-blue-300">{p.trainer.title}</div>
            </div>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="Sessions" eyebrow={enrollment && inProgram ? `${attended} attended` : `${p.sessions.length} planned`} />
        <div className="space-y-1.5">
          {p.sessions.map((s) => {
            const mark = enrollment?.attendance.find((a) => a.sessionId === s.id);
            const past = new Date(s.endsAt) < new Date();
            return (
              <div key={s.id} className={`flex items-center gap-3 rounded-md border border-line/10 bg-surface-1 px-3 py-2 text-body-sm ${s.status === "CANCELLED" ? "opacity-50" : ""}`}>
                <span className="w-6 text-caption font-bold tabular text-fg-subtle">{s.index}</span>
                <span className="flex-1 truncate">
                  {formatInZone(new Date(s.startsAt), tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {s.topic ? ` · ${s.topic}` : ""}
                </span>
                {s.status === "CANCELLED" ? (
                  <Badge size="sm" tone="danger">
                    Cancelled
                  </Badge>
                ) : mark ? (
                  <Badge size="sm" tone={ATT_TONE[mark.status]}>
                    {mark.status.charAt(0) + mark.status.slice(1).toLowerCase()}
                  </Badge>
                ) : past && enrollment ? (
                  <Badge size="sm">Not marked</Badge>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {enrollment && enrollment.payments[0] && (
        <Card padding="sm" className="flex items-center justify-between px-4 text-body-sm">
          <span className="text-fg-muted">Payment</span>
          <span className="flex items-center gap-2 font-semibold tabular">
            {money(enrollment.payments[0].amountCents, enrollment.payments[0].currency)} <PaymentStatusBadge status={enrollment.payments[0].status} size="sm" />
          </span>
        </Card>
      )}

      {canEnroll && (
        <div className="space-y-2">
          {!levelOk ? (
            <Alert tone="warning" title={myLevel ? `For levels ${p.levels.join(", ")}` : "An official level is required"} action={myLevel ? undefined : <Button size="sm" variant="secondary" href="/app/profile?tab=assessment">Get assessed</Button>}>
              {myLevel ? `Your official level is ${myLevel}.` : `This program takes levels ${p.levels.join(", ")}. Request a free assessment.`}
            </Alert>
          ) : (
            <Button size="xl" fullWidth className="shadow-glow-md" leftIcon={full ? <Users /> : <CheckCircle2 />} disabled={full && !p.allowWaitlist} onClick={() => setConfirm(true)}>
              {full ? (p.allowWaitlist ? "Join the waitlist" : "Program full") : `Enroll · ${money(p.priceCents, p.currency)}`}
            </Button>
          )}
        </div>
      )}
      {inProgram && (p.status === "OPEN" || p.status === "FULL") && (
        <Button variant="ghost" fullWidth leftIcon={<XCircle />} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setWithdraw(true)}>
          {enrollment!.status === "WAITLISTED" ? "Leave the waitlist" : "Withdraw from program"}
        </Button>
      )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={full ? "Join the waitlist?" : "Enroll in this program?"} description={full ? "You take the next free place in order and are told when it opens." : `${money(p.priceCents, p.currency)} is paid at the venue. Withdraw free of charge up to ${p.cancellationCutoffHours} hours before the first session.`} confirmLabel={full ? "Join waitlist" : "Enroll"} loading={busy} onConfirm={() => act(full ? "Added to the waitlist" : "You are enrolled", () => enrollAction(p.id))} />
      <ConfirmDialog open={withdraw} onClose={() => setWithdraw(false)} title="Withdraw?" description={enrollment?.status === "WAITLISTED" ? "You leave the waitlist." : "Your place goes to the next player on the waitlist. Any payment is refunded at the venue."} confirmLabel="Withdraw" tone="danger" loading={busy} onConfirm={() => enrollment && act("Withdrawn", () => cancelEnrollmentAction(enrollment.id))} />
    </div>
  );
}
