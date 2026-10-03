import { notFound } from "next/navigation";
import { Award, MapPin } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/misc";
import { money } from "@/components/patterns/booking-status";
import { ProgramCard, TrainerMeta } from "@/components/patterns/academy";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { isAppError } from "@/lib/errors";
import { getTrainer } from "@/server/services/trainers";
import { listPrograms } from "@/server/services/programs";
import { usablePurchases } from "@/server/services/packages";
import { getLevelDefinitions } from "@/server/services/levels";
import { getMyProfile } from "@/server/services/profiles";
import { BookLessonPanel } from "./book-lesson";

export const dynamic = "force-dynamic";

export default async function TrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActorOrRedirect(`/app/trainers/${id}`);
  const t = await getTrainer(actor, id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!t) notFound();
  const [levels, programs, profile] = await Promise.all([getLevelDefinitions(), listPrograms(actor), getMyProfile(actor)]);
  const levelLabels = Object.fromEntries(levels.map((l) => [l.level, l.label]));
  const theirs = programs.filter((p) => p.trainerId === t.id);
  const eligible = t.levels.length === 0 || (profile.level ? t.levels.includes(profile.level) : false);
  const purchases = await Promise.all(t.locations.map((l) => usablePurchases(actor, actor.id, t.id, l.location.id)));
  const credits = [...new Map(purchases.flat().map((p) => [p.id, p])).values()].map((p) => ({ id: p.id, name: p.name, creditsLeft: p.creditsLeft, trainerId: p.trainerId, locationId: p.locationId, expiresAt: p.expiresAt.toISOString().slice(0, 10) }));

  return (
    <div className="space-y-7">
      <PageHeader back="/app/trainers" title="Coach" eyebrow="Academy" />
      <div className="flex items-center gap-4">
        <Avatar name={t.user.name} src={t.photoUrl} size="xl" ring />
        <div className="min-w-0">
          <h2 className="text-h2">{t.user.name}</h2>
          <div className="text-body-sm text-blue-300">{t.title}</div>
          <div className="mt-1 flex gap-1">{t.levels.length ? t.levels.map((l) => <LevelBadge key={l} level={l} size="sm" label={levelLabels[l]} />) : <Badge size="sm">All levels</Badge>}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Rate" value={<span className="text-h4">{money(t.hourlyRateCents, t.currency)}/h</span>} />
        <StatTile label="Lessons" value={t._count.lessons} icon={<Award />} />
        <StatTile label="Clubs" value={t.locations.length} icon={<MapPin />} />
      </div>
      {t.bio && (
        <section>
          <SectionHeader title="About" />
          <p className="text-body text-fg-muted">{t.bio}</p>
        </section>
      )}
      <div className="flex flex-wrap gap-1.5">
        {t.specialties.map((s) => (
          <Badge key={s} tone="brand">
            {s}
          </Badge>
        ))}
        {t.qualifications.map((q) => (
          <Badge key={q} size="sm">
            {q}
          </Badge>
        ))}
      </div>
      <Card padding="sm">
        <TrainerMeta trainer={t} />
      </Card>

      <BookLessonPanel
        trainer={{ id: t.id, name: t.user.name, rateCents: t.hourlyRateCents, currency: t.currency, durations: t.durationsMinutes, autoConfirm: t.autoConfirm, levels: t.levels }}
        locations={t.locations.map((l) => ({ id: l.location.id, name: l.location.name, timezone: l.location.timezone }))}
        eligible={eligible}
        myLevel={profile.level}
        credits={credits}
      />

      {theirs.length > 0 && (
        <section>
          <SectionHeader eyebrow="Academy" title="Programs by this coach" />
          <div className="space-y-3">
            {theirs.map((p) => (
              <ProgramCard key={p.id} program={p} levelLabels={levelLabels} href={`/app/programs/${p.code}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
