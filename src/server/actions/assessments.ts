"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import * as assessments from "@/server/services/assessments";
import * as levels from "@/server/services/levels";
import * as training from "@/server/services/training";

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

const PATHS = ["/app/profile", "/app", "/admin/assessments", "/admin/members"];

export async function requestAssessmentAction(input: { locationId: string; note?: string }) {
  return run(async () => assessments.requestAssessment(await getActor(), input), PATHS);
}

export async function cancelAssessmentRequestAction(requestId: string, reason?: string) {
  return run(async () => assessments.cancelAssessmentRequest(await getActor(), requestId, { reason }), PATHS);
}

export async function scheduleAssessmentAction(requestId: string, input: { scheduledAt: string; assessorId?: string }) {
  return run(async () => assessments.scheduleAssessment(await getActor(), requestId, input), PATHS);
}

export async function createAssessmentAction(input: Record<string, unknown>) {
  return run(async () => assessments.createAssessment(await getActor(), input), [...PATHS, "/admin"]);
}

export async function recordLevelChangeAction(input: { playerProfileId: string; level: string; reason: string }) {
  return run(async () => assessments.recordLevelChange(await getActor(), input), PATHS);
}

export async function updateLevelDefinitionsAction(input: unknown) {
  return run(async () => levels.updateLevelDefinitions(await getActor(), input), ["/admin/assessments", "/app/profile", "/app"]);
}

export async function recordTrainingAction(input: Record<string, unknown>) {
  return run(async () => training.recordTraining(await getActor(), input), ["/admin/members", "/app/profile"]);
}
