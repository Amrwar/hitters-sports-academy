import { NextResponse } from "next/server";
import { sendDueReminders } from "@/server/services/reminders";
import { advanceElapsedGames } from "@/server/services/game-sessions";
import { advancePrograms } from "@/server/services/programs";

export const dynamic = "force-dynamic";

/**
 * The scheduled pass: moves elapsed games and programs along, then sends the reminders due in the next day.
 * Guarded by CRON_SECRET, which Vercel Cron sends as a bearer token. Safe to call repeatedly: every reminder
 * dedupes on the booking or lesson it is about.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  await advanceElapsedGames(now);
  await advancePrograms(now);
  const run = await sendDueReminders({ now });
  return NextResponse.json({ ok: true, at: now.toISOString(), ...run });
}
