import type { GameRequestStatus } from "@prisma/client";
import { Check, Clock, MapPin, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import type { MatchReason } from "@/lib/matching";
import type { ReactNode } from "react";

const ICON: Record<MatchReason["kind"], ReactNode> = {
  level: <Sparkles size={12} />,
  location: <MapPin size={12} />,
  time: <Clock size={12} />,
  capacity: <Users size={12} />,
  type: <Check size={12} />,
  policy: <Check size={12} />,
};

/** The engine's explanations as chips: strong reasons in blue, neutral ones muted. */
export function MatchReasons({ reasons, compact, className }: { reasons: (MatchReason | string)[]; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {reasons.map((r, i) => {
        const label = typeof r === "string" ? r : r.label;
        const strong = typeof r === "string" ? !label.startsWith("Other club") : r.points >= 20;
        const icon = typeof r === "string" ? null : ICON[r.kind];
        return (
          <span
            key={`${label}-${i}`}
            title={typeof r === "string" ? undefined : r.detail}
            className={cn("inline-flex items-center gap-1 rounded-full border px-2 font-semibold", compact ? "h-5 text-[11px]" : "h-6 text-caption", strong ? "border-blue-400/30 bg-blue-500/10 text-blue-200 light:text-blue-700" : "border-line/10 bg-line/5 text-fg-muted")}
          >
            {icon}
            {label}
          </span>
        );
      })}
    </div>
  );
}

/** Score as a small "match strength" meter; deterministic bands so two players see the same word. */
export function MatchStrength({ score, className }: { score: number; className?: string }) {
  const band = score >= 90 ? { label: "Great match", tone: "volt" as const } : score >= 65 ? { label: "Good match", tone: "success" as const } : { label: "Possible match", tone: "info" as const };
  return (
    <Badge tone={band.tone} size="sm" className={className} title={`Match score ${score}`}>
      {band.label}
    </Badge>
  );
}

const REQUEST_TONE: Record<GameRequestStatus, "warning" | "info" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  WAITLISTED: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  WITHDRAWN: "neutral",
  EXPIRED: "neutral",
};
const REQUEST_LABEL: Record<GameRequestStatus, string> = { PENDING: "Pending", WAITLISTED: "Waitlisted", ACCEPTED: "Accepted", DECLINED: "Declined", WITHDRAWN: "Withdrawn", EXPIRED: "Expired" };

export function RequestStatusBadge({ status, size = "sm" }: { status: GameRequestStatus; size?: "sm" | "md" }) {
  return (
    <Badge tone={REQUEST_TONE[status]} dot size={size}>
      {REQUEST_LABEL[status]}
    </Badge>
  );
}
