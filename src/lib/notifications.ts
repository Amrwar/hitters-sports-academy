/**
 * The catalogue of every notification HITTERS can send: one entry per type, with its category, default
 * wording, default channels and anti-spam rules. Admins override the wording per type in
 * NotificationTemplate; this file is the fallback and the source of truth for which types exist.
 *
 * Wording uses {{placeholders}} filled from the notification's `data`. A placeholder with no value renders
 * empty and the surrounding spacing is tidied, so a template never shows "{{club}}" to a player.
 */
import type { NotificationCategory, NotificationChannel } from "@prisma/client";

export type NotificationDef = {
  category: NotificationCategory;
  title: string;
  body: string;
  /** Channels this type may use before each person's preferences narrow it further. */
  channels: NotificationChannel[];
  /**
   * Minutes during which an identical dedupeKey for the same person is suppressed. Stops a burst of the
   * same event (a lineup changing three times in a minute) turning into three notifications.
   */
  quietMinutes?: number;
  /** Types the centre collapses by groupKey, e.g. five join requests for one game shown as one row. */
  groupable?: boolean;
  /** Placeholders the wording may use; shown to admins editing the template. */
  vars: string[];
};

const IN_APP: NotificationChannel[] = ["IN_APP"];
const IN_APP_EMAIL: NotificationChannel[] = ["IN_APP", "EMAIL"];

