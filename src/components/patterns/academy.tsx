import Link from "next/link";
import type { EnrollmentStatus, LessonStatus, ProgramStatus, PurchaseStatus } from "@prisma/client";
import { CalendarDays, GraduationCap, Languages, MapPin, Star, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/misc";
import { money } from "@/components/patterns/booking-status";
import { formatInZone, minutesToHHMM, DAY_SHORT } from "@/lib/time";
import { programCategoryLabel } from "@/lib/catalog";
import type { TrainerView } from "@/server/services/trainers";
import type { LessonView } from "@/server/services/lessons";
import type { ProgramView, ScheduleSlot } from "@/server/services/programs";
import type { PurchaseView } from "@/server/services/packages";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ Status badges */

const LESSON_TONE: Record<LessonStatus, "success" | "warning" | "danger" | "neutral"> = { CONFIRMED: "success", REQUESTED: "warning", CANCELLED: "danger", COMPLETED: "neutral", NO_SHOW: "danger" };
export const LESSON_LABEL: Record<LessonStatus, string> = { CONFIRMED: "Confirmed", REQUESTED: "Requested", CANCELLED: "Cancelled", COMPLETED: "Completed", NO_SHOW: "No-show" };
export function LessonStatusBadge({ status, size }: { status: LessonStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={LESSON_TONE[status]} dot size={size}>
      {LESSON_LABEL[status]}
    </Badge>
  );
}

const PROGRAM_TONE: Record<ProgramStatus, "neutral" | "info" | "warning" | "volt" | "danger" | "success"> = { DRAFT: "neutral", OPEN: "info", FULL: "warning", IN_PROGRESS: "volt", COMPLETED: "neutral", CANCELLED: "danger" };
export const PROGRAM_LABEL: Record<ProgramStatus, string> = { DRAFT: "Draft", OPEN: "Open", FULL: "Full", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export function ProgramStatusBadge({ status, size }: { status: ProgramStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={PROGRAM_TONE[status]} dot size={size} pulse={status === "IN_PROGRESS"}>
      {PROGRAM_LABEL[status]}
    </Badge>
  );
}

const ENROLL_TONE: Record<EnrollmentStatus, "success" | "info" | "danger" | "neutral"> = { ENROLLED: "success", WAITLISTED: "info", CANCELLED: "danger", COMPLETED: "neutral" };
export function EnrollmentBadge({ status, position, size = "sm" }: { status: EnrollmentStatus; position?: number | null; size?: "sm" | "md" }) {
  return (
    <Badge tone={ENROLL_TONE[status]} dot size={size}>
      {status === "WAITLISTED" && position ? `Waitlist #${position}` : status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

const PURCHASE_TONE: Record<PurchaseStatus, "success" | "neutral" | "warning" | "danger"> = { ACTIVE: "success", EXHAUSTED: "neutral", EXPIRED: "warning", CANCELLED: "danger" };
export function PurchaseBadge({ status, size = "sm" }: { status: PurchaseStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={PURCHASE_TONE[status]} dot size={size}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

/* ------------------------------------------------------------------ Cards */

export function TrainerCard({ trainer, levelLabels, href }: { trainer: TrainerView; levelLabels: Record<string, string>; href?: string }) {
  const body = (
    <Card variant={href ? "interactive" : "default"}>
      <div className="flex items-start gap-3.5">
        <Avatar name={trainer.user.name} src={trainer.photoUrl} size="lg" ring />
        <div className="min-w-0 flex-1">
          <div className="truncate text-h4">{trainer.user.name}</div>
          <div className="text-caption text-blue-300">{trainer.title}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {trainer.specialties.slice(0, 3).map((s) => (
              <Badge key={s} size="sm">
                {s}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">{trainer.levels.length ? trainer.levels.map((l) => <LevelBadge key={l} level={l} size="sm" label={levelLabels[l]} />) : <Badge size="sm">All levels</Badge>}</div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line/10 pt-3 text-body-sm">
        <span className="flex items-center gap-1 truncate text-fg-muted">
          <MapPin size={14} /> {trainer.locations.map((l) => l.location.name.replace("HITTERS ", "")).join(", ")}
        </span>
        <span>
          <span className="font-bold text-fg tabular">{money(trainer.hourlyRateCents, trainer.currency)}</span>
          <span className="text-fg-subtle">/h</span>
        </span>
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function LessonRow({ lesson, href, viewer }: { lesson: LessonView; href: string; viewer: "player" | "trainer" | "staff" }) {
  const tz = lesson.location.timezone;
  const who = viewer === "player" ? lesson.trainer.user.name : lesson.player.name;
  return (
    <Link href={href} className="block">
      <Card variant="interactive" padding="sm">
        <div className="flex items-center gap-3">
          <div className="flex w-14 shrink-0 flex-col items-center rounded-md bg-surface-2 py-2 ring-1 ring-inset ring-line/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">{formatInZone(new Date(lesson.startsAt), tz, { weekday: "short" })}</span>
            <span className="text-h4 tabular">{formatInZone(new Date(lesson.startsAt), tz, { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="text-[10px] text-fg-subtle">{formatInZone(new Date(lesson.startsAt), tz, { day: "numeric", month: "numeric" })}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-bold">{who}</div>
            <div className="truncate text-caption text-fg-muted">
              {lesson.location.name.replace("HITTERS ", "")} · {lesson.durationMinutes} min · {lesson.redemption ? "package credit" : money(lesson.priceCents, lesson.currency)}
              {lesson.payments[0]?.status === "PAID" ? " · paid" : ""}
            </div>
            <div className="mt-0.5 text-[11px] tabular text-fg-subtle">{lesson.code}</div>
          </div>
          <LessonStatusBadge status={lesson.status} size="sm" />
        </div>
      </Card>
    </Link>
  );
}

export function scheduleText(schedule: unknown): string {
  const slots = (schedule as ScheduleSlot[]) ?? [];
  return slots.map((s) => `${DAY_SHORT[s.dayOfWeek]} ${minutesToHHMM(s.startMinutes)}`).join(" · ");
}

export function ProgramCard({ program, levelLabels, href, action }: { program: ProgramView; levelLabels: Record<string, string>; href?: string; action?: ReactNode }) {
  const body = (
    <Card variant={href ? "interactive" : "default"}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20">
          <GraduationCap size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-h4">{program.name}</h3>
            <ProgramStatusBadge status={program.status} size="sm" />
            {program.spotsLeft <= 2 && program.spotsLeft > 0 && ["OPEN"].includes(program.status) && (
              <Badge tone="warning" size="sm">
                {program.spotsLeft} left
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-caption text-fg-muted">
            {programCategoryLabel(program.category)} · {program.trainer.user.name} · {program.location.name.replace("HITTERS ", "")}
          </div>
        </div>
        <div className="flex gap-1">{program.levels.length ? program.levels.map((l) => <LevelBadge key={l} level={l} size="sm" label={levelLabels[l]} />) : <Badge size="sm">Any level</Badge>}</div>
      </div>
      {program.description && <p className="mt-3 line-clamp-2 text-body-sm text-fg-muted">{program.description}</p>}
      <div className="mt-4 flex items-center justify-between border-t border-line/10 pt-3 text-body-sm">
        <span className="flex items-center gap-1 text-fg-muted">
          <CalendarDays size={14} /> {program.sessionsCount} sessions · {scheduleText(program.schedule)} · from {formatInZone(new Date(program.startsOn), "UTC", { day: "numeric", month: "short" })}
        </span>
        {action ?? <span className="font-bold text-fg tabular">{money(program.priceCents, program.currency)}</span>}
      </div>
      <div className="mt-3 flex items-center gap-2 text-caption text-fg-muted">
        <Users size={12} /> {program.enrolledCount}/{program.capacity} enrolled{program.waitlistCount ? ` · ${program.waitlistCount} waitlisted` : ""}
        <ProgressBar value={program.enrolledCount} max={program.capacity} tone={program.spotsLeft === 0 ? "success" : "brand"} className="ml-2 flex-1" />
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function PurchaseCard({ purchase, className }: { purchase: PurchaseView; className?: string }) {
  const pct = purchase.credits ? (purchase.creditsUsed / purchase.credits) * 100 : 0;
  return (
    <Card variant={purchase.status === "ACTIVE" ? "brand" : "default"} padding="md" className={cn(purchase.status === "ACTIVE" ? "court-line" : "", className)}>
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={cn("text-overline uppercase", purchase.status === "ACTIVE" ? "text-white/80" : "text-fg-subtle")}>{purchase.code}</div>
            <div className="text-h3">{purchase.name}</div>
          </div>
          <PurchaseBadge status={purchase.status} />
        </div>
        <div className="mt-3 text-display tabular">
          {purchase.creditsLeft}
          <span className={cn("text-h3", purchase.status === "ACTIVE" ? "text-white/70" : "text-fg-muted")}> / {purchase.credits} left</span>
        </div>
        <ProgressBar value={purchase.credits - purchase.creditsUsed} max={purchase.credits} tone={purchase.status === "ACTIVE" ? "volt" : "brand"} className="mt-2" />
        <div className={cn("mt-2 flex flex-wrap gap-x-3 text-caption", purchase.status === "ACTIVE" ? "text-white/80" : "text-fg-muted")}>
          <span>{purchase.creditsUsed} used</span>
          <span>Expires {purchase.expiresAt.toISOString().slice(0, 10)}</span>
          <span>{money(purchase.priceCents, purchase.currency)} · {purchase.payments[0]?.status === "PAID" ? "paid" : "pay at venue"}</span>
        </div>
        {void pct}
      </div>
    </Card>
  );
}

export function TrainerMeta({ trainer }: { trainer: TrainerView }) {
  return (
    <ul className="divide-y divide-line/10 text-body-sm">
      <li className="flex items-center gap-3 py-2.5">
        <Star size={16} className="text-blue-300" /> <span className="text-fg-muted">Experience</span>
        <span className="ml-auto font-semibold">
          {trainer.yearsExperience ? `${trainer.yearsExperience} years · ` : ""}
          {trainer._count.lessons} lessons given
        </span>
      </li>
      <li className="flex items-center gap-3 py-2.5">
        <Languages size={16} className="text-blue-300" /> <span className="text-fg-muted">Languages</span> <span className="ml-auto font-semibold">{trainer.languages.join(", ") || "—"}</span>
      </li>
      <li className="flex items-center gap-3 py-2.5">
        <MapPin size={16} className="text-blue-300" /> <span className="text-fg-muted">Clubs</span> <span className="ml-auto text-right font-semibold">{trainer.locations.map((l) => l.location.name.replace("HITTERS ", "")).join(", ")}</span>
      </li>
    </ul>
  );
}
