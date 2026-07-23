# Known Limitations

This document lists real, documented limitations of the BlinkGo platform. Each entry explains what doesn't work, why, and what the workaround is.

---

## 🔐 Authentication

### 1. OAuth (Google/Apple) requires manual Supabase setup

**Limitation:** The "Mit Google fortfahren" / "Mit Apple fortfahren" buttons work, but they display "Provider not enabled" until you configure the OAuth providers in the Supabase Dashboard.

**Why:** OAuth requires:
- Google Cloud Console OAuth Client ID + Secret
- Apple Developer Service ID
- Configuration in Supabase Dashboard → Authentication → Providers

**Workaround:** For now, use Email + Password login. The infrastructure is ready — just add credentials in Supabase.

**Configuration steps:**
1. Get Google OAuth credentials: https://console.cloud.google.com/apis/credentials
2. Add redirect URI: `https://rhdaffhlrglyknxtucux.supabase.co/auth/v1/callback`
3. In Supabase Dashboard → Authentication → Providers → Google: paste Client ID + Secret
4. Repeat for Apple if needed

---

### 2. Magic Link email sending requires Resend domain verification

**Limitation:** In development, Magic Link emails fail with "You can only send testing emails to your own email address" from Resend.

**Why:** Resend's free tier only allows sending from verified domains.

**Workaround:**
- For dev/testing: emails are logged to the server console
- For production: verify your domain at https://resend.com/domains and update `EMAIL_FROM` in `.env`

---

### 3. Resend API Key not configured = no email delivery

**Limitation:** If `RESEND_API_KEY` is missing in `.env`, the system falls back to console logging. Emails won't actually be sent.

**Why:** Email service is optional in dev mode.

**Workaround:** Set `RESEND_API_KEY` in `.env` to enable real email delivery.

---

## 🗺️ Maps & Geolocation

### 4. Google Maps requires API key

**Limitation:** If `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is missing, the app falls back to OpenStreetMap (Leaflet).

**Why:** Google Maps requires a paid API key for production use.

**Workaround:** OSM fallback works well. For Google Maps, set the API key in `.env`.

---

### 5. Distance validation is server-side only

**Limitation:** The 5km delivery radius is enforced only on order creation (server-side). The UI shows distance as a warning but doesn't block.

**Why:** This is intentional — users should see distance before ordering.

**Workaround:** None needed. The server is the source of truth.

---

## 💳 Payments

### 6. Stripe requires live API keys for production

**Limitation:** In dev mode, payments are bypassed (cash on delivery only).

**Why:** Avoids requiring Stripe setup for local development.

**Workaround:** For production:
1. Get Stripe API keys from https://dashboard.stripe.com/apikeys
2. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env`
3. Configure webhook endpoint in Stripe Dashboard

---

### 7. Stripe webhooks require public URL

**Limitation:** Stripe webhooks can't reach `localhost:3000` — they need a public URL.

**Why:** Stripe sends webhooks to publicly accessible URLs only.

**Workaround:**
- Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Or deploy to staging environment with public URL

---

## 🏗️ Infrastructure

### 8. In-memory rate limiting doesn't scale across servers

**Limitation:** The rate limiter uses an in-memory Map. If you deploy to multiple servers, each has its own rate limit.

**Why:** Simplicity for MVP. In production, this should be Redis or a managed service.

**Workaround:** For now, single-server deployment. For multi-server, switch to:
- Redis: `lib/rate-limit-redis.ts` (not implemented)
- Supabase: query `login_attempts` table
- Vercel KV: built-in edge cache

---

### 9. OTP store uses Supabase table that may not be migrated

**Limitation:** If the `email_otps` table doesn't exist (migration 14+ not applied), OTPs fall back to in-memory storage. They will be lost on server restart.

**Why:** Defensive code for incomplete migrations.

**Workaround:** Ensure migration 14 (`14-complete-schema.sql`) is applied to enable DB-backed OTPs.

---

### 10. Service worker only works in production HTTPS

**Limitation:** The PWA service worker (`sw.js`) doesn't register on `localhost` in some browsers.

**Why:** Browser security policy. SW requires HTTPS (except for localhost).

**Workaround:** Test PWA features on a public HTTPS URL (staging or production).

---

## 📱 Browser Support

### 11. Speech recognition (Voice Search) requires Chrome/Edge

**Limitation:** The Voice Search button uses the Web Speech API, which is only supported in Chrome, Edge, and Safari (iOS 14.5+).

**Why:** Browser API support varies.

**Workaround:** Falls back gracefully — button still works for typing.

---

