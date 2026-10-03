import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { listMyBookings } from "@/server/services/bookings";
import { getLevelDefinitions } from "@/server/services/levels";
import { listMyPairs } from "@/server/services/pairs";
import { NewGameForm } from "./new-game-form";

export const dynamic = "force-dynamic";

export default async function NewGamePage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const actor = await requireActorOrRedirect("/app/play/new");
  const { booking } = await searchParams;
  const [upcoming, levels, pairsAll] = await Promise.all([listMyBookings(actor, "upcoming"), getLevelDefinitions(), listMyPairs(actor)]);
  const pairs = pairsAll.filter((p) => p.status === "ACTIVE").map((p) => ({ id: p.id, label: p.name?.trim() || `with ${(p.playerAId === actor.id ? p.playerB : p.playerA).name.split(" ")[0]}`, partnerId: p.playerAId === actor.id ? p.playerBId : p.playerAId }));
  const candidates = upcoming
    .filter((b) => b.playerId === actor.id && !b.gameSession)
    .map((b) => ({ id: b.id, code: b.confirmationCode, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), timezone: b.location.timezone, location: b.location.name, court: b.court.name, priceCents: b.priceCents, currency: b.currency, durationMinutes: b.durationMinutes }));
  return <NewGameForm bookings={candidates} preselect={booking ?? null} levels={levels.map((l) => ({ level: l.level, label: l.label }))} pairs={pairs} />;
}
