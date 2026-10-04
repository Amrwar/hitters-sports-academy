/** Static catalogues shared by validation, services and UI. */

export const FACILITIES = [
  { key: "parking", label: "Parking" },
  { key: "showers", label: "Showers" },
  { key: "lockers", label: "Lockers" },
  { key: "cafe", label: "Café" },
  { key: "pro_shop", label: "Pro shop" },
  { key: "coaching", label: "Coaching" },
  { key: "physio", label: "Physio" },
  { key: "kids_area", label: "Kids area" },
  { key: "equipment_rental", label: "Racket & ball rental" },
  { key: "indoor_ac", label: "Indoor air conditioning" },
  { key: "lounge", label: "Lounge" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "prayer_room", label: "Prayer room" },
  { key: "accessible", label: "Wheelchair accessible" },
] as const;

export type FacilityKey = (typeof FACILITIES)[number]["key"];
export const FACILITY_KEYS = FACILITIES.map((f) => f.key) as [FacilityKey, ...FacilityKey[]];
export const facilityLabel = (key: string) => FACILITIES.find((f) => f.key === key)?.label ?? key;

export const COURT_TYPES = [
  { value: "INDOOR", label: "Indoor" },
  { value: "OUTDOOR", label: "Outdoor" },
  { value: "PANORAMIC", label: "Panoramic" },
] as const;

export const COURT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "MAINTENANCE", label: "Under maintenance" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

export const LOCATION_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "COMING_SOON", label: "Coming soon" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

export const PRICING_KINDS = [
  { value: "PEAK", label: "Peak hours", hint: "Higher rate during busy hours" },
  { value: "OFF_PEAK", label: "Off-peak", hint: "Lower rate during quiet hours" },
  { value: "WEEKEND", label: "Weekend", hint: "Applies on the selected days" },
  { value: "MEMBERSHIP_DISCOUNT", label: "Membership discount", hint: "Discount for members of a tier" },
  { value: "CUSTOM", label: "Custom", hint: "Any other adjustment" },
] as const;

export const PREFERRED_TIMES = [
  { key: "weekday_morning", label: "Weekday mornings" },
  { key: "weekday_afternoon", label: "Weekday afternoons" },
  { key: "weekday_evening", label: "Weekday evenings" },
  { key: "weekend_morning", label: "Weekend mornings" },
  { key: "weekend_afternoon", label: "Weekend afternoons" },
  { key: "weekend_evening", label: "Weekend evenings" },
] as const;
export const PREFERRED_TIME_KEYS = PREFERRED_TIMES.map((t) => t.key) as [string, ...string[]];
export const preferredTimeLabel = (key: string) => PREFERRED_TIMES.find((t) => t.key === key)?.label ?? key;

export const MATCH_TYPES = [
  { value: "ANY", label: "Any" },
  { value: "FRIENDLY", label: "Friendly" },
  { value: "COMPETITIVE", label: "Competitive" },
] as const;

export const TRAINING_KINDS = [
  { value: "PRIVATE", label: "Private session" },
  { value: "PROGRAM", label: "Program session" },
  { value: "CLINIC", label: "Clinic" },
  { value: "ASSESSMENT", label: "Assessment" },
] as const;

/** Game formats. The player count is stored per session, so a new format only needs a row here. */
export const GAME_FORMATS = [
  { value: "DOUBLES", label: "Doubles", players: 4, hint: "Standard 2 v 2" },
  { value: "SINGLES", label: "Singles", players: 2, hint: "1 v 1" },
  { value: "OPEN", label: "Open", players: 8, hint: "Americano, clinic or social: choose the player count" },
] as const;
export type GameFormatKey = (typeof GAME_FORMATS)[number]["value"];
export const gameFormatLabel = (value: string) => GAME_FORMATS.find((f) => f.value === value)?.label ?? value;

export const GAME_VISIBILITY = [
  { value: "PRIVATE", label: "Private", hint: "Only invited players can see it" },
  { value: "PUBLIC", label: "Discoverable", hint: "Listed in Play for players at this club" },
] as const;

export const GAME_COST_MODES = [
  { value: "SPLIT_EVENLY", label: "Split the court", hint: "Court price divided by the players" },
  { value: "FIXED_PER_PLAYER", label: "Fixed per player", hint: "You set the amount" },
  { value: "ORGANIZER_PAYS", label: "On me", hint: "The organizer covers the court" },
  { value: "FREE", label: "Free", hint: "No cost to anyone" },
] as const;
export const gameCostLabel = (value: string) => GAME_COST_MODES.find((c) => c.value === value)?.label ?? value;

