/**
 * Small text helpers shared by every screen. They exist so the product never shows "1 bookings" or a raw
 * enum like IN_PROGRESS, which is the kind of detail that makes software feel unfinished.
 */

/** "1 booking" / "3 bookings". Pass an irregular plural when the word is not just word + s. */
export function count(n: number, singular: string, plural?: string): string {
  return `${n.toLocaleString("en")} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** The noun alone, pluralised: `${n} ${pluralize(n, "court")}`. */
export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

/** "" or "s", for wording built around a number that is already rendered. */
export const s = (n: number): string => (n === 1 ? "" : "s");

/** "is" / "are", agreeing with a count. */
export const isAre = (n: number): string => (n === 1 ? "is" : "are");

/** "needs" / "need", agreeing with a count. */
export const verbS = (n: number, verb: string): string => (n === 1 ? `${verb}s` : verb);

/**
 * Turns a database enum into something readable: IN_PROGRESS becomes "In progress", FIXED_PER_PLAYER
 * becomes "Fixed per player". Never show a raw enum to a person.
 */
export function humanize(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Like humanize but left in lower case, for mid-sentence use: "This game is in progress." */
export const humanizeLower = (value: string): string => value.toLowerCase().replace(/_/g, " ").trim();

/** "Omar Farouk" to "Omar". Used wherever a full name would crowd the line. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** Joins with commas and a final "and": ["a","b","c"] to "a, b and c". */
export function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
