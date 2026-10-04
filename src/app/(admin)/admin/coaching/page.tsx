import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { accessibleLocationIds } from "@/lib/auth/authorize";
import { getMyTrainerProfile } from "@/server/services/trainers";
import { listLocationLessons, listTrainerLessons, listTrainerStudents } from "@/server/services/lessons";
import { listTrainerPrograms } from "@/server/services/programs";
import { listManagedLocations } from "@/server/services/locations";
import { getLevelDefinitions } from "@/server/services/levels";
import { todayISO } from "@/lib/time";
import { CoachingView } from "./coaching-view";

export const metadata = { title: "Coaching" };

export const dynamic = "force-dynamic";

export default async function CoachingPage({ searchParams }: { searchParams: Promise<{ location?: string; date?: string; tab?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const sp = await searchParams;
  const [me, levels, locations, readable] = await Promise.all([getMyTrainerProfile(actor), getLevelDefinitions(), listManagedLocations(actor), accessibleLocationIds(actor, "lesson.read")]);
  const levelLabels = Object.fromEntries(levels.map((l) => [l.level, l.label]));
  const trainerData = me
    ? {
        profile: me,
        upcoming: await listTrainerLessons(actor, me.id, "upcoming"),
        requests: await listTrainerLessons(actor, me.id, "requests"),
        past: await listTrainerLessons(actor, me.id, "past"),
        students: await listTrainerStudents(actor, me.id),
        programs: await listTrainerPrograms(actor, me.id),
      }
    : null;
  const clubs = locations.filter((l) => readable === "all" || readable.includes(l.id));
  const selected = clubs.find((l) => l.id === sp.location) ?? clubs[0] ?? null;
  const dateISO = selected ? (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayISO(selected.timezone)) : null;
  const clubLessons = selected ? await listLocationLessons(actor, selected.id, sp.date === "all" ? undefined : dateISO ?? undefined).catch(() => []) : [];
  return (
    <CoachingView
      viewerId={actor.id}
      levelLabels={levelLabels}
      trainer={trainerData}
      clubs={clubs.map((l) => ({ id: l.id, name: l.name, timezone: l.timezone }))}
      selectedClubId={selected?.id ?? null}
      dateISO={sp.date === "all" ? null : dateISO}
      clubLessons={clubLessons}
      initialTab={sp.tab ?? (me ? "calendar" : "club")}
    />
  );
}
