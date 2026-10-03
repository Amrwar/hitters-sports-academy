"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import * as games from "@/server/services/game-sessions";
import { searchPlayers, type PlayerHit } from "@/server/services/profiles";

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

const PATHS = ["/app", "/app/play", "/app/bookings", "/admin/games", "/admin"];
const gamePaths = (g: { code: string; bookingId: string }) => [...PATHS, `/app/play/${g.code}`, `/app/bookings/${g.bookingId}`];

export async function createGameAction(input: Record<string, unknown>): Promise<ActionResult<games.GameView>> {
  return run(async () => {
    const g = await games.createGameSession(await getActor(), input);
    for (const p of gamePaths(g)) revalidatePath(p);
    return g;
  });
}

export async function updateGameAction(sessionId: string, input: Record<string, unknown>): Promise<ActionResult<games.GameView>> {
  return run(async () => games.updateGameSession(await getActor(), sessionId, input), PATHS);
}

export async function publishGameAction(sessionId: string): Promise<ActionResult<games.GameView>> {
  return run(async () => games.publishGame(await getActor(), sessionId), PATHS);
}

export async function confirmGameAction(sessionId: string): Promise<ActionResult<games.GameView>> {
  return run(async () => games.confirmGame(await getActor(), sessionId), PATHS);
}

export async function cancelGameAction(sessionId: string, reason?: string): Promise<ActionResult<games.GameView>> {
  return run(async () => games.cancelGame(await getActor(), sessionId, { reason }), PATHS);
}

export async function inviteToGameAction(sessionId: string, userIds: string[]): Promise<ActionResult<games.GameView>> {
  return run(async () => games.inviteToGame(await getActor(), sessionId, { userIds }), PATHS);
}

export async function respondToInviteAction(sessionId: string, response: "ACCEPT" | "DECLINE"): Promise<ActionResult<games.GameView>> {
  return run(async () => games.respondToInvite(await getActor(), sessionId, response), PATHS);
}

export async function leaveGameAction(sessionId: string): Promise<ActionResult<games.GameView>> {
  return run(async () => games.leaveGame(await getActor(), sessionId), PATHS);
}

export async function removeParticipantAction(sessionId: string, userId: string): Promise<ActionResult<games.GameView>> {
  return run(async () => games.removeParticipant(await getActor(), sessionId, userId), PATHS);
}

export async function discoverGamesAction(input: { locationId?: string; level?: string; dateISO?: string }): Promise<ActionResult<games.GameView[]>> {
  return run(async () => games.discoverGames(await getActor(), input));
}

export async function searchPlayersAction(q: string): Promise<ActionResult<PlayerHit[]>> {
  return run(async () => searchPlayers(await getActor(), { q }));
}
