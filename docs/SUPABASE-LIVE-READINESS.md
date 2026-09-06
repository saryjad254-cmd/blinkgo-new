# BlinkGo Supabase live-readiness audit

Audit date: 2026-08-11  
Project: `blink go` (`eu-central-1`)  
Method: read-only Supabase Management/MCP queries. No production mutations were made.

## Staging implementation status

An isolated free Supabase project was created after owner approval:

- project: `blinkgo-staging`;
- reference: `egjehqoilbjvzgbnksds`;
- region: `eu-central-1`;
- production data copied: none;
- current application `.env.local` changed: no;
- staging settings file: `.env.staging.local` (git-ignored; server secret present locally only).

The staging schema now covers every literal public table/view referenced by the
application. Historical migrations were applied selectively and repaired where
they contained invalid PostgreSQL, obsolete enum roles, unsafe fixed accounts,
or assumptions that contradicted the current application contract. The staging
Security Advisor now reports only two intentional warnings: the authenticated
`auth_role()` helper and admin-only `approve_product_request(...)`; both enforce
identity/role checks internally. TypeScript, lint (zero errors), production
build, authorization-source, driver verification and merchant-verification
checks pass.

Real staging Auth/API verification also passes. It creates and signs in all six
canonical roles (`customer`, `driver`, `restaurant`, `manager`, `admin`, and
`super_admin`), verifies the Auth-to-profile synchronization contract, confirms
that an editable `user_metadata` privilege-escalation attempt falls back to
`customer`, and deletes all temporary identities afterward. BlinkGo roles now
use the server-managed `app_metadata.app_role` claim because Supabase reserves
`app_metadata.role` for its PostgreSQL JWT role.

The Performance Advisor previously reported 46 foreign keys without covering
indexes. All 46 are now covered in staging and the follow-up advisor reports
zero unindexed foreign keys. Remaining performance notices are advisory tuning
items (for example unused-index and RLS-plan suggestions), not failed gates.

## Executive status

The local development server now runs against the isolated `blinkgo-staging`
Supabase project through `.env.staging.local`; production remains unchanged.
Real customer, driver, restaurant and admin identities, RLS boundaries, catalog,
address, live order and role dashboards have been verified end to end. The
production project is still not approved for a deployment switch because its
legacy data/security reconciliation and the German legal launch evidence remain
open gates.

Do not replace production environment variables until all rollout gates pass.

## Current cloud evidence

> 2026-08-31 update: automated-test accounts on `test.com`, `example.com`,
> `example`, and `blinkgo-test.de` were removed with their linked synthetic
> orders/earnings/refunds after relational scope checks. Production now has 170
> Auth users, 195 public profiles, 629 orders, one driver, and 25 deliberately
> preserved orphan `blinkgo.de` profiles. The schema remains at 44 public base
> tables and still requires the reviewed forward-only production upgrade.

The exact current signature comparison is recorded in
`deploy/PRODUCTION-SCHEMA-UPGRADE.md`: staging has 121 public base tables,
production is missing 80 of them, three production-only legacy tables must be
preserved, and 26 shared tables have different column contracts. This is a P0
deployment blocker until the exact hosted staging ledger has been replayed and
validated on a production-derived development branch.

- 44 public base tables; RLS is enabled on all 44.
- 170 Auth users and 195 `public.users` rows after guarded test-artifact cleanup.
- 25 deliberately preserved orphan `blinkgo.de` profiles require human review.
- 629 orders, one driver record and five restaurant records.
- Four Storage buckets and eight tables in the Realtime publication.
- No Edge Functions are deployed.
- The Supabase migration history is empty even though the schema is substantial.

These row counts are operational diagnostics only. No personal fields were queried or copied.

## Blocking compatibility gaps

The application references substantially more relations than the remote project currently exposes. Missing relations include current features for:

