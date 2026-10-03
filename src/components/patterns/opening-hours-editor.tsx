"use client";

import { Switch } from "@/components/ui/misc";
import { TimeSelect } from "@/components/ui/time-select";
import { DAY_NAMES } from "@/lib/time";
import type { OpeningHours } from "@/lib/validation/schemas";

type Props = { value: OpeningHours; onChange: (next: OpeningHours) => void; disabled?: boolean };

export const DEFAULT_HOURS: OpeningHours = Array.from({ length: 7 }, () => ({ opensAt: 7 * 60, closesAt: 24 * 60 }));

/** Seven-day opening hours editor (Sunday first) used for locations. */
export function OpeningHoursEditor({ value, onChange, disabled }: Props) {
  const set = (i: number, next: OpeningHours[number]) => onChange(value.map((d, j) => (j === i ? next : d)) as OpeningHours);
  return (
    <div className="divide-y divide-line/10 rounded-lg border border-line/10 bg-surface-1">
      {value.map((day, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[120px_1fr_auto]">
          <div className="text-body-sm font-bold">{DAY_NAMES[i]}</div>
          <div className="order-3 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
            {day ? (
              <>
                <TimeSelect value={day.opensAt} onChange={(opensAt) => set(i, { ...day, opensAt })} disabled={disabled} aria-label={`${DAY_NAMES[i]} opens`} max={23 * 60 + 30} />
                <span className="text-caption text-fg-subtle">to</span>
                <TimeSelect value={day.closesAt} onChange={(closesAt) => set(i, { ...day, closesAt })} disabled={disabled} aria-label={`${DAY_NAMES[i]} closes`} min={30} />
                {day.closesAt <= day.opensAt && <span className="text-caption text-danger">Closes before it opens</span>}
              </>
            ) : (
              <span className="text-body-sm text-fg-subtle">Closed</span>
            )}
          </div>
          <Switch checked={!!day} onChange={(open) => set(i, open ? { opensAt: 7 * 60, closesAt: 23 * 60 } : null)} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}
