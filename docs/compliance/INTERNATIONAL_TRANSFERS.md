# International Data Transfer Assessment (Drittlandtransfer)

**Status:** DRAFT — to be reviewed and signed by a Datenschutzberater or DSB before commercial launch.
**Reference:** Art. 44-50 DSGVO, Schrems II ruling (CJEU C-311/18)

---

## What BlinkGo does NOT claim

- We do NOT claim that all personal data remains in the EU/EEA.
- We do NOT claim that data is "anonymized" when in fact it is merely "pseudonymized" (e.g. customer IDs).
- We do NOT claim that international transfers are absent when infrastructure shows otherwise.

---

## Identified international transfers

| Vendor | Destination | Mechanism | Risk level | Mitigation |
|--------|-------------|-----------|------------|------------|
| Supabase (AWS) | EU region (verified by tenant config) | N/A — EU only | LOW | Confirm region in Supabase dashboard |
| Cloudflare | Global edge (may transit US) | EU-US Data Privacy Framework + SCCs | LOW-MEDIUM | Use EU-only Cloudflare products where available |
| Stripe (when wired) | US + EU regions | SCCs + DPF | MEDIUM | Use Stripe Ireland Ltd. (EU entity) |
| Google Maps Platform | US | SCCs + DPF | MEDIUM | Minimize data sent; use session tokens |
| Resend | US (default) | SCCs + DPF | MEDIUM | Consider EU-based alternative if available |
| Hosting (operator's choice) | TBD by operator | TBD | TBD | Operator selects EU-region hosting |

---

## EU-US Data Privacy Framework (DPF)

As of July 2023, the European Commission adopted an adequacy decision for the EU-US Data Privacy Framework. Transfers to US-based vendors certified under the DPF are permitted under Art. 45 DSGVO. The DPF requires:

- Vendor is self-certified with US Department of Commerce
- Vendor complies with DPF Principles
- Recourse mechanisms available to EU data subjects

**For each US-based vendor, verify DPF certification at dataprivacyframework.gov.**

---

## Standard Contractual Clauses (SCCs)

Where DPF does not apply, SCCs (2021/914) are the fallback. They require:

- Module 1 (Controller → Controller) or Module 2 (Controller → Processor) as appropriate
- Annex specifying parties, data categories, processing purposes, technical measures
- Transfer Impact Assessment (TIA) for the destination country's surveillance laws

A TIA must consider:
- Laws of the destination country (e.g. FISA 702, Executive Order 12333 in the US)
- Whether the data is sensitive
- Volume and nature of the data
- Available technical safeguards (e.g. end-to-end encryption, pseudonymization)

---

## Encryption status

| Data | In transit | At rest | E2E? |
|------|-----------|---------|------|
| All web traffic | TLS 1.2+ (Cloudflare) | N/A | N/A |
| Database | TLS to Supabase | AES-256 (Supabase default) | No |
| Backups | TLS to Supabase | AES-256 | No |
| Driver location | TLS to Supabase Realtime | AES-256 | No |
| Email (Resend) | TLS to/from Resend | AES-256 at rest | No |

**For Schrems II compliance on US transfers, end-to-end encryption is preferred but not currently implemented.** A TIA should weigh this risk.

---

## Action items

- [ ] Confirm Supabase data center region (EU verified?)
- [ ] Sign Cloudflare DPA + verify DPF certification
- [ ] Sign Stripe DPA (when wired) + use Stripe Ireland
- [ ] Sign Google Ads Data Processing Terms
- [ ] Sign Resend DPA
- [ ] Select EU-region hosting provider + sign DPA
- [ ] Document TIA for each US transfer
- [ ] Review with Datenschutzberater

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Datenschutzberater / DSB | _____________ | _______ | ☐ Pending |
| Geschäftsführung | _____________ | _______ | ☐ Pending |
