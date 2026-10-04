/**
 * Timezone helpers without dependencies. All schedule data is stored as
 * minutes-from-midnight in the location's IANA timezone; these convert to and from UTC instants.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsIn(tz: string, at: Date): Parts {
  const out: Partial<Parts> = {};
  for (const p of formatter(tz).formatToParts(at)) {
    if (p.type !== "literal") out[p.type as keyof Parts] = Number(p.value);
  }
  return out as Parts;
}

/** Offset of `tz` from UTC in minutes at the given instant (e.g. Africa/Cairo winter = 120). */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const p = partsIn(tz, at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for a UTC-free calendar date. */
export function toDateISO(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateISO(dateISO: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) throw new Error(`Invalid date: ${dateISO}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Day of week (0 = Sunday) for a calendar date, independent of timezone. */
export function dayOfWeekISO(dateISO: string): number {
  const { year, month, day } = parseDateISO(dateISO);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDaysISO(dateISO: string, days: number): string {
  const { year, month, day } = parseDateISO(dateISO);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toDateISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** UTC instant for a wall-clock time (minutes after midnight, may exceed 1440) on a date in `tz`. */
export function zonedToUtc(dateISO: string, minutes: number, tz: string): Date {
  const { year, month, day } = parseDateISO(dateISO);
  const guess = new Date(Date.UTC(year, month - 1, day, 0, minutes));
  let result = new Date(guess.getTime() - tzOffsetMinutes(tz, guess) * 60_000);
  const offset2 = tzOffsetMinutes(tz, result);
  if (offset2 !== tzOffsetMinutes(tz, guess)) result = new Date(guess.getTime() - offset2 * 60_000);
  return result;
}

/** Wall-clock date and minutes in `tz` for a UTC instant. */
export function utcToZoned(at: Date, tz: string): { dateISO: string; minutes: number; dayOfWeek: number } {
  const p = partsIn(tz, at);
  const dateISO = toDateISO(p.year, p.month, p.day);
  return { dateISO, minutes: p.hour * 60 + p.minute, dayOfWeek: dayOfWeekISO(dateISO) };
}

export function todayISO(tz: string, now = new Date()): string {
  return utcToZoned(now, tz).dateISO;
}

export function minutesToHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Parses an HTML datetime-local value ("YYYY-MM-DDTHH:mm") as wall-clock time in `tz`. */
export function localInputToUtc(value: string, tz: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new Error(`Invalid datetime: ${value}`);
  return zonedToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), tz);
}

/** Formats a UTC instant as datetime-local wall-clock text in `tz`. */
export function utcToLocalInput(at: Date, tz: string): string {
  const z = utcToZoned(at, tz);
  return `${z.dateISO}T${minutesToHHMM(z.minutes)}`;
}

export function formatInZone(at: Date, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(at);
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/* ------------------------------------------------------------------ Human dates */

/** The one locale the product formats dates in, so two screens never disagree. */
export const LOCALE = "en-GB";

/** "Sat 11 Oct" from a Date. */
export const shortDate = (at: Date | string): string => new Date(at).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Saturday 11 October" from a YYYY-MM-DD string, for confirmation dialogs. */
export function longDate(dateISO: string): string {
  const { year, month, day } = parseDateISO(dateISO);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** "11 Apr 2027", for expiry dates where the weekday adds nothing. */
export const plainDate = (at: Date | string): string => new Date(at).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A timezone in words for a player: "Cairo time" rather than "Africa/Cairo". Staff screens keep the IANA id,
 * which is exact and is what they configure.
 */
export function timezoneLabel(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ");
  return city ? `${city} time` : tz;
}
