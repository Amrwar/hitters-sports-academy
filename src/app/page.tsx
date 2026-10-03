import Image from "next/image";
import { ArrowRight, CalendarCheck, GraduationCap, MapPin, ShieldCheck, Star, Swords, Users, Zap } from "lucide-react";
import { Lockup, Monogram } from "@/components/brand/Logo";
import { MarketingFooter, MarketingNav } from "@/components/nav/marketing-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { CourtBackdrop } from "@/components/patterns/cards";
import { locations, money } from "@/data/mock";

export default function LandingPage() {
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
            Now open · 4 locations across Egypt
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
              { v: "23", l: "Courts" },
              { v: "4.9", l: "Average rating" },
              { v: "6,200+", l: "Players matched" },
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
      <section id="locations" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
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
          {locations.map((l) => (
            <Card key={l.slug} variant="interactive" padding="none" href={`/app/locations/${l.slug}`}>
              <CourtBackdrop src={l.image} overlay="soft" className="h-40">
                <div className="flex h-40 flex-col justify-end p-4">
                  <div className="text-h4">{l.name.replace("HITTERS ", "")}</div>
                  <div className="flex items-center gap-1 text-caption text-blue-100/80">
                    <MapPin size={12} /> {l.area}
                  </div>
                </div>
              </CourtBackdrop>
              <div className="flex items-center justify-between px-4 py-3 text-body-sm text-blue-100/70">
                <span className="flex items-center gap-1">
                  <Star size={14} className="fill-volt text-volt" /> <span className="font-bold text-white">{l.rating}</span>
                </span>
                <span>
                  {l.courts} courts · from <span className="font-bold text-white tabular">{money(l.priceFrom)}</span>
                </span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Play / matchmaking */}
      <section id="play" className="border-y border-white/10 bg-court">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <div className="text-overline uppercase text-blue-300">Smart matchmaking</div>
            <h2 className="mt-1 text-h1">Never play without a fourth again.</h2>
            <p className="mt-4 text-body-lg text-blue-100/75">
              Every player is assessed and placed at level A, B, C or D. Open a session solo, as a pair or with three, and HITTERS fills the court with players who match your game.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: <Users />, t: "Solo, pair and 3+1 matching", d: "Join as one, two or three and we complete the four." },
                { icon: <ShieldCheck />, t: "Organiser approval", d: "You decide who joins your session. Requests, not surprises." },
                { icon: <Zap />, t: "Level-locked sessions", d: "Competitive games stay competitive." },
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
            <Button className="mt-8" size="lg" href="/app/play" leftIcon={<Swords />}>
              Find a match
            </Button>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 rounded-[40px] bg-blue-500/20 blur-3xl" aria-hidden />
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
              <Button fullWidth className="mt-4">
                Request to join
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Academy */}
      <section id="academy" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-overline uppercase text-blue-300">Academy</div>
        <h2 className="mt-1 text-h1">Train with the people who built the game here.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { icon: <GraduationCap />, t: "Programs", d: "6 to 12 week structured programs from Foundations to the Elite Pathway." },
            { icon: <Users />, t: "Private trainers", d: "Book certified coaches by the hour at any HITTERS club." },
            { icon: <CalendarCheck />, t: "Training packages", d: "Bundle sessions and save. Track every session in your profile." },
          ].map((f) => (
            <Card key={f.t} variant="default" padding="lg">
              <span className="flex size-12 items-center justify-center rounded-md bg-brand-gradient text-white shadow-glow-sm [&_svg]:size-6">{f.icon}</span>
              <h3 className="mt-5 text-h3">{f.t}</h3>
              <p className="mt-2 text-body text-blue-100/70">{f.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Membership CTA */}
      <section id="membership" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-8 text-white shadow-glow-lg court-line sm:p-14">
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="text-overline uppercase text-white/80">Membership</div>
              <h2 className="mt-2 text-h1 sm:text-display">Become a HITTER.</h2>
              <p className="mt-3 max-w-lg text-body-lg text-white/85">Priority booking windows, member rates at every location, free level assessment and monthly academy credits.</p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Button size="xl" variant="secondary" className="bg-white text-blue-700 hover:bg-blue-50 border-transparent" href="/app" rightIcon={<ArrowRight />}>
                Start your membership
              </Button>
              <span className="text-caption text-white/70">From {money(1200)}/month · cancel anytime</span>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
