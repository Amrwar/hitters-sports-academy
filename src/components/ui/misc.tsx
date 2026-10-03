"use client";

import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/* ---------------------------------------------------------------- Chip */

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: ReactNode };

/** Filter / selection chip. */
export function Chip({ selected, icon, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-body-sm font-semibold transition-all [&_svg]:size-4",
        selected
          ? "border-blue-300/40 bg-brand-gradient text-white shadow-glow-sm"
          : "border-line/10 bg-surface-2 text-fg-muted hover:border-line/25 hover:text-fg",
        "disabled:opacity-45",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Switch */

type SwitchProps = { checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string; disabled?: boolean; className?: string };

export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-not-allowed opacity-45", className)}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-body-sm font-semibold text-fg">{label}</span>}
          {description && <span className="block text-caption text-fg-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-all duration-200",
          checked ? "border-blue-300/40 bg-brand-gradient shadow-glow-sm" : "border-line/15 bg-surface-3",
        )}
      >
        <span className={cn("absolute left-0 top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

/* ---------------------------------------------------------------- Checkbox */

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 text-body-sm text-fg", className)}>
      <input
        type="checkbox"
        className="size-5 shrink-0 appearance-none rounded-xs border border-line/20 bg-surface-2 transition-all checked:border-blue-400 checked:bg-blue-500 checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M3.5 8.5l3 3 6-7%22/></svg>')] bg-center bg-no-repeat disabled:opacity-45"
        {...rest}
      />
      {label}
    </label>
  );
}

/* ---------------------------------------------------------------- Progress */

export function ProgressBar({ value, max = 100, tone = "brand", className, label }: { value: number; max?: number; tone?: "brand" | "volt" | "success"; className?: string; label?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const fill = { brand: "bg-brand-gradient", volt: "bg-volt", success: "bg-success" }[tone];
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex justify-between text-caption text-fg-muted">
          <span>{label}</span>
          <span className="tabular">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-line/10" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Stat tile */

export function StatTile({ label, value, delta, icon, className, tone = "default", size = "md" }: { label: string; value: ReactNode; delta?: { value: string; positive?: boolean }; icon?: ReactNode; className?: string; tone?: "default" | "brand"; size?: "md" | "lg" }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border p-4",
        tone === "brand" ? "border-blue-300/30 bg-brand-gradient text-white shadow-glow-sm" : "border-line/10 bg-surface-1 shadow-inset-hi",
        className,
      )}
      data-theme={tone === "brand" ? "dark" : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-caption font-semibold uppercase tracking-wider", tone === "brand" ? "text-white/80" : "text-fg-subtle")}>{label}</span>
        {icon && <span className={cn("[&_svg]:size-5", tone === "brand" ? "text-white/80" : "text-blue-300 light:text-blue-600")}>{icon}</span>}
      </div>
      <div className={cn("mt-2 tabular", size === "lg" ? "text-h1" : "text-h2")}>{value}</div>
      {delta && (
        <div className={cn("mt-1 text-caption font-semibold", tone === "brand" ? "text-white/80" : delta.positive === false ? "text-danger" : "text-success")}>{delta.value}</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Divider */

export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <hr className={cn("border-line/10", className)} />;
  return (
    <div className={cn("flex items-center gap-3 text-caption font-semibold uppercase tracking-wider text-fg-subtle", className)}>
      <span className="h-px flex-1 bg-line/10" />
      {label}
      <span className="h-px flex-1 bg-line/10" />
    </div>
  );
}
