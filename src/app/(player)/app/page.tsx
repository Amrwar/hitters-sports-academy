import { ArrowRight, CalendarPlus, GraduationCap, MapPin, Navigation, Swords, Trophy, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/misc";
import { BookingCard, MatchCard, ProgramCard, QuickAction } from "@/components/patterns/cards";
import { bookings, locationBySlug, matches, programs } from "@/data/mock";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { getMyProfile } from "@/server/services/profiles";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function PlayerDashboard() {
  const actor = await requireActorOrRedirect("/app");
  const profile = await getMyProfile(actor);
  // Bookings, sessions and programs are still mock data until those phases ship.
  const next = bookings.find((b) => b.status === "confirmed");
  const nextLoc = next && locationBySlug(next.locationSlug);
  const live = matches.find((m) => m.status === "live");
  const open = matches.filter((m) => m.status === "open").slice(0, 2);

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-overline uppercase text-blue-300">{greeting()}</div>
          <h1 className="text-h1">{actor.name.split(" ")[0]}</h1>
        </div>
        {profile.level ? (
          <LevelBadge level={profile.level} size="lg" withLabel />
        ) : (
          <Button size="sm" variant="outline" href="/app/trainers">
            Book assessment
          </Button>
        )}
      </div>

      {!profile.level && (
        <Card variant="brand" padding="md" className="court-line">
          <div className="relative flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-white/15 text-h3 font-extrabold">?</span>
            <div className="min-w-0 flex-1">
              <div className="text-h4">Get your level</div>
              <div className="text-body-sm text-white/80">A free 30-minute assessment places you at A, B, C or D so matchmaking fits your game.</div>
            </div>
          </div>
        </Card>
      )}

      {next && nextLoc && (
        <Card variant="brand" padding="lg" className="court-line">
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-overline uppercase text-white/80">Next booking</span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-caption font-bold">{next.date}</span>
            </div>
            <div className="mt-3 text-display tabular">{next.time}</div>
            <div className="mt-1 text-body-lg font-semibold">{nextLoc.name}</div>
            <div className="flex items-center gap-1 text-body-sm text-white/80">
              <MapPin size={14} /> {next.court} · {next.durationMin} min
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" href="/app/profile">
                View booking
              </Button>
              <Button variant="outline" className="border-white/40 text-white hover:bg-white/10" leftIcon={<Navigation />}>
                Directions
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <QuickAction href="/app/book" icon={<CalendarPlus />} label="Book a court" hint="From EGP 400/h" />
        <QuickAction href="/app/play" icon={<Swords />} label="Find a match" hint="3 open near you" />
        <QuickAction href="/app/trainers" icon={<UserSquare2 />} label="Private coach" hint="Certified trainers" />
        <QuickAction href="/app/programs" icon={<GraduationCap />} label="Programs" hint="New intake Oct" />
      </div>

      {live && (
        <section>
          <SectionHeader eyebrow="Happening now" title="Live at your club" />
          <MatchCard match={live} />
        </section>
      )}

      <section>
        <SectionHeader
          eyebrow="Matchmaking"
          title="Open sessions for you"
          action={
            <Button variant="link" size="sm" href="/app/play" rightIcon={<ArrowRight />}>
              See all
            </Button>
          }
        />
        <div className="space-y-3">
          {open.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader eyebrow="Your season" title="Progress" />
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Level" value={profile.level ?? "—"} />
          <StatTile label="Assessments" value={profile.assessments.length} />
          <StatTile label="Home club" value={<span className="text-h4">{profile.homeLocation?.name.replace("HITTERS ", "") ?? "Not set"}</span>} icon={<Trophy />} tone="brand" />
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Bookings"
          title="Upcoming"
          action={
            <Button variant="link" size="sm" href="/app/profile" rightIcon={<ArrowRight />}>
              All bookings
            </Button>
          }
        />
        <div className="space-y-2.5">
          {bookings
            .filter((b) => b.status === "confirmed" || b.status === "pending")
            .map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
        </div>
        <Badge className="mt-2">Sample data until booking launches</Badge>
      </section>

      <section>
        <SectionHeader eyebrow="Academy" title={`Recommended${profile.level ? ` for Level ${profile.level}` : ""}`} />
        <ProgramCard program={programs[profile.level === "A" ? 2 : profile.level === "B" ? 1 : 0]} />
      </section>
    </div>
  );
}
