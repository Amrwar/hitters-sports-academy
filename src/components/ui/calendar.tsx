"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";

const DAY = 86_400_000;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

type CalendarProps = {
  value?: Date;
  onChange?: (d: Date) => void;
  /** Days before this are disabled. */
  min?: Date;
  /** Dates to mark with a dot (e.g. days with bookings). */
  marked?: Date[];
  className?: string;
};

/** Month grid. Desktop admin and booking flows. */
export function Calendar({ value, onChange, min, marked = [], className }: CalendarProps) {
  const [view, setView] = useState(() => startOfDay(value ?? new Date()));
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: offset + days }, (_, i) => (i < offset ? null : new Date(view.getFullYear(), view.getMonth(), i - offset + 1)));
  const today = startOfDay(new Date());
  const minDay = min ? startOfDay(min) : undefined;

  return (
    <div className={cn("rounded-lg border border-line/10 bg-surface-1 p-3 sm:p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <IconButton variant="ghost" size="sm" label="Previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
          <ChevronLeft />
        </IconButton>
        <div className="text-body font-bold">{view.toLocaleString("en", { month: "long", year: "numeric" })}</div>
        <IconButton variant="ghost" size="sm" label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>
          <ChevronRight />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 text-center text-overline uppercase text-fg-subtle">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const disabled = !!minDay && d < minDay;
          const selected = !!value && sameDay(d, value);
          const isToday = sameDay(d, today);
          const mark = marked.some((m) => sameDay(m, d));
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(d)}
              aria-pressed={selected}
              aria-label={d.toDateString()}
              className={cn(
                "relative mx-auto flex size-10 items-center justify-center rounded-sm text-body-sm font-semibold tabular transition-all",
                "hover:bg-line/10 disabled:opacity-30 disabled:hover:bg-transparent",
                selected && "bg-brand-gradient text-white shadow-glow-sm hover:bg-transparent",
                isToday && !selected && "text-blue-300 ring-1 ring-inset ring-blue-400/50 light:text-blue-700",
              )}
            >
              {d.getDate()}
              {mark && !selected && <span className="absolute bottom-1 size-1 rounded-full bg-blue-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type StripProps = { value: Date; onChange: (d: Date) => void; days?: number; className?: string };

/** Horizontal day picker for mobile booking flows. */
export function DateStrip({ value, onChange, days = 14, className }: StripProps) {
  const start = startOfDay(new Date());
  const list = Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * DAY));
  return (
    <div className={cn("flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4", className)} role="listbox" aria-label="Select date">
      {list.map((d, i) => {
        const selected = sameDay(d, value);
        return (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(d)}
            className={cn(
              "flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border py-2.5 transition-all",
              selected
                ? "border-blue-300/40 bg-brand-gradient text-white shadow-glow-sm"
                : "border-line/10 bg-surface-1 text-fg-muted hover:border-line/25 hover:text-fg",
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{i === 0 ? "Today" : d.toLocaleString("en", { weekday: "short" })}</span>
            <span className="text-h4 tabular">{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}
