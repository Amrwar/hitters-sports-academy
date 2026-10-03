"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import * as mm from "@/server/services/matchmaking";
import * as pairs from "@/server/services/pairs";

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

const PATHS = ["/app", "/app/play", "/app/play/find", "/app/play/requests", "/admin/games"];

export async function findMatchesAction(input: { dateISO?: string; startMinutes?: number; endMinutes?: number; locationIds?: string[]; kind?: "SOLO" | "PAIR"; pairId?: string }): Promise<ActionResult<mm.FindResult>> {
  return run(async () => mm.findMatches(await getActor(), input));
}

export async function requestToJoinAction(sessionId: string, input: { kind?: "SOLO" | "PAIR"; pairId?: string; message?: string }): Promise<ActionResult<mm.RequestView>> {
  return run(async () => {
    const r = await mm.requestToJoin(await getActor(), sessionId, input);
    revalidatePath(`/app/play/${r.game.code}`);
    return r;
  }, PATHS);
}

export async function withdrawRequestAction(requestId: string): Promise<ActionResult<mm.RequestView>> {
  return run(async () => {
    const r = await mm.withdrawRequest(await getActor(), requestId);
    revalidatePath(`/app/play/${r.game.code}`);
    return r;
  }, PATHS);
}

export async function decideRequestAction(requestId: string, input: { decision: "ACCEPT" | "DECLINE"; note?: string }): Promise<ActionResult<mm.RequestView>> {
  return run(async () => {
    const r = await mm.decideRequest(await getActor(), requestId, input);
    revalidatePath(`/app/play/${r.game.code}`);
    return r;
  }, PATHS);
}

export async function proposePairAction(input: { partnerUserId: string; name?: string }): Promise<ActionResult<pairs.PairView>> {
  return run(async () => pairs.proposePair(await getActor(), input), [...PATHS, "/app/play/pairs"]);
}

export async function respondToPairAction(pairId: string, response: "ACCEPT" | "DECLINE"): Promise<ActionResult<pairs.PairView | null>> {
  return run(async () => pairs.respondToPair(await getActor(), pairId, response), [...PATHS, "/app/play/pairs"]);
}

export async function dissolvePairAction(pairId: string): Promise<ActionResult<{ ok: true }>> {
  return run(async () => pairs.dissolvePair(await getActor(), pairId), [...PATHS, "/app/play/pairs"]);
}

export async function updateMatchmakingConfigAction(input: { allowAdjacentLevels: boolean; requestExpiryHours: number; maxOpenRequests: number }) {
  return run(async () => mm.updateMatchmakingConfig(await getActor(), input), ["/admin/settings", ...PATHS]);
}
