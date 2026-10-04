import { CalendarX, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { LessonRow } from "@/components/patterns/academy";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyLessons } from "@/server/services/lessons";
import { ScopeTabs } from "./scope-tabs";

export const metadata = { title: "My lessons" };

export const dynamic = "force-dynamic";

export default async function MyLessonsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const actor = await requireActorOrRedirect("/app/lessons");
  const { scope } = await searchParams;
  const current = scope === "past" ? "past" : "upcoming";
  const items = await listMyLessons(actor, current);
  return (
    <div className="space-y-5">
      <PageHeader back="/app/programs" eyebrow="Academy" title="My lessons" action={<Button size="sm" href="/app/trainers" leftIcon={<GraduationCap />}>Book</Button>} />
      <ScopeTabs current={current} />
      {items.length === 0 ? (
        current === "upcoming" ? (
          <EmptyState icon={<GraduationCap />} title="No upcoming lessons" description="Pick a coach, choose a time inside their availability and book in a few taps." action={<Button href="/app/trainers">Find a coach</Button>} />
        ) : (
          <EmptyState icon={<CalendarX />} title="No past lessons" description="Completed and cancelled lessons appear here." />
        )
      ) : (
        <div className="space-y-2.5">
          {items.map((l) => (
            <LessonRow key={l.id} lesson={l} href={`/app/lessons/${l.id}`} viewer="player" />
          ))}
        </div>
      )}
    </div>
  );
}
