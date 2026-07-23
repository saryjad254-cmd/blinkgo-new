# Project Structure

Complete walkthrough of every important folder and file in the BlinkGo project.

---

## 📁 Root Level

| File/Dir | Purpose |
|----------|---------|
| `app/` | Next.js 14 App Router (pages, layouts, API routes) |
| `components/` | React components organized by domain |
| `lib/` | Business logic, utilities, services |
| `deploy/supabase/` | 33 SQL migration files (run in numerical order) |
| `public/` | Static assets (PWA icons, manifest, service worker) |
| `scripts/` | 14 test scripts + utility scripts |
| `docs/` | 9 documentation files |
| `middleware.ts` | Global middleware (CORS, CSRF, auth, security headers) |
| `next.config.js` | Next.js configuration (image domains, transpilation) |
| `tailwind.config.js` | Tailwind CSS design tokens & theme |
| `tsconfig.json` | TypeScript configuration |
| `package.json` | Dependencies and scripts |
| `.env.example` | Environment variable template |
| `.gitignore` | Git ignore rules |
| `vercel.json` | Vercel deployment config |

---

## 📁 `app/` — Next.js App Router

The `app/` directory follows the Next.js 14 App Router convention. Each folder with a `page.tsx` is a route.

### `app/(customer)/` — Customer Pages (route group)

| Path | File | Purpose |
|------|------|---------|
| `/cart` | `cart/page.tsx` | Shopping cart |
| `/favorites` | `favorites/page.tsx` | Favorite restaurants |
| `/notifications` | `notifications/page.tsx` | Notification center |
| `/orders` | `orders/page.tsx` | Order history |
| `/orders/[id]` | `orders/[id]/page.tsx` | Order details |
| `/orders/[id]/track` | `orders/[id]/track/page.tsx` | Live order tracking |
| `/payment-history` | `payment-history/page.tsx` | Payment history |
| `/profile` | `profile/page.tsx` | User profile |
| `/restaurants` | `restaurants/page.tsx` | Restaurant browse |
| `/restaurants/[id]` | `restaurants/[id]/page.tsx` | Restaurant menu |
| `/search` | `search/page.tsx` | Search & filter |
| `layout.tsx` | — | Customer layout (auth required) |
| `loading.tsx` | — | Loading state |

### `app/admin/` — Admin Pages

| Path | File | Purpose |
|------|------|---------|
| `/admin` | `page.tsx` | Admin dashboard |
| `/admin/users` | `users/page.tsx` | User management |
| `/admin/restaurants` | `restaurants/page.tsx` | Restaurant management |
| `/admin/orders` | `orders/page.tsx` | All orders |
| `/admin/finance` | `finance/page.tsx` | Financial reports |
| `/admin/analytics` | `analytics/page.tsx` | Analytics dashboard |
| `/admin/map` | `map/page.tsx` | Live map view |
| `/admin/operations` | `operations/page.tsx` | Operations center |
| `/admin/audit` | `audit/page.tsx` | Audit log |
| `/admin/config` | `config/page.tsx` | System configuration |
| `+ 6 more` | — | Various admin tools |

### `app/api/` — API Routes (78 endpoints)

Organized by domain. See [API_OVERVIEW.md](API_OVERVIEW.md) for the complete list.

```
app/api/
├── auth/              # Authentication (login, register, magic-link, OAuth, etc.)
├── admin/             # Admin operations
├── customer/          # (deprecated — moved to root)
├── driver/            # Driver endpoints
├── restaurant/        # Restaurant endpoints
├── orders/            # Order management
├── products/          # Product/menu endpoints
├── restaurants/       # Public restaurant queries
├── search/            # Universal search
├── favorites/         # Customer favorites
├── notifications/     # Notifications
├── ratings/           # Reviews & ratings
├── coupons/           # Coupons & discounts
├── loyalty/           # Loyalty program
├── referrals/         # Referral program
├── stripe/            # Stripe integration
├── push/              # Push notifications
├── share-links/       # Order sharing
├── maps/              # Map utilities
├── geocode/           # Geocoding
├── addresses/         # Customer addresses
└── health/            # Health check
```

### `app/login/`, `app/register/`, `app/auth/`, `app/driver/`, `app/restaurant/`, `app/share/`

Standard Next.js route folders for each major section.

### `app/global-error.tsx`, `app/loading.tsx`, `app/layout.tsx`

Global error boundary, loading state, and root layout.

---