### 12. Touch ID / Passkeys require modern browsers

**Limitation:** The WebAuthn conditional UI is only available in Chrome 108+, Edge 108+, Safari 16+.

**Why:** Modern browser API.

**Workaround:** Falls back to email/password. Passkeys are progressive enhancement.

---

## 🌍 Internationalization

### 13. Translations are manual (not auto-translated)

**Limitation:** All 3 languages (DE/AR/EN) must be maintained manually. Adding a new i18n key requires updating all 3 files.

**Why:** Translation quality matters more than automation for a customer-facing product.

**Workaround:** Use a translation service (e.g., DeepL, Google Translate) to draft, then have a native speaker review.

---

### 14. Arabic RTL layout has some quirks

**Limitation:** Some 3rd-party components (e.g., Stripe Elements) don't fully support RTL.

**Why:** Limited RTL support in some libraries.

**Workaround:** Custom CSS overrides in `app/globals.css`.

---

## 🧪 Testing

### 15. Test suite requires a live server

**Limitation:** All test scripts (`scripts/*.js`) hit a live server URL via `BASE_URL` env var.

**Why:** Integration tests are more accurate than mocks.

**Workaround:** Set `BASE_URL=http://localhost:3000` and start the dev server before running tests.

---

### 16. No E2E tests (Playwright/Cypress)

**Limitation:** All tests are HTTP-level (Node.js scripts), not browser-level.

**Why:** Simpler setup, faster CI.

**Workaround:** For E2E coverage, consider adding Playwright tests in the future.

---

## 📊 Monitoring & Observability

### 17. No APM (Application Performance Monitoring)

**Limitation:** No automatic error tracking or performance monitoring (Sentry, DataDog, etc.).

**Why:** Not yet integrated.

**Workaround:** Use Vercel Analytics for basic metrics. For error tracking, integrate Sentry:

```typescript
// In instrumentation.ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({ dsn: process.env.SENTRY_DSN });
```

---

### 18. Logs are in-memory only

**Limitation:** The structured logger (`lib/logging.ts`) writes to console only. No log aggregation.

**Why:** Local dev doesn't need it.

**Workaround:** In production, pipe stdout to a log service (CloudWatch, Datadog, etc.).

---

## 🔄 Background Jobs

### 19. No job queue system

**Limitation:** Operations like "daily metrics reset" must be triggered manually via `/api/admin/daily-reset`.

**Why:** Avoids Redis/queue infrastructure for MVP.

**Workaround:** 
- Vercel Cron Jobs (configured in `vercel.json`)
- External cron: `curl -X POST https://your-app.com/api/admin/daily-reset -H "Authorization: Bearer ..."`

---

### 20. No push notification queue

**Limitation:** Push notifications are sent synchronously on order status change. If the push service is slow, the order update is slow.

**Why:** Simplicity. No queue infrastructure.

**Workaround:** In production, integrate a job queue (BullMQ, Inngest, etc.).

---

## 🧪 Data & Demo

### 21. Demo restaurants are limited to 4

**Limitation:** Only 4 demo restaurants exist (1 in Bonn, 3 in München).

**Why:** Test data only.

**Workaround:** Use the admin API or SQL inserts to add more restaurants.

---

### 22. Geocoding depends on Nominatim (OSM)

**Limitation:** Server-side geocoding uses Nominatim, which has rate limits (1 req/sec) and may be slow for some addresses.

**Why:** Free and doesn't require an API key.

**Workaround:** For production, switch to Google Geocoding API (set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).

---

## 🚧 Not Yet Implemented (Roadmap)

Features planned but not yet built:

- [ ] **Group orders** — Multiple users ordering together
- [ ] **Scheduled orders** (UI exists, backend partial)
- [ ] **Real-time chat** between customer and driver
- [ ] **Restaurant analytics dashboard** (admin-side)
- [ ] **Driver leaderboard** and gamification
- [ ] **Subscription plans** for customers (free delivery, etc.)
- [ ] **Multi-language restaurants** (per-restaurant menu languages)
- [ ] **In-app tipping** with custom amounts
- [ ] **Voice ordering** via phone call (Twilio integration)

---

## 📞 Reporting Issues

If you discover a new limitation or bug:

1. Check this document first
2. Search the existing issues
3. Create a new issue with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment (browser, OS, locale)
   - Screenshots/logs

---

## 🔄 Updating This Document

When you discover a new limitation:

1. Document it with a clear title
2. Explain the "why"
3. Provide a workaround
4. Mark it with the relevant version (e.g., "v42.1")

This document is a living resource — keep it current as the platform evolves.
