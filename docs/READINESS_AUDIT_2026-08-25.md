# BlinkGo technical readiness audit

Date: 2026-08-25  
Scope: local acceptance environment on `http://localhost:3100`

## Current verdict

The reviewed source is technically suitable for continued staging acceptance.
It is not yet approved for a public production launch because the operating
company data, provider production credentials and six external German/EU legal
reviews are not complete. The production readiness and legal gates intentionally
fail closed until that evidence exists.

## Corrections completed in this review

- Aligned payment history, refund requests, addresses, orders, restaurants,
  drivers and restaurant analytics with the deployed Supabase schema.
- Prevented concurrent pending refund requests from reserving zero cents and
  allowing the same payment to be over-refunded.
- Replaced the browser-side Google Routes request with the BlinkGo server routing
  endpoint. Provider quota or API failures now degrade to a safe route fallback
  without CSP violations or browser console errors.
- Preserved Google Maps attribution while expanding its mobile interaction area
  to the required 44 by 44 CSS pixels.
- Corrected restaurant order ownership to compare the authenticated owner with
  `restaurants.owner_id`, rejected unknown actor roles and constrained order
  status changes to the targets permitted for each role.
- Made the local acceptance reset isolate the demo customer and driver state,
  so active orders, driver availability and rate limits cannot leak between
  test suites.
- Removed every silent workflow-test skip, aligned the second driver fixture and
  performance tracking query with the current API contracts, and made driver
  arrival verification use the active order's real destination coordinates.
- Made visual and portal acceptance tests accept an explicit local base URL and
  made the visual runner able to verify dynamic routes directly.
- Replaced unsafe generic data shapes across customer, driver, restaurant and
  admin pages with explicit contracts, normalized Supabase relation arrays, and
  removed unreachable legacy admin creation UI. These four page scopes now lint
  with zero errors and zero warnings.
- Kept the driver privacy control accessible without covering live-map offer or
  safety controls, while preserving opt-in consent and keyboard operation.

## Verification evidence

| Gate | Result |
| --- | --- |
| TypeScript | PASS |
| ESLint | PASS with 0 errors; customer/driver/restaurant/admin page scopes have 0 warnings; 441 legacy API/shared-component warnings remain non-blocking debt |
| Next.js 16.3 production build | PASS |
| Schema and ownership contracts | PASS, 69/69 |
| Security penetration suite | PASS, 31/31 |
| Authorization-source checks | PASS, 6/6 |
| Role routing | PASS, 9 cases |
| API source safety | PASS, 191 files |
| Security middleware regression | PASS, 12 protected routes |
| Route integrity | PASS, 108 pages and 528 navigation references |
| Static accessibility | PASS, 381 TSX files |
| Portal keyboard accessibility | PASS, 14/14 |
| Static interaction audit | PASS, 381 TSX files |
| Customer workflow | PASS, 43/43 |
| Driver workflow | PASS, 25/25 |
| Restaurant workflow | PASS, 22/22 |
| Administration workflow | PASS, 83/83 |
| Post-refactor live regression | PASS, 198/198 (customer 43, driver cockpit 55, restaurant orders 17, administration 83) |
| Comprehensive isolated workflow run | PASS, 203/203 with no skipped cases |
| Edge cases | PASS, 20/20 |
| Local performance suite | PASS, 10/10 |
| Refund workflow | PASS, 73/73 |
| German readiness contract | PASS, 9/9 |
| Regulated product information contract | PASS, 10/10 |
| Tracked-source secret scan | PASS |

The full responsive visual audit visited 612 combinations across 101 routes,
five roles, German/Arabic/English and mobile/desktop viewports. It initially
reported five failures, all caused by Google routing CSP/provider behavior and
one Google attribution touch target. After correction, every previously failing
tracking combination passed (6/6 direct route matrix), and the affected Arabic
mobile home route passed its direct regression check.

After the page-contract and consent-layout refactor, a focused visual regression
also passed 24/24 visits: customer profile, driver dashboard, restaurant orders
and admin dashboard, each in German, Arabic and English on mobile and desktop.

## Performance evidence

- Login p95: 102 ms; median: 67 ms.
- Search p95: 45 ms; median: 35 ms.
- Authenticated order tracking p95: 119 ms across 10/10 successful samples.
- Concurrent search: 10/10 successful.
- Concurrent GPS updates: 30/30 successful.
- Search throughput check: 52 requests/second with 50/50 successful requests.
- Bounded smoke load: 42.15 requests/second, 100% success, p95 235.5 ms.
- Cache regression: two reads caused one computation.
- Observability/rate-limit regression: PASS.

These local smoke results prove regression resistance, not internet-scale
capacity. A production-like staging environment still needs baseline/peak tests,
database pool monitoring, restore drills and alert verification before launch.

## External launch gates

1. Register the operating company and replace every legal placeholder with the
   final legal name, address, representation, register and tax information.
2. Obtain and record German counsel approval for the overall legal package,
   BFSG accessibility, TDDDG consent, DSA trader verification, checkout/pricing
   and the privacy DPIA for continuous location and profiling.
3. Rotate every provider key shared during development and restrict replacement
   keys by origin, API, environment, quota and least privilege.
4. Configure Stripe test acceptance and signed webhooks, then separate live
   credentials only after provider acceptance.
5. Verify `blinkgo.de` for transactional email and configure SPF, DKIM, DMARC,
   delivery webhooks, bounce handling and complaint handling.
6. Configure production VAPID credentials, monitoring tokens, alerts, backups,
   rollback and incident runbooks.
7. Enable Supabase leaked-password protection and close remaining database
   performance-advisor findings before the production-scale load drill.

## Release rule

Do not label or deploy this build as production-ready until every external gate
above has authoritative evidence. Continue using the local/staging environment
for design, workflow and provider-test acceptance in the meantime.
