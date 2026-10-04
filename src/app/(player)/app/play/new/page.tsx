import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { db } from "@/lib/db";
import { listMyBookings } from "@/server/services/bookings";
import { getLevelDefinitions } from "@/server/services/levels";
import { listMyPairs } from "@/server/services/pairs";
import { NewGameForm } from "./new-game-form";

export const metadata = { title: "Organize a game" };

export const dynamic = "force-dynamic";

export default async function NewGamePage({ searchParams }: { searchParams: Promise<{ booking?: string; invite?: string }> }) {
  const actor = await requireActorOrRedirect("/app/play/new");
  const { booking, invite } = await searchParams;
  const [upcoming, levels, pairsAll, invited] = await Promise.all([
    listMyBookings(actor, "upcoming"),
    getLevelDefinitions(),
    listMyPairs(actor),
    // /app/play/new?invite=<userId> comes from a player's profile, so their name is already in the picker.
    invite && invite !== actor.id
      ? db.user.findFirst({ where: { id: invite, status: "ACTIVE" }, select: { id: true, name: true, playerProfile: { select: { level: true } } } })
      : Promise.resolve(null),
  ]);
  const pairs = pairsAll.filter((p) => p.status === "ACTIVE").map((p) => ({ id: p.id, label: p.name?.trim() || `with ${(p.playerAId === actor.id ? p.playerB : p.playerA).name.split(" ")[0]}`, partnerId: p.playerAId === actor.id ? p.playerBId : p.playerAId }));
  const candidates = upcoming
    .filter((b) => b.playerId === actor.id && !b.gameSession)
    .map((b) => ({ id: b.id, code: b.confirmationCode, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), timezone: b.location.timezone, location: b.location.name, court: b.court.name, priceCents: b.priceCents, currency: b.currency, durationMinutes: b.durationMinutes }));
  return (
    <NewGameForm
      bookings={candidates}
      preselect={booking ?? null}
      levels={levels.map((l) => ({ level: l.level, label: l.label }))}
      pairs={pairs}
      preInvited={invited ? [{ id: invited.id, name: invited.name, level: invited.playerProfile?.level ?? null }] : []}
    />
  );
}
