import { CalendarCheck, GraduationCap, Package, Users } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Card, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { EnrollmentBadge, ProgramCard } from "@/components/patterns/academy";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyEnrollments, listPrograms } from "@/server/services/programs";
import { listMyLessons } from "@/server/services/lessons";
import { getLevelDefinitions } from "@/server/services/levels";
import { getMyProfile } from "@/server/services/profiles";
import { QuickAction } from "@/components/patterns/cards";

export const metadata = { title: "Academy" };

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const actor = await requireActorOrRedirect("/app/programs");
  const [programs, mine, lessons, levels, profile] = await Promise.all([listPrograms(actor), listMyEnrollments(actor), listMyLessons(actor, "upcoming"), getLevelDefinitions(), getMyProfile(actor)]);
  const levelLabels = Object.fromEntries(levels.map((l) => [l.level, l.label]));
  const active = mine.filter((e) => e.status === "ENROLLED" || e.status === "WAITLISTED");
  const forMe = programs.filter((p) => !active.some((e) => e.programId === p.id));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Academy" title="Train with HITTERS" />
      <div className="grid grid-cols-2 gap-3">
        <QuickAction href="/app/trainers" icon={<Users />} label="Private coaching" hint={lessons.length ? `${lessons.length} upcoming lesson${lessons.length === 1 ? "" : "s"}` : "Book a coach"} />
        <QuickAction href="/app/packages" icon={<Package />} label="Lesson packages" hint="5, 10 or custom" />
      </div>
      {!profile.level && (
        <Card variant="brand" padding="md" className="court-line">
          <div className="relative flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-white/15">
              <GraduationCap size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-h4">Not sure of your level?</div>
              <div className="text-body-sm text-white/80">Request a free assessment; many programs are level-based.</div>
            </div>
            <Button size="sm" variant="secondary" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" href="/app/profile?tab=assessment">
              Request
            </Button>
          </div>
        </Card>
      )}
      {active.length > 0 && (
        <section>
          <SectionHeader eyebrow="Enrolled" title="My programs" action={<Button variant="link" size="sm" href="/app/lessons" rightIcon={<CalendarCheck />}>Lessons</Button>} />
          <div className="space-y-3">
            {active.map((e) => (
              <ProgramCard key={e.id} program={e.program} levelLabels={levelLabels} href={`/app/programs/${e.program.code}`} action={<EnrollmentBadge status={e.status} position={e.position} size="md" />} />
            ))}
          </div>
        </section>
      )}
      <section>
        <SectionHeader eyebrow="Programs" title={profile.level ? `Open programs for Level ${profile.level} and all levels` : "Open programs"} />
        {forMe.length ? (
          <div className="space-y-3">
            {forMe
              .sort((a, b) => Number(b.levels.length === 0 || (profile.level ? b.levels.includes(profile.level) : false)) - Number(a.levels.length === 0 || (profile.level ? a.levels.includes(profile.level) : false)))
              .map((p) => (
                <ProgramCard key={p.id} program={p} levelLabels={levelLabels} href={`/app/programs/${p.code}`} />
              ))}
          </div>
        ) : (
          <EmptyState icon={<GraduationCap />} title="No open programs" description="New intakes are announced here. Private coaching is available any time." action={<Button href="/app/trainers">Find a coach</Button>} />
        )}
      </section>
    </div>
  );
}