## 📁 `components/` — React Components (101 total)

Components are organized by domain. Each folder contains only the components specific to that domain.

### `components/ui/` — UI Primitives (8)

| Component | Purpose |
|-----------|---------|
| `Button` | Primary button with variants |
| `Card` | Container with elevation |
| `Icon` / `LucideIcon` | Icon wrapper |
| `Input` | Form input |
| `Skeleton` / `Skeletons` | Loading skeletons |
| `Toast` | Toast notifications |

### `components/shared/` — Reusable (12)

| Component | Purpose |
|-----------|---------|
| `AddressCard` | Display address |
| `AddressWithMap` | Address + mini map |
| `BackButton` | Standardized back button |
| `BrandedNotFound` | 404 page |
| `DeliveryAddressCard` | Delivery address with edit |
| `EmptyState` / `EmptyStateClient` | Empty state UI |
| `LoadingSpinner` | Loading spinner |
| `LogoutButton` / `LogoutCardButton` | Logout buttons |
| `PageHeader` | Page header |
| `SectionHeader` | Section header |
| `StatusBadge` | Status indicator |

### `components/auth/` (1)

| Component | Purpose |
|-----------|---------|
| `LoginForm` | Main login form (password + magic link + social) |

### `components/cart/` (5)

| Component | Purpose |
|-----------|---------|
| `CouponInput` | (legacy) |
| `PromoCodeInput` | Promo code entry |
| `SavedAddressChips` | Saved address chips |
| `ScheduleOrder` / `ScheduleOrderPicker` | Schedule order for later |

### `components/customer/` (16)

| Component | Purpose |
|-----------|---------|
| `ActiveOffers` | Active promotions |
| `AddToCartButton` | Add to cart |
| `CancelOrderButton` | Cancel order |
| `CarbonCard` | CO₂ footprint card |
| `CategoryFilter` | Filter by category |
| `CustomerNav` | Customer bottom nav |
| `FavoriteButton` | Favorite toggle |
| `FavoritesToggle` | Favorites filter |
| `LoyaltyCard` | Loyalty points card |
| `OrderPaymentSection` | Payment section in order |
| `OrderTimeline` | Order progress timeline |
| `OrderTracker` | Order tracking widget |
| `PaymentHistoryClient` | Payment history view |
| `ReferralCard` | Referral program card |
| `RestaurantCard` | Restaurant card |
| `StripeCheckout` | Stripe payment form |
| `VoiceSearch` | Voice input for search |

### `components/driver/` (14)

| Component | Purpose |
|-----------|---------|
| `AcceptOrderButton` | Accept order button |
| `ActiveDeliveryCard` | Active delivery card |
| `ActiveDeliveryMap` | Live delivery map |
| `AvailableOrderCard` / `AvailableOrderList` | Available orders |
| `DriverDashboardV3` | Main driver dashboard (V3 — current) |
| `DriverEarningsDashboard` | Earnings stats |
| `DriverHeader` | Driver header |
| `DriverNav` | Driver bottom nav |
| `DriverOrderMap` | Order map view |
| `EmergencyCallButton` | Emergency button |
| `OnlineToggle` | Online/offline toggle |
| `OrderActions` | Order action buttons |

### `components/restaurant/` (11)

| Component | Purpose |
|-----------|---------|
| `AcceptOrderCard` | Order accept card |
| `DeleteProductButton` | Delete product |
| `KitchenView` | Kitchen display |
| `MenuManagerClient` | Menu management |
| `ProductForm` | Product form |
| `RestaurantLiveDashboard` | Live dashboard |
| `RestaurantNav` | Restaurant nav |
| `RestaurantOrderActions` | Order actions |
| `RestaurantSettingsForm` | Settings form |
| `ToggleAvailability` | Product availability |
| `ToggleOnlineButton` | Online status |
| `WorkingHoursForm` | Hours form |

### `components/orders/` (8)

| Component | Purpose |
|-----------|---------|
| `CompletedOrderCard` | Completed order card |
| `CustomerOrderCalendar` | Customer order calendar |
| `OrderCalendar` | Order calendar |
| `RateOrderModal` / `RateOrderTrigger` | Rating UI |
| `RestaurantOrderCalendar` | Restaurant order calendar |
| `ShareOrderView` | Share order view |
| `ShareTrackingButton` | Share tracking button |

### `components/admin/` (10)

