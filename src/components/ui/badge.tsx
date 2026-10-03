import { cn } from "@/lib/cn";
import { LEVEL_LABEL, STATUS_TONE, type Level, type Tone } from "@/lib/tokens";
import type { HTMLAttributes } from "react";

const tones: Record<Tone, string> = {
  neutral: "bg-line/10 text-fg-muted",
  brand: "bg-blue-500/20 text-blue-200 ring-1 ring-inset ring-blue-400/30 light:bg-blue-500/10 light:text-blue-700",
  info: "bg-blue-500/15 text-blue-300 light:text-blue-700",
  success: "bg-success/15 text-success ring-1 ring-inset ring-success/30 light:text-success-600",
  warning: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/30 light:text-warning-600",
  danger: "bg-danger/15 text-danger ring-1 ring-inset ring-danger/30 light:text-danger-600",
  volt: "bg-volt/15 text-volt ring-1 ring-inset ring-volt/30 light:bg-volt/35 light:text-navy-800 light:ring-volt-600/50",
};

const dots: Record<Tone, string> = {
  neutral: "bg-fg-subtle",
  brand: "bg-blue-400",
  info: "bg-blue-300",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  volt: "bg-volt",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean; size?: "sm" | "md"; pulse?: boolean };

export function Badge({ tone = "neutral", dot, size = "md", pulse, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-caption",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cn("absolute inline-flex size-full rounded-full opacity-75 animate-ping-volt", dots[tone])} />}
          <span className={cn("relative inline-flex size-1.5 rounded-full", dots[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

/** Badge driven by a status string so colors stay consistent app-wide. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <Badge tone={tone} dot pulse={status === "live"} className={cn("capitalize", className)}>
      {status}
    </Badge>
  );
}

const levelStyles: Record<Level, string> = {
  A: "bg-volt text-navy-950 shadow-glow-volt",
  B: "bg-brand-gradient text-white shadow-glow-sm",
  C: "bg-blue-500/25 text-blue-100 ring-1 ring-inset ring-blue-400/40 light:bg-blue-500/10 light:text-blue-700",
  D: "bg-line/10 text-fg-muted ring-1 ring-inset ring-line/15",
};

/** A/B/C/D assessment level chip. */
export function LevelBadge({ level, size = "md", withLabel, className }: { level: Level; size?: "sm" | "md" | "lg"; withLabel?: boolean; className?: string }) {
  const sz = { sm: "size-6 text-caption", md: "size-8 text-body-sm", lg: "size-11 text-h4" }[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`Level ${level} · ${LEVEL_LABEL[level]}`}>
      <span className={cn("inline-flex shrink-0 items-center justify-center rounded-sm font-extrabold", sz, levelStyles[level])}>{level}</span>
      {withLabel && <span className="text-body-sm font-medium text-fg-muted">{LEVEL_LABEL[level]}</span>}
    </span>
  );
}
