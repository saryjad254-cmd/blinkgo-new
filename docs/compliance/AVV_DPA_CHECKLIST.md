# AVV / DPA Checklist (Auftragsverarbeitungsvertrag)

**Status:** DRAFT — checklist only. Each item requires a signed document before production launch.
**Reference:** Art. 28 DSGVO

For each Auftragsverarbeiter (processor), an AVV / DPA must be in place. This checklist tracks what is required, what we have, and what is missing.

---

## Required AVV/DPA elements (per Art. 28(3) DSGVO)

- [ ] Subject matter and duration of processing
- [ ] Nature and purpose of processing
- [ ] Type of personal data
- [ ] Categories of data subjects
- [ ] Controller obligations and rights
- [ ] Documented instructions of the controller
- [ ] Confidentiality obligations of processor staff
- [ ] Technical and organizational measures (TOMs)
- [ ] Sub-processor authorization and notification
- [ ] Assistance with data subject rights
- [ ] Assistance with DPIA (Art. 35) and prior consultation (Art. 36)
- [ ] Notification of personal data breaches
- [ ] Return or deletion of data at end of service
- [ ] Audits and inspections
- [ ] Liability provisions

---

## Vendor checklist

### 1. Supabase

- [ ] Sign Supabase DPA (DPA is online at supabase.com/dpa)
- [ ] Document data center region (EU confirmed)
- [ ] Document sub-processor list
- [ ] Set retention controls (e.g. 90-day backup retention)
- [ ] Configure breach notification channel

### 2. Cloudflare

- [ ] Sign Cloudflare Customer DPA
- [ ] Configure log retention
- [ ] Document sub-processor list

### 3. Stripe (when wired)

- [ ] Stripe Services Agreement signed (includes DPA)
- [ ] Set data residency to EU (Stripe Ireland Ltd.)
- [ ] Configure webhook signing
- [ ] Document fraud-detection data flows

### 4. Google Maps Platform

- [ ] Sign Google Ads Data Processing Terms (when activated)
- [ ] Restrict API key to allowed referrers
- [ ] Set quota limits
- [ ] Consider Google Places Autocomplete with session tokens (privacy-enhanced mode)

### 5. Resend

- [ ] Sign Resend DPA
- [ ] Verify custom sending domain (replace `onboarding@resend.dev`)
- [ ] Configure suppression list handling

### 6. Hosting provider (self-host operator's choice)

- [ ] Sign hosting DPA
- [ ] Verify data center region (EU)
- [ ] Document backup retention
- [ ] Document physical security measures

---

## Status

As of 2026-07-21:

- All AVVs/DPA: **PENDING** (none have been signed and on-boarded yet)
- All contracts: must be signed by the operator before commercial launch
- Self-attestation: **NOT acceptable** — actual signed copies must be on file

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Datenschutzberater / DSB | _____________ | _______ | ☐ Pending |
| Geschäftsführung | _____________ | _______ | ☐ Pending |