| Component | Purpose |
|-----------|---------|
| `AdminConfigClient` | System config |
| `AdminCouponsClient` | Coupon management |
| `AdminDashboardClient` | Admin dashboard |
| `AdminLayout` | Admin layout |
| `AdminLoyaltyClient` | Loyalty admin |
| `AdminPromotionsClient` | Promotions |
| `AdminReferralsClient` | Referrals |
| `AdminRefundsClient` | Refunds |
| `GeocodeTool` | Geocoding tool |
| `OperationsCenterClient` | Operations |

### `components/maps/` (4)

| Component | Purpose |
|-----------|---------|
| `AddressInput` | Address with autocomplete |
| `GoogleMap` | Google Maps wrapper |
| `OSMMap` | OpenStreetMap wrapper |
| `SmartMap` | Auto-selects Google/OSM |

### `components/notifications/` (2)

| Component | Purpose |
|-----------|---------|
| `NotificationsBell` | Bell dropdown + full page |
| `NotificationsBellSafe` | Error boundary wrapper |

### `components/tracking/`, `components/i18n/`, `components/charts/`

Single-purpose component folders (LiveTrackingMap, LanguageSwitcher, Charts).

### Top-level Components

| File | Purpose |
|------|---------|
| `AdminLayout.tsx` | Admin layout wrapper |
| `CartHydrator.tsx` | Hydrates cart from localStorage |
| `PerformanceProvider.tsx` | Pre-fetching + service worker |
| `QueryProvider.tsx` | TanStack Query setup |

---

## 📁 `lib/` — Business Logic

The `lib/` directory contains all non-React business logic.

### Root Level Files

| File | Purpose |
|------|---------|
| `admin-auth.ts` | Admin-specific auth helpers |
| `admin-guard.ts` | Admin route guards |
| `auth-helper.ts` | Authentication helpers |
| `cache.ts` | In-memory cache with TTL |
| `calendar-utils.ts` | Calendar grouping (day/week/month) |
| `carbon.ts` | CO₂ calculation per food category |
| `cart-store.ts` | Zustand cart store (persisted) |
| `cn.ts` | Tailwind className merger |
| `demo-guard.ts` | Demo account detection |
| `email-service.ts` | Resend email sender |
| `errors.ts` | Custom error classes (AppError, ValidationError, etc.) |
| `format.ts` | Currency, date, distance formatters |
| `iconography.ts` | Icon size & usage standards |
| `idempotency.ts` | Idempotency key handling |
| `logging.ts` | Structured logger |
| `notifications.ts` | Notification helpers |
| `otp-store.ts` | Email OTP store (DB-backed) |
| `rate-limit.ts` | Rate limiting (in-memory) |
| `rbac.ts` | Role-based access control (single source of truth) |
| `restaurant-actions.ts` | Restaurant server actions |
| `security-headers.ts` | CORS + security headers |
| `types.ts` | Shared TypeScript types |
| `validation.ts` | Input validation helpers (email, phone, etc.) |

### `lib/api/` (3)

| File | Purpose |
|------|---------|
| `cache-middleware.ts` | Cache-Control header helpers |
| `error-helper.ts` | Error-to-response conversion |
| `response.ts` | Standard `ok()` and `fail()` response helpers |

### `lib/config/` (1)

| File | Purpose |
|------|---------|
| `fees.ts` | Centralized fee constants (commission, delivery, etc.) |

### `lib/driver/` (2)

| File | Purpose |
|------|---------|
| `geolocation.ts` | GPS + distance utilities |
| `states.ts` | Driver state machine |

### `lib/hooks/` (1)

| File | Purpose |
|------|---------|
| `useDriverGPS.ts` | GPS tracking hook |

### `lib/i18n/` (3 + 3 locale files)

| File | Purpose |
|------|---------|
| `I18nProvider.tsx` | React context for translations |
| `server-translations.ts` | Server-side translation loader |
| `translations-map.ts` | Type-safe translation map |
| `locales/de.ts` | German translations |
| `locales/ar.ts` | Arabic translations |
| `locales/en.ts` | English translations |

### `lib/maps/` (3)

| File | Purpose |
|------|---------|
| `distance.ts` | Haversine formula, distance formatting |
| `geocoder.ts` | Server-side geocoding |
| `google-maps.ts` | Google Maps loader with fallback |

### `lib/perf/` (1)

| File | Purpose |
|------|---------|
| `use-prefetch.ts` | Route prefetching on hover/idle |

### `lib/realtime/` (2)

