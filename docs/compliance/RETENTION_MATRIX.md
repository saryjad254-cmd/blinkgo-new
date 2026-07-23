# Data Retention Matrix (Aufbewahrungsfristen)

**Status:** DRAFT — retention periods are technical defaults based on common interpretations of German commercial and tax law. **All retention periods must be confirmed with a Steuerberater and Datenschutzberater before commercial launch.**

---

## Legal basis summary

- **§ 147 AO** (Abgabenordnung): Invoices and accounting records — **10 years**
- **§ 257 HGB** (Handelsgesetzbuch): Handelsbriefe (commercial letters) — **6 years**
- **§ 35 SGB I**: Sozialversicherungsdaten — varies; typically 5-10 years
- **Art. 17 DSGVO**: Personal data must be deleted when no longer necessary for the original purpose, UNLESS legal retention obligations apply
- **HGB § 239**: Proper accounting records
- **BDSG / Landesrecht**: Various local regulations

---

## Retention matrix

| Data type | Retention | Legal basis | Deletion method |
|-----------|-----------|-------------|-----------------|
| **Customer accounts (active)** | Until account deletion + 30 days | Vertragserfüllung (Art. 6(1)(b)) | Soft delete (`is_active=false`), hard delete after 30 days |
| **Customer accounts (deleted)** | 30 days after deletion request | Vertragserfüllung | Hard delete from `users` table |
| **Customer order records (financial)** | 10 years from order date | § 147 AO (tax retention) | Anonymize personal fields (name, address, email) at year 10, keep order_id + total for audit |
| **Customer order records (non-financial)** | 2 years from order date | Verjährung (BGB § 195) | Hard delete |
| **Customer delivery addresses** | Until order is delivered + 30 days | Vertragserfüllung | Hard delete precise lat/lng; keep address string in order record for billing |
| **Driver location (live GPS)** | 24 hours from capture | Berechtigte Interessen (Art. 6(1)(f)) | Automatic deletion after 24h |
| **Driver profile (active)** | Until account deletion | Vertragserfüllung | Soft delete |
| **Driver documents (license, insurance)** | Until contract end + 3 years | Verjährung + berechtigte Interessen | Hard delete (encrypted storage) |
| **Driver payout records** | 10 years | § 147 AO | Anonymize at year 10 |
| **Restaurant records** | Until contract end + 10 years | § 147 AO + Verjährung | Anonymize at year 10 |
| **Restaurant menu** | Until removed by restaurant | Vertragserfüllung | Hard delete on restaurant request |
| **Authentication logs (login attempts)** | 90 days | Berechtigte Interessen (security) | Hard delete |
| **Session cookies** | 30 days (Supabase default) | Vertragserfüllung | Auto-expire |
| **Rate-limit records** | 15 minutes - 1 hour (varies by route) | Berechtigte Interessen (abuse prevention) | Auto-expire |
| **Application error logs** | 30 days (with PII redaction) | Berechtigte Interessen | Auto-expire |
| **Audit log (admin actions)** | 2 years | Berechtigte Interessen (compliance) | Hard delete after 2 years |
| **Support messages** | 2 years from last contact | Verjährung | Hard delete |
| **DSAR records (data_subject_requests)** | 3 years from closure | Art. 5(2) DSGVO (Rechenschaftspflicht) | Hard delete |
| **Consent records (consent_records)** | 3 years from withdrawal | Art. 7(1) DSGVO | Hard delete |
| **Backup snapshots (Supabase)** | Per Supabase retention (typically 7 days for free, configurable) | Service-provider default | Auto-expire |
| **Stripe payment records (when wired)** | Stripe retains per their ToS | DPA | Stripe-managed |
| **Resend email logs** | Per Resend retention | DPA | Resend-managed |

---

## Implementation status (current)

| Item | Implemented? | Notes |
|------|:---:|-------|
| Customer order anonymization at 10 years | ❌ | Requires scheduled job — out of current scope |
| Driver location deletion at 24h | ⚠️ Partial | Live tracking stops, but DB row may persist until cleaned up |
| Auth log deletion at 90 days | ❌ | No cleanup job in current build |
| Audit log deletion at 2 years | ❌ | No cleanup job in current build |
| Application log rotation at 30 days | ⚠️ Partial | System-dependent (Docker/logrotate) |
| DSAR record retention at 3 years | ⚠️ Partial | Records logged; cleanup job needed |
| Consent record retention at 3 years | ⚠️ Partial | Records logged; cleanup job needed |

**The current build prioritizes the OPERATIONAL retention (session, location, rate limits). Long-term retention cleanup jobs are documented but not implemented, per v65 architecture freeze.**

---

## Storage-region compliance

- Primary database: Supabase (EU region — verify in dashboard)
- Backups: Supabase-managed (region-locked — verify)
- Email: Resend (US by default — DPF applies)
- Maps: Google (US — DPF applies)
- Payments: Stripe (EU when using Stripe Ireland)

**For Schrems II compliance, see `INTERNATIONAL_TRANSFERS.md`.**

---

## What is NOT retained

- Plaintext passwords (Supabase hashes with bcrypt)
- PAN (credit card primary account number) — handled by Stripe when wired
- Free-form PII outside structured tables

---

## Data subject deletion — exact flow

When a user requests account deletion:

1. User authenticates and submits `DELETE /api/account/delete` (or via DSAR form)
2. Server sets `users.is_active = false` (deactivation)
3. User session is invalidated (Supabase revoke refresh tokens)
4. A row is inserted into `data_subject_requests` with type=`erasure`
5. After 30 days (grace period), a scheduled job would:
   - Anonymize `users.name` → "Gelöscht"
   - Anonymize `users.email` → "deleted-{userId}@invalid.local"
   - Anonymize `users.phone` → null
   - Anonymize `favorites` rows
   - Anonymize `support_messages.body` → "[gelöscht]"
   - Mark `notifications` as deleted
6. Order financial records: kept until year 10, then anonymized (name, address) keeping only `order_id`, `total`, `created_at` for tax audit

**Step 5 is NOT implemented in the current build.** Until the cleanup job is added, account deletion is a "soft delete" (deactivation only). This is documented in the DSAR response.

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Steuerberater | _____________ | _______ | ☐ Pending |
| Datenschutzberater / DSB | _____________ | _______ | ☐ Pending |
| Geschäftsführung | _____________ | _______ | ☐ Pending |
