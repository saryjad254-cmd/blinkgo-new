# BlinkGo Master Directive — Current-Code Gap Audit

Date: 2026-08-20  
Scope: the current local release candidate only. No production deployment was performed.  
Method: source, migration, route, test and build evidence; an item is not marked READY from UI presence alone.

## Baseline inventory

- 107 application pages, 189 API route handlers, 187 test/spec scripts and 33 ordered Supabase migrations.
- Current customer, courier, restaurant and administrator surfaces are broad and already share one Next.js application.
- The last verified baseline has zero lint errors, a passing TypeScript check and a passing optimized build. Provider and legal gates remain external.
- Existing delivery package and source archives are not treated as implementation evidence.

## Status definitions

- **READY** — implemented and covered by current executable evidence.
- **PARTIAL** — useful implementation exists, but a required contract, control or end-to-end proof is missing.
- **MISSING** — no adequate implementation evidence in the current codebase.
- **NEEDS REDESIGN** — an implementation exists, but its contract conflicts with the Master Directive.
- **FEATURE-FLAG READY** — implementation exists but must remain disabled until dependencies and acceptance evidence are complete.
- **POST-LAUNCH SCALE FEATURE** — intentionally deferred; not a release-candidate blocker.

## Executive finding

BlinkGo is not missing “more pages.” Its strongest areas are the single-order lifecycle, customer/merchant/courier workflows, refunds, double-entry financial journals, reconciliation, legal information surfaces and broad regression coverage. The launch-critical gaps are control-plane gaps:

1. no typed central feature-flag, dependency, rollout and kill-switch system;
2. no active-order-aware partial maintenance or emergency freeze enforcement;
3. the startup loader is visual-only and reports no real boot task progress;
4. the data model is restaurant-first rather than the required generic merchant/fulfillment-location abstraction;
5. Stripe Connect merchant settlement is not implemented or proven against a provider test account;
6. incident, outbox delivery and restoration drills are incomplete;
7. official brand reference assets are not yet represented as a complete locked full/compact/icon asset set.

## A. Product and commerce core (Directive 1–25)

| Capability | Status | Current evidence | Required closure |
|---|---|---|---|
| One order core and server-side totals | READY | `app/api/checkout/draft/route.ts`, `app/api/checkout/confirm/route.ts`, `app/api/orders/route.ts`, atomic order migrations | Keep all new verticals on this contract. |
| Idempotent checkout/order creation | READY | draft nonce/hash contracts, atomic RPCs, payment reliability tests | Keep concurrency and retry gates mandatory. |
| Immutable financial ledger | READY | `20260814133000_add_financial_ledger_and_reconciliation.sql`, `lib/finance/ledger.ts` | Provider reconciliation is still external evidence. |
| Refunds and financial recovery | READY | refund state machine, webhook handling, reconciliation cron, recovery queue and refund suites | Prove with Stripe test-mode events. |
| Customer food, market and shop storefronts | READY | `/restaurants`, `/market`, `/shop`; storefront separation test | Preserve vertical-specific discovery. |
| Generic merchant abstraction | MISSING | orders/products use `restaurant_id`; no `merchant_id`, merchant type or fulfillment-location domain found | Add compatibility-first merchant/location model before multi-vertical scale work. |
| BlinkGo-owned commerce | FEATURE-FLAG READY | shop/market surfaces exist, but ownership, inventory liability and settlement model are not explicit | Add owner/operator fields and keep owned inventory disabled until operations are defined. |
| Generic catalogue engine | PARTIAL | products, variants, extras, allergens, legal fields, storefront verticals | Add category schemas for weight, regulated items, bundles and fulfilment constraints. |
| Customer wallet/credits | PARTIAL | wallet and loyalty tables/routes exist | Replace balance-only assumptions with an auditable credit/loyalty ledger. |
| Group orders | READY | group-order migration, routes and workflow gate | Provider settlement proof remains part of checkout acceptance. |
| Bundled delivery | POST-LAUNCH SCALE FEATURE | no production-safe batching engine evidenced | Design after single-order dispatch metrics are stable. |
| Multi-city/multi-zone | PARTIAL | zone pricing, surge rules, admin zones and tests | Add city launch templates, inherited configuration and staged activation. |
| Multi-country | POST-LAUNCH SCALE FEATURE | EUR/Germany assumptions are deliberate | Do not generalize before German launch evidence. |
| BlinkGo+ | FEATURE-FLAG READY | loyalty/referral foundations only | Requires commercial, cancellation, tax and benefit rules. |
| Merchant ads/campaigns | PARTIAL | promotions/admin controls exist | Add merchant self-service, funding split, caps, attribution and abuse controls. |
| BlinkGo Drive/B2B | MISSING | no stable external-delivery contract found | Defer behind a flag after generic merchant/location work. |
| Merchant API/webhooks | MISSING | inbound provider webhooks exist; partner API/outbound delivery contract does not | Add versioned API, signed outbox, retry and replay tools. |