- driver document verification;
- merchant verification and cookie-consent audit evidence;
- system settings and announcements;
- admin integrations, webhooks and automations;
- product approval requests;
- data-subject requests and security/audit records;
- search analytics, loyalty and referral flows.

The repository currently has two migration sources:

- `deploy/supabase/*.sql`: manually ordered legacy scripts;
- `supabase/migrations/*.sql`: the current repository migration series.

A forward-only compatibility migration must be tested against a
production-derived development branch before production. The exact validated
staging SQL also remains available in the hosted migration ledger. The legacy
scripts must not be bulk-applied blindly.

## Confirmed security findings

1. `public.v_duplicate_refund_requests` and `public.v_stuck_cancel_refunds` are security-definer views and are selectable by both `anon` and `authenticated`.
2. `public.drivers` and `public.driver_working_hours` have RLS enabled but no policies.
3. All 44 public tables currently have `SELECT` table privileges for `anon` and `authenticated`; RLS is therefore the only row boundary.
4. 42 of 52 public functions are executable by `anon`.
5. 25 public functions are `SECURITY DEFINER`.
6. All 52 public functions were reported with a mutable `search_path`.
7. Several policies target `PUBLIC` and use legacy or ineffective role checks such as `auth.role() = 'admin'`.
8. Some UPDATE policies lack ownership-preserving `WITH CHECK` predicates.
9. Storage buckets do not currently restrict allowed MIME types.
10. The cloud migration ledger is empty, so deployment drift cannot be detected reliably.

## Safe rollout gates

1. Create an isolated schema-only staging environment after explicit approval. (Complete.)
2. Generate and apply reviewed, forward-only compatibility migrations to staging. (Complete.)
3. Add explicit Data API grants and RLS policies for every new exposed table. (Complete in staging.)
4. Revoke public access to internal finance views and non-client RPC functions. (Complete in staging.)
5. Set immutable `search_path` values and review every security-definer function. (Complete in staging; two intentional advisor warnings documented.)
6. Reconcile Auth/profile orphans without deleting any account automatically.
7. Configure private Storage buckets with MIME and size limits.
8. Verify Realtime publication membership matches the subscribed application tables.
9. Run customer, driver, restaurant and admin E2E tests against staging. (Complete for authentication, role routing, catalog/cart/address, driver live order, restaurant operations and admin live overview.)
10. Run Supabase Security and Performance Advisors with no unresolved high-risk findings. (Complete for current staging scope.)
11. Apply the same reviewed migrations to production, then switch deployment environment variables.

## Key handling

- Browser: use a Supabase publishable key.
- Server: use a separately rotatable Supabase secret key.
- Never paste a secret/service-role key into chat, source files or browser code.
- The existing local test keys must not be reused for cloud production.
- The staging secret was exposed in conversation history during setup and must
  be rotated in Supabase before the staging environment is shared or deployed.
- The temporary Google Maps browser key was also exposed in conversation
  history. It is stored only in the gitignored staging environment and must be
  replaced with a key restricted to the final BlinkGo domains and required APIs
  before deployment.

## Verified staging business journey (2026-08-11)

- `npm run test:staging-business`: passes with deterministic Wesseling zone,
  restaurant, products, customer address, approved driver documents, live
  driver status and a delivering order.
- `npm run test:staging-app-api`: passes bearer authentication and owned-address
  API access through BlinkGo's security middleware.
- Driver dashboard: real online dispatch status, active order, route distance,
  ETA, payout and normalized customer address render without console errors.
- Restaurant dashboard: real restaurant identity, open/accepting state, rating,
  product count and order totals render without console errors.
- Admin dashboard: `/admin` now resolves to the live overview and shows four
  role accounts, one active restaurant, one online driver and the active order.
- Responsive Arabic mobile visual audits now pass for all 12 driver routes,
  all 13 restaurant routes (including a real product edit route), and all 36
  admin routes (including a real order detail route).
