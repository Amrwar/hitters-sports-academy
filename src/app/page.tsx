import Image from "next/image";
import { ArrowRight, CalendarCheck, ChevronDown, ClipboardCheck, GraduationCap, LayoutDashboard, LayoutGrid, MapPin, Search, ShieldCheck, Swords, Users, Zap } from "lucide-react";
import { Lockup, Monogram } from "@/components/brand/Logo";
import { MarketingFooter, MarketingNav } from "@/components/nav/marketing-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { CourtBackdrop } from "@/components/patterns/cards";
import { count } from "@/lib/text";
import { money } from "@/components/patterns/booking-status";
import { listPublicLocations } from "@/server/services/locations";
import { getSiteContent, type SiteContent } from "@/server/services/public-site";
import { Avatar } from "@/components/ui/avatar";
import { programCategoryLabel } from "@/lib/catalog";
import { shortDate } from "@/lib/time";
import { pluralize } from "@/lib/text";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const PHOTOS = ["/brand/court-net.jpg", "/brand/court-rackets.jpg", "/brand/court-line.jpg", "/brand/court-handles.jpg"];

export default async function LandingPage() {
  // Everything on this page is read from the live tables, so the site is never out of date with the academy
  // it is selling. A failed read degrades to an absent section rather than a broken page.
  const [clubs, site] = await Promise.all([
    listPublicLocations().catch(() => []),
    getSiteContent().catch((): SiteContent => ({ coaches: [], programs: [] })),
  ]);
  const totalCourts = clubs.reduce((n, c) => n + c.activeCourts, 0);
  const cheapest = clubs.map((c) => c.priceFromCents).filter((p): p is number => p != null);
  const fromPrice = cheapest.length ? Math.min(...cheapest) : null;
  // Two coaches in a four-column grid leave half a row of nothing; the track count follows the roster.
  const coachCols = site.coaches.length >= 4 ? "lg:grid-cols-4" : site.coaches.length === 3 ? "max-w-4xl lg:grid-cols-3" : "max-w-2xl";

  return (
    <div data-theme="dark" className="bg-navy-950 text-white">
      <MarketingNav />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-court">
        <div className="pointer-events-none absolute inset-0 lg:left-1/2" aria-hidden>
          <Image
            src="/brand/monogram-3d.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain object-center opacity-40 [mask-image:radial-gradient(55%_55%_at_50%_50%,black_35%,transparent_72%)] lg:opacity-90"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(180deg,rgba(3,7,18,0)_0%,#030712_100%)]" />
        <div className="relative mx-auto flex min-h-[92dvh] max-w-6xl flex-col items-center justify-center px-4 pb-16 pt-28 text-center sm:px-6 lg:items-start lg:text-left">
          <Badge tone="brand" dot pulse className="mb-6 bg-white/10 text-blue-100 ring-white/15">
            {clubs.length > 0 ? `Now open · ${count(clubs.length, "club")} across Egypt` : "Now open across Egypt"}
          </Badge>
          <Lockup height={44} glow className="sm:hidden" />
          <Lockup height={72} glow className="hidden sm:inline-flex" />
          <h1 className="mt-8 max-w-2xl text-display sm:text-display-xl">
            Book courts. Find your match. <span className="text-gradient-blue">Hit harder.</span>
          </h1>
          <p className="mt-5 max-w-xl text-body-lg text-blue-100/80">
            The premium padel academy platform. Smart matchmaking by level, instant court booking across every HITTERS club, and coaching from the best in the game.
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
            <Button size="xl" href="/app" rightIcon={<ArrowRight />}>
              Open the app
            </Button>
            <Button size="xl" variant="outline" href="/login" className="border-white/30 text-white hover:bg-white/10">
              Sign in
            </Button>
          </div>
          <div className="mt-12 grid w-full max-w-xl grid-cols-3 gap-3 text-left">
            {[
              { v: String(totalCourts || "23"), l: totalCourts === 1 ? "Court" : "Courts" },
              { v: String(clubs.length || 4), l: clubs.length === 1 ? "Club" : "Clubs" },
              { v: fromPrice ? money(fromPrice) : "EGP 400", l: "From, an hour" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border border-white/10 bg-white/5 p-3 backdrop-blur-xl sm:p-4">
                <div className="text-h2 tabular sm:text-h1">{s.v}</div>
                <div className="text-caption text-blue-100/70">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Locations */}
      <section id="locations" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-overline uppercase text-blue-300">Locations</div>
            <h2 className="mt-1 text-h1">One membership. Every club.</h2>
          </div>
          <Button variant="link" href="/app/locations" rightIcon={<ArrowRight />}>
            View all locations
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {clubs.map((l, i) => (
            <Card key={l.slug} variant="interactive" padding="none" href={`/app/locations/${l.slug}`}>
              <CourtBackdrop src={l.photos[0]?.url ?? PHOTOS[i % PHOTOS.length]} overlay="soft" className="h-40">
                <div className="flex h-40 flex-col justify-end p-4">
                  <div className="text-h4">{l.name.replace("HITTERS ", "")}</div>
                  <div className="flex items-center gap-1 text-caption text-blue-100/80">
                    <MapPin size={12} /> {l.area ?? l.city}
                  </div>
                </div>
              </CourtBackdrop>
              <div className="flex items-center justify-between px-4 py-3 text-body-sm text-blue-100/70">
                <span className="flex items-center gap-1.5">
                  <LayoutGrid size={14} className="text-blue-300" /> <span className="font-bold text-white">{l.status === "COMING_SOON" ? "Opening soon" : count(l.activeCourts, "court")}</span>
                </span>
                {l.priceFromCents != null && (
                  <span>
                    from <span className="font-bold text-white tabular">{money(l.priceFromCents)}</span>
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Play / matchmaking */}
      <section id="play" className="scroll-mt-24 border-y border-white/10 bg-court">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <div className="text-overline uppercase text-blue-300">Smart matchmaking</div>
            <h2 className="mt-1 text-h1">Never play without a fourth again.</h2>
            <p className="mt-4 text-body-lg text-blue-100/75">
              Every player is assessed and placed at level A, B, C or D. Open a game solo, as a pair or with three, and HITTERS fills the court with players who match yours.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: <Users />, t: "Solo, pair and 3+1 matching", d: "Join as one, two or three and we complete the four." },
                { icon: <ShieldCheck />, t: "Organizer approval", d: "You decide who joins your game. Requests, not surprises." },
                { icon: <Zap />, t: "Level-locked games", d: "Competitive games stay competitive." },
              ].map((f) => (
                <li key={f.t} className="flex gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20 [&_svg]:size-5">{f.icon}</span>
                  <div>
                    <div className="text-body font-bold">{f.t}</div>
                    <div className="text-body-sm text-blue-100/70">{f.d}</div>
                  </div>
                </li>
              ))}
            </ul>
            <Button className="mt-8" size="lg" href="/app/play/find" leftIcon={<Swords />}>
              Find a match
            </Button>
          </div>
          {/* A picture of the product, not a working control: nothing inside is clickable. */}
          <div className="relative" aria-hidden>
            {/* Decorative glow. It keeps its vertical bleed but must not widen the page on a phone, where the card already sits against the gutter. */}
            <div className="absolute -inset-y-6 inset-x-0 rounded-[40px] bg-blue-500/20 blur-3xl sm:-inset-x-6" />
            <Card variant="glass" padding="lg" className="relative rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-caption text-blue-100/70">
                  <Monogram height={14} /> Evening doubles · Court 2
                </div>
                <Badge tone="brand" dot>
                  1 spot left
                </Badge>
              </div>
              <div className="mt-5 grid grid-cols-4 gap-3">
                {["Omar F.", "Nour E.", "Laila M.", "You?"].map((n, i) => (
                  <div key={n} className="flex flex-col items-center gap-2">
                    <div className={`flex size-14 items-center justify-center rounded-full text-body-sm font-bold ${i === 3 ? "border-2 border-dashed border-blue-300/60 text-blue-200 animate-pulse-glow" : "bg-brand-gradient"}`}>
                      {i === 3 ? "+" : n.split(" ").map((x) => x[0]).join("")}
                    </div>
                    <span className="text-caption text-blue-100/80">{n}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between rounded-md bg-white/5 p-3">
                <div className="flex items-center gap-2">
                  <LevelBadge level="B" size="sm" />
                  <span className="text-body-sm text-blue-100/80">Level B · Competitive</span>
                </div>
                <span className="text-body-sm font-bold">Today 19:00</span>
              </div>
              <div className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-brand-gradient text-body-sm font-semibold text-white shadow-glow-sm">Request to join</div>
            </Card>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
        <div className="text-overline uppercase text-blue-300">How it works</div>
        <h2 className="mt-1 max-w-2xl text-h1">From signing up to walking on court, in four steps.</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "01", icon: <ClipboardCheck />, t: "Get your level", d: "Book a free assessment at any club. A coach places you at A, B, C or D, and that level follows you everywhere." },
            { n: "02", icon: <CalendarCheck />, t: "Book a court", d: "See live availability across every HITTERS club with the real price for that hour. Pay at the venue." },
            { n: "03", icon: <Search />, t: "Fill the court", d: "Open your game to players at your level. Every suggestion explains why it fits, and you approve who joins." },
            { n: "04", icon: <GraduationCap />, t: "Keep improving", d: "Add private lessons, a multi-week program or a credit package, all tracked in your profile." },
          ].map((step) => (
            <li key={step.n}>
              <Card variant="default" padding="lg" className="h-full">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20 [&_svg]:size-5">{step.icon}</span>
                  <span className="text-h3 tabular text-white/15">{step.n}</span>
                </div>
                <h3 className="mt-4 text-h4">{step.t}</h3>
                <p className="mt-2 text-body-sm text-blue-100/70">{step.d}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Academy */}
      <section id="academy" className="scroll-mt-24 border-y border-white/10 bg-court">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="text-overline uppercase text-blue-300">Academy</div>
          <h2 className="mt-1 text-h1">Train with the people who built the game here.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: <GraduationCap />, t: "Programs", d: "Six to twelve week structured programs, from Foundations to the Elite Pathway, with a place held for you every week.", href: "/app/programs", cta: "Browse programs" },
              { icon: <Users />, t: "Private coaching", d: "Book certified coaches by the hour at any HITTERS club, with their real availability and your own notes after each lesson.", href: "/app/trainers", cta: "Meet the coaches" },
              { icon: <CalendarCheck />, t: "Training packages", d: "Buy five or ten lessons at once and spend the credits whenever you book. Every session is tracked in your profile.", href: "/app/packages", cta: "See packages" },
            ].map((f) => (
              <Card key={f.t} variant="default" padding="lg" className="flex flex-col">
                <span className="flex size-12 items-center justify-center rounded-md bg-brand-gradient text-white shadow-glow-sm [&_svg]:size-6">{f.icon}</span>
                <h3 className="mt-5 text-h3">{f.t}</h3>
                <p className="mt-2 flex-1 text-body text-blue-100/70">{f.d}</p>
                <Button variant="link" href={f.href} rightIcon={<ArrowRight />} className="mt-4 self-start">
                  {f.cta}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* The coaches, with real faces. A page that sells coaching and shows no coach asks for a lot of trust. */}
      {site.coaches.length > 0 && (
        <section id="coaches" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-overline uppercase text-blue-300">The coaches</div>
              <h2 className="mt-1 text-h1">The people you will be learning from.</h2>
            </div>
            <Button variant="link" href="/app/trainers" rightIcon={<ArrowRight />}>
              Meet them all
            </Button>
          </div>
          <div className={cn("mx-auto grid gap-4 sm:grid-cols-2", coachCols)}>
            {site.coaches.slice(0, 4).map((c) => (
              <Card key={c.id} variant="interactive" padding="lg" href="/app/trainers" className="flex h-full flex-col text-center">
                <Avatar name={c.name} src={c.photoUrl} size="xl" ring className="mx-auto" />
                <div className="mt-4 text-h4">{c.name}</div>
                <div className="text-caption text-blue-300">{c.title}</div>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {c.specialties.slice(0, 2).map((sp) => (
                    <Badge key={sp} size="sm" className="bg-white/10 text-blue-100 ring-white/10">
                      {sp}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 flex-1" />
                <div className="border-t border-white/10 pt-3 text-caption text-blue-100/70">
                  {c.yearsExperience ? `${count(c.yearsExperience, "year")} coaching` : c.clubs[0] ? `At ${c.clubs[0]}` : "HITTERS coach"}
                  <span className="mx-1.5 text-white/20">|</span>
                  <span className="font-bold text-white tabular">{money(c.hourlyRateCents, c.currency)}</span>/h
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Programs actually open for enrolment, with the places left. */}
      {site.programs.length > 0 && (
        <section id="programs" className="scroll-mt-24 border-y border-white/10 bg-court">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-overline uppercase text-blue-300">Open for enrolment</div>
                <h2 className="mt-1 text-h1">Join an intake that starts in weeks, not someday.</h2>
              </div>
              <Button variant="link" href="/app/programs" rightIcon={<ArrowRight />}>
                All programs
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {site.programs.slice(0, 3).map((pr) => (
                <Card key={pr.id} variant="interactive" padding="lg" href={`/app/programs/${pr.code}`} className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-overline uppercase text-blue-300">{programCategoryLabel(pr.category)}</span>
                    {pr.spotsLeft > 0 && pr.spotsLeft <= 3 && (
                      <Badge tone="warning" size="sm">
                        {count(pr.spotsLeft, "place")} left
                      </Badge>
                    )}
                  </div>
                  <h3 className="mt-2 text-h3">{pr.name}</h3>
                  {pr.description && <p className="mt-2 line-clamp-3 text-body-sm text-blue-100/70">{pr.description}</p>}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {pr.levels.length ? pr.levels.map((l) => <LevelBadge key={l} level={l as "A" | "B" | "C" | "D"} size="sm" />) : <Badge size="sm" className="bg-white/10 text-blue-100 ring-white/10">Any level</Badge>}
                  </div>
                  <div className="mt-4 flex-1" />
                  <dl className="space-y-1.5 border-t border-white/10 pt-4 text-body-sm">
                    <Row label="Starts" value={shortDate(pr.startsOn)} />
                    <Row label={pluralize(pr.sessionsCount, "Session")} value={String(pr.sessionsCount)} />
                    <Row label="Club" value={pr.locationName} />
                    <Row label="Price" value={money(pr.priceCents, pr.currency)} strong />
                  </dl>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Built for the whole club */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-overline uppercase text-blue-300">One platform</div>
        <h2 className="mt-1 max-w-2xl text-h1">Built for the players, the coaches and the people running the club.</h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            {
              icon: <Swords />,
              t: "For players",
              items: ["Live court availability and instant booking", "Matchmaking that explains every suggestion", "Group chat with your lineup, without sharing your number", "Lessons, programs and credits in one place"],
            },
            {
              icon: <GraduationCap />,
              t: "For coaches",
              items: ["Your own calendar and weekly availability", "Lesson requests to accept or decline", "Program rosters with attendance", "Private progress notes per student"],
            },
            {
              icon: <LayoutDashboard />,
              t: "For the club",
              items: ["Court grid, bookings and payments by venue", "Pricing rules for peak, weekend and members", "Level assessments and staff permissions", "Announcements, templates and moderation"],
            },
          ].map((group) => (
            <Card key={group.t} variant="default" padding="lg">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20 [&_svg]:size-5">{group.icon}</span>
                <h3 className="text-h4">{group.t}</h3>
              </div>
              <ul className="mt-5 space-y-2.5">
                {group.items.map((i) => (
                  <li key={i} className="flex gap-2.5 text-body-sm text-blue-100/75">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-400" />
                    {i}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Questions the page otherwise leaves open right before asking for a signup. */}
      <section id="faq" className="scroll-mt-24 border-t border-white/10 bg-court">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <div className="text-overline uppercase text-blue-300">Questions</div>
            <h2 className="mt-1 text-h1">Before you book.</h2>
            <p className="mt-4 text-body text-blue-100/75">
              Anything else, the front desk at any club will answer it, or ask inside the app once you are in.
            </p>
            <Button variant="outline" href="/app/locations" className="mt-6 border-white/30 text-white hover:bg-white/10" rightIcon={<MapPin />}>
              Find a club
            </Button>
          </div>
          <dl className="divide-y divide-white/10 border-y border-white/10">
            {FAQS.map((f) => (
              <details key={f.q} className="group px-1 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <dt className="text-body font-bold">{f.q}</dt>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-blue-300 transition-transform group-open:rotate-180 [&_svg]:size-4">
                    <ChevronDown />
                  </span>
                </summary>
                <dd className="mt-2.5 max-w-prose text-body-sm text-blue-100/75">{f.a}</dd>
              </details>
            ))}
          </dl>
        </div>
      </section>

      {/* Membership CTA */}
      <section id="membership" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-8 text-white shadow-glow-lg court-line sm:p-14">
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="text-overline uppercase text-white/80">Membership</div>
              <h2 className="mt-2 text-h1 sm:text-display">Become a HITTER.</h2>
              <p className="mt-3 max-w-lg text-body-lg text-white/85">Priority booking windows, member rates at every location, a free level assessment and monthly academy credits.</p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Button size="xl" variant="secondary" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" href="/register" rightIcon={<ArrowRight />}>
                Create your account
              </Button>
              <span className="text-caption text-white/70">Free to join · membership from {money(120000)} a month</span>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

/** One line of a program card's summary list. */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-blue-100/60">{label}</dt>
      <dd className={strong ? "font-bold tabular text-white" : "font-semibold tabular text-blue-100/90"}>{value}</dd>
    </div>
  );
}

/**
 * Answers describe how the product actually behaves, so they have to be revisited when the rules change:
 * the booking cutoff, the assessment requirement and the payment method all live in the services.
 */
const FAQS = [
  {
    q: "Do I need a level before I can play?",
    a: "No. You can book a court the moment you sign up. A level only matters for matchmaking and for level-based programs, and a free assessment at any club gives you one that follows you to every HITTERS location.",
  },
  {
    q: "How does matchmaking decide who to suggest?",
    a: "By level, club, time and the format you asked for, and every suggestion tells you the reason it fits. Nothing is automatic: the player who opened the game approves each request before anyone joins.",
  },
  {
    q: "Will other players see my phone number?",
    a: "Never. A confirmed game gets its own group chat inside the app, so a lineup can sort out who brings the balls without anyone handing over a number. Messages can be reported to a moderator.",
  },
  {
    q: "How do I pay, and what if I cancel?",
    a: "Courts, lessons and programs are paid at the venue, and your booking is confirmed before you pay. Cancel free of charge up to the cutoff shown on the booking itself, which each club sets for its own courts.",
  },
  {
    q: "What is the difference between a lesson, a package and a program?",
    a: "A lesson is one hour with a coach you choose. A package is five or ten prepaid lesson credits at a lower rate per lesson. A program is a structured intake of six to twelve weeks with the same group and a place held for you every week.",
  },
  {
    q: "Can I use one account at every club?",
    a: "Yes. One account covers every HITTERS location: your level, your credits, your history and your bookings are the same wherever you play.",
  },
] as const;
