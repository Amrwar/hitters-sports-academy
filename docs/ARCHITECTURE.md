# HITTERS platform architecture (foundation phase)

## Stack
Next.js 15 App Router · React 19 · TypeScript · Tailwind 3.4 · Prisma 6 · PostgreSQL 16 (Docker, port 5440) · Vitest.

```
src/
  app/            routes (marketing, (auth), (player)/app, (admin)/admin, verify-email, design-system)
  components/     design system (ui/), brand marks, navigation, patterns
  lib/            db client, errors, validation (zod), auth primitives (password, tokens, permissions, authorize, cookies)
  server/
    services/     ALL business rules. Every function takes `actor: Actor | null` first and authorizes itself.
    actions/      thin "use server" wrappers: read cookies -> call service -> return ActionResult (never throw)
  middleware.ts   UX-only redirect for /app, /admin, /splash when no session cookie is present
prisma/           schema, migrations, seed
tests/            vitest suite against TEST_DATABASE_URL (migrate deploy + truncate per test)
docs/             AUDIT, DESIGN_SYSTEM, ARCHITECTURE
```

## Data model
`User` (one account for all locations) 1-1 `PlayerProfile` (level A-D, side, bio, home location, visibility).
`Location` 1-n `Court` 1-n `CourtAvailability` (weekly template, minutes from midnight, base + peak price) and `CourtClosure`.
`StaffMembership` (user, location, role) grants location-scoped roles. `User.globalRole` holds SUPER_ADMIN / ACADEMY_OWNER.
`Assessment` records each A-D placement (assessor, location, previous level) and updates the profile level.
`Session` (hashed opaque token, sliding 30-day expiry), `VerificationToken` (email verify, phone verify, password reset; hashed, single use).
`RolePermission` (role -> permission grants, seeded from code, authoritative at runtime, cached 60s).
`Notification` (outbox with channel/status; IN_APP read by the app). `AuditLog` (actor, action, entity, location, metadata, ip).

Constraints: unique email/phone, unique (location, court name), unique (user, location, role), unique (court, day, opensAt), unique token hashes; FKs cascade from User/Location/Court and restrict on assessor/location of assessments.

