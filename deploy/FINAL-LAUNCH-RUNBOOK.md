# BlinkGo final production launch gate

Last verified: 2026-08-31. This runbook intentionally contains no secret
values. Do not deploy until the owner explicitly authorizes production
deployment.

## Current verified state

- Local production build passes.
- Core suite passes 202/202; payment suite passes 378/378; visual suite passes
  606/606.
- The real staging launch lifecycle passes 49/49 assertions through four
  independent authenticated roles: customer checkout and idempotency,
  restaurant confirmation/preparation/readiness, driver assignment/pickup/PIN
  delivery, and final customer/restaurant/driver/admin visibility.
- Nine live staging RLS smoke suites pass after the authorization-profile
  hardening. The staging Auth regression also passes seven role/login cases
  with complete temporary-identity cleanup.
- Public-catalog hardening now hides unverified/hidden/inactive restaurants,
  future/expired/deleted/exhausted coupons and raw legacy review identifiers.
  Its live negative test passes, and the full 49-assertion launch lifecycle
  still passes after the change.
- Staging Auth acceptance passes 16/16, including customer signup, password
  recovery, driver invitation, restaurant invitation and callback verification.
- Eight branded German Supabase Auth templates are installed and verified in
  staging project `egjehqoilbjvzgbnksds`.
- Production driver RLS drift was repaired through migration
  `restore_driver_rls_policies_20260831`; the security advisor no longer reports
  policy-less driver tables.
- The remaining Supabase security warning is leaked-password protection being
  disabled. Supabase documents this feature as Pro-only; enable it after the
  production project is upgraded, or record an explicit launch-risk decision.
- Production migration `74-production-performance-advisor-closure.sql` closes
  the five Auth RLS init-plan findings caused by the repaired driver policies
  and adds the 16 missing foreign-key indexes reported by the advisor.
- The production/staging signature comparison is now exact: 44 versus 121
  public base tables, 80 missing production tables, three preserved
  production-only legacy tables, and 26 changed shared table contracts. The
  reviewed branch-only reconciliation procedure is in
  `deploy/PRODUCTION-SCHEMA-UPGRADE.md`.
- Cron workers for retail replacement refunds, scheduled orders and draft
  cleanup now fail closed when `CRON_SECRET` is absent, reject every query
  parameter, and compare bearer tokens in constant time. The focused contract
  passes 12/12 and live local probes return 401 without auth and 400 for a
  query-string secret on all three routes.
- All eight HTTP cron workers now have an explicit deployment schedule and a
  Vercel-compatible GET handler. Payment reconciliation runs every 15 minutes
  and expired draft cleanup hourly; both were previously unscheduled. The
  scheduler contract passes with 8 routes and 8 schedules.
- Normal authentication redirects and missing-session control flow are now
  opt-in diagnostics (`LOG_OAUTH_TRACE=true`) instead of production error-log
  noise; genuine auth failures remain on the error channel. The observability
  contract passes 5/5, and the current local `/api/build-info` returns HTTP 200.
- Production readiness now fails closed unless BlinkGo HTTPS hosts and origins,
  live Stripe credentials, separate restricted Maps keys, Resend, VAPID, all
  security secrets and six German/EU approval records are complete. Its focused
  gate passes 10/10; bundle exposure, legal and type contracts also pass.
- Structured logging now redacts sensitive content inside free-text error
  messages in addition to sensitive field names, including email addresses,
  bearer/JWT values, provider secrets and token-bearing URLs. The executable
  redaction regression passes.
- A live production grants/policy audit found launch-blocking legacy RLS
  exposures that are absent from the tested staging flow: authenticated users
  can mutate protected columns of their own `public.users` row; payments,
  tracking events and raw ratings are cross-user readable; a customer can
  self-provision `driver_status` or a restaurant; restaurant users can read all
  driver profiles; and drivers can update privileged profile fields. The
  forward-only repairs are tracked in migrations `20260831122957`,
  `20260831124921`, `20260831125502`, `20260831150000` and `20260831151500`, plus
  `deploy/supabase/75-production-sensitive-read-rls-repair.sql`. None has been
  applied to production pending the production-derived branch gate.

## External gates before deployment

1. **Production SMTP** — in Supabase project `rhdaffhlrglyknxtucux`, the custom
   SMTP toggle and all non-secret Resend fields are prepared. The credential
   owner must enter the SMTP password and explicitly approve **Save changes**.
   The password must never be read back or committed to the repository.
2. **Vercel plan or scheduler** — project `blinkgo-new-gzap` is on Hobby while
   `vercel.json` contains one-minute and five-minute jobs. Hobby allows only
   once-daily schedules, so this exact configuration cannot be deployed there.
   Upgrade the team to Pro before launch, or explicitly approve migration of
   frequent jobs to a separately secured scheduler.
3. **Production environment** — populate every required server-only variable
   documented in `docs/PRODUCTION_ENVIRONMENT.md`. Use separate restricted
   Google Maps browser and server keys.
4. **Legal operator data** — provide the final registered-company and legal
   approval values required by the production legal gate. Do not publish
   placeholder legal data.

5. **Production schema branch** — approve the Supabase development branch cost
   of 0.01344 per hour, then run the ordered staging-ledger replay and complete
   acceptance on that production-derived branch. No direct production schema
   replay is permitted before the branch passes.

6. **Production legacy RLS P0** - the branch must prove that role mutation,
   customer self-provisioning of driver/restaurant authority, cross-user
   payment/tracking/rating reads, raw driver-profile exposure and privileged
  driver-profile mutation are denied before production migration approval. Do
  not launch against the current legacy grants/policies.
7. **Production public-catalog RLS P0** - production still contains broad
   `true` reads for coupons, products, variants, extras, restaurants and legacy
   reviews. The production-derived branch must replay and prove migrations
   `20260831134416`, `20260831135006` and `20260831135623`, including scheduled
   coupon compatibility and participant-only raw reviews, before approval.

## After SMTP is enabled

1. Install the eight exact subjects and full bodies from
   `supabase/templates/README.md` into Supabase -> Authentication -> Email
   Templates.
2. Reopen every template and verify the saved subject and full HTML.
3. Run the production Auth acceptance with cleanup enabled. Respect any
   `Retry-After` response and never loop on HTTP 429.

## Deployment approval sequence

Only after the owner explicitly says to deploy:

1. Link the reviewed workspace to Vercel project
   `prj_ghJf4Rz2tNOlfobF6EcEiIEKPeSS` in team
   `team_GGwq2Hi9HatWxq9O4iaZ7SRL`.
2. Confirm the plan/scheduler gate and environment contract before upload.
3. Deploy the reviewed workspace, not the stale GitHub checkout.
4. Promote only a deployment whose build and preflight gates pass.

## Mandatory post-deploy proof

- `https://blinkgo.de` redirects to the canonical HTTPS host.
- `/brand/blinkgo-email-logo.png` returns `200 image/png`.
- `/manifest.json` returns the BlinkGo PWA manifest.
- a random missing route returns HTTP 404.
- `/api/health/live`, `/api/health/ready`, and `/api/build-info` return 200.
- production Auth acceptance passes with zero unexplained 429 responses.
- a real test-mode order completes customer -> restaurant -> driver ->
  delivered -> admin exactly once.
- no P0 runtime errors appear in Vercel or Supabase after the proof run.

The currently deployed `www.blinkgo.de` is stale: the email-logo path and a
random missing route return HTML with HTTP 200, and `/api/build-info` returns
HTTP 500. Those observations prove that local readiness is not the same as a
successful production launch.
