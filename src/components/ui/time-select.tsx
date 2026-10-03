"use client";

import { Select } from "./select";
import { minutesToHHMM } from "@/lib/time";

type Props = { value: number; onChange: (minutes: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; size?: "sm" | "md"; "aria-label"?: string };

/** Minutes-from-midnight picker. 1440 renders as "24:00" so closing at midnight is expressible. */
export function TimeSelect({ value, onChange, min = 0, max = 24 * 60, step = 30, disabled, size = "sm", ...rest }: Props) {
  const options: { value: string; label: string }[] = [];
  for (let m = min; m <= max; m += step) options.push({ value: String(m), label: m === 1440 ? "24:00" : minutesToHHMM(m) });
  if (!options.some((o) => Number(o.value) === value)) options.push({ value: String(value), label: minutesToHHMM(value) });
  options.sort((a, b) => Number(a.value) - Number(b.value));
  return <Select size={size} value={String(value)} onChange={(e) => onChange(Number(e.target.value))} options={options} disabled={disabled} aria-label={rest["aria-label"]} />;
}
