import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, MapPin, Users } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ProgressBar } from "@/components/ui/misc";
import { TrainerCard } from "@/components/patterns/cards";
import { byId, locationBySlug, money, programs, trainers } from "@/data/mock";

export function generateStaticParams() {
  return programs.map((p) => ({ id: p.id }));
}

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = byId(programs, id);
  if (!p) notFound();
  const trainer = byId(trainers, p.trainerId);
  const loc = locationBySlug(p.locationSlug);
  const enrolled = p.capacity - p.spotsLeft;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader back="/app/programs" title={p.name} eyebrow="Program" />

      <Card variant="brand" padding="lg" className="court-line">
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {p.levels.map((l) => (
                <LevelBadge key={l} level={l} size="sm" />
              ))}
            </div>
            {p.tag && <Badge className="bg-white/15 text-white">{p.tag}</Badge>}
          </div>
          <h2 className="mt-4 text-h1">{p.name}</h2>
          <p className="mt-2 text-body text-white/85">{p.description}</p>
          <div className="mt-5 flex items-end justify-between">
            <div>
              <div className="text-caption text-white/70">Full program</div>
              <div className="text-h2 tabular">{money(p.price)}</div>
            </div>
            <div className="text-right text-caption text-white/70">
              or {money(Math.round(p.price / p.weeks))}/week
            </div>
          </div>
        </div>
      </Card>

      {p.spotsLeft <= 2 && (
        <Alert tone="warning" title={`Only ${p.spotsLeft} spot${p.spotsLeft > 1 ? "s" : ""} left`}>
          Enrolment closes when the group is full.
        </Alert>
      )}

      <Card padding="sm">
        <ul className="divide-y divide-line/10 text-body-sm">
          <li className="flex items-center gap-3 py-2.5">
            <CalendarDays size={16} className="text-blue-300" /> <span className="text-fg-muted">Starts</span> <span className="ml-auto font-semibold">{p.startDate}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Clock size={16} className="text-blue-300" /> <span className="text-fg-muted">Schedule</span> <span className="ml-auto text-right font-semibold">{p.schedule}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Users size={16} className="text-blue-300" /> <span className="text-fg-muted">Duration</span>{" "}
            <span className="ml-auto font-semibold">
              {p.weeks} weeks · {p.sessionsPerWeek} sessions / week
            </span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <MapPin size={16} className="text-blue-300" /> <span className="text-fg-muted">Club</span> <span className="ml-auto font-semibold">{loc?.name}</span>
          </li>
        </ul>
        <div className="border-t border-line/10 px-1 pb-1 pt-3">
          <ProgressBar value={enrolled} max={p.capacity} label={`${enrolled} of ${p.capacity} enrolled`} tone={p.spotsLeft <= 2 ? "volt" : "brand"} />
        </div>
      </Card>

      <section>
        <SectionHeader title="What's included" />
        <ul className="space-y-2 text-body-sm">
          {["All court fees and balls", "Video analysis every two weeks", "End-of-program level reassessment", "10% off private sessions during the program"].map((i) => (
            <li key={i} className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="shrink-0 text-success" /> {i}
            </li>
          ))}
        </ul>
      </section>

      {trainer && (
        <section>
          <SectionHeader title="Your coach" />
          <TrainerCard trainer={trainer} />
        </section>
      )}

      <div className="fixed inset-x-0 bottom-[104px] z-30 mx-auto max-w-app px-4">
        <Button size="xl" fullWidth className="shadow-glow-md">
          Enrol · {money(p.price)}
        </Button>
      </div>
    </div>
  );
}
