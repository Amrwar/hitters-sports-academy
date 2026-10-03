"use client";

import { cn } from "@/lib/cn";
import { slotStatus, timeSlots, type Court } from "@/data/mock";

type Props = {
  courts: Court[];
  dayIndex: number;
  selected?: { courtId: string; slot: string } | null;
  onSelect: (sel: { courtId: string; slot: string }) => void;
  className?: string;
};

/**
 * Availability grid: rows are courts, columns are hours.
 * Status colors come from the design-system court states (available / peak / booked / selected / maintenance).
 */
export function CourtSlotGrid({ courts, dayIndex, selected, onSelect, className }: Props) {
  return (
    <div className={cn("overflow-x-auto no-scrollbar -mx-4 px-4", className)}>
      <div className="min-w-max">
        <div className="mb-2 grid gap-1" style={{ gridTemplateColumns: `88px repeat(${timeSlots.length}, 56px)` }}>
          <div />
          {timeSlots.map((t) => (
            <div key={t} className="text-center text-[11px] font-semibold tabular text-fg-subtle">
              {t}
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {courts.map((court) => (
            <div key={court.id} className="grid items-center gap-1" style={{ gridTemplateColumns: `88px repeat(${timeSlots.length}, 56px)` }}>
              <div className="pr-2">
                <div className="truncate text-body-sm font-bold">{court.name}</div>
                <div className="text-[11px] text-fg-subtle">{court.type}</div>
              </div>
              {timeSlots.map((slot) => {
                const maintenance = court.status === "maintenance";
                const status = maintenance ? "maintenance" : slotStatus(court.id, slot, dayIndex);
                const isSelected = selected?.courtId === court.id && selected.slot === slot;
                const disabled = status === "booked" || status === "maintenance";
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={disabled}
                    aria-pressed={isSelected}
                    aria-label={`${court.name} ${slot} ${status}`}
                    onClick={() => onSelect({ courtId: court.id, slot })}
                    className={cn(
                      "h-10 rounded-sm border text-[11px] font-semibold transition-all",
                      isSelected && "border-blue-300/60 bg-brand-gradient text-white shadow-glow-sm scale-[1.04]",
                      !isSelected && status === "available" && "border-line/10 bg-surface-2 text-fg-muted hover:border-blue-400/60 hover:text-fg",
                      !isSelected && status === "peak" && "border-blue-400/30 bg-blue-500/15 text-blue-200 hover:border-blue-300/70",
                      status === "booked" && "border-transparent bg-line/[0.04] text-fg-subtle/40 line-through",
                      status === "maintenance" && "border-warning/20 bg-warning/5 text-warning/50",
                    )}
                  >
                    {isSelected ? "✓" : status === "peak" ? "Peak" : status === "booked" ? "—" : status === "maintenance" ? "!" : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-caption text-fg-muted">
          <Legend className="border-line/10 bg-surface-2" label="Available" />
          <Legend className="border-blue-400/30 bg-blue-500/15" label="Peak rate" />
          <Legend className="border-blue-300/60 bg-brand-gradient" label="Selected" />
          <Legend className="border-transparent bg-line/[0.06]" label="Booked" />
          <Legend className="border-warning/20 bg-warning/10" label="Maintenance" />
        </div>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-[3px] border", className)} /> {label}
    </span>
  );
}
