# BlinkGo — System Architecture

## Overview

BlinkGo is a multi-tenant food delivery platform with a Next.js 14 frontend, Supabase backend, and serverless API routes. The architecture is designed for:

- **Performance** — Server Components, edge caching, code splitting
- **Security** — RBAC, RLS, rate limiting, CSRF, signed JWTs
- **Scalability** — Stateless API, CDN-friendly, database connection pooling
- **Maintainability** — Service layer, type-safe contracts, comprehensive tests

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser/PWA)                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │  Customer  │  │   Driver   │  │ Restaurant/Admin   │    │
│  │  (RTL/LTR) │  │  (Mobile)  │  │   (Dashboard)      │    │
│  └────────────┘  └────────────┘  └────────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────┴────────────────────────────────────┐
│                    Vercel Edge Network                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Next.js Middleware (CSRF, CORS, rate limit, i18n)  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Next.js 14 App Router (RSC)               │   │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐     │   │
│  │  │  Pages   │  │  Layouts │  │  Server        │     │   │
│  │  │  (RSC)   │  │  (RSC)   │  │  Components    │     │   │
│  │  └──────────┘  └──────────┘  └────────────────┘     │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │       Client Components (interactive)        │    │   │
│  │  │   • React Query • Framer Motion • Zustand    │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │              API Routes (88)                  │    │   │
│  │  │   /api/auth/*  /api/orders/*  /api/driver/*  │    │   │
│  │  │   /api/admin/* /api/restaurant/* /api/webhook│    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Supabase   │  │    Stripe    │  │  Resend/SMTP │
│              │  │              │  │              │
│ • Postgres   │  │ • Payments   │  │ • Email      │
│ • Auth       │  │ • Webhooks   │  │ • OTP codes  │
│ • Realtime   │  │ • Connect    │  │ • Receipts   │
│ • RLS        │  │              │  │              │
│ • Storage    │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│         External Service Integrations        │
│  • Google Maps API   • OpenStreetMap (fallback)
│  • Nominatim (geocoding fallback)            
│  • CARTO Basemaps (OSM tiles)                 
└──────────────────────────────────────────────┘
```

## Core Principles

### 1. Server-First Architecture
- All data fetching defaults to Server Components
- API routes are REST-based with consistent `{ok, data, error}` envelope
- Client components are used **only** when interactivity is required
- Server Actions handle forms (`app/actions/`)

### 2. Type Safety End-to-End
- TypeScript strict mode everywhere
- Zod schemas validate API inputs (`lib/validation.ts`)
- Generated types from Supabase (in production)
- No `any` in business logic

### 3. Defense in Depth
- **Layer 1:** Middleware (CSRF, CORS, headers, rate limit)
- **Layer 2:** API route guards (requireApiRole, requireAdmin)
- **Layer 3:** RLS policies (database-level)
- **Layer 4:** Service-layer validation

### 4. Service Layer
All business logic lives in `lib/services/`. Pages and components are **thin** — they orchestrate, not implement.

| Service | Responsibility |
|---------|----------------|
| `auth-service.ts` | Login, logout, session management |
| `order-service.ts` | Order CRUD, status transitions, fees |
| `driver-service.ts` | Online state, GPS, dispatch, earnings |
| `restaurant-service.ts` | Menu, hours, settings |
| `coupon-service.ts` | Discount codes, validation |
| `loyalty-service.ts` | Points, tiers, redemptions |
| `referral-service.ts` | Invite codes, rewards |
| `notification-service.ts` | Push, in-app, email triggers |
| `analytics-service.ts` | Aggregations, reports |
| `operations-service.ts` | Daily reset, admin ops |
| `driver-earnings.ts` | Single source of truth for earnings |

### 5. Data Flow Patterns

**Server Component (Read)**
```
Page (RSC) → createServerClient() → Supabase → Render
```

**Client Action (Write)**
```
Form → Server Action → Service → Supabase → revalidatePath() → Page re-renders
```

**API Route (External/Programmatic)**
```
fetch() → Middleware (auth/CSRF) → Handler (Zod) → Service → Supabase → JSON response
```

### 6. State Management
- **Server state:** TanStack Query (5min stale, no refetch on focus)
- **Global state:** Zustand (cart only)
- **Form state:** React Hook Form / Server Actions
- **Auth state:** Cookie-based, verified per request

## Database Architecture

### Schema
33 tables across 6 domains:
- **Identity:** `users`, `user_addresses`, `otp_codes`
- **Catalog:** `restaurants`, `products`, `categories`, `extras`
- **Orders:** `orders`, `order_items`, `order_events`
- **Delivery:** `drivers`, `driver_locations`, `working_hours`
- **Engagement:** `favorites`, `ratings`, `notifications`
- **Commerce:** `coupons`, `loyalty_points`, `referrals`

All tables have:
- `id` UUID primary key
- `created_at` / `updated_at` timestamps
- RLS policies for row-level access
- Defensive indexes for common queries

### Migrations
SQL files in `deploy/supabase/` are applied in order:
1. `00-auth-sync.sql` — Auth triggers
2. `01-rls-fixes.sql` — RLS hardening
3. `02-aggregations.sql` — Helper views
4. `03-helpers.sql` — RPC functions
5. ... (see file list for full sequence)

## Security Architecture

### Authentication
- **Method:** Supabase JWT (HTTP-only cookies)
- **Cookie name:** `sb-{project-ref}-auth-token`
- **Session:** 7 days, refreshed on activity
- **Logout:** Server-side token revocation

### Authorization (RBAC)
| Role | Permissions |
|------|-------------|
| `customer` | Browse, order, track, rate |
| `driver` | View/accept orders, update location, view earnings |
| `restaurant` | Manage own menu, view/fulfill own orders |
| `manager` | View admin (no mutations) |
| `admin` | Full admin (excl. super-admin functions) |
| `super_admin` | Unrestricted |

**Enforcement:**
- Pages: `requireRole(role)` → redirects to `/login`
- API: `requireApiRole([roles])` → returns 401/403
- Admin API: `requireAdminRole(perm)` → role hierarchy check
- Database: RLS policies → row-level

### Rate Limiting
Per-IP+identifier, in-memory bucket:
- Login: 20/15min
- Register: 10/15min
- Password reset: 10/15min
- OTP verify: 10/15min
- OTP resend: 3/5min
- Contact form: 3/1min

### CSRF Protection
- POST/PUT/PATCH/DELETE require matching Origin
- Allowed: localhost, tunnel hosts (loca.lt, ngrok, vercel), app URL
- Stripe webhook exempted (uses signature verification)

### Security Headers
- CSP with allowlist (Google Maps, OSM, Supabase, etc.)
- HSTS in production
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin

## Performance Optimizations

### Frontend
- Server Components reduce JS payload
- Route-level code splitting
- Image optimization (next/image)
- Font preloading
- TanStack Query with 30s stale time
- Framer Motion only on interactive elements

### Backend
- Database connection pooling (Supabase)
- In-memory cache for hot reads (search, restaurants)
- Optimistic UI for cart updates
- Webhook async processing

### Network
- Edge middleware for CSRF (no DB hit)
- HTTP/2 on Vercel
- Brotli compression
- CDN caching for static assets

## Internationalization

### Languages
- `de` — German (default, formal Sie)
- `ar` — Arabic (MSA, RTL)
- `en` — English

### Implementation
- Server: `getServerTranslations()` from `lib/i18n/server-translations.ts`
- Client: `useI18n()` from `lib/i18n/I18nProvider.tsx`
- Translations: `lib/i18n/locales/{de,ar,en}.ts`
- Storage: `blinkgo-locale` cookie (1 year)

### RTL Support
- `<html dir="rtl">` set automatically for Arabic
- Tailwind `rtl:` variants used
- Logical CSS properties (margin-inline-start, etc.)

## PWA Support

- **Manifest:** `/manifest.json` (theme color, icons, display: standalone)
- **Icons:** 192px + 512px (PNG)
- **Service Worker:** `/sw.js` (basic, push-ready)
- **Install:** iOS Safari (Share → Add to Home Screen), Android Chrome (Install)

Note: PWA install requires HTTPS (Vercel provides automatically).

## Deployment Architecture

### Production
- **Host:** Vercel (auto-scaling, edge network)
- **DB:** Supabase (managed Postgres)
- **CDN:** Vercel Edge Network
- **Monitoring:** Vercel Analytics + custom logger

### Environments
- `development` — Local with hot reload
- `preview` — Vercel preview deployments
- `production` — Vercel production

### Required Secrets
See [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md) for the complete list.

## Scalability Considerations

### Current Bottlenecks
- In-memory rate limit (per-instance) — fine for Vercel's regional routing
- No background job queue (uses Supabase Realtime for push)
- Single Supabase region

### When to Scale
- **>10K DAU:** Move rate limit to Redis (Upstash)
- **>100K DAU:** Add job queue (Inngest/Trigger.dev)
- **Multi-region:** Supabase read replicas

## Testing Strategy

### Test Pyramid
```
       ┌─────────────────┐
       │  E2E (lifecycle)│  16 tests
       ├─────────────────┤
       │  Integration    │  150+ tests
       │  (per-feature)  │
       ├─────────────────┤
       │  Unit (lib/)    │  (services tested via integration)
       └─────────────────┘
```

### Suites
- Customer Journey, Driver Stress, Restaurant Workflow
- Admin Workflow, Edge Cases, Performance
- Security, Maps, Ops, Driver Experience, Lifecycle

All suites: **221/221 passing**.

## Decision Records

### Why Next.js 14 over Vite/Remix?
- Built-in API routes, middleware, RSC
- First-class Vercel integration
- Server Actions simplify forms

### Why Supabase over custom backend?
- RLS replaces 90% of authorization code
- Realtime out of the box (driver tracking)
- Auth handles JWT, refresh, sessions
- Lower ops burden for small team

### Why TanStack Query over SWR?
- Better TypeScript inference
- Built-in devtools
- Mutation hooks more ergonomic

### Why Zustand over Redux?
- 3KB vs 30KB+
- No boilerplate
- Sufficient for cart-only state

## Future Considerations

- [ ] Move rate limit to Upstash Redis (multi-region)
- [ ] Add Sentry for error tracking
- [ ] Implement feature flags (PostHog/LaunchDarkly)
- [ ] Add background job queue (Inngest)
- [ ] Multi-region Supabase for DR
- [ ] Storybook for component documentation
- [ ] E2E tests with Playwright
