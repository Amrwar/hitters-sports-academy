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
