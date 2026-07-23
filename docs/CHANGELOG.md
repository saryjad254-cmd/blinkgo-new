# Changelog

All notable changes to BlinkGo are documented here. Historical version notes (V28–V40) are in the [docs/](.) directory.

## [Unreleased]

### Added
- Comprehensive documentation suite (ARCHITECTURE, PROJECT_STRUCTURE, API, DATABASE_SCHEMA, SECURITY, DEPLOYMENT, ENVIRONMENT_SETUP, CONTRIBUTING)
- All SQL migrations consolidated in `deploy/supabase/`

### Changed
- **Refactored:** `lib/admin/` → `lib/rbac.ts` (single RBAC file)
- **Refactored:** `lib/cache/index.ts` → `lib/cache.ts`
- **Refactored:** `lib/errors/index.ts` → `lib/errors.ts`
- **Refactored:** `lib/logging/index.ts` → `lib/logging.ts`
- **Refactored:** `lib/perf.ts` → `lib/perf/index.ts` (consolidated with hooks)
- **Moved:** `hooks/useAdmin.ts` → `lib/hooks/useAdmin.ts`
- **Moved:** `lib/supabase/migrations/*` → `deploy/supabase/`
- **Moved:** `supabase/` and `supabase-fixes/` → `deploy/supabase/`
- **Moved:** `screenshots/` and `*.png` artifacts → removed
- **Moved:** `CHANGELOG_V*.md` → `docs/`
- **Moved:** All historical reports → `docs/audits/`

### Removed
- `app/intro/` (unused dev page)
- `app/go/` (unused dev page)
- `app/fix-rls/` (dev tool)
- `app/email-preview/` (dev tool)
- `app/preview/` (design review)
- `app/api/check-*` (test endpoints)
- `app/api/debug*` (test endpoints)
- `app/api/fixroles/` (dev tool)
- `app/api/schema-sql/` (dev tool)
- `app/api/seed*/` (dev seeders)
- `app/api/test-*` (test endpoints)
- `app/api/login/submit/` (replaced by /api/auth/login)
- `app/(auth)/` route group (unused)
- `components/intro/`, `components/dev/` (unused)
- `lib/utils/` (empty)
- `hooks/` (top-level — use `lib/hooks/`)
- `verify-*.mjs` (test scripts)
- `screenshot_*.js`, `test-*.mjs` (dev scripts)
- All top-level `*.png` files (48 dev artifacts)

### Security
- All imports updated to new module locations
- TypeScript: 0 errors
- Build passes
- All 221 tests pass

---

## [V40] - 2026-07-13

### Added
- `lib/config/fees.ts` — Centralized fee constants
- `components/shared/LogoutCardButton.tsx` — Client logout component
- `isValidUuidStrict` — Rejects nil UUID for auth checks

### Fixed
- `/api/check-items` — Added missing `requireAdmin` call
- `/api/admin/daily-reset` GET — Added admin auth
- `/api/orders/[id]/reorder` — IDOR fix (auth + ownership)
- `/api/geocode` — Auth + ownership check
- `/api/stripe/create-payment-intent` — No env var names in errors
- Multiple operator-precedence bugs in hooks
- `useDriverGPS` — Race condition in sendFix
- `useDriverApp` — `addEventListener` null check
- PWA manifest, icons, theme color in viewport
- Mixed-language restaurant settings (now uses i18n)
- GPS toggle on driver (no longer blocks on HTTP)
- Map loading (CSP for unpkg.com, cartocdn.com)
- Logout button on profile (was server component with onClick)

### Security
- All admin API routes now read role from `public.users`, not `user_metadata`
- Cart page uses i18n for cuisine array

See [CHANGELOG_V40.md](CHANGELOG_V40.md) for full details.

---

## [V39] - 2026-07-12

### Added
- `lib/hooks/useSmoothTracking.ts` — Smooth driver location updates
- `lib/services/driver-earnings.ts` — Single source of truth for earnings
- `requireApiRole` — Strict API auth helper

### Fixed
- JWT signature verification (use `createServerClient().auth.getUser()`)
- Various earnings calculation bugs
- Order status transition validation

See [CHANGELOG_V39.md](CHANGELOG_V39.md).

---

## [V38] - 2026-07-11

### Added
- `lib/services/operations-service.ts` — Daily reset, admin ops
- `lib/services/analytics-service.ts` — System-wide aggregations
- `app/admin/operations/` — Ops center
- `app/admin/finance/` — Finance dashboard

### Fixed
- Performance issues on admin dashboard
- Missing indexes for aggregations

See [CHANGELOG_V38.md](CHANGELOG_V38.md).

---

## [V37] - 2026-07-10

### Added
- `computeEarnings()` — Centralized driver earnings

### Changed
- Driver earnings now computed consistently across all endpoints

See [CHANGELOG_V37.md](CHANGELOG_V37.md).

---

## [V36] - 2026-07-09

### Added
- Server-side geocoding (API key never reaches browser)
- OpenStreetMap fallback for maps

### Fixed
- Map loading issues on slow networks
- Address validation

See [CHANGELOG_V36.md](CHANGELOG_V36.md).

---

## [V35] - 2026-07-08

### Added
- Loyalty points system
- Referral program
- Coupon engine

See [CHANGELOG_V35.md](CHANGELOG_V35.md).

---

## [V34] - 2026-07-07

### Added
- Proximity-based driver dispatch (Haversine)

### Fixed
- Driver dispatch fairness
- Order assignment edge cases

See [CHANGELOG_V34.md](CHANGELOG_V34.md).

---

## [V33] - 2026-07-06

### Added
- i18n system (DE/AR/EN)
- RTL support
- Server translations

See [CHANGELOG_V33.md](CHANGELOG_V33.md).

---

## [V32] - 2026-07-05

### Added
- PWA support
- Push notifications
- Service worker

See [CHANGELOG_V32.md](CHANGELOG_V32.md).

---

## [V29–V31] - 2026-06-28 to 2026-07-04

- Stripe payment integration
- Restaurant dashboard
- Driver app foundation
- Authentication system
- Cart and order flow

See individual [CHANGELOG_V29.md](CHANGELOG_V29.md).

---

## [V28] - 2026-06-25

Initial production release.

See [ARCHITECTURE_V28.md](architecture/ARCHITECTURE_V28.md) for original architecture.