## B. Administration, resilience and operations (Directive 26–85)

| Capability | Status | Current evidence | Required closure |
|---|---|---|---|
| Admin operational control | PARTIAL | 45 admin API groups, live ops, finance, onboarding, zones, configuration | Add centralized status, flag dependencies and active-order-safe controls. |
| Roles, MFA and privileged action governance | PARTIAL | server role guards, protected role source, privileged-MFA tests, audit service | Four-eyes approval and production MFA enforcement are not proven. |
| Central feature flags and rollouts | MISSING | only a generic untyped `config` editor exists | Add typed flags, scope, dependencies, rollout, version and audit history. |
| Kill switches and partial maintenance | MISSING | no enforcement layer found | Add fail-closed server evaluation and protect active orders during freezes. |
| Circuit breakers/retry policy | PARTIAL | payment retry/rate-limit/recovery utilities exist | Generalize health-aware breakers to maps, notifications and partner webhooks. |
| Recovery engine | READY | payment/order recovery queue and reconciliation | Add unified incident correlation and operator ownership. |
| Background jobs | PARTIAL | cron routes, job/job-run tables | Add lease, retry class, dead-letter and replay contracts consistently. |
| Incident center | PARTIAL | operational and recovery consoles exist | A single incident state model, severity, owner, timeline and runbook is missing. |
| Support center | READY | order-linked support, attachments and resolution contracts/tests | Production malware scanning and staffing evidence remain external. |
| Fraud/risk foundation | PARTIAL | payment fraud signals, limits and audit data | Add configurable rules, reason visibility, review queues and false-positive metrics. |
| Dispatch and ETA | PARTIAL | offer lifecycle, driver map, heatmap, navigation and tests | Multi-offer fairness, poor-network device proof and calibration are incomplete. |
| RLS/data ownership | PARTIAL | RLS and explicit service-role grants in ordered migrations | Run database advisor/RLS tester against the target project before release. |
| Secret management | PARTIAL | environment-only runtime and secret scan | Previously exposed provider credentials must remain rotated; hosted vault evidence is external. |
| Rate limiting/attack resilience | PARTIAL | route security wrappers and payment-specific controls | Build one route-class policy and hosted WAF/rate-limit proof. |
| Pagination/cache/realtime/GPS | PARTIAL | cache regression, realtime/GPS models and several paginated APIs | Enforce cursor/page limits consistently and perform real-device reconnect tests. |
| Observability | PARTIAL | metrics, structured logging, health routes, performance/load gates | Hosted alerts, on-call routing and cost dashboards are unproven. |
| Backup/DR/rollback | PARTIAL | documentation and deployment artifacts exist | Timed isolated restore and rollback drills are required. |
| GDPR and retention | PARTIAL | consent, export/delete requests and legal pages | DPIA, retention jobs and German/EU legal approvals remain outstanding. |

