import { ArrowRight, CalendarPlus, GraduationCap, MapPin, Navigation, Swords, Trophy, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { LevelBadge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/misc";
import { BookingCard, MatchCard, ProgramCard, QuickAction } from "@/components/patterns/cards";
import { bookings, currentUser, locationBySlug, matches, programs } from "@/data/mock";

export default function PlayerDashboard() {
  const next = bookings.find((b) => b.status === "confirmed");
  const nextLoc = next && locationBySlug(next.locationSlug);
  const live = matches.find((m) => m.status === "live");
  const open = matches.filter((m) => m.status === "open").slice(0, 2);
  const winRate = Math.round((currentUser.wins / currentUser.matches) * 100);

  return (
    <div className="space-y-7">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-overline uppercase text-blue-300">Good evening</div>
          <h1 className="text-h1">{currentUser.name.split(" ")[0]}</h1>
        </div>
        <LevelBadge level={currentUser.level} size="lg" withLabel />
      </div>

      {/* Next booking hero */}
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

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <QuickAction href="/app/book" icon={<CalendarPlus />} label="Book a court" hint="From EGP 400/h" />
        <QuickAction href="/app/play" icon={<Swords />} label="Find a match" hint="3 open near you" />
        <QuickAction href="/app/trainers" icon={<UserSquare2 />} label="Private coach" hint="Certified trainers" />
        <QuickAction href="/app/programs" icon={<GraduationCap />} label="Programs" hint="New intake Oct" />
      </div>

      {/* Live */}
      {live && (
        <section>
          <SectionHeader eyebrow="Happening now" title="Live at your club" />
          <MatchCard match={live} />
        </section>
      )}

      {/* Open matches */}
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

      {/* Progress */}
      <section>
        <SectionHeader eyebrow="Your season" title="Progress" />
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Matches" value={currentUser.matches} />
          <StatTile label="Win rate" value={`${winRate}%`} delta={{ value: "+4% this month" }} />
          <StatTile label="Rating" value={currentUser.rating.toFixed(1)} icon={<Trophy />} tone="brand" />
        </div>
      </section>

      {/* Upcoming bookings */}
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
      </section>

      {/* Programs */}
      <section>
        <SectionHeader eyebrow="Academy" title="Recommended for Level B" />
        <ProgramCard program={programs[1]} />
      </section>
    </div>
  );
}
