# Phase 21 — Legal, GDPR & Compliance Hardening
**Date:** 2026-07-21
**Status:** COMPLETE — DRAFT FOR LAWYER REVIEW
**Architecture:** v65 (frozen) — no schema changes, no new tables added (defensive coding for future migrations)

---

## ⚠️ CRITICAL DISCLAIMER

**This phase added STRUCTURAL legal pages and compliance plumbing. It is NOT a substitute for legal advice.**

Every legal page is marked with a draft banner that states:
> "Dieser Text ist ein Entwurf und bedarf der Prüfung durch einen spezialisierten Rechtsanwalt."

**Before commercial launch, ALL of the following must be reviewed and signed by qualified professionals:**

1. **German Rechtsanwalt** (specialized in IT/E-commerce law)
2. **Datenschutzberater / DPO** (DSGVO specialist)
3. **Steuerberater** (for retention periods, USt-IdNr, tax compliance)

The codebase enforces this via `LEGAL_REVIEW_STATUS` in `lib/legal/company-info.ts`. The launch gate in `lib/legal/launch-gate.ts` refuses to start the customer-facing app in production mode if:
- Required legal fields are missing, OR
- `LEGAL_REVIEW_STATUS` is not `APPROVED`

---

## What was delivered

### 1. Legal Center (public, no auth)

7 public legal pages, fully responsive, accessible, DE/AR/EN:

| Route | Purpose | Status |
|-------|---------|:------:|
| `/legal/impressum` | Impressum per § 5 TMG | ✅ Draft |
| `/legal/datenschutz` | Datenschutzerklärung per Art. 13 DSGVO | ✅ Draft |
| `/legal/agb` | AGB (Customer Terms) | ✅ Draft |
| `/legal/widerruf` | Widerrufsbelehrung (Right of Withdrawal) | ✅ Draft |
| `/legal/cookies` | Cookie & Tracking inventory | ✅ Honest |
| `/legal/data-request` | Public DSAR form (Art. 15-21) | ✅ Functional |
| `/legal/merchant-terms` | Merchant/Restaurant partner terms | ✅ Stub |
| `/legal/driver-terms` | Driver contractual information | ✅ Stub |

All pages:
- Have draft banner (visible until `LEGAL_REVIEW_STATUS=APPROVED`)
- Public (no auth required)
- Trilingual (DE/AR/EN)
- Responsive (mobile-first)
- Accessible (semantic HTML, ARIA labels, keyboard nav)
- No JS required (rendered server-side)

### 2. Centralized legal config (`lib/legal/company-info.ts`)

Single source of truth for:
- Legal business name, form, director
- Address, contact
- VAT ID, tax number, commercial register
- DSB, supervisory authority
- Business hours, service area
- Dispute resolution info
- Legal review status

Reads from env vars (`COMPANY_LEGAL_NAME`, etc.) — **never fabricates values**. Missing fields are explicit placeholders that make the missing state obvious.

### 3. Production launch gate (`lib/legal/launch-gate.ts`)

In production mode, refuses to start if legal config is incomplete. Logs missing fields clearly. Operators can bypass with `LEGAL_GATE_BYPASS=true` (NOT recommended).

### 4. Data subject rights (Art. 15, 17, 20)

- **`GET /api/account/export`** — Authenticated users download all their data as JSON (Art. 15 + Art. 20)
- **`DELETE /api/account/delete`** — Authenticated users request account deletion (Art. 17). Deactivates immediately; financial data retained per § 147 AO
- **`POST /api/legal/data-request`** — Public form for any DSAR. Rate-limited, validated, logged, optionally emailed to legal contact
- **`POST /api/consent`** — Cookie consent state, audit-grade logged

### 5. Compliance documentation (`docs/compliance/`)

| File | Purpose | Status |
|------|---------|:------:|
| `RECORD_OF_PROCESSING_ACTIVITIES.md` | Art. 30 DSGVO record | ✅ Draft |
| `VENDOR_REGISTER.md` | Processor inventory + DPA status | ✅ Draft |
| `AVV_DPA_CHECKLIST.md` | Art. 28 DPA checklist | ✅ Draft |
| `INTERNATIONAL_TRANSFERS.md` | Schrems II assessment | ✅ Draft |
| `RETENTION_MATRIX.md` | All retention periods with legal basis | ✅ Draft |
| `LOCATION_PRIVACY.md` | Driver + customer location audit | ✅ Draft |

### 6. UI integration

- Legal links added to:
  - Login page footer
  - Register page footer
  - Customer profile page
- All public legal pages have a persistent legal footer with links
- Draft banner visible on every legal page until lawyer approval

### 7. Test coverage

| Test file | Tests | Status |
|-----------|------:|:------:|
| `legal-compliance-test.js` | 22 | ✅ 22/22 |
| `rbac-negative-test.js` | 34 | ✅ 34/34 |
| All existing tests (regression) | 166+ | ✅ No regression |

**Total Phase 21: 56 new tests, 222+ total tests passing.**

### 8. Checkout compliance

- Cart already shows full price breakdown (subtotal, delivery, service, discount, tip, total)
- Restaurant identity shown in cart header
- Place-order button: "Bestellung aufgeben" with total amount visible
- Legal acknowledgment text below button
- No vague "Continue" or "Confirm" labels

---

## What was NOT done (and why)

### Not done per user directive

- **No new database tables** (v65 architecture freeze)
- **No multi-tenant / multi-city** (Phase 19 was permanently cancelled)
- **No new features** beyond legal compliance plumbing
- **No fabricated company data** (GmbH name, HRB, USt-IdNr, etc.)

### Documented but not implemented (TODOs)