| File | Purpose |
|------|---------|
| `location-service.ts` | Driver location realtime |
| `use-realtime.ts` | Generic Supabase realtime hook |

### `lib/services/` (9 — business logic)

| Service | Responsibility |
|---------|----------------|
| `analytics-service.ts` | Revenue, orders, user metrics |
| `auth-service.ts` | Login, register, session management |
| `coupon-service.ts` | Coupon validation, redemption |
| `driver-earnings.ts` | **Single source of truth** for driver earnings |
| `loyalty-service.ts` | Points, tiers, redemptions |
| `notification-service.ts` | Send notifications (DB + realtime) |
| `operations-service.ts` | Daily ops (orders, finance) |
| `order-service.ts` | Order creation, status transitions |
| `referral-service.ts` | Referral codes, redemptions |
| `restaurant-service.ts` | (deprecated, but used) |

### `lib/stripe/` (2)

| File | Purpose |
|------|---------|
| `client.ts` | Stripe client setup |
| `dev-mode.ts` | Dev mode Stripe bypass |

### `lib/supabase/` (4)

| Client | Purpose |
|--------|---------|
| `client.ts` | Browser client (anon key) |
| `server.ts` | Server Component client |
| `middleware.ts` | Session refresh in middleware |
| `service.ts` | Service-role client (admin) |

---

## 📁 `deploy/supabase/` — Database Migrations (33 files)

SQL migrations must be applied **in numerical order**. See [DATABASE.md](DATABASE.md) for details.

| Range | Purpose |
|-------|---------|
| `00-03` | Initial setup (auth sync, RLS, aggregations, helpers) |
| `04-13` | Bug fixes and patches |
| `14` | Complete schema |
| `15-18` | Activity log, enhanced products, duplicate fixes |
| `19-21` | Production upgrade, driver status, missing tables |
| `22-27` | Version-tagged features (v29, v31, v33, v36, v38, v40) |
| `28-32` | New features (restaurant type, magic link, quick filters, OAuth) |

---

## 📁 `public/` — Static Assets

```
public/
├── brand/
│   ├── icon-192.png     # PWA icon (192x192)
│   └── icon-512.png     # PWA icon (512x512)
├── manifest.json         # PWA manifest
└── sw.js                 # Service worker (push + offline)
```

---

## 📁 `scripts/` — 14 Test Scripts

| Script | Coverage |
|--------|----------|
| `customer-journey-test.js` | 29 customer flow tests |
| `driver-stress-test.js` | 23 driver workflow tests |
| `restaurant-workflow-test.js` | 18 restaurant tests |
| `admin-workflow-test.js` | 24 admin tests |
| `edge-cases-test.js` | 20 edge case tests |
| `security-test.js` | 22 security tests |
| `maps-acceptance-test.js` | 15 maps tests |
| `ops-acceptance-test.js` | 30 operations tests |
| `lifecycle-test.js` | 16 E2E tests |
| `driver-experience-test.js` | 14 driver UX tests |
| `performance-test.js` | 10 performance tests |
| `maps-stress-test.js` | Maps stress tests |
| `run-all-tests.js` | Master test runner |
| `apply-migrations.js` | Migration utility |

---

## 📁 `docs/` — Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview (root) |
| `PROJECT_STRUCTURE.md` | This file |
| `DEPENDENCIES.md` | Every dependency explained |
| `API_OVERVIEW.md` | All API endpoints |
| `DATABASE.md` | Database schema & migrations |
| `ENVIRONMENT_SETUP.md` | Environment variables |
| `DEPLOYMENT.md` | Deployment guide |
| `SECURITY.md` | Security architecture |
| `CONTRIBUTING.md` | Development guidelines |
| `CHANGELOG.md` | Version history |
| `architecture/ARCHITECTURE.md` | System architecture |
| `KNOWN_LIMITATIONS.md` | Known limitations |
| `API_DOCUMENTATION.md` | Detailed API reference |
| `DATABASE_SCHEMA.md` | Schema diagram |

---

## Conventions

- **TypeScript path alias:** `@/*` maps to project root
- **Server components by default** — only add `'use client'` when needed
- **Defensive code** — handle missing tables/columns gracefully
- **Type safety** — prefer `unknown` over `any`, use Zod for validation
- **Server-authoritative** — never trust client for business logic
- **i18n** — always use `t.X` from i18n system, never hardcode
- **Error handling** — throw `AppError` subclasses, catch in middleware