export const GAME_JOIN_POLICIES = [
  { value: "OPEN", label: "Solo players and pairs", hint: "Anyone compatible can ask for a spot" },
  { value: "SOLO_ONLY", label: "Solo players only", hint: "One spot per request" },
  { value: "PAIRS_ONLY", label: "Pairs only (challenge)", hint: "An opposing pair takes both spots" },
] as const;

export const GAME_LEVEL_POLICIES = [
  { value: "EXACT", label: "Exact levels only", hint: "Only the levels you pick" },
  { value: "ADJACENT", label: "Adjacent levels welcome", hint: "One rank above or below, when the academy allows it" },
] as const;

export const REQUEST_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "EXPIRED", label: "Expired" },
] as const;

export const GAME_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Open" },
  { value: "FULL", label: "Full" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const PROGRAM_CATEGORIES = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "JUNIOR", label: "Junior" },
  { value: "COMPETITIVE", label: "Competitive" },
  { value: "INTENSIVE", label: "Intensive" },
  { value: "GROUP_COACHING", label: "Group coaching" },
] as const;
export const programCategoryLabel = (v: string) => PROGRAM_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const TRAINER_SPECIALTIES = ["Technique", "Match tactics", "Footwork", "Serve and return", "Net game", "Bandeja and vibora", "Fitness", "Juniors", "Beginners", "Competition prep", "Mental game"] as const;
export const TRAINER_LANGUAGES = ["Arabic", "English", "Spanish", "French", "Italian", "German"] as const;

export const ATTENDANCE_STATUSES = [
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
  { value: "EXCUSED", label: "Excused" },
] as const;

export const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180] as const;

export const TIMEZONES = ["Africa/Cairo", "Asia/Dubai", "Asia/Riyadh", "Europe/Madrid", "Europe/London", "America/New_York"] as const;

/** Brand photo library available to admins until object storage is connected. */
export const BRAND_PHOTOS = [
  { url: "/brand/court-net.jpg", alt: "Net and racket on a blue court" },
  { url: "/brand/court-rackets.jpg", alt: "Racket head, ball and court glow" },
  { url: "/brand/court-line.jpg", alt: "Court line and ball" },
  { url: "/brand/court-handles.jpg", alt: "Rackets and balls" },
] as const;

/* ------------------------------------------------------------------ Label maps for everything else */

const fromPairs = <T extends readonly { value: string; label: string }[]>(rows: T): Record<string, string> => Object.fromEntries(rows.map((r) => [r.value, r.label]));

/** One place to turn any stored enum into the words a person should read. */
export const LABELS: Record<string, Record<string, string>> = {
  gameStatus: fromPairs(GAME_STATUSES),
  requestStatus: fromPairs(REQUEST_STATUSES),
  courtStatus: fromPairs(COURT_STATUSES),
  locationStatus: fromPairs(LOCATION_STATUSES),
  attendance: fromPairs(ATTENDANCE_STATUSES),
  matchType: fromPairs(MATCH_TYPES),
  programCategory: fromPairs(PROGRAM_CATEGORIES),
  side: { LEFT: "Left side", RIGHT: "Right side", BOTH: "Plays both sides" },
  sideShort: { LEFT: "Left", RIGHT: "Right", BOTH: "Both sides" },
  participantRole: { ORGANIZER: "Organizer", PLAYER: "Player" },
  participantStatus: { INVITED: "Invited", ACCEPTED: "Joined", DECLINED: "Declined", LEFT: "Left", REMOVED: "Removed" },
  bookingSource: { PLAYER_APP: "Booked in the app", ADMIN: "Booked by staff", RECEPTION: "Booked at reception" },
  bookingStatus: { PENDING: "Pending", CONFIRMED: "Confirmed", CANCELLED: "Cancelled", COMPLETED: "Completed", NO_SHOW: "No-show" },
  lessonStatus: { REQUESTED: "Awaiting the coach", CONFIRMED: "Confirmed", CANCELLED: "Cancelled", COMPLETED: "Completed", NO_SHOW: "No-show" },
  enrollmentStatus: { ENROLLED: "Enrolled", WAITLISTED: "Waitlisted", CANCELLED: "Cancelled", COMPLETED: "Completed" },
  programStatus: { DRAFT: "Draft", OPEN: "Open", FULL: "Full", IN_PROGRESS: "Running", COMPLETED: "Finished", CANCELLED: "Cancelled" },
  reportStatus: { OPEN: "Open", ACTIONED: "Actioned", DISMISSED: "Dismissed" },
  assessmentKind: { INITIAL: "Initial assessment", REASSESSMENT: "Reassessment", LEVEL_CHANGE: "Level change" },
  visibility: { PUBLIC: "Anyone", MEMBERS: "HITTERS members", PRIVATE: "Only me" },
  /** Why a slot cannot be booked, in words a player understands. */
  slot: { available: "Available", booked: "Already booked", closed: "Court closed", location_closed: "Club closed", maintenance: "Under maintenance", too_soon: "Too close to start", outside_window: "Outside the booking window", past: "In the past" },
  /** Assessment score fields. */
  score: { serve: "Serve", forehand: "Forehand", backhand: "Backhand", volley: "Volley", bandeja: "Bandeja", smash: "Smash", lob: "Lob", positioning: "Positioning", tactics: "Tactics", movement: "Movement", consistency: "Consistency", fitness: "Fitness" },
};