## C. Brand, frontend and startup experience (Directive 86–137, 146–154)

| Capability | Status | Current evidence | Required closure |
|---|---|---|---|
| Central brand assets | PARTIAL | `public/brand` and reusable logo components exist | Produce a locked manifest for official full, compact and icon variants derived only from supplied approved assets. |
| One identity across roles | PARTIAL | brand components and tokens are shared | Audit every role header/splash/auth surface against the locked manifest. |
| Living Background system | MISSING | isolated glow/orb backgrounds only | Add reusable Subtle/Standard/Hero variants with reduced-motion support. |
| Login/welcome | PARTIAL | functional multilingual login and brand treatment | Align to approved visual reference without altering auth contracts. |
| Real startup loader | NEEDS REDESIGN | `BlinkSplash` animates dots; `/api/health/startup` uses only process uptime | Add real task states, weighted progress, timeout/retry/degraded outcomes and scooter position from actual progress. |
| Loading/empty/error/offline states | PARTIAL | broad page-level states and offline handling exist | Close remaining route/state matrix and eliminate duplicated splash implementations. |
| PWA | PARTIAL | manifest/service worker/push foundations exist | Install/update/offline and iOS/Android device acceptance needed. |
| Accessibility | PARTIAL | static/keyboard gates pass and reduced-motion patterns exist | Independent BFSG review and real assistive-technology evidence remain external. |
| Localization | READY | German default, Arabic RTL and English foundations | Continue translation completeness gates for every new control-plane screen. |
| Frontend performance/images | PARTIAL | Next image usage, resilience and performance tests | Enforce budgets in a release gate and measure real mid-tier devices. |

## D. Quality, release and post-138 controls

| Capability | Status | Current evidence | Required closure |
|---|---|---|---|
| Role E2E journeys | READY | customer, courier, merchant and admin suites exist | Re-run after every control-plane phase. |
| Payment failure matrix | READY locally | 207 payment/security/recovery assertions in the latest baseline | Stripe test-mode/provider evidence is still required. |
| Feature-flag test matrix | MISSING | no central flag engine | Must cover dependencies, rollout, stale config, kill switches and active orders. |
| Failure injection | PARTIAL | payment chaos and offline/recovery tests | Extend to notifications, maps, partner webhooks, DB latency and job replay. |
| Automated quality/security/financial gates | PARTIAL | rich scripts exist but are not one release manifest | Add a deterministic release-candidate command and evidence bundle. |
| Configuration versioning/validation | MISSING | generic config upsert accepts arbitrary JSON/string values | Replace high-risk settings with schemas, versions, optimistic concurrency and rollback. |
| Merchant/courier settlement | PARTIAL | internal payouts, statements and ledger exist | Stripe Connect v2 recipient onboarding/capability checks and provider payouts are absent. |
| Order timeline/proofs/unavailable flows | READY | status history, proof and failed-delivery migrations/routes/tests | Retention and dispute runbooks remain operational evidence. |
| Cancellation/refund policy engine | PARTIAL | secure endpoints and calculations exist | Centralize versioned policy configuration and explain decisions in admin/support. |
| Analytics events | PARTIAL | analytics routes/events and privacy hardening exist | Document schema/versioning and keep analytics non-blocking. |
| Webhook outbox | MISSING | provider webhook receivers exist | Add signed outbound event outbox with idempotency, retry, replay and delivery audit. |
| Order snapshots | PARTIAL | financial documents and item configuration preserve important facts | Add explicit policy/config/merchant snapshot versions to every accepted order. |
| Currency/timezone safety | PARTIAL | integer cents ledger, EUR checks, Berlin hours tests | Remove remaining decimal-money paths and document DST policy across all schedulers. |
| Soft-delete/archive/data quality | PARTIAL | selected status/retention patterns exist | Apply consistent lifecycle contracts and admin repair tooling. |
| Regulated/age-restricted commerce | FEATURE-FLAG READY | legal product fields and pharmacy surface exist | Keep disabled until merchant licensing, age verification and German legal approval. |

