# Vendor / Processor Register (Auftragsverarbeiter-Verzeichnis)

**Status:** DRAFT — Requires verification of signed AVVs/DPAs by the responsible Datenschutzberater.
**Version:** 1.0
**Date:** 2026-07-21

For each vendor: data processed, role, contract requirement, storage region, sub-processors, transfer mechanism, and current production configuration.

---

## 1. Supabase, Inc.

| Field | Value |
|-------|-------|
| Purpose | Database (PostgreSQL), authentication, realtime, file storage |
| Data processed | All user data (customers, drivers, restaurants, orders, messages, files) |
| Role | Auftragsverarbeiter (processor) per Art. 28 DSGVO |
| DPA status | **TO BE VERIFIED** — needs signed DPA before launch |
| Storage region | EU region (Frankfurt or other EU zone — verify with tenant config) |
| Sub-processors | AWS (infrastructure) — sub-processor list at supabase.com/subprocessors |
| Transfer mechanism | EU region; no third-country transfer for primary data |
| Retention controls | Yes (via Supabase dashboard + custom policies) |
| Production config | `NEXT_PUBLIC_SUPABASE_URL=https://rhdaffhlrglyknxtucux.supabase.co` |

**Source files:** `lib/supabase/server.ts`, `lib/supabase/service.ts`, `lib/supabase/client.ts`

---

## 2. Cloudflare, Inc.

| Field | Value |
|-------|-------|
| Purpose | Reverse proxy, TLS termination, DDoS protection |
| Data processed | All HTTP traffic (IP, headers, paths) |
| Role | Auftragsverarbeiter |
| DPA status | **TO BE VERIFIED** — Cloudflare offers standard DPA at cloudflare.com/cloudflare-customer DPA |
| Storage region | Global edge network; logs may transit US |
| Sub-processors | Multiple, see cloudflare.com/subprocessors |
| Transfer mechanism | EU-US Data Privacy Framework + SCCs |
| Production config | Tunnel: `club-taxation-tracks-medication.trycloudflare.com` |

**Source files:** `START.sh`, `cf-tunnel.log`, `CURRENT_TUNNEL.txt`

---

## 3. Stripe, Inc.

| Field | Value |
|-------|-------|
| Purpose | Payment processing (when wired) |
| Data processed | Card data, payment intent metadata, customer IDs |
| Role | Auftragsverarbeiter (with independent controller role for fraud signals) |
| DPA status | **TO BE VERIFIED** — Stripe DPA is included in standard merchant agreement |
| Storage region | EU region available (Stripe Ireland Ltd.) |
| Sub-processors | Multiple — see stripe.com/legal/service-providers |
| Transfer mechanism | EU + SCCs + DPF |
| **Production status** | **NOT WIRED** — `STRIPE_SECRET_KEY` env var not set. `payment_method: 'card'` is currently mocked. |

**Source files:** `lib/stripe/client.ts`, `lib/stripe/dev-mode.ts`, `app/api/stripe/*`, `lib/integrations/payments/router.ts`

**WARNING:** Production launch without Stripe wired means online card payments are unavailable. Cash-on-delivery works. This is acceptable for v1 launch if customers are informed.

---

## 4. Google Maps Platform (Google Ireland Ltd.)

| Field | Value |
|-------|-------|
| Purpose | Geocoding, address autocomplete, map display, place details |
| Data processed | Address strings, browser fingerprint, IP |
| Role | Auftragsverarbeiter (with own legitimate interest for service improvement) |
| DPA status | **TO BE VERIFIED** — Google Ads Data Processing Terms apply |
| Storage region | Global; EU users may still be processed in US |
| Transfer mechanism | EU-US DPF + SCCs |
| Production config | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set (live key) |

**Source files:** `lib/maps/google-maps.ts`, `lib/maps/geocoder.ts`, `lib/maps/distance.ts`, `components/maps/GoogleMap.tsx`

**WARNING:** Sending address data to Google requires DPA + appropriate safeguards. Do not enable address autocomplete in production without signed Google Ads Data Processing Terms.

---

## 5. Resend, Inc.

| Field | Value |
|-------|-------|
| Purpose | Transactional email (OTP codes, order confirmations) |
| Data processed | Recipient email, name, body content |
| Role | Auftragsverarbeiter |
| DPA status | **TO BE VERIFIED** — Resend DPA at resend.com/legal/dpa |
| Storage region | US (with EU sub-processor option) |
| Transfer mechanism | SCCs + DPF |
| Production config | `RESEND_API_KEY` is set. `EMAIL_FROM=onboarding@resend.dev` (Resend's default test sender) |

**Source files:** `lib/email-service.ts`

**WARNING:** `onboarding@resend.dev` is a TEST sender. Production launch needs a verified custom domain like `noreply@blinkgo.de`. Domain verification requires DNS changes.

---

## 6. (Removed: Vercel)

The current architecture does NOT use Vercel. The application runs as a self-hosted Next.js process. Hosting provider is the operator's choice (Hetzner, AWS, etc.) and must be added to this register.

---

## 7. Vendors NOT currently used

These are NOT integrated and do NOT process data:

- Google Analytics / Matomo / Plausible (no analytics)
- Facebook Pixel / Google Ads (no advertising)
- Sentry / Datadog (no error tracking)
- Twilio / Vonage (no SMS)
- Intercom / Zendesk (no live chat — only direct email)

If any of these are later integrated, they MUST be added to this register with signed DPA + transfer mechanism before activation.

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Datenschutzberater | _____________ | _______ | ☐ Pending |
| Datenschutzbeauftragter (if appointed) | _____________ | _______ | ☐ Pending |

**This document is a DRAFT and must be reviewed and signed before commercial launch.**
