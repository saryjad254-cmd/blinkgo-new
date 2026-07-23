# Record of Processing Activities (Verzeichnis der Verarbeitungstätigkeiten)

**Status:** DRAFT — Requires review by the responsible Daten­schutz­beauftragter (DPO) or Datenschutzberater.
**Article basis:** Art. 30 DSGVO
**Version:** 1.0
**Date:** 2026-07-21

---

## 1. Verantwortlicher (Controller)

| Field | Value |
|-------|-------|
| Name | [NOT_CONFIGURED — see `lib/legal/company-info.ts`] |
| Address | [NOT_CONFIGURED] |
| Contact | `COMPANY_LEGAL_EMAIL` env var |
| DSB (if appointed) | `COMPANY_DPO` env var |

---

## 2. Categories of personal data processed

### 2.1 Customer data
- Name, email, phone (during registration and order placement)
- Authentication credentials (password hashes via Supabase Auth)
- Delivery addresses (with optional precise lat/lng)
- Order history (items, totals, timestamps, status changes)
- Favorites (restaurant IDs)
- Loyalty points and wallet balance
- Notification tokens (if push enabled)
- Support messages (if submitted)
- Payment references (cash or Stripe charge IDs when payment wired)

### 2.2 Driver data
- Name, email, phone
- Profile photo (if uploaded)
- Vehicle information
- Driver documents (license, insurance — uploaded by driver)
- Bank account / payout details (for payouts)
- Live GPS location (only when online AND has active order)
- Working hours / shift state
- Acceptance and rejection history
- Earnings and tip history

### 2.3 Restaurant / merchant data
- Legal entity name, address, contact
- Bank account / payout details
- Menu items, prices, photos
- Working hours
- Order history for the restaurant
- Pause / busy mode state
- Ratings (if displayed)

### 2.4 Operational data
- IP addresses (rate-limit and abuse detection)
- User-Agent strings
- Session cookies (Supabase auth, blinkgo-session)
- LocalStorage preferences (language, theme, cart, search history, push-dismissed)
- Server access logs (request_id, path, status, duration)
- Application error logs (PII-redacted via `lib/logging`)

### 2.5 NOT processed
- Biometric data
- Health data (except voluntary dietary preferences)
- Government identifiers (Personalausweis, Sozialversicherungsnummer)
- Payment card primary account numbers (PAN) — handled by Stripe or kept locally for cash

---

## 3. Purposes and legal bases

| Purpose | Data category | Legal basis (Art. 6 DSGVO) | Retention |
|---------|---------------|------------------------------|-----------|
| Account creation | Customer/driver/restaurant profile | (b) Vertragserfüllung | Until account deletion + 30 days |
| Authentication | Email, password hash | (b) Vertragserfüllung | Until account deletion |
| Order placement and fulfilment | Order data, delivery address | (b) Vertragserfüllung | 10 years per § 147 AO (financial records); 30 days for non-financial |
| Delivery tracking (live) | Driver GPS, customer address | (b) Vertragserfüllung | 24 hours then deleted |
| Payment processing | Payment references | (b) Vertragserfüllung | 10 years per § 147 AO |
| Tax / invoicing | Invoices, payment refs | (c) Rechtliche Verpflichtung | 10 years per § 147 AO; 8 years per § 257 HGB |
| Fraud / abuse prevention | IP, user agent, request patterns | (f) Berechtigtes Interesse | 90 days |
| Customer support | Support messages, attached files | (b) Vertragserfüllung | 2 years |
| Marketing emails | Email | (a) Einwilligung (opt-in) | Until withdrawal |
| Push notifications | Notification tokens | (a) Einwilligung (opt-in) | Until withdrawal |
| Analytics | Aggregated, pseudonymous usage | Currently NOT performed | N/A |
| Service improvements | Aggregated order patterns | (f) Berechtigtes Interesse (anonymized) | 1 year |

---

## 4. Recipients (categories)

- **Internal staff** (operators with role-based access)
- **Supabase Inc.** — database, auth, storage (data center in EU region)
- **Stripe** (when configured) — payment processing
- **Google Maps Platform** (when configured) — geocoding, map tiles
- **Resend** (when `RESEND_API_KEY` set) — transactional email
- **Cloudflare** — reverse proxy, DDoS protection

See `VENDOR_REGISTER.md` for full details and DPA status.

---

## 5. International transfers

- Supabase: hosted in EU region. No third-country transfer.
- Stripe: data may be transferred to US. EU-US Data Privacy Framework + SCCs apply.
- Google Maps: data transferred to US. EU-US DPF + SCCs apply.
- Resend: data may be transferred to US. EU-US DPF + SCCs apply.
- Cloudflare: data may be transferred to US. EU-US DPF + SCCs apply.

We do NOT claim that all data remains in EU/EEA without verification. Standard Contractual Clauses and EU-US DPF are the legal mechanisms for the above transfers.

---

## 6. Technical and organizational measures (TOMs)

- TLS 1.2+ in transit (Cloudflare edge terminates TLS)
- Database encryption at rest (Supabase default)
- Row-Level Security on all tables containing user data
- Role-based access control (RBAC) at application layer
- Rate limiting (login: 5/15min/email; status: 60/15min/user; DSAR: 5/hour/IP)
- CSRF protection (Origin-header check on all mutations)
- PII redaction in application logs (via `lib/logging`)
- Secrets stored in environment variables, never logged
- Session cookies: HttpOnly, SameSite=Lax
- Input validation: Zod schemas + manual fallbacks
- Driver location: 24-hour automatic retention
- Deactivated accounts: marked `is_active=false`, data retained per retention matrix

---

## 7. Data subject rights

Implemented routes:

- `GET /api/account/export` — Art. 15 (right to access) + Art. 20 (portability)
- `DELETE /api/account/delete` — Art. 17 (right to erasure), with 30-day deletion queue
- `POST /api/legal/data-request` — public DSAR form for any request type
- Support contact for rectification, restriction, objection, consent withdrawal

All requests acknowledged within 30 days per Art. 12(3) DSGVO.

---

## 8. Approval

| Role | Name | Date | Status |
|------|------|------|--------|
| Verantwortlicher | _____________ | _______ | ☐ Pending |
| Datenschutzbeauftragter (if appointed) | _____________ | _______ | ☐ Pending |
| External DPO / Datenschutzberater | _____________ | _______ | ☐ Pending |

**This document is a DRAFT and must be reviewed and signed before commercial launch.**
