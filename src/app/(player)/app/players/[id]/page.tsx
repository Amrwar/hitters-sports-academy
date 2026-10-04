import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock, Lock, MapPin, Swords, Trophy, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { MATCH_TYPES, preferredTimeLabel } from "@/lib/catalog";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { isAppError } from "@/lib/errors";
import { getProfile } from "@/server/services/profiles";
import { getLevelMap } from "@/server/services/levels";
import { label } from "@/lib/catalog";

export const metadata = { title: "Player" };

export const dynamic = "force-dynamic";

/** Public player profile (by profile id). Visibility rules are enforced by the service. */
export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActorOrRedirect();
  const { id } = await params;
  let p: Awaited<ReturnType<typeof getProfile>>;
  try {
    p = await getProfile(actor, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    if (isAppError(e) && e.code === "FORBIDDEN") {
      return (
        <div>
          <PageHeader back="/app/play" title="Player" eyebrow="Profile" />
          <EmptyState icon={<Lock />} title="This profile is private" description="The player has chosen to keep their profile hidden." />
        </div>
      );
    }
    throw e;
  }
  const levels = await getLevelMap();
  const self = p.user.id === actor.id;

  return (
    <div className="space-y-6">
      <PageHeader back="/app/play" title="Player" eyebrow="Profile" />
      <div className="flex items-center gap-4">
        {p.photoUrl ? (
          <span className="relative size-20 shrink-0 overflow-hidden rounded-full">
            <Image src={p.photoUrl} alt={p.user.name} fill sizes="80px" className="object-cover" unoptimized />
          </span>
        ) : (
          <Avatar name={p.user.name} size="xl" />
        )}
        <div className="min-w-0">
          <h2 className="truncate text-h2">{p.user.name}</h2>
          <div className="mt-1">{p.level ? <LevelBadge level={p.level} size="sm" withLabel label={levels[p.level].label} /> : <Badge>Not yet assessed</Badge>}</div>
          <div className="mt-1 text-caption text-fg-muted">
            {label("side", p.side)} · {p.homeLocation?.name ?? "No home club"} · since {new Date(p.user.createdAt).toLocaleDateString("en", { month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      {!self && (
        <div className="grid grid-cols-2 gap-2">
          <Button leftIcon={<UserPlus />} href={`/app/play/new?invite=${p.user.id}`}>
            Invite to a game
          </Button>
          <Button variant="secondary" href="/app/play/find">
            Find a match
          </Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Level" value={p.level ?? "—"} />
        <StatTile label="Assessments" value={p._count.assessments} />
        <StatTile label="Training" value={p._count.trainingRecords} icon={<Trophy />} tone="brand" />
      </div>

      <section>
        <SectionHeader title="Playing preferences" />
        <Card padding="sm">
          <ul className="divide-y divide-line/10 text-body-sm">
            <li className="flex items-center gap-3 py-2.5">
              <Swords size={16} className="text-blue-300" /> <span className="text-fg-muted">Match type</span>
              <span className="ml-auto font-semibold">{MATCH_TYPES.find((m) => m.value === p.matchType)?.label}</span>
            </li>
            <li className="flex items-start gap-3 py-2.5">
              <Clock size={16} className="mt-0.5 text-blue-300" /> <span className="text-fg-muted">Usually plays</span>
              <span className="ml-auto max-w-[60%] text-right font-semibold">{p.preferredTimes.length ? p.preferredTimes.map(preferredTimeLabel).join(", ") : "—"}</span>
            </li>
            <li className="flex items-start gap-3 py-2.5">
              <MapPin size={16} className="mt-0.5 text-blue-300" /> <span className="text-fg-muted">Clubs</span>
              <span className="ml-auto max-w-[60%] text-right font-semibold">{[p.homeLocation, ...p.preferredLocations.filter((l) => l.id !== p.homeLocationId)].filter(Boolean).map((l) => l!.name.replace("HITTERS ", "")).join(", ") || "—"}</span>
            </li>
          </ul>
        </Card>
      </section>

      {p.bio && (
        <section>
          <SectionHeader title="About" />
          <Card padding="md">
            <p className="text-body text-fg-muted">{p.bio}</p>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title="Reviews" />
        <EmptyState compact icon={<Trophy />} title="No reviews yet" description="Reviews appear after players complete a match together." />
      </section>
    </div>
  );
}
