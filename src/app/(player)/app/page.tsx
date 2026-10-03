import { ArrowRight, CalendarPlus, GraduationCap, MapPin, Navigation, Swords, Trophy, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/misc";
import { MatchCard, ProgramCard, QuickAction } from "@/components/patterns/cards";
import { BookingRow } from "@/components/patterns/booking-row";
import { matches, programs } from "@/data/mock";
import { listMyBookings } from "@/server/services/bookings";
import { formatInZone } from "@/lib/time";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { getMyProfile } from "@/server/services/profiles";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function PlayerDashboard() {
  const actor = await requireActorOrRedirect("/app");
  const [profile, upcoming] = await Promise.all([getMyProfile(actor), listMyBookings(actor, "upcoming")]);
  // Sessions and programs are still mock data until those phases ship.
  const next = upcoming[0];
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

      {next && (
        <Card variant="brand" padding="lg" className="court-line">
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-overline uppercase text-white/80">Next booking</span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-caption font-bold">{formatInZone(new Date(next.startsAt), next.location.timezone, { weekday: "short", day: "numeric", month: "short" })}</span>
            </div>
            <div className="mt-3 text-display tabular">{formatInZone(new Date(next.startsAt), next.location.timezone, { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="mt-1 text-body-lg font-semibold">{next.location.name}</div>
            <div className="flex items-center gap-1 text-body-sm text-white/80">
              <MapPin size={14} /> {next.court.name} · {next.durationMinutes} min · {next.confirmationCode}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" href={"/app/bookings/" + next.id}>
                View booking
              </Button>
              <Button variant="outline" className="border-white/40 text-white hover:bg-white/10" leftIcon={<Navigation />} href={"https://maps.google.com/?q=" + encodeURIComponent(next.location.address)}>
                Directions
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <QuickAction href="/app/book" icon={<CalendarPlus />} label="Book a court" hint={upcoming.length ? upcoming.length + " upcoming" : "From EGP 400/h"} />
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
            <Button variant="link" size="sm" href="/app/bookings" rightIcon={<ArrowRight />}>
              All bookings
            </Button>
          }
        />
        {upcoming.length === 0 ? (
          <Card variant="outline" padding="md" className="flex items-center justify-between gap-3">
            <span className="text-body-sm text-fg-muted">No upcoming bookings.</span>
            <Button size="sm" href="/app/book">
              Book a court
            </Button>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {upcoming.slice(0, 3).map((b) => (
              <BookingRow key={b.id} booking={b} href={"/app/bookings/" + b.id} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader eyebrow="Academy" title={`Recommended${profile.level ? ` for Level ${profile.level}` : ""}`} />
        <ProgramCard program={programs[profile.level === "A" ? 2 : profile.level === "B" ? 1 : 0]} />
      </section>
    </div>
  );
}