- Admin Live Ops now reads canonical `orders`, `driver_status`, `users`, and
  `restaurants` fields directly and in parallel. Its keyless OpenStreetMap base
  layer avoids a broken dashboard when a Google Maps Embed entitlement is not
  configured, while BlinkGo live markers remain data-driven.
- Admin referrals now read through a server-only service client and join
  referrers explicitly because the deployed referrals table has no declared
  PostgREST relationship. Reward totals use the canonical `reward_value` field.
- Search analytics initial rendering now reads Supabase directly instead of
  making five recursive HTTP calls back into the same Next.js server.
- The staging admin identity has the narrowly scoped `payment_support`
  permission so the protected recovery queue can be exercised without
  weakening the production authorization rule.
- TypeScript, focused ESLint (zero errors) and the Next.js production build pass.
- Critical session verification now retries only transient provider/network
  failures, preventing short Supabase interruptions from immediately ejecting
  an authenticated user.

## Isolated acceptance evidence (2026-08-11)

- The local acceptance harness now runs beside staging with an independent
  `.next-test` build directory, so destructive fixture resets can never target
  the cloud staging database.
- Comprehensive functional/performance suite: 190/190 assertions pass across
  customer (43), driver (23), restaurant (22), admin (72), edge cases (20),
  and performance (10).
- Security penetration suite: 31/31 assertions pass, covering headers, CSRF,
  authorization, unauthenticated access, open redirects, SSRF, JWT forgery,
  input handling, body limits, and login rate limiting.
- Admin integrations browser suite: 19/19 interactions pass on the real mobile
  interface, including privacy consent, webhook create/edit/test/history/delete,
  automation create/edit/toggle/delete, Arabic rendering, mobile/desktop
  overflow, and browser runtime errors.
- Portal notification interactions pass 10/10, automation limiter tests pass
  6/6, and push-provider JWT regression tests pass 2/2.
- The mock Auth contract now mirrors production trust boundaries: roles and the
  narrowly scoped `payment_support` permission are delivered only through
  server-managed `app_metadata`, never editable `user_metadata`.
- Admin restaurant creation acceptance data now exercises the full German
  trader-verification contract and persists a pending verification record;
  the test no longer bypasses legal onboarding requirements.
- Source-secret regression scan added on 2026-08-12. It rejects production-
  shaped Google, Supabase, Stripe, GitHub, AWS and private-key material while
  reporting filenames and line numbers without printing secret values.
- Legacy certification evidence was redacted and synthetic mock credentials
  were changed so they cannot be mistaken for deployable Supabase keys.
- `npm run test:secrets`, the 4/4 post-login role-flow regression, TypeScript,
  and ESLint all pass. ESLint reports legacy warnings but zero errors and no
  longer scans the isolated `.next-test` build output.

## Google Maps staging evidence (2026-08-12)

- The temporary staging key successfully resolves a real Wesseling geocoding
  request without logging or persisting the credential in source files.
- Driver order maps now use the shared Google Maps loader; the duplicate
  component-local script injector was removed to prevent races and duplicate
  billing/runtime initialization.
- Loader timeout, network failure, callback and retry paths clean up timers and
  retain the bundled OpenStreetMap fallback.
- `npm run test:staging-maps` passes against the live staging driver order with
  Google selected, one script element, three readable map-legend labels and
  zero browser runtime errors.
- Mobile visual review caught and fixed white-on-white legend labels. The
  legend is now keyboard/screen-reader discoverable as a named list.
- Focused React/ESLint, TypeScript, source-secret scan and the isolated Next.js
  production build all pass after the map consolidation.

## Browser Push staging evidence (2026-08-12)

- A staging-only VAPID key pair is stored exclusively in the gitignored staging
  environment. The public key is cryptographically derived from the private key
  and the sender subject uses the BlinkGo development address.
- `npm run test:staging-push` builds a signed, encrypted Web Push request without
  transmitting it. Provider JWT regressions remain 2/2.
- The service-worker regression proves that an existing BlinkGo order window is
  focused, external notification URLs are replaced with `/notifications`, and a
  push event displays exactly one notification.