export const NOTIFICATION_CATALOG = {
  /* ------------------------------------------------------------------ Bookings */
  "booking.confirmed": { category: "BOOKING", title: "Booking confirmed · {{code}}", body: "{{club}} · {{court}} · {{when}} for {{duration}} min.", channels: IN_APP_EMAIL, vars: ["code", "club", "court", "when", "duration"] },
  "booking.cancelled": { category: "BOOKING", title: "Booking {{code}} cancelled", body: "{{club}} · {{when}}.{{reasonSuffix}}", channels: IN_APP_EMAIL, vars: ["code", "club", "when", "reasonSuffix"] },
  "booking.rescheduled": { category: "BOOKING", title: "Booking moved · {{code}}", body: "Now {{when}} at {{club}} · {{court}}.", channels: IN_APP_EMAIL, vars: ["code", "club", "court", "when"] },
  "booking.reminder": { category: "BOOKING", title: "Your court is booked for {{when}}", body: "{{club}} · {{court}} · {{code}}. See you there.", channels: IN_APP_EMAIL, quietMinutes: 14 * 24 * 60, vars: ["code", "club", "court", "when"] },
  "booking.court_unavailable": { category: "BOOKING", title: "{{court}} is unavailable", body: "{{club}} · {{when}}.{{reasonSuffix}} The club will be in touch about moving your booking.", channels: IN_APP_EMAIL, vars: ["code", "club", "court", "when", "reasonSuffix"] },

  /* ------------------------------------------------------------------ Matchmaking */
  "game.invited": { category: "MATCHMAKING", title: "{{organizer}} invited you to a game", body: "{{when}} · {{club}} · {{court}}.", channels: IN_APP_EMAIL, vars: ["organizer", "when", "club", "court", "code"] },
  "game.accepted": { category: "MATCHMAKING", title: "{{player}} is in", body: "{{accepted}} of {{max}} players · {{when}} · {{club}}.", channels: IN_APP, groupable: true, vars: ["player", "accepted", "max", "when", "club", "code"] },
  "game.declined": { category: "MATCHMAKING", title: "{{player}} can't make it", body: "{{when}} · {{club}} · {{court}}.", channels: IN_APP, groupable: true, vars: ["player", "when", "club", "court", "code"] },
  "game.left": { category: "MATCHMAKING", title: "{{player}} left your game", body: "{{spots}} spot{{spotsPlural}} open · {{when}} · {{club}}.{{waitlistSuffix}}", channels: IN_APP, vars: ["player", "spots", "spotsPlural", "when", "club", "waitlistSuffix", "code"] },
  "game.removed": { category: "MATCHMAKING", title: "{{headline}}", body: "{{when}} · {{club}} · {{court}}.", channels: IN_APP, vars: ["headline", "when", "club", "court", "code"] },
  "game.confirmed": { category: "MATCHMAKING", title: "Game confirmed", body: "{{when}} · {{club}} · {{court}}. The lineup is set.", channels: IN_APP_EMAIL, vars: ["when", "club", "court", "code"] },
  "game.cancelled": { category: "MATCHMAKING", title: "Game cancelled", body: "{{when}} · {{club}}.{{reasonSuffix}}", channels: IN_APP_EMAIL, vars: ["when", "club", "reasonSuffix", "code"] },
  "game.moved": { category: "MATCHMAKING", title: "Game {{code}} moved", body: "Now {{when}} at {{club}} · {{court}}.", channels: IN_APP_EMAIL, vars: ["code", "when", "club", "court"] },
  "game.lineup": { category: "MATCHMAKING", title: "{{player}} joined your game", body: "{{accepted}} of {{max}} players · {{code}}.", channels: IN_APP, groupable: true, quietMinutes: 10, vars: ["player", "accepted", "max", "code"] },
  "game.almost_full": { category: "MATCHMAKING", title: "One spot left in your game", body: "{{when}} · {{club}}. Confirm the lineup once it fills.", channels: IN_APP, quietMinutes: 24 * 60, vars: ["when", "club", "code"] },
  "game.request": { category: "MATCHMAKING", title: "{{who}} asked to join your game", body: "{{reasons}} · {{code}}.", channels: IN_APP_EMAIL, groupable: true, vars: ["who", "reasons", "code"] },
  "game.request_waitlist": { category: "MATCHMAKING", title: "{{who}} joined the waitlist", body: "{{reasons}} · {{code}}.", channels: IN_APP, groupable: true, vars: ["who", "reasons", "code"] },
  "game.request_sent": { category: "MATCHMAKING", title: "{{player}} requested a game for your pair", body: "{{club}} · {{code}}. You are both added if the organizer accepts.", channels: IN_APP, vars: ["player", "club", "code"] },
  "game.request_accepted": { category: "MATCHMAKING", title: "You're in!", body: "{{club}} · {{court}} · {{code}}. {{accepted}} of {{max}} players.", channels: IN_APP_EMAIL, vars: ["club", "court", "code", "accepted", "max"] },
  "game.request_declined": { category: "MATCHMAKING", title: "Request declined", body: "{{code}}.{{reasonSuffix}}", channels: IN_APP, vars: ["code", "reasonSuffix"] },
  "game.request_withdrawn": { category: "MATCHMAKING", title: "{{player}} withdrew a request", body: "{{code}}.", channels: IN_APP, groupable: true, vars: ["player", "code"] },
  "game.request_waitlisted": { category: "MATCHMAKING", title: "The game filled up; you are waitlisted", body: "{{code}} · you move back to pending if a spot opens.", channels: IN_APP, vars: ["code"] },
  "game.waitlist_moved": { category: "MATCHMAKING", title: "You moved up the waitlist", body: "Now number {{position}} for {{code}} · {{when}} at {{club}}.", channels: IN_APP, quietMinutes: 60, vars: ["position", "code", "when", "club"] },
  "match.suggested": { category: "MATCHMAKING", title: "A game that fits you opened up", body: "{{when}} · {{club}} · {{reasons}}.", channels: IN_APP, quietMinutes: 24 * 60, groupable: true, vars: ["when", "club", "reasons", "code"] },
  "pair.proposed": { category: "MATCHMAKING", title: "{{player}} wants to play as a pair", body: "Confirm the pair to request games together.", channels: IN_APP, vars: ["player"] },
  "pair.confirmed": { category: "MATCHMAKING", title: "{{player}} confirmed your pair", body: "Find a match together or open a challenge.", channels: IN_APP, vars: ["player"] },
  "pair.declined": { category: "MATCHMAKING", title: "{{player}} declined the pair", body: "You can propose again later.", channels: IN_APP, vars: ["player"] },
  "pair.dissolved": { category: "MATCHMAKING", title: "{{player}} ended your pair", body: "Pending pair requests were withdrawn.", channels: IN_APP, vars: ["player"] },

  /* ------------------------------------------------------------------ Training */
  "lesson.booked": { category: "TRAINING", title: "{{headline}}", body: "{{when}} · {{club}} · {{duration}} min.{{pendingSuffix}}", channels: IN_APP_EMAIL, vars: ["headline", "when", "club", "duration", "pendingSuffix", "code"] },
  "lesson.confirmed": { category: "TRAINING", title: "{{coach}} confirmed your lesson", body: "{{when}} · {{club}}.", channels: IN_APP_EMAIL, vars: ["coach", "when", "club", "code"] },
  "lesson.declined": { category: "TRAINING", title: "{{coach}} can't make that time", body: "{{when}} · {{club}}. Try another slot or another coach.", channels: IN_APP_EMAIL, vars: ["coach", "when", "club", "code"] },
  "lesson.cancelled": { category: "TRAINING", title: "Lesson {{code}} cancelled", body: "{{when}} · {{club}}.{{reasonSuffix}}", channels: IN_APP_EMAIL, vars: ["code", "when", "club", "reasonSuffix"] },
  "lesson.rescheduled": { category: "TRAINING", title: "Lesson moved · {{code}}", body: "Now {{when}} at {{club}}.", channels: IN_APP_EMAIL, vars: ["code", "when", "club"] },
  "lesson.reminder": { category: "TRAINING", title: "Lesson with {{coach}} {{when}}", body: "{{club}} · {{duration}} min · {{code}}.", channels: IN_APP_EMAIL, quietMinutes: 14 * 24 * 60, vars: ["coach", "when", "club", "duration", "code"] },
  "lesson.note": { category: "TRAINING", title: "{{coach}} left you a note", body: "{{excerpt}}", channels: IN_APP, vars: ["coach", "excerpt"] },
  "program.enrolled": { category: "TRAINING", title: "Enrolled in {{program}}", body: "{{club}} · starts {{startsOn}} · pay at the venue.", channels: IN_APP_EMAIL, vars: ["program", "club", "startsOn"] },
  "program.waitlisted": { category: "TRAINING", title: "Waitlisted for {{program}}", body: "You are number {{position}} in line. We tell you when a spot opens.", channels: IN_APP_EMAIL, vars: ["program", "position"] },
  "program.promoted": { category: "TRAINING", title: "A place opened in {{program}}", body: "You moved off the waitlist and are enrolled. Pay at the venue.", channels: IN_APP_EMAIL, vars: ["program"] },
  "program.enrollment_cancelled": { category: "TRAINING", title: "Removed from {{program}}", body: "{{reason}}", channels: IN_APP_EMAIL, vars: ["program", "reason"] },
  "program.cancelled": { category: "TRAINING", title: "{{program}} was cancelled", body: "{{reason}}", channels: IN_APP_EMAIL, vars: ["program", "reason"] },
  "program.changed": { category: "TRAINING", title: "{{program}} has changed", body: "{{summary}} Check the schedule for the new details.", channels: IN_APP_EMAIL, quietMinutes: 60, vars: ["program", "summary"] },
  "program.assigned": { category: "TRAINING", title: "You lead \"{{program}}\"", body: "{{club}} · {{sessions}} sessions from {{startsOn}}.", channels: IN_APP, vars: ["program", "club", "sessions", "startsOn"] },
  "program.roster": { category: "TRAINING", title: "{{player}} {{verb}} {{program}}", body: "{{enrolled}} of {{capacity}} places taken.", channels: IN_APP, groupable: true, quietMinutes: 30, vars: ["player", "verb", "program", "enrolled", "capacity"] },
  "package.purchased": { category: "TRAINING", title: "{{credits}} lesson credit{{creditsPlural}} added", body: "{{package}}, valid until {{expires}}. Pay at the venue and spend the credits whenever you book a lesson.", channels: IN_APP_EMAIL, vars: ["package", "credits", "creditsPlural", "expires"] },
  "training.recorded": { category: "TRAINING", title: "Training added to your history", body: "{{title}} · {{club}}{{coachSuffix}}.", channels: IN_APP, vars: ["title", "club", "coachSuffix"] },
  "trainer.profile": { category: "TRAINING", title: "Your coaching profile is live", body: "Set your weekly availability from Admin, Coaching.", channels: IN_APP, vars: [] },
  "assessment.scheduled": { category: "TRAINING", title: "Your assessment is booked", body: "{{when}} · {{club}}{{assessorSuffix}}.", channels: IN_APP_EMAIL, vars: ["when", "club", "assessorSuffix"] },
  "assessment.completed": { category: "TRAINING", title: "Official level: {{level}} · {{label}}", body: "{{kind}} at {{club}} by {{assessor}}.{{previousSuffix}}", channels: IN_APP_EMAIL, vars: ["level", "label", "kind", "club", "assessor", "previousSuffix"] },
  "assessment.level_changed": { category: "TRAINING", title: "Official level updated: {{level}} · {{label}}", body: "{{reason}}", channels: IN_APP_EMAIL, vars: ["level", "label", "reason"] },
  "assessment.cancelled": { category: "TRAINING", title: "Assessment request declined", body: "{{club}} could not schedule your assessment.{{reasonSuffix}} You can request again.", channels: IN_APP, vars: ["club", "reasonSuffix"] },

  /* ------------------------------------------------------------------ Academy */
  "academy.announcement": { category: "ACADEMY", title: "{{title}}", body: "{{body}}", channels: IN_APP_EMAIL, vars: ["title", "body"] },
  "staff.granted": { category: "ACADEMY", title: "You've been given a new role", body: "{{role}} at {{club}}.", channels: IN_APP_EMAIL, vars: ["role", "club"] },

  /* ------------------------------------------------------------------ Messaging */
  "message.new": { category: "MESSAGING", title: "{{sender}} in {{thread}}", body: "{{excerpt}}", channels: IN_APP, groupable: true, quietMinutes: 15, vars: ["sender", "thread", "excerpt"] },
  "message.reported": { category: "MESSAGING", title: "A message was reported", body: "{{reason}} · {{thread}}. Review it in Admin, Moderation.", channels: IN_APP, groupable: true, vars: ["reason", "thread"] },
  "message.removed": { category: "MESSAGING", title: "Your message was removed", body: "{{thread}}. Keep it civil and about the game.", channels: IN_APP, vars: ["thread"] },
} as const satisfies Record<string, NotificationDef>;

