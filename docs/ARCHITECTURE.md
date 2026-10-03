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
- `GameJoinRequest` (PENDING / ACCEPTED / DECLINED / WITHDRAWN / EXPIRED) is in the schema for the matchmaking phase; no code writes it yet and no matching algorithm exists.
- Permissions: players `session.create.own` and `session.participate.own`; staff `session.read` (every location role) and `session.manage` (managers, receptionists, global roles). Visibility: organizer, invited or accepted players and in-scope staff see a game; anyone signed in sees PUBLIC games once published, without the lineup notes.
- UI: `/app/play` (my games with inline accept/decline, discover with level/club/today filters), `/app/play/new` (pick a booking, format, levels, invitations, visibility, cost, notes), `/app/play/[code]` (lineup, organizer controls: publish, invite, discoverable/open-spots toggles, edit, confirm, remove, cancel; player controls: accept, decline, leave), booking detail links to its game, home shows invitations, the next game and open games at preferred clubs, admin `/admin/games` (scope-filtered list, cancel).