- Customer opt-in now handles pre-granted permission without hiding an absent
  subscription, prevents double submission, reuses an existing subscription,
  localizes denial guidance and the close label, and provides 44px focusable
  controls. Headless Chrome cannot register with its external push service, and
  the tested UI correctly remains open with an error instead of claiming success.
- Role-aware idle prefetching replaces the previous global list that requested
  admin, driver and restaurant pages during a customer session. Public/auth
  pages prefetch nothing; each operational portal warms only its own routes.
- Push, service-worker, prefetch-policy, TypeScript, focused ESLint, static
  accessibility and static interaction tests pass after these changes.

## Cost gate

The attempted preview branch was not created and incurred no charge because the
organization is on Supabase Free, where branching requires Pro. The approved
replacement is the separate free `blinkgo-staging` project described above.

## Payment hardening evidence (2026-08-12)

- Checkout now fails closed when the immutable PaymentIntent binding cannot be
  persisted or verified. No client secret is returned, and the orphan intent is
  queued for reconciliation.
- Binding retries accept an existing row only when draft, customer, restaurant,
  amount, currency, environment and livemode all match exactly.
- Mock PaymentIntent creation now mirrors Stripe idempotency deterministically;
  50 concurrent checkout requests return one identical PaymentIntent.
- Draft state is revalidated after the full read, preventing reuse after a
  webhook has burned the draft or created the order.
- Recovery-queue `payment_support` authorization executes before body parsing,
  eliminating validation responses as an authorization side channel.
- Webhook verification accepts any valid `v1` entry in a Stripe rotation header
  while retaining timestamp-window and constant-time signature validation.
- Refund operations wait for a short bounded per-order lock and recompute the
  refundable balance inside the critical section. Two valid concurrent partial
  refunds serialize successfully; a pair exceeding the remaining balance
  produces one success and one safe rejection.
- Isolated acceptance results: payment flow 79/79, payment security 69/69,
  reliability/reconciliation 60/60, full/partial refund operations 73/73,
  financial chaos/resilience 57/57, and infrastructure/observability 40/40.
  The suites include replay, out-of-order webhooks, 3DS, cross-user access,
  binding mismatch, key rotation, browser refresh, multiple devices, recovery,
  idempotency and concurrency scenarios.
- These results use mock/test payment infrastructure only. Live Stripe test keys,
  a registered webhook endpoint and Stripe CLI/provider verification remain a
  required external gate before a deployable payment environment can be claimed.

## Transactional email hardening (2026-08-12)

- Verification codes, password resets, magic links, automation messages and
  legal alerts now share the same provider router and `blinkgo.de` sender
  configuration instead of separate direct Resend clients.
- German, Arabic RTL and English OTP/reset templates are UTF-8 clean and escape
  user-controlled names, links, restaurant names, addresses and receipt items.
- Transactional sends use hashed provider idempotency keys. Action links accept
  only the configured application origin, and invalid recipients are rejected
  before the provider request.
- Magic-link tokens are no longer written to logs when email is unavailable.
  Password-reset links are sent only after their server-side token was durably
  stored.
- `71-email-delivery.sql` and the signed `/api/webhooks/resend` endpoint record
  only keyed recipient hashes. Bounce, complaint, failed and provider-suppressed
  events populate a service-only suppression list checked before future sends.
- GDPR requests use `72-data-subject-requests.sql`; request PII is no longer
  copied into application logs, and the endpoint returns an honest 503 if the
  durable record cannot be written.
- Email security regression: 15/15, TypeScript: pass, focused ESLint: zero
  errors, source-secret scan: pass, isolated production build: pass.
- External gate: apply migrations 71/72 to staging, provision a Resend key,
  verify SPF/DKIM for `blinkgo.de`, set `EMAIL_FROM` and
  `RESEND_WEBHOOK_SECRET`, then verify a real provider delivery and bounce.