export type NotificationType = keyof typeof NOTIFICATION_CATALOG;

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_CATALOG) as NotificationType[];

export const NOTIFICATION_CATEGORIES: { value: NotificationCategory; label: string; description: string }[] = [
  { value: "BOOKING", label: "Court bookings", description: "Confirmations, changes, reminders and court problems." },
  { value: "MATCHMAKING", label: "Games and matchmaking", description: "Invitations, join requests, lineup changes and suggested games." },
  { value: "TRAINING", label: "Coaching and academy", description: "Lessons, programs, packages and assessments." },
  { value: "ACADEMY", label: "Academy announcements", description: "News and notices from HITTERS." },
  { value: "MESSAGING", label: "Messages", description: "New messages in your game and program chats." },
];

export const CATEGORY_LABEL: Record<NotificationCategory, string> = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.value, c.label])) as Record<NotificationCategory, string>;

/** Channels a person can actually be reached on today. Email, SMS and push wait for a provider. */
export const CHANNELS: { value: NotificationChannel; label: string; live: boolean }[] = [
  { value: "IN_APP", label: "In the app", live: true },
  { value: "EMAIL", label: "Email", live: false },
  { value: "PUSH", label: "Push", live: false },
  { value: "SMS", label: "SMS", live: false },
];

export const isKnownType = (type: string): type is NotificationType => type in NOTIFICATION_CATALOG;

