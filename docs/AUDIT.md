# HITTERS Sports Academy - Technical Audit (2026-10-02)

## Summary
The repository is greenfield. Before this session the folder contained only two brand
reference images (`padel1.jpeg`, `padel2.jpeg`). During this session a minimal Next.js
scaffold was added (no pages, no components, no database, no auth). Nothing exists yet
that implements any HITTERS feature.

## 1. Current architecture
- Framework: Next.js 15 (App Router) + React 19 + TypeScript 5, Tailwind CSS 3.4 (config files only).
- Folders: `src/app/` and `public/brand/` exist but are empty.
- No backend, API routes, server actions, ORM, or database.
- No tests, lint config, CI, or deployment config.

## 2. Current features
None.

## 3. Current database structure
None. No schema, migrations, or ORM.

## 4. Current authentication / authorization
None.

## 5. Current UI / design system
Not implemented. Brand language is fully defined by the two reference images:
deep navy -> royal -> electric blue gradients, white extended italic wordmark,
geometric two-slab "H" monogram with glow, lime padel-ball accent, rounded premium surfaces.

Measured from `padel1.jpeg` (wordmark): cap height 66px, stroke ~30px (45% of cap height),
italic slant ~20 degrees, wordmark aspect ~9.9:1, monogram H width ~1.8x cap height.
Monogram: two parallelogram slabs; top slab notched from the top centre, bottom slab
notched from the bottom centre, separated by a thin horizontal gap.

## 6. What can be reused
- The two reference images (court photography can be cropped for hero backgrounds).
- The measured logo geometry (basis for an exact SVG wordmark + monogram).
- The scaffold (package.json, tsconfig, next.config.ts, postcss.config.js).
- Conventions from sibling projects (Next.js + Tailwind + Prisma) so the team stays on a familiar stack.

## 7. What needs to be changed
Nothing to change; everything is to be built. Decisions still open:
database/hosting (Postgres via Prisma recommended), auth provider, payment provider,
notification channels (push/email/SMS), and whether admin is a separate app or a route group.

## 8. What is missing
Everything in the target product list: locations, players, A/B/C/D levels, booking,
matches/sessions, smart matching (solo, pair, 3+1), join requests/approval, trainers,
programs, packages, memberships, payments, notifications, profiles, match history,
admin/trainer/location management, analytics, tournaments/leagues, reviews/moderation.

## 9. Potential architectural problems (to avoid)
- Booking conflicts: need DB-level exclusion constraints or transactional slot locking per court.
- Multi-tenancy: every entity must carry `locationId`; admins need location-scoped roles.
- Matching logic belongs in a pure, testable service layer, not in UI or route handlers.
- Payments must be idempotent (webhook replay) and decoupled from booking creation.
- Notifications need an outbox table so they survive failures and can be retried.
- Timezones: store UTC, render per-location timezone.

## 10. Recommended implementation order
1. Design system + logo assets + app shell (navigation, layouts, theming).
2. Data model + Prisma schema + seed (locations, courts, users, roles, levels).
3. Auth + RBAC (player, trainer, location admin, super admin).
4. Court booking (availability engine, slot locking, cancellation rules).
5. Players, profiles, assessment levels, match history.
6. Matches/sessions + join requests + organizer approval.
7. Smart matching (solo, pair, 3+1) on top of sessions.
8. Trainers, programs, training packages.
9. Memberships + payments (+ webhooks, receipts).
10. Notifications (outbox, in-app, push/email).
11. Admin: locations, courts, members, trainers, programs, bookings.
12. Analytics dashboards.
13. Tournaments/leagues.
14. Reviews + moderation.
