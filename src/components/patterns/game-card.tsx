import Link from "next/link";
import type { GameStatus } from "@prisma/client";
import { Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { AvatarGroup } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { money } from "@/components/patterns/booking-status";
import { formatInZone } from "@/lib/time";
import { gameFormatLabel } from "@/lib/catalog";
import type { GameView } from "@/server/services/game-sessions";
import type { ReactNode } from "react";

const TONE: Record<GameStatus, "neutral" | "brand" | "success" | "warning" | "danger" | "volt" | "info"> = {
  DRAFT: "neutral",
  OPEN: "info",
  FULL: "warning",
  CONFIRMED: "success",
  IN_PROGRESS: "volt",
  COMPLETED: "neutral",
  CANCELLED: "danger",
};

export const GAME_LABEL: Record<GameStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  FULL: "Full",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function GameStatusBadge({ status, size, className }: { status: GameStatus; size?: "sm" | "md"; className?: string }) {
  return (
    <Badge tone={TONE[status]} dot pulse={status === "IN_PROGRESS"} size={size} className={className}>
      {GAME_LABEL[status]}
    </Badge>
  );
}

export function costLabel(g: GameView): string {
  if (g.costMode === "ORGANIZER_PAYS") return "On the organizer";
  if (g.sharePerPlayerCents === 0 || g.costMode === "FREE") return "Free";
  return `${money(g.sharePerPlayerCents ?? 0, g.currency)} each`;
}

/** Shared game summary for Play, Home and admin lists. */
export function GameCard({ game, viewerId, action, href, showStatus = true }: { game: GameView; viewerId?: string; action?: ReactNode; href?: string; showStatus?: boolean }) {
  const live = game.status === "IN_PROGRESS";
  const names = game.participants.filter((p) => p.status === "ACCEPTED").map((p) => p.user.name);
  const me = viewerId ? game.participants.find((p) => p.userId === viewerId) : null;
  const body = (
    <Card variant={live ? "brand" : href ? "interactive" : "default"} padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {showStatus && <GameStatusBadge status={game.status} size="sm" className={live ? "bg-white/15 text-white ring-0" : ""} />}
            <Badge size="sm" className={live ? "bg-white/15 text-white" : "bg-line/10 text-fg-muted"}>
              {gameFormatLabel(game.format)}
            </Badge>
            {game.matchType !== "ANY" && (
              <Badge size="sm" tone={live ? "neutral" : "info"} className={live ? "bg-white/15 text-white" : ""}>
                {game.matchType === "FRIENDLY" ? "Friendly" : "Competitive"}
              </Badge>
            )}
            {me?.status === "INVITED" && (
              <Badge size="sm" tone="volt">
                Invited
              </Badge>
            )}
            {game.visibility === "PUBLIC" && !live && (
              <Badge size="sm" className="bg-line/10 text-fg-subtle">
                Discoverable
              </Badge>
            )}
          </div>
          <h3 className="mt-2 truncate text-h4">{game.description?.trim() || `${game.organizer.name.split(" ")[0]}'s ${gameFormatLabel(game.format).toLowerCase()}`}</h3>
          <div className={cn("mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm", live ? "text-white/80" : "text-fg-muted")}>
            <span className="flex items-center gap-1">
              <Clock size={14} /> {formatInZone(new Date(game.startsAt), game.location.timezone)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={14} /> {game.location.name.replace("HITTERS ", "")} · {game.court.name}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {game.levels.length ? game.levels.map((l) => <LevelBadge key={l} level={l} size="sm" />) : <Badge size="sm">Any level</Badge>}
        </div>
      </div>
      <div className={cn("mt-4 flex items-center justify-between gap-3 border-t pt-3", live ? "border-white/15" : "border-line/10")}>
        <div className="flex items-center gap-2.5">
          <AvatarGroup names={names} size="sm" />
          <span className={cn("text-caption font-semibold tabular", live ? "text-white/80" : "text-fg-muted")}>
            {game.acceptedCount}/{game.maxPlayers} · {game.spotsLeft > 0 ? `${game.spotsLeft} spot${game.spotsLeft > 1 ? "s" : ""} left` : "Full"}
          </span>
        </div>
        {action ?? <span className={cn("text-body-sm font-bold tabular", live ? "text-white" : "text-fg")}>{costLabel(game)}</span>}
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