## Locations, courts, availability and pricing (phase 4)
- `Location` gained `description`, `facilities[]` (keys from `src/lib/catalog.ts`), `openingHours` (JSON, 7 entries Sunday-first, null = closed), `LocationPhoto[]` (URL based until object storage is connected) and a 1-1 `BookingPolicy` (booking window, minimum notice, cancellation cutoff, max active bookings, verified-email requirement, allowed durations).
- `Court` gained `description` and `durationsMinutes[]` (overrides the policy's allowed durations). `CourtAvailability` is the weekly operating template with a **base hourly rate**; the old peak columns were migrated into `PricingRule` rows (see migration `20261003030000_court_management`).
- `PricingRule` (kinds PEAK, OFF_PEAK, WEEKEND, MEMBERSHIP_DISCOUNT, CUSTOM) scopes by location or court, days, time window, validity dates and membership tier; applied in ascending priority, absolute price replaces the base, percentage scales the running total. Engine: `quotePrice()` in `server/services/pricing.ts` (pure, unit tested).
- `CourtClosure` blocks a period. Overlaps are rejected inside a transaction that locks the court row (`SELECT ... FOR UPDATE`); `closeLocationCourts` blocks every court atomically.
- Availability engine `computeCourtDay()` (`server/services/availability.ts`, pure) intersects the court template with location hours, applies closures, court/location status and booking policy, and prices each slot. All wall-clock math uses `src/lib/time.ts` (Intl-based, no dependency) in the location's IANA timezone; UTC instants are what get stored.
- Admin UI: `/admin/locations/[id]` (details, photos, hours, facilities, policy, pricing), `/admin/courts/[id]` (details, weekly template, closures), `/admin/calendar` (courts x hours grid with block-period actions). Player UI: `/app/locations` and `/app/locations/[slug]` read live data.

## Authentication
- Passwords: scrypt (N=2^15, r=8, p=1, 64-byte key), parameters stored with the hash; rehash on login when parameters are raised.
- Sessions: 32-byte random cookie token, SHA-256 stored; `hitters_session` cookie is httpOnly, SameSite=Lax, Secure in production. Expiry slides hourly. Logout deletes the row; password reset/change and suspension revoke all sessions.
- Email verification and password reset use single-use hashed tokens (24h / 1h). Reset also marks the email verified. Unknown emails get the same response as known ones.
- Login failures are audited and rate limited per IP+email (10 per 15 min); registration 10/h per IP. Limiter is in-process; move to Redis before scaling horizontally.
- Mail: `src/lib/mail.ts` logs to console and an in-memory outbox until a provider is configured.

## Authorization
- Roles: SUPER_ADMIN, ACADEMY_OWNER (global); LOCATION_MANAGER, RECEPTIONIST, TRAINER, ASSESSOR, FINANCE_MANAGER (per location); PLAYER (every account).
- Permissions are string keys in `src/lib/auth/permissions.ts`; the default matrix is seeded into `RolePermission` by `prisma db seed` / tests.
- `can(actor, permission, { locationId })` checks global roles first, then memberships at that location. Global-only permissions (`location.create`, `roles.manage`, `users.manage`, `users.suspend`) can never be satisfied by a location role.
- `accessibleLocationIds(actor, permission)` returns `"all"` or the list of location ids; list endpoints filter with it.
- Rules encoded in services: managers cannot deactivate their location, appoint/remove managers, or edit profiles of players whose home club is elsewhere; assessors only assess at their location and never themselves; only super admins set global roles or suspend other admins; players edit only their own profile; private profiles are hidden from other players but not from staff at the home club.
- Frontend gates (`middleware.ts`, layouts, `isStaff`) are convenience only. Every service call re-verifies.

## Adding a feature
1. Add schema + `prisma migrate dev --name <change>`.
2. Add zod schema in `lib/validation/schemas.ts`.
3. Add a service in `server/services/` that calls `requirePermission` / `requireSelfOrPermission` and writes an `audit` row inside the transaction.
4. Add a thin action in `server/actions/` returning `ActionResult`.
5. Add tests in `tests/` covering allowed and denied actors.

## Commands
`npm run db:migrate` · `npm run db:seed` · `npm test` · `npm run typecheck` · `npm run build` · `docker compose up -d`

## Court reservations (phase 5)
- `Booking` is the court reservation only (court, time range, status, price, source, confirmation code). `BookingParticipant` holds who plays (organizer + invited players or a guest). `Payment` is separate and created PENDING ("pay at venue") because no provider is connected; staff with `payment.manage` record cash/card/waived at the desk.
- Statuses: PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW. CONFIRMED bookings whose end time has passed are flipped to COMPLETED lazily on reads (`completeElapsedBookings`); staff can mark NO_SHOW or COMPLETED once a session has started.
- Double booking is impossible by construction: the Postgres exclusion constraint `Booking_no_overlap` (btree_gist, `tsrange(startsAt, endsAt, '[)')`, active statuses only) rejects overlapping inserts even under concurrency. The service additionally locks the court row (`SELECT ... FOR UPDATE`) and re-checks inside the transaction so most races fail with a friendly SLOT_UNAVAILABLE before hitting the constraint; constraint violations are mapped to the same error.
- `validateSlot` is the single rule engine for quote, create and reschedule: location active and open that day, court active, allowed duration (court override or policy), on the slot grid inside operating hours capped by location hours, no closure, not in the past, inside min-notice and booking-window (staff bypass these two), no overlapping active booking, then priced with `quotePrice`.
- Players: verified email required when the policy says so, max active bookings per player, free cancellation/reschedule until `cancellationCutoffHours` before start; staff (`booking.manage`: location manager, receptionist, global roles) can book for members or walk-in guests, cancel late, reschedule, and record attendance. Rescheduling cancels the old booking and creates a linked new one in one transaction; a PAID payment follows the new booking.
- Error codes surfaced to the UI: SLOT_UNAVAILABLE, COURT_UNAVAILABLE, BOOKING_CONFLICT, CANCELLATION_NOT_ALLOWED, INVALID_DURATION, LOCATION_CLOSED (plus the generic ones).
- UI: `/app/book` (location, date, court/time grid with live availability, duration, price review, confirm), `/app/bookings` (+ `[id]` with cancel/reschedule), admin `/admin/bookings` (filters, manual/receptionist booking, cancel, attendance, payment) and `/admin/bookings/[id]`, booked cells on `/admin/calendar`, live dashboards.

## Player profiles and assessments (phase 6)
- `PlayerProfile` gained `photoUrl`, `selfLevel` (self-reported, never official), `matchType`, `playStyle`, `yearsPlaying`, `preferredTimes[]` (catalogue keys) and a many-to-many `preferredLocations`. The official `level` is written only by the assessment service.
- `LevelDefinition` makes the A-D ordering and wording admin-configurable (`rank` 1 = strongest, label, description). Nothing in code assumes which letter is highest; defaults are seeded and only global roles (`levels.configure`) may change them. Changes are audited.
- Workflow: `AssessmentRequest` (REQUESTED -> SCHEDULED -> COMPLETED / CANCELLED). Players request (`assessment.request.own`, one open request at a time); receptionists, assessors and managers schedule (`assessment.schedule`) with an assessor who holds the ASSESSOR role at that location; assessors record (`assessment.create`) which closes the request, writes an `Assessment` (kind INITIAL / REASSESSMENT / LEVEL_CHANGE, previous level, scores, player notes, staff-only notes), updates the profile level and notifies the player. Managers and owners may correct a level without a session via `recordLevelChange` (`level.override`, home-location scoped). Every assessment stays in history; players never see `staffNotes`.
- `TrainingRecord` gives players a real training history; trainers and managers record it (`training.record`).
- UI: player profile tabs (overview, level, history, settings), public player page, admin `/admin/assessments` (queue, history, level definitions) and `/admin/members/[id]` (profile, assessments with staff notes, bookings, training, record assessment, change level, add training).
- Screenshots for the proposal are produced by `node scripts/screenshots.mjs` (headless Chrome against a seeded server) into `docs/screenshots/`.
- Lesson: never animate or transform a page wrapper that contains fixed overlays; modals now portal to `<body>`.

## Games: planned sessions on a booking (phase 7)
- `GameSession` is a planned game that lives on exactly one of the organizer's own active bookings (`bookingId` unique). Court, location and times are copied from the booking and follow it: rescheduling the booking moves the game (`moveGameToBooking`), cancelling the booking cancels the game (`cancelGameForBooking`), both inside the booking transaction. The reservation (`Booking`) and money (`Payment`) stay separate; the game only owns who plays and how spots are filled.
- Formats: `GameFormat` SINGLES (2), DOUBLES (4), OPEN (organizer sets 2-16). `maxPlayers` is stored per session so a new format is a catalogue row, not a schema change. `levels[]` (empty = any), `matchType`, `visibility` (PRIVATE / PUBLIC = discoverable), `openToRequests`, `costMode` (SPLIT_EVENLY derives a share from the booking price; FIXED_PER_PLAYER; ORGANIZER_PAYS; FREE), description (public) and notes (lineup only).
- Participants: `GameParticipant` with role ORGANIZER / PLAYER and status INVITED -> ACCEPTED / DECLINED / LEFT / REMOVED, unique per (session, user). The organizer is auto-added as ACCEPTED; everyone else must accept their own invitation. Nothing accepts on a player's behalf. Accepted + pending invitations never exceed `maxPlayers`, so "spots left" is always honest.
- States: DRAFT (organizer builds the lineup; invisible to others) -> OPEN (published) -> FULL (every spot accepted) -> CONFIRMED (organizer locks the lineup; players notified) -> IN_PROGRESS (start time passed) -> COMPLETED (end time passed). CANCELLED from any live state by the organizer or staff with `session.manage` at the location. A drop-out from FULL or CONFIRMED returns the game to OPEN. Drafts whose booking has ended expire to CANCELLED. Time transitions run lazily on reads (`advanceElapsedGames`).
- Concurrency: `respondToInvite` locks the session row (`SELECT ... FOR UPDATE`) and recounts accepted players inside the transaction, so parallel acceptances cannot overfill a game (tested with six simultaneous accepts for three spots).
- `GameJoinRequest` is used by the matchmaking phase below.
- Permissions: players `session.create.own` and `session.participate.own`; staff `session.read` (every location role) and `session.manage` (managers, receptionists, global roles). Visibility: organizer, invited or accepted players and in-scope staff see a game; anyone signed in sees PUBLIC games once published, without the lineup notes.
- UI: `/app/play` (my games with inline accept/decline, discover with level/club/today filters), `/app/play/new` (pick a booking, format, levels, invitations, visibility, cost, notes), `/app/play/[code]` (lineup, organizer controls: publish, invite, discoverable/open-spots toggles, edit, confirm, remove, cancel; player controls: accept, decline, leave), booking detail links to its game, home shows invitations, the next game and open games at preferred clubs, admin `/admin/games` (scope-filtered list, cancel).

## Matchmaking (phase 8)
- Rules engine in `src/lib/matching.ts`: pure and deterministic (no randomness, no learned weights). `evaluateMatch(candidate, seeker, config)` returns eligibility, a score, the reasons that fired (each with points) and the blockers. Scores: exact level 40, any-level game 25, adjacent level 15; home club 30, preferred club 25, selected club 20, other club 0 (location ranks, it never hides a game); inside the requested time window 20, a preferred time of week 10; completes the lineup 8, otherwise 4; friendly/competitive preference aligned 5. Ties break on start time, then game code. Hard blockers: no official level, level not welcome, wrong date, outside the time window, not OPEN/FULL, not PUBLIC, requests closed, join policy (solo vs pair), organizer, already in the lineup or already asked, not enough spots (a full game can be waitlisted).
- Adjacent levels: a seeker one rank above or below (ranks come from `LevelDefinition`, never from the letter) is welcome only when the game's `levelPolicy` is ADJACENT **and** `MatchmakingConfig.allowAdjacentLevels` is on. The config is a singleton (`default`) changed only by global roles (`matchmaking.configure`) from Admin › Settings; it also sets request expiry hours and the open-request cap.
- Requests: `GameJoinRequest` with `kind` SOLO (1 spot) or PAIR (2 spots, `pairId`), status PENDING → ACCEPTED / DECLINED / WITHDRAWN / EXPIRED, or WAITLISTED when the game is full (promoted back to PENDING, oldest first, when a spot reopens; nothing is accepted automatically). Each request stores the score and reasons the seeker saw; the organizer's review re-evaluates "compatibility now" and shows profile, level, side, spots needed, message and completed games played together (hidden for private profiles). Open requests expire with the game (start, cancellation, booking cancellation) or after the configured hours.
- Acceptance (`decideRequest`): one transaction locks the game row and the request row (`SELECT ... FOR UPDATE`), re-reads both, rejects an already decided request (INVALID_TRANSITION), checks `spotsLeft >= spots` (SESSION_FULL), upserts every member as ACCEPTED with the pair id, flips the game to FULL and waitlists the remaining pending requests. Simultaneous approvals and simultaneous requests are covered by tests; a pair is accepted as a unit or not at all.
- Pairs (`Pair`): proposed by one player, confirmed by the partner (PENDING → ACTIVE), dissolved by either (open pair requests are withdrawn). A pair requests both spots at once; a game with `joinPolicy` PAIRS_ONLY is a challenge opened by a pair (`GameSession.pairId`, partner invited) that only another pair can take. `GameParticipant.pairId` shows teams in the lineup.
- UI: Play › For you (ranked matches with reasons, Find a match, pairs), › My games, › Requests (incoming with accept/decline, pair invitations, my requests with withdraw); `/app/play/find` (day, time window, clubs, solo/pair, results with reasons and near-miss explanations); game page (compatibility card and Request to join or waitlist, request status, organizer review cards); `/app/play/pairs`; home shows top matches; Admin › Settings holds the rules.

## Academy: coaching, programs and packages (phase 9)
- `TrainerProfile` is the public coaching profile of a user who holds the TRAINER role at each of its `TrainerLocation`s (title, bio, photo, qualifications, languages, specialties, eligible levels, hourly rate, lesson lengths, auto-confirm, status). Trainers edit their own public details (`trainer.self`); staff with `trainer.manage` at the club create profiles and change rate, status and clubs. `TrainerAvailability` is the weekly template per club; `TrainerTimeOff` blocks dates.
- `getTrainerDay` is the single slot engine: availability windows capped by the club's opening hours, minus time off, lessons and program sessions, with a 2-hour notice and a 30-day window. The UI and `bookLesson` both use it, so what the player sees is what the service accepts.
- `Lesson` (REQUESTED / CONFIRMED / CANCELLED / COMPLETED / NO_SHOW): booked by the player (`lesson.book.own`) or by staff for a member (`lesson.manage`). The trainer row is locked and the `Lesson_trainer_no_overlap` exclusion constraint rejects overlaps even under concurrency (tested with five simultaneous bookings). Price = rate × minutes. Payment is a PENDING venue payment, or one credit redeemed from a `PackagePurchase` (`PackageRedemption`), refunded when the lesson is cancelled in time and carried over on reschedule. Players cancel or reschedule up to 12 hours before; trainers and staff any time before the start. Trainers who do not auto-confirm accept or decline requests. After the start the trainer or staff mark COMPLETED (which writes a `TrainingRecord`) or NO_SHOW.
- `ProgressNote`: trainers write notes only about players they coach; PRIVATE notes are visible to the author and club staff with `training.read`, SHARED notes also to the player. Trainers never see another trainer's lessons, students or notes (`listTrainerLessons`, `listTrainerStudents`, `listProgressNotes` enforce it).
- `Program` (categories beginner … group coaching): description, level requirement, age range, trainer, club, dates, weekly `schedule`, session count, capacity, price, waitlist flag, enrollment close, cancellation cutoff and rule texts. `createProgram` generates dated `ProgramSession`s from the schedule. Status DRAFT → OPEN → FULL → IN_PROGRESS → COMPLETED, or CANCELLED (refunds and notifies). `enroll` checks status, close date, level and age, then reserves a place under a row lock or waitlists in order; cancelling promotes the next waitlisted player. Attendance per session (PRESENT / LATE / ABSENT / EXCUSED) by the trainer or staff; PRESENT and LATE add a `TrainingRecord` once.
- `TrainingPackage` (catalogue: credits, price, validity, optional trainer and club) and `PackagePurchase` (player's credits, used, left, expiry, ACTIVE / EXHAUSTED / EXPIRED / CANCELLED). Players buy catalogue packages (`package.purchase.own`, pay at venue); staff with `package.manage` sell catalogue or custom packages. `Payment` is now polymorphic (booking, lesson, enrollment or purchase) and `recordAcademyPayment` records venue payments for all three. No online processing is wired, consistent with bookings.
- UI: player `/app/trainers` (+ profile and booking), `/app/lessons` (+ detail with reschedule/cancel and shared notes), `/app/programs` (+ detail with enroll, waitlist, schedule and attendance), `/app/packages`; trainer workspace `/admin/coaching` (calendar with requests and attendance, availability and time off, students with notes, programs with attendance, history, club lessons for staff); admin `/admin/trainers`, `/admin/programs` (roster, waitlist, enroll member, payments), `/admin/packages` (catalogue, sales, payments).

## Phase 10 — Notifications and group messaging

Everything HITTERS tells a person now goes through one path, and the people in a lineup can talk to each
other without swapping phone numbers.

### The catalogue is the source of truth

`src/lib/notifications.ts` holds one entry per notification type: its category, default title and body, the
channels it may use, whether the centre collapses it, and the quiet window that stops a repeat. Wording uses
`{{placeholders}}` filled from the notification's `data`, and `render()` tidies the spacing and separators a
missing value leaves behind, so a player never sees a brace or a dangling `·`.

Adding a notification means adding a catalogue entry and calling `notify(userId, { type, data, url })`. The
type is the contract; nothing else in the app writes a title or a body.

### One function sends everything

`notify()` in `src/server/services/notifications.ts`:

1. resolves the admin template for the type, falling back to the catalogue, and stops if it is disabled
2. renders the title and body
3. narrows the type's channels by that person's per-category preferences, and stops if nothing is left
4. checks the dedupe key against the type's quiet window, and returns the earlier notification instead of a
   second one
5. writes the `Notification` plus one `NotificationDelivery` per channel: `IN_APP` is `SENT` immediately,
   the rest are `PENDING`
6. hands the live channels to their sender, outside any caller transaction

`notifyMany()` is the same thing for a list of people, and `{ dispatch: false }` queues without sending.

### Channels are an abstraction, not a promise

`registerChannelSender(channel, sender)` is the whole integration surface for email, push, SMS or WhatsApp.
Until a provider is registered its delivery rows sit `PENDING`, which means nothing is lost when a channel is
switched on later: `dispatchPendingDeliveries()` walks the backlog. A delivery is claimed (`PENDING` →
`SENDING`) before the provider is called, so the inline dispatch and a cron pass can never send the same
message twice; a claim that never finished is retried after ten minutes.

### Not spamming people

Four mechanisms, each doing one job:

- **Preferences** per category per channel (`NotificationPreference`), defaulting to in-app and email on.
- **Quiet windows** per type, keyed on `dedupeKey`, which defaults to `type:groupKey`. A lineup that changes
  three times in a minute produces one notification.
- **Grouping** in the centre: a groupable type collapses by `groupKey`, so five join requests for one game
  are one row showing "5 updates", and tapping it marks all five read.
- **Templates** an admin can disable outright, which turns the type off for everyone.

### Reminders and event triggers

`src/server/services/reminders.ts` sends what nobody clicks: booking reminders, lesson reminders for both
sides, and program session reminders, for anything starting in the next 24 hours. Each one dedupes on the id
of the thing it is about, so the job is safe to run as often as you like. `/api/cron/reminders` is the entry
point, guarded by `CRON_SECRET` and scheduled hourly in `vercel.json`; it also advances elapsed games and
programs.

Event triggers added in this phase: a court closure warns the players holding a booking under it; publishing
a game (or a spot reopening) tells the players it actually fits via `announceCompatibleGame()`, which runs the
same deterministic matching engine in reverse and only interrupts people on a strong match; a program edit
tells the enrolled players what changed; a waitlisted request that becomes pending again tells the requester
their new position.

### Group messaging

One `MessageThread` per game and per program, created on the first post. Membership is derived, never stored:
a game thread is the organizer plus the accepted participants, a program thread is the coach plus the enrolled
players. `ThreadMember` carries a name, a photo and a level and nothing else, which is how players reach each
other without a phone number being exposed anywhere in the payload.

A new message notifies the other members with a fifteen-minute quiet window keyed to the thread, so a busy
chat is one notification rather than thirty.

### Moderation

Any member can report a message once (`@@unique([messageId, reporterId])`), which notifies the managers and
reception at that club. A moderator dismisses it, actions it, or actions it and removes the message; removal
is a soft delete so the report and the audit trail keep pointing at something real, and the sender is told.
A whole thread can be locked, which leaves it readable and stops every post. Staff with `message.moderate`
can read a thread they are not in; they cannot post in it.

### Permissions added

`notification.configure` (global), `announcement.send`, `message.participate`, `message.moderate`. An
announcement is scoped to the sender's locations; only an academy-wide role may message everyone.

### Screens

Player: the notification centre with category filters and grouped rows, notification preferences, a messages
list, and the chat embedded in the game and program pages. Admin: notification templates with a live preview
and placeholder validation, the announcement composer, delivery health per channel, and the moderation queue.

## Refinement pass — real data, no dead controls, human copy

A sweep over the whole surface, after two audits of the running app.

### Nothing fake is on screen

The admin Analytics screen was invented numbers in a file. It is now `getAnalytics()` in
`src/server/services/analytics.ts`: bookings, revenue, occupancy, matchmaking fill rate and academy
occupancy, scoped to the locations the viewer may read, over a window of 4 to 26 weeks, with the same
figures for the previous window so the change is real. The weekly series and the hour histogram are
aggregated in SQL rather than loaded as rows, and the hour is converted to each club's own timezone, so an
evening peak in Cairo does not appear two hours early because the instant is stored in UTC.

The marketing site read a hardcoded list of clubs. It now calls `listPublicLocations()` and shows the live
clubs, their active court counts and their real cheapest hourly rate. `src/data/mock.ts` is deleted, along
with the seven components and the court grid that only it fed.

`prisma/seed-history.ts` generates thirty weeks of completed bookings, games and lessons, weighted the way a
padel club actually fills: evenings busy, weekends busiest, mornings quiet, with a gentle growth trend and a
realistic trickle of cancellations. A court is treated as a single resource, so nothing overlaps. It is
idempotent on an `HX-` code prefix, and dates are relative to today, so a demo database stays current.

### No control lies

The admin Settings "Academy" card was five inputs that discarded everything typed while the page toasted
success. It is now a real `AcademySettings` record behind the `academy.configure` permission, holding the
academy name, tagline, support email and phone, default timezone, currency and the cancellation policy
players agree to before they book. The page's single Save sends only the sections that actually changed.

The admin search box now searches: a confirmation code routes to Bookings, anything else to Members. The
notification bell was a permanently lit red dot that opened nothing; it links to the centre and lights only
when something is unread, with a separate moderation badge when reports are waiting. Every footer link was
`href="#"`; all twelve now resolve. The dead "Invite to match" button opens a new game with that player
already in the picker, and a pair's "Find a match" preselects that pair.

### Nothing shows a developer its internals

A global Zod error map in `src/lib/validation/schemas.ts` replaces "String must contain at least 2
character(s)" and "Invalid cuid" with plain sentences, for every rule that does not carry its own message.

`LABELS` and `label()` in `src/lib/catalog.ts` turn every stored enum into words, so no screen shows "both
side", "IN_PROGRESS" or a raw participant status; `auditLabel()` does the same for audit keys in history
timelines. `src/lib/text.ts` holds `count()`, `pluralize()` and `humanize()`, so the product never says "1
courts". `src/lib/time.ts` gained `shortDate()`, `longDate()` and `plainDate()` on one locale constant, so a
confirmation dialog reads "Saturday 11 October" rather than 2026-10-11.

Terminology is consistent: game not session, organizer not organiser, enrollment not enrolment, "your clubs"
not "your scope". Roadmap notes and engineering voice are gone from buyer-visible panels. Every route sets a
browser tab title.
