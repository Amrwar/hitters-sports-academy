/**
 * Non-CSS design tokens shared by components.
 * Keep in sync with tailwind.config.ts and docs/DESIGN_SYSTEM.md.
 */

/** Icon sizes (px). Inline text 16, UI controls 20, navigation 24, feature tiles 32. */
export const ICON = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const;

/** Player assessment levels, A is the strongest. */
export const LEVELS = ["A", "B", "C", "D"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  A: "Advanced",
  B: "Intermediate+",
  C: "Intermediate",
  D: "Beginner",
};

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "volt" | "info";

/** Booking / session statuses mapped to a tone. One source of truth for status colors. */
export const STATUS_TONE: Record<string, Tone> = {
  confirmed: "success",
  pending: "warning",
  cancelled: "danger",
  completed: "neutral",
  live: "volt",
  open: "brand",
  full: "neutral",
  maintenance: "warning",
  available: "brand",
  booked: "neutral",
  active: "success",
  expired: "danger",
  paused: "warning",
};
