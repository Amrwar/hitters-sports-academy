import Image from "next/image";
import Link from "next/link";
import { Bell, CalendarCheck, Clock, CreditCard, GraduationCap, MapPin, Star, Swords } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarGroup } from "@/components/ui/avatar";
import { Badge, LevelBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { byId, locationBySlug, money, players, trainers, type Booking, type Location, type Match, type Notification, type Player, type Program, type Trainer } from "@/data/mock";
import type { ReactNode } from "react";

/* ------------------------------------------------------------ Photo backdrop */

/** Brand photography with the navy-to-electric overlay used on every hero and media card. */
export function CourtBackdrop({ src, className, children, priority, overlay = "strong" }: { src: string; className?: string; children?: ReactNode; priority?: boolean; overlay?: "strong" | "soft" }) {
  return (
    <div className={cn("relative overflow-hidden text-white", className)} data-theme="dark">
      <Image src={src} alt="" fill priority={priority} sizes="(max-width: 768px) 100vw, 1200px" className="object-cover" />
      <div
        className={cn(
          "absolute inset-0",
          overlay === "strong"
            ? "bg-[linear-gradient(180deg,rgba(3,7,18,0.15)_0%,rgba(3,7,18,0.55)_55%,rgba(3,7,18,0.95)_100%)]"
            : "bg-[linear-gradient(180deg,rgba(3,7,18,0)_30%,rgba(3,7,18,0.85)_100%)]",
        )}
      />
      <div className="absolute inset-0 bg-blue-700/20 mix-blend-multiply" />
      {children && <div className="relative">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ Location */

export function LocationCard({ location, compact }: { location: Location; compact?: boolean }) {
  return (
    <Card variant="interactive" padding="none" href={`/app/locations/${location.slug}`} className="group">
      <CourtBackdrop src={location.image} overlay="soft" className={compact ? "h-32" : "h-44"}>
        <div className="flex h-full flex-col justify-between p-4" style={{ minHeight: compact ? 128 : 176 }}>
          <div className="flex justify-between">
            <Badge tone="brand">{location.indoorCourts > 0 ? "Indoor + outdoor" : "Outdoor"}</Badge>
            {location.distanceKm !== undefined && (
              <Badge className="bg-navy-950/60 text-white backdrop-blur">{location.distanceKm} km</Badge>
            )}
          </div>
          <div className="text-white">
            <div className="text-h4">{location.name}</div>
            <div className="flex items-center gap-1 text-caption text-blue-100/80">
              <MapPin size={12} /> {location.area}, {location.city}
            </div>
          </div>
        </div>
      </CourtBackdrop>
      <div className="flex items-center justify-between px-4 py-3 text-body-sm">
        <div className="flex items-center gap-3 text-fg-muted">
          <span className="flex items-center gap-1">
            <Star size={14} className="fill-volt text-volt" /> <span className="font-bold text-fg">{location.rating}</span>
          </span>
          <span>{location.courts} courts</span>
        </div>
        <div>
          <span className="text-fg-subtle">from </span>
          <span className="font-bold text-fg tabular">{money(location.priceFrom)}</span>
          <span className="text-fg-subtle">/h</span>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Match */

export function MatchCard({ match, action }: { match: Match; action?: ReactNode }) {
  const loc = locationBySlug(match.locationSlug);
  const names = match.playerIds.map((id) => (id === "p-me" ? "Amr Hefny" : (byId(players, id)?.name ?? "Player")));
  const spotsLeft = 4 - match.playerIds.length;
  return (
    <Card variant={match.status === "live" ? "brand" : "interactive"} padding="md" className={match.status === "live" ? "" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={match.status} />
            <Badge tone={match.status === "live" ? "neutral" : "info"} className={match.status === "live" ? "bg-white/15 text-white" : ""}>
              {match.type}
            </Badge>
            <Badge className={match.status === "live" ? "bg-white/15 text-white" : "bg-line/10 text-fg-muted"}>{match.mode}</Badge>
          </div>
          <h3 className="mt-2 truncate text-h4">{match.title}</h3>
          <div className={cn("mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm", match.status === "live" ? "text-white/80" : "text-fg-muted")}>
            <span className="flex items-center gap-1">
              <Clock size={14} /> {match.date} · {match.time}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={14} /> {loc?.name.replace("HITTERS ", "")} · {match.court}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {match.levels.map((l) => (
            <LevelBadge key={l} level={l} size="sm" />
          ))}
        </div>
      </div>
      <div className={cn("mt-4 flex items-center justify-between gap-3 border-t pt-3", match.status === "live" ? "border-white/15" : "border-line/10")}>
        <div className="flex items-center gap-2.5">
          <AvatarGroup names={names} size="sm" />
          <span className={cn("text-caption font-semibold", match.status === "live" ? "text-white/80" : "text-fg-muted")}>
            {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft > 1 ? "s" : ""} left` : "Full"}
          </span>
        </div>
        {action ?? (
          <div className="flex items-center gap-3">
            <span className={cn("text-body-sm font-bold tabular", match.status === "live" ? "text-white" : "text-fg")}>{money(match.pricePerPlayer)}</span>
            {match.status === "open" && (
              <Button size="sm" variant="primary">
                Request to join
              </Button>
            )}
            {match.status === "full" && (
              <Button size="sm" variant="secondary">
                Waitlist
              </Button>
            )}
            {match.status === "live" && (
              <Button size="sm" variant="volt">
                Watch live
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Player */

export function PlayerCard({ player, action, compact }: { player: Player; action?: ReactNode; compact?: boolean }) {
  const winRate = Math.round((player.wins / Math.max(1, player.matches)) * 100);
  return (
    <Card variant="interactive" padding={compact ? "sm" : "md"} href={action ? undefined : `/app/players/${player.id}`}>
      <div className="flex items-center gap-3">
        <Avatar name={player.name} size={compact ? "md" : "lg"} online={player.online} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-body font-bold">{player.name}</span>
            <LevelBadge level={player.level} size="sm" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-fg-muted">
            <span>{player.side} side</span>
            <span aria-hidden>·</span>
            <span className="tabular">{player.matches} matches</span>
            <span aria-hidden>·</span>
            <span className="tabular">{winRate}% wins</span>
          </div>
        </div>
        {action ?? (
          <span className="flex items-center gap-1 text-body-sm font-bold text-fg">
            <Star size={14} className="fill-volt text-volt" /> {player.rating.toFixed(1)}
          </span>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Trainer */

export function TrainerCard({ trainer }: { trainer: Trainer }) {
  return (
    <Card variant="interactive" href={`/app/trainers/${trainer.id}`}>
      <div className="flex items-start gap-3.5">
        <Avatar name={trainer.name.replace("Coach ", "")} size="lg" ring />
        <div className="min-w-0 flex-1">
          <div className="truncate text-h4">{trainer.name}</div>
          <div className="text-caption text-blue-300">{trainer.title}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {trainer.specialties.slice(0, 3).map((s) => (
              <Badge key={s} size="sm">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line/10 pt-3 text-body-sm">
        <span className="flex items-center gap-1 text-fg-muted">
          <Star size={14} className="fill-volt text-volt" /> <span className="font-bold text-fg">{trainer.rating.toFixed(1)}</span> ({trainer.reviews})
        </span>
        <span>
          <span className="font-bold text-fg tabular">{money(trainer.pricePerHour)}</span>
          <span className="text-fg-subtle">/h</span>
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Program */

export function ProgramCard({ program }: { program: Program }) {
  const trainer = byId(trainers, program.trainerId);
  const loc = locationBySlug(program.locationSlug);
  const tagTone = program.tag === "Last spots" ? "warning" : program.tag === "New" ? "volt" : "brand";
  return (
    <Card variant="interactive" href={`/app/programs/${program.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20">
          <GraduationCap size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-h4">{program.name}</h3>
            {program.tag && (
              <Badge tone={tagTone} size="sm">
                {program.tag}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-caption text-fg-muted">
            {trainer?.name} · {loc?.name.replace("HITTERS ", "")}
          </div>
        </div>
        <div className="flex gap-1">
          {program.levels.map((l) => (
            <LevelBadge key={l} level={l} size="sm" />
          ))}
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-body-sm text-fg-muted">{program.description}</p>
      <div className="mt-4 flex items-center justify-between border-t border-line/10 pt-3 text-body-sm">
        <span className="text-fg-muted">
          {program.weeks} wks · {program.sessionsPerWeek}×/wk · starts {program.startDate}
        </span>
        <span className="font-bold text-fg tabular">{money(program.price)}</span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Booking */

export function BookingCard({ booking, href = "/app/profile" }: { booking: Booking; href?: string }) {
  const loc = locationBySlug(booking.locationSlug);
  return (
    <Card variant="interactive" padding="sm" href={href}>
      <div className="flex items-center gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-md bg-surface-2 py-2 ring-1 ring-inset ring-line/10">
          <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">{booking.date.split(" ")[0]}</span>
          <span className="text-h4 tabular">{booking.time}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-bold">{loc?.name}</div>
          <div className="text-caption text-fg-muted">
            {booking.court} · {booking.durationMin} min · <span className="tabular">{money(booking.price)}</span>
          </div>
        </div>
        <StatusBadge status={booking.status} />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Notification */

const kindIcon: Record<Notification["kind"], ReactNode> = {
  match: <Swords size={18} />,
  booking: <CalendarCheck size={18} />,
  program: <GraduationCap size={18} />,
  payment: <CreditCard size={18} />,
  system: <Bell size={18} />,
};

export function NotificationItem({ item }: { item: Notification }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex gap-3 rounded-lg border p-3.5 transition-colors",
        item.read ? "border-line/10 bg-surface-1 hover:bg-surface-2" : "border-blue-400/30 bg-blue-500/10 hover:bg-blue-500/15",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", item.read ? "bg-line/10 text-fg-muted" : "bg-brand-gradient text-white shadow-glow-sm")}>
        {kindIcon[item.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className={cn("text-body-sm font-bold", !item.read && "text-fg")}>{item.title}</span>
          <span className="shrink-0 text-caption text-fg-subtle">{item.time}</span>
        </div>
        <p className="mt-0.5 text-body-sm text-fg-muted">{item.body}</p>
      </div>
      {!item.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-volt" aria-label="Unread" />}
    </Link>
  );
}

/* ------------------------------------------------------------ Quick action tile */

export function QuickAction({ href, icon, label, hint }: { href: string; icon: ReactNode; label: string; hint?: string }) {
  return (
    <Link href={href} className="group flex flex-col gap-3 rounded-lg border border-line/10 bg-surface-1 p-4 shadow-inset-hi transition-all hover:border-blue-400/50 hover:shadow-glow-sm active:scale-[0.98]">
      <span className="flex size-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20 transition-colors group-hover:bg-brand-gradient group-hover:text-white [&_svg]:size-5">{icon}</span>
      <span>
        <span className="block text-body font-bold">{label}</span>
        {hint && <span className="block text-caption text-fg-muted">{hint}</span>}
      </span>
    </Link>
  );
}

