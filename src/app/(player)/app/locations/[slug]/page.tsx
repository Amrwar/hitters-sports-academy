import { notFound } from "next/navigation";
import { CalendarPlus, Clock, MapPin, Navigation, Phone, Star } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CourtBackdrop, MatchCard, TrainerCard } from "@/components/patterns/cards";
import { courts, locationBySlug, locations, matches, money, trainers } from "@/data/mock";

export function generateStaticParams() {
  return locations.map((l) => ({ slug: l.slug }));
}

export default async function LocationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loc = locationBySlug(slug);
  if (!loc) notFound();
  const locCourts = courts.filter((c) => c.locationSlug === slug);
  const openHere = matches.filter((m) => m.locationSlug === slug && m.status !== "completed");
  const coaches = trainers.filter((t) => t.locationSlugs.includes(slug));

  return (
    <div className="space-y-7">
      <PageHeader back="/app/locations" title={loc.name.replace("HITTERS ", "")} eyebrow="HITTERS club" />

      <CourtBackdrop src={loc.image} className="-mx-4 h-56 sm:mx-0 sm:rounded-xl">
        <div className="flex h-56 flex-col justify-end p-5 text-white">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="brand">{loc.courts} courts</Badge>
            {loc.indoorCourts > 0 && <Badge className="bg-white/15 text-white">{loc.indoorCourts} indoor</Badge>}
            <Badge className="bg-white/15 text-white">
              <Star size={12} className="fill-volt text-volt" /> {loc.rating} ({loc.reviews})
            </Badge>
          </div>
          <h2 className="mt-2 text-h2">{loc.name}</h2>
          <div className="flex items-center gap-1 text-body-sm text-blue-100/80">
            <MapPin size={14} /> {loc.address}
          </div>
        </div>
      </CourtBackdrop>

      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" href={`/app/book?location=${loc.slug}`} leftIcon={<CalendarPlus />}>
          Book a court
        </Button>
        <Button size="lg" variant="secondary" leftIcon={<Navigation />}>
          Directions
        </Button>
      </div>

      <Card padding="sm">
        <ul className="divide-y divide-line/10 text-body-sm">
          <li className="flex items-center gap-3 py-2.5">
            <Clock size={16} className="text-blue-300" /> <span className="text-fg-muted">Open</span> <span className="ml-auto font-semibold">{loc.hours}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Phone size={16} className="text-blue-300" /> <span className="text-fg-muted">Front desk</span> <span className="ml-auto font-semibold tabular">+20 2 2000 0000</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Star size={16} className="text-blue-300" /> <span className="text-fg-muted">Court rate</span>{" "}
            <span className="ml-auto font-semibold tabular">from {money(loc.priceFrom)}/h</span>
          </li>
        </ul>
      </Card>

      <section>
        <SectionHeader title="Amenities" />
        <div className="flex flex-wrap gap-2">
          {loc.amenities.map((a) => (
            <Badge key={a} tone="neutral" className="h-8 px-3 text-body-sm">
              {a}
            </Badge>
          ))}
        </div>
      </section>

      {locCourts.length > 0 && (
        <section>
          <SectionHeader title="Courts" />
          <div className="grid grid-cols-2 gap-2.5">
            {locCourts.map((c) => (
              <Card key={c.id} padding="sm" variant={c.status === "maintenance" ? "outline" : "default"}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-body font-bold">{c.name}</div>
                    <div className="text-caption text-fg-muted">{c.type}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {openHere.length > 0 && (
        <section>
          <SectionHeader eyebrow="Matchmaking" title="Sessions at this club" />
          <div className="space-y-3">
            {openHere.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {coaches.length > 0 && (
        <section>
          <SectionHeader eyebrow="Academy" title="Trainers here" />
          <div className="space-y-3">
            {coaches.map((t) => (
              <TrainerCard key={t.id} trainer={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
