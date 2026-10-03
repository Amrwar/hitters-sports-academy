"use client";

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type TabItem<T extends string = string> = { value: T; label: string; icon?: ReactNode; count?: number; disabled?: boolean };

type Props<T extends string> = {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** underline = page sections; pill = segmented control for filters/toggles. */
  variant?: "underline" | "pill";
  fullWidth?: boolean;
  className?: string;
};

export function Tabs<T extends string>({ items, value, onChange, variant = "underline", fullWidth, className }: Props<T>) {
  const isPill = variant === "pill";
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1",
        isPill ? "rounded-md bg-surface-2 p-1 border border-line/10" : "border-b border-line/10 overflow-x-auto no-scrollbar",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 disabled:opacity-45 [&_svg]:size-4",
              fullWidth && "flex-1",
              isPill
                ? cn("h-9 rounded-sm px-3.5 text-body-sm", active ? "bg-brand-gradient text-white shadow-glow-sm" : "text-fg-muted hover:text-fg")
                : cn(
                    "-mb-px h-11 border-b-2 px-3 text-body-sm",
                    active ? "border-blue-400 text-fg" : "border-transparent text-fg-muted hover:text-fg hover:border-line/30",
                  ),
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-caption tabular", active && !isPill ? "bg-blue-500/20 text-blue-200 light:text-blue-700" : "bg-line/10 text-fg-subtle")}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
