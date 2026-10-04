import { ArrowRight, CalendarPlus, GraduationCap, MapPin, Navigation, Swords, Trophy, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/misc";
import { QuickAction } from "@/components/patterns/cards";
import { LessonRow, ProgramCard } from "@/components/patterns/academy";
import { BookingRow } from "@/components/patterns/booking-row";
import { GameCard } from "@/components/patterns/game-card";
import { listMyBookings } from "@/server/services/bookings";
import { listMyGames } from "@/server/services/game-sessions";
import { findMatches } from "@/server/services/matchmaking";
import { listPrograms } from "@/server/services/programs";
import { listMyLessons } from "@/server/services/lessons";
import { getLevelDefinitions } from "@/server/services/levels";
import { MatchReasons, MatchStrength } from "@/components/patterns/match-reasons";
import { formatInZone } from "@/lib/time";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { getMyProfile } from "@/server/services/profiles";

export const metadata = { title: "Home" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function PlayerDashboard() {
  const actor = await requireActorOrRedirect("/app");
  const [profile, upcoming, myGames, found, programs, lessons, levelDefs] = await Promise.all([getMyProfile(actor), listMyBookings(actor, "upcoming"), listMyGames(actor, "upcoming"), findMatches(actor, { take: 2 }).catch(() => null), listPrograms(actor), listMyLessons(actor, "upcoming"), getLevelDefinitions()]);
  const recommended = found?.items ?? [];
  const levelLabels = Object.fromEntries(levelDefs.map((l) => [l.level, l.label]));
  const recommendedProgram = programs.find((p) => p.status === "OPEN" && (p.levels.length === 0 || (profile.level ? p.levels.includes(profile.level) : false))) ?? programs[0] ?? null;
  // Programs are still sample data until the academy phase ships.
  const next = upcoming[0];
  const live = myGames.find((g) => g.status === "IN_PROGRESS") ?? null;
  const invitations = myGames.filter((g) => g.participants.some((p) => p.userId === actor.id && p.status === "INVITED"));
  const nextGame = myGames.find((g) => g.status !== "IN_PROGRESS" && !invitations.includes(g)) ?? null;


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
        <QuickAction href="/app/play" icon={<Swords />} label="Play" hint={invitations.length ? `${invitations.length} invitation${invitations.length === 1 ? "" : "s"}` : recommended.length ? `${recommended.length} match${recommended.length === 1 ? "" : "es"} for you` : "Find a match"} />
        <QuickAction href="/app/trainers" icon={<UserSquare2 />} label="Private coach" hint={lessons.length ? `${lessons.length} lesson${lessons.length === 1 ? "" : "s"} booked` : "Book a coach"} />
        <QuickAction href="/app/programs" icon={<GraduationCap />} label="Programs" hint={programs.length ? `${programs.length} open` : "Academy"} />
      </div>

      {live && (
        <section>
          <SectionHeader eyebrow="Happening now" title="Your game is on" />
          <GameCard game={live} viewerId={actor.id} href={`/app/play/${live.code}`} />
        </section>
      )}

      {(invitations.length > 0 || nextGame) && (
        <section>
          <SectionHeader
            eyebrow="Games"
            title={invitations.length ? `${invitations.length} invitation${invitations.length === 1 ? "" : "s"} waiting` : "Your next game"}
            action={
              <Button variant="link" size="sm" href="/app/play" rightIcon={<ArrowRight />}>
                My games
              </Button>
            }
          />
          <div className="space-y-3">
            {invitations.slice(0, 2).map((g) => (
              <GameCard key={g.id} game={g} viewerId={actor.id} href={`/app/play/${g.code}`} />
            ))}
            {invitations.length === 0 && nextGame && <GameCard game={nextGame} viewerId={actor.id} href={`/app/play/${nextGame.code}`} />}
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          eyebrow="Matchmaking"
          title="Matches for you"
          action={
            <Button variant="link" size="sm" href="/app/play/find" rightIcon={<ArrowRight />}>
              Find a match
            </Button>
          }
        />
        {recommended.length ? (
          <div className="space-y-3">
            {recommended.map(({ game, match }) => (
              <div key={game.id} className="space-y-2">
                <GameCard game={game} viewerId={actor.id} href={`/app/play/${game.code}`} action={<MatchStrength score={match.score} />} />
                <MatchReasons reasons={match.reasons} compact className="px-1" />
              </div>
            ))}
          </div>
        ) : (
          <Card variant="outline" padding="md" className="flex items-center justify-between gap-3">
            <span className="text-body-sm text-fg-muted">{profile.level ? "No open games match your level right now." : "Get your official level to unlock matchmaking."}</span>
            <Button size="sm" variant="secondary" href={profile.level ? "/app/play/new" : "/app/profile?tab=assessment"}>
              {profile.level ? "Organize one" : "Get assessed"}
            </Button>
          </Card>
        )}
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

      {lessons.length > 0 && (
        <section>
          <SectionHeader eyebrow="Coaching" title="Next lesson" action={<Button variant="link" size="sm" href="/app/lessons" rightIcon={<ArrowRight />}>All lessons</Button>} />
          <LessonRow lesson={lessons[0]} href={`/app/lessons/${lessons[0].id}`} viewer="player" />
        </section>
      )}
      {recommendedProgram && (
        <section>
          <SectionHeader eyebrow="Academy" title={`Recommended${profile.level ? ` for Level ${profile.level}` : ""}`} action={<Button variant="link" size="sm" href="/app/programs" rightIcon={<ArrowRight />}>Programs</Button>} />
          <ProgramCard program={recommendedProgram} levelLabels={levelLabels} href={`/app/programs/${recommendedProgram.code}`} />
        </section>
      )}
    </div>
  );
}
