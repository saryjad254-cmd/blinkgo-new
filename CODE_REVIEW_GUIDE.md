# 🔍 BlinkGo Code Review Guide

> **A complete, self-contained guide for any developer/auditor to review the entire BlinkGo codebase.**

---

## 1. Project Overview

**BlinkGo** is a production-grade, multi-tenant food delivery platform built with **Next.js 14 + Supabase + TypeScript**. It supports 4 distinct user roles (Customer, Driver, Restaurant, Admin) with 3 languages (DE/AR/EN) and RTL support.

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | `^14.2.15` |
| UI Runtime | React | `^18.3.1` |
| Language | TypeScript | `^5.x` |
| Database | Supabase (PostgreSQL) | `^2.45.4` |
| Auth | Supabase Auth + Custom RBAC | — |
| State | Zustand + TanStack Query | `^4.5.5` / `^5.59.0` |
| Forms | Zod validation | `^3.23.8` |
| Animations | Framer Motion | `^12.42.2` |
| Icons | Lucide React | `^0.451.0` |
| Email | Resend | `^6.17.2` |
| Payments | Stripe | `^22.3.0` |
| Maps | OpenStreetMap + Google Maps | — |
| Node | `>=18.18.0` | — |

### Project Stats

| Metric | Count |
|--------|-------|
| **Total .tsx files** | 257 |
| **Total .ts files** | 283 |
| **Total lines of code** | **~80,500** |
| **Pages** | 69 |
| **Components** | 156 |
| **API routes** | 123 |
| **Translation keys** | ~3,500 per language |

---

## 2. Directory Structure

```
blinkgo-flat/
├── app/                    # Next.js App Router (pages + APIs)
│   ├── (customer)/         # Customer-only pages
│   ├── admin/              # Admin panel
│   ├── driver/             # Driver app
│   ├── restaurant/         # Restaurant dashboard
│   ├── api/                # 123 API routes
│   ├── auth/               # Auth flows
│   ├── brand/              # Design system showcase (/brand)
│   ├── globals.css         # Global styles + brand tokens
│   └── layout.tsx          # Root layout with ThemeProvider
├── components/             # 156 React components
│   ├── admin/              # 15 admin components
│   ├── brand/              # 20 design system components ⭐
│   ├── customer/           # 20 customer components
│   ├── driver/             # 19 driver components
│   ├── restaurant/         # 12 restaurant components
│   ├── shared/             # 18 shared components
│   ├── ui/                 # 16 UI primitives
│   ├── auth/               # 2 auth components
│   ├── maps/               # 5 map components
│   └── orders/             # 8 order components
├── lib/                    # 158 utility files
│   ├── brand/              # Design tokens (Source of Truth) ⭐
│   ├── theme/              # Theme provider
│   ├── i18n/               # 3 language packs (5,400+ keys)
│   ├── services/           # Business logic services
│   ├── integrations/       # 4 payment, 2 push, 3 email, 2 SMS providers
│   ├── analytics/          # 8 analytics libraries
│   ├── intelligence/       # AI/smart ops
│   ├── api/                # API helpers (response, error, security)
│   ├── driver/             # Driver state machines
│   ├── errors.ts           # Custom error classes
│   └── cn.ts               # className merger
├── public/                 # 13 public assets
│   └── brand/              # Official brand assets ⭐
├── supabase/               # SQL migrations
├── deploy/                 # Docker, K8s, Prometheus configs
├── docs/                   # API documentation
└── scripts/                # 17 utility scripts
```

---

## 3. Architecture Layers

### 3.1 Request Flow

```
Browser
  ↓
Next.js Middleware (middleware.ts)
  ├─ CSRF protection
  ├─ Rate limiting
  ├─ Session refresh
  ↓
Layout (app/layout.tsx)
  ├─ ThemeProvider
  ├─ I18nProvider
  ├─ QueryProvider
  ├─ ToastProvider
  ↓
Page (app/.../page.tsx)
  ├─ requireRole() guard
  ├─ CustomerNav / AdminLayout / etc.
  ↓
Server Component (data fetch)
  ↓
API Route (app/api/.../route.ts)
  ├─ Zod validation
  ├─ requireApiRole() guard
  ├─ Rate limiter
  ├─ AuthService
  ↓
Supabase (PostgreSQL)
```