These are in the compliance docs as "TODO" with priority. Per v65 architecture freeze, cleanup jobs are NOT scheduled:

- Driver location 24h automatic deletion (manual cleanup only)
- Customer precise lat/lng clearing after delivery
- Application log rotation (system-dependent)
- DSAR record 3-year retention
- Consent record 3-year retention

### Requires real data from operator

- Real GmbH name and address (in env vars)
- Real HRB entry
- Real USt-IdNr or tax number
- Real DSB (if applicable)
- Real AVV/DPA signatures with each vendor
- Real custom email domain (replace `onboarding@resend.dev`)

---

## What the operator must do before launch

1. **Hire a German IT/E-commerce lawyer.** Provide them with:
   - This codebase (Phase 21)
   - `docs/compliance/*.md` (all 6 files)
   - All `app/legal/*` pages
   - The AGB and Datenschutz text

2. **After lawyer review:**
   - Update env vars with real company data
   - Set `LEGAL_REVIEW_STATUS=APPROVED`
   - Sign all AVV/DPAs (per `AVV_DPA_CHECKLIST.md`)
   - Update Stripe/Resend/Google with real domain

3. **Hire a Steuerberater.** Confirm retention periods in `RETENTION_MATRIX.md` are correct for your tax situation.

4. **Hire a Datenschutzberater (or DSB if required by § 38 BDSG).** Review all compliance docs and the privacy page.

5. **Run the production launch gate check:**
   ```bash
   NODE_ENV=production npx tsx lib/legal/launch-gate.ts
   ```

---

## Architecture compliance

Per the v65 architecture freeze:

- **No new tables added.** The `data_subject_requests` and `consent_records` tables are referenced as DEFENSIVE (try-insert, fail-silently). Records are always logged in the application log, so audit trail exists regardless of schema state.

- **No new features added.** The legal pages, DSAR endpoints, and consent endpoint are pure plumbing. They don't change core business logic.

- **No fake data.** Every placeholder is explicit and obvious. No made-up GmbH names, addresses, HRB numbers, or VAT IDs.

---

## Test results — full sweep

```
customer-journey-test.js     29/29 ✅
admin-workflow-test.js       24/24 ✅
edge-cases-test.js           20/20 ✅
security-test.js             22/22 ✅
ops-acceptance-test.js       30/30 ✅
restaurant-workflow-test.js  18/18 ✅
driver-stress-test.js        23/23 ✅
legal-compliance-test.js     22/22 ✅  (NEW)
rbac-negative-test.js        34/34 ✅  (NEW)
─────────────────────────────────────
TOTAL                       222/222 ✅  (100% pass rate)
```

**0 TypeScript errors. Build successful. Live tunnel operational.**

---

## Files added in Phase 21

### Code (lib + components)
- `lib/legal/company-info.ts` (13KB)
- `lib/legal/launch-gate.ts` (2.7KB)
- `components/legal/LegalBanner.tsx` (2.5KB)
- `components/legal/LegalFooter.tsx` (3.6KB)

### Pages
- `app/legal/layout.tsx` (1.7KB)
- `app/legal/impressum/page.tsx` (9.8KB)
- `app/legal/datenschutz/page.tsx` (17KB)
- `app/legal/agb/page.tsx` (14.7KB)
- `app/legal/widerruf/page.tsx` (6.2KB)
- `app/legal/cookies/page.tsx` (6.5KB)
- `app/legal/data-request/page.tsx` (8.6KB)
- `app/legal/merchant-terms/page.tsx` (3.7KB)
- `app/legal/driver-terms/page.tsx` (4.1KB)

### API routes
- `app/api/legal/data-request/route.ts` (4.9KB)
- `app/api/account/export/route.ts` (4.0KB)
- `app/api/account/delete/route.ts` (3.7KB)
- `app/api/consent/route.ts` (3.7KB)

### Documentation
- `docs/compliance/RECORD_OF_PROCESSING_ACTIVITIES.md` (6.2KB)
- `docs/compliance/VENDOR_REGISTER.md` (5.5KB)
- `docs/compliance/AVV_DPA_CHECKLIST.md` (2.7KB)
- `docs/compliance/INTERNATIONAL_TRANSFERS.md` (3.6KB)
- `docs/compliance/RETENTION_MATRIX.md` (6.2KB)
- `docs/compliance/LOCATION_PRIVACY.md` (6.5KB)

### Tests
- `scripts/legal-compliance-test.js` (5.9KB, 22 tests)
- `scripts/rbac-negative-test.js` (7.3KB, 34 tests)

### Modified
- `app/login/page.tsx` — added legal footer
- `app/register/page.tsx` — added legal footer
- `app/(customer)/profile/page.tsx` — added legal links
- `app/(customer)/cart/page.tsx` — improved compliance text

**Total Phase 21: ~140KB of new code/docs, 56 new tests, 8 new pages, 4 new API routes.**

---

## Final recommendation

**Status: READY FOR LAWYER REVIEW.**

The compliance plumbing is complete. The next step is human review by qualified professionals. Until that review is complete and `LEGAL_REVIEW_STATUS=APPROVED` is set, the production launch gate will block deployment.

**Operator actions required:**

1. Set up an env file with real company data (or `LEGAL_GATE_BYPASS=true` for dev)
2. Hire lawyer + Steuerberater + Datenschutzberater
3. Get all docs signed
4. Set `LEGAL_REVIEW_STATUS=APPROVED`
5. Deploy to production

**This is not a technical launch blocker. It is a legal one. The technical baseline is verified — the legal baseline requires qualified human review.**

---

**Phase 21 complete. 222/222 tests pass. 0 TS errors. 0 critical bugs. Architecture frozen at v65 maintained.**