## First safe implementation sequence

1. **P0 Control plane:** typed feature flags, dependencies, rollouts, kill switches, partial maintenance, configuration versions and active-order protection.
2. **P0 real startup:** one boot coordinator and one branded loader driven by real required/degradable tasks; remove fake uptime/progress semantics.
3. **P0/P1 financial provider boundary:** document marketplace merchant-of-record decision; move toward Stripe Connect Accounts v2 in test mode only; keep provider payouts disabled until capability and reconciliation proofs pass.
4. **P1 merchant abstraction:** introduce compatibility views/columns and fulfillment locations without breaking `restaurant_id` consumers; migrate verticals incrementally behind flags.
5. **P1 resilience:** unified incident center, generic circuit-breaker states and signed webhook outbox.
6. **P1 brand closure:** official asset manifest, living backgrounds and role-by-role visual acceptance.
7. **Release candidate gate:** run application, database security, provider test-mode, failure, performance, accessibility and visual matrices; generate evidence without production deployment.

## Immediate acceptance criteria for Phase 1

- flags are typed and evaluated on the server; clients cannot override them;
- high-risk changes are audited and versioned;
- flag dependencies fail closed;
- global and domain kill switches can block new writes while active orders remain trackable and completable;
- stale/unavailable configuration has a documented safe default;
- checkout/payment, dispatch and notification write entry points demonstrate enforcement;
- a permanent test matrix proves dependencies, rollout stability, emergency freeze and active-order protection;
- TypeScript, focused lint, build, route integrity, customer, merchant, courier, admin and financial tests remain green.

## External blockers that code must not misrepresent

- Stripe and Resend test/provider acceptance evidence;
- production Google Maps configuration and load evidence;
- registered-company and merchant-of-record decisions;
- German/EU legal, BFSG, TDDDG, DSA and GDPR/DPIA approvals;
- production monitoring, on-call, backup restore and rollback drills.

These remain explicit release gates; BlinkGo must not be labelled globally production-ready until they are proven.

## Phase 1 implementation checkpoint — 2026-08-20

- Central control plane is now implemented with 16 typed server-owned flags: 6 kill switches, 3 write surfaces and 7 product capabilities. The staging database contains 16 matching initial version records.
- Browser roles (`anon` and `authenticated`) have no direct grants on either control-plane table. `service_role` is the only application database role with table access; RLS remains enabled as defence in depth.
- Flag changes use optimistic versions, mandatory reasons, audit events, dependencies, stable percentage rollout, role/city/user scope and active-order policies. Checkout, cash/Stripe selection, order creation, pickup, group orders and dispatch acceptance now enforce the server decision.
- Permanent flag acceptance passes 7/7. Route integrity covers 108 pages and 521 references; API safety covers 190 route files. Payment flow/security/reliability remain green at 207/207 after the control-plane enforcement.
- The fake startup dots were replaced with a real weighted boot coordinator covering preferences/fonts, same-origin connectivity, authenticated session restoration, platform/database readiness and critical brand assets. It has bounded timeouts, retry, non-trapping degraded continuation and reduced-motion handling.
- Official supplied artwork is now represented by pixel-preserving full, compact and loader-rider crops; the complete reference board is not shipped or rendered as application content. The canonical logo component supplies the compact official lockup to shared customer, courier, merchant and admin headers.
- Current validation: TypeScript passes, focused ESLint has zero findings, brand identity contract passes and runtime asset audit passes across 847 source files.
- Supabase advisor status for the new control-plane tables: no unindexed foreign-key finding remains. `RLS Enabled No Policy` is an intentional informational result because browser grants are revoked and access is server-only; unused-index notices are expected before operational history accumulates.