### 3.2 Authentication Flow

```
1. User submits credentials → POST /api/auth/login
2. LoginForm → handlePasswordSubmit (client)
3. API route validates Zod schema
4. AuthService.loginFull() → Supabase auth
5. If success: AuthService.setSessionCookies(tokens)
6. Response with user data + redirect path
7. Middleware (updateSession) refreshes cookies
8. Server components re-render with user context
```

### 3.3 Role-Based Access Control

Roles: `customer | driver | restaurant | admin | super_admin | manager`

- **Page-level**: `requireRole('customer')` in layouts
- **API-level**: `requireApiRole(['admin'])` in route handlers
- **Component-level**: Conditional rendering based on `useUser()` hook

---

## 4. Key Files to Review First

### 4.1 Source of Truth (MUST READ)

| File | Purpose | Lines |
|------|---------|-------|
| `lib/brand/IDENTITY.md` | Brand identity source | — |
| `lib/brand/tokens.ts` | All design tokens | ~200 |
| `components/brand/BlinkLogo.tsx` | Official logo | ~100 |
| `app/globals.css` | CSS variables (light + dark) | ~400 |
| `tailwind.config.js` | Tailwind theme config | ~500 |
| `app/layout.tsx` | Root layout (providers) | ~100 |
| `middleware.ts` | CSRF + rate limit + auth | ~300 |

### 4.2 Core Business Logic

| File | Purpose | Lines |
|------|---------|-------|
| `lib/services/auth-service.ts` | All authentication logic | ~600 |
| `lib/services/audit-log.ts` | Audit trail (DB + fallback) | ~200 |
| `lib/services/driver-earnings.ts` | Driver earnings calculation | ~300 |
| `lib/services/restaurant-service.ts` | Restaurant ops | ~400 |
| `lib/validation/schemas.ts` | Zod schemas for all entities | ~500 |
| `lib/errors.ts` | Custom error classes | ~100 |
| `lib/api/response.ts` | API response helpers | ~100 |
| `lib/api/security.ts` | CSRF, rate limit, helpers | ~400 |
| `lib/rbac.ts` | Role-based access control | ~150 |

### 4.3 Brand Design System (CRITICAL)

| File | Variants | Purpose |
|------|----------|---------|
| `components/brand/BlinkLogo.tsx` | 4 variants | Official logo |
| `components/brand/BlinkButton.tsx` | 8 × 6 | All buttons |
| `components/brand/BlinkCard.tsx` | 7 | Content cards |
| `components/brand/BlinkInput.tsx` | 4 × 3 | Forms |
| `components/brand/BlinkBadge.tsx` | 8 | Status indicators |
| `components/brand/BlinkHeader.tsx` | 6 | Page headers |
| `components/brand/BlinkAvatar.tsx` | 6 + tier | User avatars |
| `components/brand/BlinkSplash.tsx` | — | Loading screen |
| `components/brand/BlinkMapMarker.tsx` | 7 | Map markers |
| `components/brand/BlinkModal.tsx` | 4 | Dialogs |
| `components/brand/BlinkStat.tsx` | 6 | KPIs |
| `components/brand/BlinkToast.tsx` | 4 | Notifications |

---

## 5. Code Review Checklist

### 5.1 Brand Identity ✅

