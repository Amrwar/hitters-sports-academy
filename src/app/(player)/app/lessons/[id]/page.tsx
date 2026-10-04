import { notFound } from "next/navigation";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { isAppError } from "@/lib/errors";
import { getLesson } from "@/server/services/lessons";
import { getLevelDefinitions } from "@/server/services/levels";
import { LessonDetail } from "./lesson-detail";

export const metadata = { title: "Lesson" };

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActorOrRedirect(`/app/lessons/${id}`);
  const lesson = await getLesson(actor, id).catch((e) => {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) return null;
    throw e;
  });
  if (!lesson) notFound();
  const levels = await getLevelDefinitions();
  return <LessonDetail lesson={lesson} viewerId={actor.id} levels={Object.fromEntries(levels.map((l) => [l.level, l.label]))} />;
}
