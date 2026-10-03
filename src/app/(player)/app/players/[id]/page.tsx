import { notFound } from "next/navigation";
import { MessageCircle, Star, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Avatar } from "@/components/ui/avatar";
import { LevelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { MatchCard } from "@/components/patterns/cards";
import { byId, locationBySlug, matches, players } from "@/data/mock";

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = byId(players, id);
  if (!p) notFound();
  const winRate = Math.round((p.wins / Math.max(1, p.matches)) * 100);
  const theirMatches = matches.filter((m) => m.playerIds.includes(p.id) && m.status !== "completed");

  return (
    <div className="space-y-6">
      <PageHeader back="/app/play" title="Player" eyebrow="Profile" />
      <div className="flex items-center gap-4">
        <Avatar name={p.name} size="xl" online={p.online} />
        <div className="min-w-0">
          <h2 className="text-h2">{p.name}</h2>
          <LevelBadge level={p.level} size="sm" withLabel className="mt-1" />
          <div className="mt-1 text-caption text-fg-muted">
            {p.side} side · {locationBySlug(p.homeClub)?.name} · since {p.memberSince}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button leftIcon={<UserPlus />}>Invite to match</Button>
        <Button variant="secondary" leftIcon={<MessageCircle />}>
          Message
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Matches" value={p.matches} />
        <StatTile label="Win rate" value={`${winRate}%`} />
        <StatTile label="Rating" value={p.rating.toFixed(1)} icon={<Star />} tone="brand" />
      </div>

      <section>
        <SectionHeader title="About" />
        <Card padding="md">
          <p className="text-body text-fg-muted">{p.bio}</p>
        </Card>
      </section>

      <section>
        <SectionHeader title="Upcoming sessions" />
        {theirMatches.length ? (
          <div className="space-y-3">
            {theirMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={<UserPlus />} title="No open sessions" description="Invite them to one of yours." />
        )}
      </section>

      <section>
        <SectionHeader title="Reviews" />
        <EmptyState compact icon={<Star />} title="No reviews yet" description="Reviews appear after players complete a match together." />
      </section>
    </div>
  );
}