- [ ] **All UI uses official brand colors**: `#F5B819` (yellow), `#DC2626` (red), `#0A0A0A` (black)
- [ ] **No orange (#FF6B1A, #F59E0B) anywhere** — replaced with brand-red/yellow
- [ ] **No purple/indigo gradients in branding context** — kept only in data viz
- [ ] **Logo uses official image** at `public/brand/blinkgo-logo.png`
- [ ] **Tagline present**: "SCHNELL. ZUVERLÄSSIG. FÜR DICH."

### 5.2 Design System ✅

- [ ] **Components use BlinkX primitives** (BlinkButton, BlinkCard, etc.)
- [ ] **No inline hardcoded colors** — use Tailwind tokens (`brand-red`, `brand-yellow`)
- [ ] **Spacing follows 8pt grid** (use `p-3`, `p-4`, `p-5`, etc.)
- [ ] **Border radius consistent**: `rounded-xl` (buttons), `rounded-2xl` (cards)
- [ ] **Light + Dark mode** supported via `.light` / `.dark` classes

### 5.3 Code Quality ✅

- [ ] **TypeScript strict mode** enabled
- [ ] **No `any` types** in production code
- [ ] **Zod validation** on all API inputs
- [ ] **Error handling** with custom error classes
- [ ] **Audit logging** for all mutations
- [ ] **Rate limiting** on auth + write endpoints

### 5.4 Security ✅

- [ ] **CSRF protection** in middleware (`csrfCheck`)
- [ ] **Origin validation** (tunnel hosts whitelisted)
- [ ] **Role guards** on all restricted routes
- [ ] **SQL injection** prevented via Supabase client
- [ ] **Secrets** in `.env` (not committed)
- [ ] **No PII in logs**

### 5.5 Accessibility ✅

- [ ] **WCAG AA** contrast ratios
- [ ] **Focus rings** on interactive elements
- [ ] **ARIA labels** on icon-only buttons
- [ ] **Touch targets** ≥ 44px
- [ ] **Keyboard navigation** supported
- [ ] **Screen reader** friendly

### 5.6 Performance ✅

- [ ] **Server components** by default
- [ ] **Lazy loading** for heavy components
- [ ] **Image optimization** (next/image)
- [ ] **CSS-in-JS avoided** (Tailwind only)
- [ ] **GPU-cheap animations** (transform/opacity)
- [ ] **Build output** under 200KB per route

---

## 6. How to Run Locally

```bash
# Install
cd blinkgo-flat
npm install

# Set up env (copy from .env.example)
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, etc.

# Dev mode
npm run dev

# Production
npm run build
npm start
```

Open: `http://localhost:3000`

### Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Customer | `demo@blinkgo.de` | `DemoCustomer!2024` |
| Driver | `driver@blinkgo.de` | `DemoDriver!2024` |
| Restaurant | `restaurant@blinkgo.de` | `DemoRestaurant!2024` |
| Admin | `admin@blinkgo.de` | `DemoAdmin!2024` |

---

## 7. API Endpoints (123 total)

### Auth (10)
- `POST /api/auth/login` — email + password login
- `POST /api/auth/register` — create customer
- `POST /api/auth/logout` — sign out
- `POST /api/auth/magic-link` — request magic link
- `GET /api/auth/callback` — OAuth callback
- `GET /api/auth/session` — current session
- `POST /api/auth/verify` — verify email
- `POST /api/auth/reset-password`
- `POST /api/auth/update-password`

### Orders (9)
- `POST /api/orders` — create
- `GET /api/orders` — list
- `GET /api/orders/[id]` — get one
- `PATCH /api/orders/[id]` — update
- `DELETE /api/orders/[id]` — cancel
- `POST /api/orders/[id]/accept` — driver accepts
- `POST /api/orders/[id]/status` — update status
- `GET /api/orders/[id]/track` — live tracking
- `POST /api/orders/[id]/rate` — rate order

### Driver (14)
- `GET /api/driver/orders/available` — list available
- `POST /api/driver/online` — go online
- `POST /api/driver/offline` — go offline
- `GET /api/driver/earnings` — earnings
- `GET /api/driver/active` — current delivery
- `POST /api/driver/location` — update GPS
- `POST /api/driver/accept` — accept order
- ... etc

### Admin (33)
- `GET /api/admin/users`
- `GET /api/admin/restaurants`
- `GET /api/admin/orders`
- `GET /api/admin/drivers`
- `GET /api/admin/analytics/...`
- ... etc

### Health (4)
- `GET /api/health/live` — liveness
- `GET /api/health/ready` — readiness
- `GET /api/health/startup` — startup probe
- `GET /api/health/status` — full status

### Other Notable
- `GET /api/maps/geocode` — address → coordinates
- `GET /api/eta` — delivery ETA
- `GET /api/products/bestsellers`
- `GET /api/analytics/...` — 8 analytics endpoints
- `GET /api/integrations/status`
- `POST /api/stripe/webhook`
- `POST /api/push/register`
- `GET /api/loyalty/tier`
- `GET /api/recommendations`

---

## 8. Database Schema (PostgreSQL via Supabase)

Core tables:
- `users` — auth + role
- `restaurants` — restaurant profile
- `products` — menu items
- `orders` — order records
- `order_items` — line items
- `drivers` — driver profile
- `addresses` — delivery addresses
- `payments` — payment records
- `reviews` — ratings
- `coupons` — discount codes
- `loyalty_tiers` — tier definitions
- `notifications` — in-app notifications
- `audit_log` — security audit trail

All migrations in `supabase/migrations/` and `deploy/supabase/`.

---

## 9. Known Patterns

### 9.1 Component Pattern

```tsx
'use client';

import { BlinkButton, BlinkCard } from '@/components/brand';

export function MyComponent({ prop }: { prop: string }) {
  return (
    <BlinkCard variant="default" hoverable>
      <BlinkButton variant="primary" onClick={...}>
        Click me
      </BlinkButton>
    </BlinkCard>
  );
}
```

### 9.2 API Route Pattern

```ts
import { withErrorHandling, ok } from '@/lib/api/response';
import { requireApiRole } from '@/lib/auth-helper';
import { LoginSchema } from '@/lib/validation/schemas';

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const auth = await requireApiRole(['admin']);
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const data = LoginSchema.parse(body);

    // ... business logic

    return ok({ result: 'data' });
  });
}
```

### 9.3 Page Pattern

```tsx
import { requireRole } from '@/lib/rbac';
import { CustomerNav } from '@/components/customer/CustomerNav';

export default async function Page() {
  await requireRole('customer');
  return (
    <>
      <CustomerNav />
      <main className="pb-20 min-h-screen bg-bg">
        {/* content */}
      </main>
    </>
  );
}
```

---

## 10. Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Using hex colors directly | Use Tailwind tokens: `bg-brand-red-500` |
| Hardcoded spacing | Use 8pt grid: `p-3`, `p-4`, `p-5` |
| Mixing fonts | Use Inter (DE/EN) or Cairo (AR) only |
| Custom buttons | Use `BlinkButton` |
| Missing error boundary | Add to layout |
| Inline SVGs | Use Lucide icons |
| Inconsistent radii | `rounded-xl` for buttons, `rounded-2xl` for cards |
| No loading state | Use `BlinkSpinner` or `BlinkSplash` |

---

## 11. Testing

- **125 tests** total across 5 test suites
- All pass: Customer Journey (29), Admin Workflow (24), Edge Cases (20), Security (22), Ops Acceptance (30)

Run with:
```bash
# Tests are in /scripts and /tests
bash tests/customer-journey.sh
```

---

## 12. Deployment

- **Docker**: `Dockerfile` (multi-stage, non-root UID 1001)
- **K8s**: Probes at `/api/health/{live,ready,startup}`
- **Prometheus**: Metrics at `/api/metrics/prometheus`
- **CI/CD**: `.github/workflows/ci-cd.yml`

See `deploy/` and `.github/workflows/` for full configs.

---

## 13. Recent Updates (v67 / Phase 20)

| Change | Files |
|--------|-------|
| **Official brand identity** adopted | All UI |
| **13 new design system components** | `components/brand/` |
| **Theme system** (light + dark) | `components/theme/` |
| **8 official brand images** | `public/brand/` |
| **Self-healing START.sh** | root |
| **271 files modified** for brand consistency | — |

---

## 14. Reviewer's Quick-Start

1. **Start with brand identity**: `lib/brand/IDENTITY.md` + `lib/brand/tokens.ts`
2. **Review the design system**: `components/brand/BlinkLogo.tsx` and one other Blink component
3. **Check the global styles**: `app/globals.css` and `tailwind.config.js`
4. **Look at the auth flow**: `lib/services/auth-service.ts` + `app/api/auth/login/route.ts`
5. **Test the app**: Use demo accounts at `https://resulting-blend-vacation-did.trycloudflare.com`
6. **Read the phase reports**: `PHASE_*.md` files for feature context
7. **Check the build**: `npm run build` should complete with 0 errors

---

**Last updated**: 2026-07-19
**Version**: v67
**Status**: Production-ready
**Live URL**: `https://resulting-blend-vacation-did.trycloudflare.com`
