import { notFound } from "next/navigation";
import { Award, Languages, MapPin, Star } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/misc";
import { byId, locationBySlug, money, programs, trainers } from "@/data/mock";
import { ProgramCard } from "@/components/patterns/cards";
import { BookSessionPanel } from "./book-session";

export default async function TrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = byId(trainers, id);
  if (!t) notFound();
  const theirPrograms = programs.filter((p) => p.trainerId === t.id);

  return (
    <div className="space-y-7">
      <PageHeader back="/app/trainers" title="Trainer" eyebrow="Academy" />

      <div className="flex items-center gap-4">
        <Avatar name={t.name.replace("Coach ", "")} size="xl" ring />
        <div className="min-w-0">
          <h2 className="text-h2">{t.name}</h2>
          <div className="text-body-sm text-blue-300">{t.title}</div>
          <div className="mt-1 flex items-center gap-1 text-body-sm">
            <Star size={14} className="fill-volt text-volt" /> <span className="font-bold">{t.rating.toFixed(1)}</span>
            <span className="text-fg-muted">({t.reviews} reviews)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Experience" value={`${t.years}y`} icon={<Award />} />
        <StatTile label="Rate" value={money(t.pricePerHour)} />
        <StatTile label="Clubs" value={t.locationSlugs.length} icon={<MapPin />} />
      </div>

      <section>
        <SectionHeader title="About" />
        <p className="text-body text-fg-muted">{t.bio}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {t.specialties.map((s) => (
            <Badge key={s} tone="brand">
              {s}
            </Badge>
          ))}
        </div>
      </section>

      <Card padding="sm">
        <ul className="divide-y divide-line/10 text-body-sm">
          <li className="flex items-center gap-3 py-2.5">
            <MapPin size={16} className="text-blue-300" />
            <span className="text-fg-muted">Coaches at</span>
            <span className="ml-auto text-right font-semibold">{t.locationSlugs.map((s) => locationBySlug(s)?.name.replace("HITTERS ", "")).join(", ")}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Languages size={16} className="text-blue-300" />
            <span className="text-fg-muted">Languages</span>
            <span className="ml-auto font-semibold">{t.languages.join(", ")}</span>
          </li>
        </ul>
      </Card>

      <BookSessionPanel trainerName={t.name} rate={t.pricePerHour} />

      {theirPrograms.length > 0 && (
        <section>
          <SectionHeader eyebrow="Academy" title="Programs by this coach" />
          <div className="space-y-3">
            {theirPrograms.map((p) => (
              <ProgramCard key={p.id} program={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
