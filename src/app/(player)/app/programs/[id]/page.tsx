import { notFound } from "next/navigation";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { isAppError } from "@/lib/errors";
import { getProgram, listMyEnrollments } from "@/server/services/programs";
import { getLevelDefinitions } from "@/server/services/levels";
import { getMyProfile } from "@/server/services/profiles";
import { ThreadSection } from "@/components/patterns/thread-section";
import { ProgramDetail } from "./program-detail";

export const metadata = { title: "Program" };

export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActorOrRedirect(`/app/programs/${id}`);
  const program = await getProgram(actor, id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!program) notFound();
  const [levels, mine, profile] = await Promise.all([getLevelDefinitions(), listMyEnrollments(actor), getMyProfile(actor)]);
  const enrollment = mine.find((e) => e.programId === program.id) ?? null;
  return (
    <div className="space-y-8">
      <ProgramDetail program={program} enrollment={enrollment} levels={Object.fromEntries(levels.map((l) => [l.level, l.label]))} myLevel={profile.level} />
      <ThreadSection actor={actor} kind="PROGRAM" subjectId={program.id} path={`/app/programs/${id}`} />
    </div>
  );
}