export const defFor = (type: string): NotificationDef | null => (isKnownType(type) ? (NOTIFICATION_CATALOG[type] as NotificationDef) : null);

/**
 * Fills {{placeholders}} from `data`. Unknown or empty placeholders collapse, and the leftover double
 * spaces and dangling separators they leave behind are cleaned up, so partial data still reads properly.
 */
export function render(template: string, data: Record<string, unknown> = {}): string {
  const filled = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = data[key];
    return v === undefined || v === null ? "" : String(v);
  });
  let out = filled.replace(/[ \t]{2,}/g, " ");
  // Two passes: dropping one separator can leave the next one beside its neighbour.
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/([·–-])\s*([·–-])/g, "$1")
      .replace(/\s*[·–-]\s*([.,;:!?])/g, "$1")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/[·–-]\s*$/g, "")
      .replace(/^\s*[·–-]\s*/g, "")
      .replace(/[ \t]{2,}/g, " ");
  }
  return out.replace(/\.{2,}/g, ".").trim();
}

/** " Reason: rain." style tails that read correctly when the reason is absent. */
export const suffix = (text: string | null | undefined, prefix = " "): string => (text && text.trim() ? `${prefix}${text.trim()}` : "");
export const plural = (n: number, one = "", many = "s"): string => (n === 1 ? one : many);
