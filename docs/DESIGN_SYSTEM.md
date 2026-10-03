# HITTERS Design System

Living reference: `/design-system` route renders every token and component.
Source of truth for tokens: `tailwind.config.ts` + `src/app/globals.css` + `src/lib/tokens.ts`.

## Brand
- Marks live in `src/components/brand/Logo.tsx` (`Monogram`, `Wordmark`, `Lockup`, `AppIcon`).
  Geometry is vector-traced from the references by `scripts/logo_geometry.py` and must not be edited by hand.
- Use `currentColor`; marks are white on navy/blue, or blue-700 on white. Add `glow` on hero and splash only.
- Photography: `public/brand/court-*.jpg` crops from the references, always under the navy overlay (`CourtBackdrop`).

## 1. Color tokens
| Token | Value | Use |
|---|---|---|
| navy-950 / 900 / 800 / 700 | #030712 / #050B24 / #0A1540 / #10205C | canvas and dark surfaces |
| blue-700 (royal) | #0B2FD6 | gradient start, light-theme brand |
| blue-500 (electric) | #2563FF | primary actions, focus |
| blue-400 / 300 / 200 | #4D82FF / #7FA6FF / #B4C9FF | glow, light-blue text, borders |
| volt | #D4F23C | padel-ball accent: live, level A, the single most important CTA |
| success / warning / danger | #22C55E / #F5A524 / #F43F5E | statuses only |

Semantic (CSS variables, theme aware): `canvas`, `surface-1/2/3`, `line`, `line-strong`, `fg`, `fg-muted`, `fg-subtle`, `brand`, `brand-hover`.
Never use raw greys. Never introduce new hues.

## 2. Typography
Manrope only (`next/font`). Scale: display-xl 56, display 40, h1 32, h2 24, h3 20, h4 18, body-lg 16, body 15, body-sm 14, caption 12, overline 11 (uppercase, 0.12em). Numbers use `.tabular`.

## 3. Spacing
4px base. Page gutter 16px mobile / 24px desktop. Card padding 16-20 (`sm`/`md`) or 20-28 (`lg`). Section gap 28px (`space-y-7`).

## 4. Radius
xs 6 · sm 10 · md 14 (controls, buttons) · lg 18 (cards) · xl 24 (sheets, nav bar) · 2xl 32 (hero) · full.

## 5. Shadows and glows
`shadow-sm/md/lg` navy elevation. `shadow-glow-sm/md/lg` electric glow for primary, selected and hovered interactive elements. `shadow-glow-volt` for volt actions. `shadow-inset-hi` 1px top highlight on dark cards. `shadow-light-md` on light surfaces.

## 6. Buttons
Variants: primary (gradient + glow), secondary (surface-2), outline, ghost, volt, danger, link. Sizes sm 36 / md 44 / lg 48 / xl 56. States: hover (brighter glow), active (scale .98), focus-visible (2px blue-400 ring, canvas offset), disabled (45% opacity), loading (spinner, `aria-busy`). `IconButton` for icon-only.

## 7. Cards
default · interactive (hover border blue-400/50 + glow) · brand (gradient hero, one per screen) · glass · outline (dashed, for disabled/maintenance). Radius lg.

## 8. Navigation
- Player: `PlayerTopBar` (monogram + wordmark, bell, avatar) + `BottomNav` (Home, Play, Book centre glow, Academy, Profile).
- Admin: `AdminShell` with fixed 256px navy sidebar (grouped links, active = gradient pill) and light content area; drawer below `lg`.
- Marketing: floating pill nav, mobile sheet.

## 9. Forms
One control surface (`controlClass`): surface-2, 1px line, hover line/20, focus blue-400 border + glow-sm, invalid danger. `Field` wires label, hint, error and ids. Select is native with chevron. Chips, Switch, Checkbox, segmented `Tabs variant="pill"`, `DateStrip`, `Calendar`.

## 10. Status colors
Single map in `lib/tokens.ts` (`STATUS_TONE`): confirmed/active → success · pending/maintenance/paused → warning · cancelled/expired → danger · completed/full/booked → neutral · live → volt (pulsing) · open/available → brand. Levels: A volt, B gradient, C blue tint, D neutral.

## 11. Mobile navigation
Bottom tab bar, 480px max column, `pb-32` on main for clearance, safe-area padding, sticky summaries sit at `bottom-28`.

## 12. Admin navigation
Desktop-first. Sidebar groups: Overview, Operations, People. Top bar: breadcrumb, title, search, notifications, account dropdown.

## 13. Surface hierarchy
Dark: canvas #030712 → surface-1 #060C24 → surface-2 #0A1540 → surface-3 #10205C, borders white at 10%.
Light (admin): canvas #F3F6FC → surface-1 #FFFFFF → surface-2 #F7F9FE → surface-3 #FFFFFF + shadow, borders navy at 10%.
Use `light:` variant for any literal blue text that must darken on light surfaces.

## Icons
lucide-react. 16 inline, 18-20 in controls, 22-24 navigation, 28-32 in state tiles (`lib/tokens.ts` `ICON`).