/**
 * The words for one stored value. Falls back to sentence case rather than the raw value, so a new enum
 * member added to the database still reads properly before anyone adds it here.
 */
export function label(kind: keyof typeof LABELS | string, value: string | null | undefined): string {
  if (!value) return "";
  const found = LABELS[kind]?.[value];
  if (found) return found;
  const words = value.toLowerCase().replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The level filter on a game, program or coach, worded the same way everywhere. */
export const ANY_LEVEL = "Any level";
export const levelsLabel = (levels: readonly string[]): string => (levels.length === 0 ? ANY_LEVEL : `Level ${levels.join(" or ")}`);

/**
 * Audit actions in plain words, for the history timelines staff read. A key with no entry falls back to
 * sentence case of its last segment, so a new action never shows as a dotted key.
 */
export const AUDIT_LABELS: Record<string, string> = {
  "booking.created": "Booking created",
  "booking.cancelled": "Booking cancelled",
  "booking.rescheduled": "Booking moved",
  "payment.recorded": "Payment recorded",
  "game.created": "Game created",
  "game.published": "Game published",
  "game.confirmed": "Lineup confirmed",
  "game.cancelled": "Game cancelled",
  "game.updated": "Game edited",
  "game.invited": "Players invited",
  "game.accepted": "Invitation accepted",
  "game.declined": "Invitation declined",
  "game.left": "Player left",
  "game.moved": "Game moved",
  "game.requested": "Join request sent",
  "game.request_accepted": "Join request accepted",
  "game.request_declined": "Join request declined",
  "game.request_withdrawn": "Join request withdrawn",
  "lesson.booked": "Lesson booked",
  "lesson.cancelled": "Lesson cancelled",
  "lesson.rescheduled": "Lesson moved",
  "note.added": "Coach note added",
  "program.created": "Program created",
  "program.updated": "Program edited",
  "program.attendance": "Attendance marked",
  "program.enrollment_cancelled": "Enrollment cancelled",
  "program.promoted": "Moved off the waitlist",
  "package.created": "Package created",
  "package.purchased": "Package sold",
  "package.cancelled": "Package cancelled",
  "assessment.requested": "Assessment requested",
  "assessment.scheduled": "Assessment scheduled",
  "assessment.created": "Assessment recorded",
  "assessment.level_changed": "Level changed",
  "assessment.request_cancelled": "Assessment request cancelled",
  "court.created": "Court created",
  "court.updated": "Court edited",
  "court.availability_set": "Opening hours set",
  "court.closure_added": "Closure added",
  "court.closure_removed": "Closure removed",
  "location.created": "Club created",
  "location.updated": "Club edited",
  "location.policy_updated": "Booking policy updated",
  "location.courts_closed": "Courts closed",
  "staff.granted": "Role granted",
  "staff.revoked": "Role revoked",
  "message.reported": "Message reported",
  "message.moderated": "Report decided",
  "announcement.sent": "Announcement sent",
  "notification.sent": "Notification sent",
  "notification.template_updated": "Template edited",
  "academy.configured": "Academy settings changed",
  "matchmaking.configured": "Matchmaking rules changed",
  "levels.configured": "Levels changed",
  "profile.updated": "Profile updated",
  "user.register": "Account created",
  "user.email_verified": "Email verified",
  "user.login": "Signed in",
  "user.password_changed": "Password changed",
  "user.global_role_set": "Account role changed",
};

export function auditLabel(action: string): string {
  const found = AUDIT_LABELS[action];
  if (found) return found;
  const tail = action.split(".").pop() ?? action;
  const words = tail.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
