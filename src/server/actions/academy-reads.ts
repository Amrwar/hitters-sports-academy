"use server";

import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import * as programs from "@/server/services/programs";
import * as lessons from "@/server/services/lessons";

export async function listProgramEnrollmentsAction(programId: string): Promise<ActionResult<programs.EnrollmentView[]>> {
  try {
    return { ok: true, data: await programs.listProgramEnrollments(await getActor(), programId) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function listProgressNotesAction(playerId: string): Promise<ActionResult<lessons.NoteView[]>> {
  try {
    return { ok: true, data: await lessons.listProgressNotes(await getActor(), playerId) };
  } catch (e) {
    return toActionError(e);
  }
}
