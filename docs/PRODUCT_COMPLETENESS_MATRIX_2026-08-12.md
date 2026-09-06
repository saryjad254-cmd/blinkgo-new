# BlinkGo product completeness matrix

Date: 2026-08-12  
Launch market: Germany  
Reference: current delivery-marketplace operating patterns, including Wolt's public product and developer documentation. BlinkGo must implement the underlying user need independently; it must not copy Wolt branding, assets, text, or distinctive layouts.

## Status and release rules

- **Complete**: a real UI, authorized backend, persistent data, error/loading/empty states, and an automated acceptance test exist.
- **Partial**: some layers exist, but the feature is not safe to market as complete.
- **Missing**: the customer or operator cannot complete the job end to end.
- **P0**: required before public launch. **P1**: required for a strong first commercial release. **P2**: post-launch growth.
- A visible control without a working backend is a defect, not a feature.

## Customer experience

| Area | Smallest important details | Current evidence | Status | Priority | Acceptance gate |
|---|---|---|---|---|---|
| Entry, address and serviceability | German default, AR RTL/EN switch, saved address, map pin, postal code, zone check, explicit out-of-zone explanation | `/welcome`, `/login`, `/home`, `/addresses`, `/api/zone/check` | Complete | P0 | Keyboard/mobile/RTL test plus valid and invalid German address |
| Three storefronts | Separate restaurant, market and general-product discovery; shared cart rules; category/search/filter/sort; location-aware availability | `/restaurants`, `/market`, `/shop`, `/search` | Complete | P0 | Persistent disjoint inventories, live seller/product targets, radius messaging and cart validation verified by `test:storefronts` plus direct browser QA |
| Restaurant/store page | Hero, open/closed/busy state, ETA, fee/minimum, categories, sticky cart, favorites, product availability | `/restaurants/[id]`, `/api/restaurants/[id]`, `/api/products/by-restaurant` | Complete | P0 | Open, closed, paused, empty menu and failed-network states |
| Product facts | Image, name, price/VAT, unit and base price where applicable, ingredients, allergens/additives, nutrition, origin, alcohol/age restriction, modifier constraints | Category-aware legal data model, merchant editor, derived unit price/completeness, customer pre-purchase disclosure and server checkout gate implemented | Complete technically | P0 | Contract 10/10; counsel/category owner must still review real catalog content before launch |
| Cart integrity | Server quote, per-line configuration identity, quantities, notes, fees, minimum, delivery zone, unavailable-item recovery | `/cart`, `/api/cart/quote`, deterministic config keys | Complete | P0 | Price tampering, stale item, wrong restaurant and concurrency tests pass |
| Coupons and loyalty | Validate server-side, usage limits, restaurant scope, persistence into checkout, atomic redemption | Coupon/loyalty APIs; shared cart persistence | Complete | P0 | Refresh and cart-to-checkout preserve valid code; races cannot double redeem |
| Scheduled order | ASAP/scheduled toggle, 30-minute lead, maximum 2 days in UI/API, restaurant open at selected time, signed draft persistence, payment/recovery persistence | Cart picker, checkout draft, scheduled cron | Complete | P0 | Past/too-soon/too-far/closed-at-time blocked before payment; paid order keeps timestamp |
| Delivery preferences | Contactless delivery, door/floor/bell notes, recipient details, safe instruction limits | Structured DE/EN/AR cart controls; signed checkout draft; service-only `order_delivery_preferences`; atomic capture/strip trigger; assigned-driver dashboard/detail/accept response; XSS and length sanitation | Complete | P0 | `npm run test:delivery-preferences` PASS 15/15; general order address and pre-accept offer queries do not expose private handoff data |
| Grocery substitutions | Per-item “best substitute / contact me / refund”, unavailable-item proposal, price-difference consent | Preference persists end to end; retail merchant proposes only equal/cheaper products; customer has a 10-minute accept/reject decision; expiry defaults to refund; atomic item update and auditable cash/Stripe credit queue exist | Complete | P0 | Merchant proposes replacement; customer accepts/rejects; final capture/refund is correct |
| Pickup/takeaway | Delivery/pickup choice, no delivery address/fee, pickup ETA, “ready” notification, pickup confirmation | Complete end-to-end: customer selector and checkout, signed immutable draft, addressless zero-fee order, six-digit handover code, merchant five-stage workflow and operational pickup settings/instructions, dispatch exclusion and DB constraints (`20260813115037_customer_pickup.sql`) | Complete | P1 | `npm run test:customer-pickup` PASS 9/9; browser-verified customer/merchant handover and settings save; delivery still requires address |
| Group order | Host invite link, participants add only their own validated lines, host locks/pays, members see completion reference, host opens full tracking | End-to-end BlinkGo Together flow, locked snapshot checkout protection, atomic/idempotent completion | Complete (QR/guest map remain enhancement) | P2 | Automated workflow 15/15: required options, concurrency, ownership, lock, anti-tamper draft, final order, member completion visibility |
| Checkout contract | Signed server draft, address, schedule, payment method, tip, coupon/points, full fee breakdown, legally unambiguous pay button | `/checkout`, draft signing, Stripe/cash flows | Complete | P0 | Duplicate clicks, expiry, price changes, payment failure/recovery all deterministic |
| Order history/detail | Status, receipt-like totals, items/modifiers, schedule, address, cancellation/refund eligibility, reorder | `/orders`, `/orders/[id]`, order APIs | Complete | P0 | Owner-only access and meaningful states for every lifecycle status |
| Live tracking | Timeline, ETA explanation, driver position, pickup/drop-off stages, driver card, support/share, stale-location state | `/orders/[id]/track`, tracking API, `/share/[token]` | Complete | P0 | Realtime/poll fallback, privacy, expired share link, network loss and delivered states |
| Support and resolution | Order-context chat/ticket, missing/wrong/damaged/late categories, photos where needed, refund status, emergency separation | Human reference; server-derived priority/SLA/next action; private 5 MB evidence; 112 separation; internal notes; customer-visible resolution | Complete | P0 | `npm run test:support-resolution` passes 27/27; owner isolation, signed evidence, internal-note privacy and immutable resolved state verified |
| Ratings and favorites | Restaurant/driver/order rating rules, one rating per order, favorites, feedback reason | Ratings/favorites APIs exist | Partial | P1 | Delivered owners only; duplicates blocked; moderation path available |
| Account and privacy | Profile, addresses, notifications, consent, export, deletion, legal links, session logout | Profile, consent, export/delete and German legal pages | Complete technically | P0 | German counsel fills company-specific legal data before launch |
| Accessibility and resilience | 44px targets, focus, screen reader names, reduced motion, contrast, skeleton/empty/error/offline, installable PWA | Static audit covers 375 TSX files; shared portal drawers are removed from the focus tree while hidden and provide focus entry/trap/restore, Escape and scroll lock; automated mobile keyboard gate passes 14/14 | Partial: manual AT audit remains | P0 | Manual NVDA/VoiceOver + keyboard + 320px/desktop + slow/offline audit |

## Courier experience

| Area | Smallest important details | Current evidence | Status | Priority | Acceptance gate |
|---|---|---|---|---|---|
| Onboarding and employment | Identity/right-to-work, contract, health insurance, tax ID, bank/IBAN, pension/social-security number, vehicle-specific documents, review/expiry/rejection reason | `/driver/documents`, admin document review, employment migration | Partial | P0 | Required set varies by contract/vehicle; encrypted storage; expiry reminders; audit log |
| Shift and online state | Scheduled working hours, go online/offline, verification gate, pause/end shift, connectivity/location permission | Dashboard, online and working-hours APIs | Partial | P0 | Cannot go online when ineligible; offline/network/location states are explained |
| Full-screen map | Current position, hotspots, offers, pickup/drop-off, recenter, route handoff, stale GPS, safe fallback | Driver live map and cockpit | Complete | P0 | Permission denied, weak GPS, offline, foreground/background and mobile tests |
| Transparent offer | Guaranteed earning, pickup/drop-off distance, total ETA, restaurant/area, item load where safe, accept/reject timer, no skip penalty | Offer ranking and transparency UI | Complete | P0 | Offer cannot expose full customer address before acceptance; race-safe claim |
| Pickup flow | Navigation, geofenced arrival, wait timer, restaurant issue, ready gate, pickup confirmation, release only before pickup | Arrival/pickup/issue/release flows | Complete | P0 | Server blocks wrong state, wrong driver, too-far arrival and late release |
| Drop-off flow | Navigation, arrival, contact options, contactless instructions, delivery PIN/photo proof, could-not-deliver flow | Geofenced arrival; hand-to-me PIN; private leave-at-door photo; two-attempt failure escalation; customer proof viewer | Complete | P0 | `npm run test:delivery-outcomes` passes 35/35; proofs expire after 30 days; retries cannot double-complete |
| Safety and support | Emergency 112 separation, incident categories, accident/safety flow, support with order context | Safety center/support | Partial | P0 | Emergency action is always reachable and does not pretend support replaces 112 |
| Earnings and payouts | Real-time totals, per-delivery breakdown, tips, adjustments, hours, payout periods/status, downloadable statement | Earnings/payout pages and APIs | Partial | P0 | Amounts reconcile with orders; immutable adjustment audit; failed payout recovery |
| Performance and fairness | No manipulative acceptance metric, objective signals, wait-time/late-order context, appeal path | Transparent ranking copy exists | Partial | P1 | Decisions can be explained and audited; no protected-characteristic inputs |

## Merchant experience

| Area | Smallest important details | Current evidence | Status | Priority | Acceptance gate |
|---|---|---|---|---|---|
| Onboarding and verification | Owner/company/tax/bank/contact/address, food-business documents, admin review, clear rejection/resubmit | Admin onboarding and verification | Partial | P0 | No venue can transact before required verification; every change audited |
| Operations dashboard | Online/offline/pause, order health, latest problem orders, sales, uptime, actionable alerts | Dashboard, busy/pause and operations APIs | Partial | P0 | Pause has duration/reason; auto-resume is visible; stale state cannot show online |
| Incoming order lifecycle | Loud/reliable alert, accept/reject with reason, prep promise, scheduled/preorder queue, start, ready, late warning | Kitchen/orders pages and preparation SLA | Complete | P0 | Realtime plus polling fallback; conflict/race and reconnect tests |
| Normal hours | Seven days, closed days, overnight periods, storefront/checkout enforcement | Settings form/API and shared hours utility | Complete | P0 | DST/Berlin timezone/overnight test coverage |
| Special and holiday hours | Date-specific closed/open periods, reason, future list, edit/delete, checkout enforcement | Owner-scoped API/RLS, settings form, Berlin-time overnight logic, checkout enforcement, 12 contract + 14 time-logic + 18 browser checks | Complete | P0 | A future holiday override supersedes weekly hours in discovery and checkout |
| Menu and inventory | Categories/items/modifiers, required/min/max, stock toggle, scheduled availability, bulk actions, images, drafts/approval | Menu pages, product governance and admin approval | Partial | P0 | Out-of-stock propagates immediately; destructive edits preserve paid-order history |
| Regulated item data | VAT, unit/base price, ingredients, allergens/additives, nutrition, origin, producer, storage/use, organic certificate, alcohol/age | Category-aware fields, explicit allergen review, automatic base price, alcohol age metadata and customer disclosure implemented; organic certification remains a dedicated follow-up | Complete except organic certification | P0 | Incomplete retail/alcohol records are blocked by quote and signed checkout draft |
| Substitution handling | Propose alternate item, quantity/price change, contact/refund preference, customer approval timeout | Retail-only ownership-gated API/RPC, one-open-proposal constraint, 10-minute consent UI, safe expiry, kitchen fulfillment state and financial adjustment/refund worker | Complete | P0 | No silent substitution; payment adjustment/refund is auditable |
| Campaigns | Free delivery/basket/item deals, eligibility, budget, schedule, admin policy, preview, pause | Admin promotions/coupons exist; merchant self-service absent | Partial | P1 | Merchant cannot exceed budget or discount invalid items; attribution report reconciles |
| Analytics | Sales/orders/AOV, conversion, cancellations/rejections, prep/wait times, item performance, customers, campaign ROI, export | Restaurant analytics API exists; portal depth incomplete | Partial | P1 | Timezone/currency correct; CSV totals reconcile with finance |
| Finance and invoices | Commission/fees/VAT, settlements, adjustments/refunds, payout status, downloadable invoice/statement | Immutable numbered customer receipts and merchant transaction statements, SHA-256 snapshots, owner-only downloads and audit logging implemented. Tax-invoice mode remains intentionally disabled until company/tax registration and accountant approval | Partial: operational documents complete | P0 | Workflow 11/11 and rendered A4 PDFs verified; true invoice/settlement needs registered issuer and ledger-backed payout evidence |
| Team and integrations | Staff roles, device/session list, POS/webhook health, test event, retry/dead-letter visibility | Webhook/integration APIs; merchant controls limited | Partial | P1 | Least privilege, secret rotation, idempotency and failure alerts |

## Administrator experience

| Area | Smallest important details | Current evidence | Status | Priority | Acceptance gate |
|---|---|---|---|---|---|
| Control center | Live orders/drivers/venues, SLA risks, payment/queue/system health, drill-down, safe refresh | Control center, live ops, map, system pages | Complete | P0 | One incident can be traced from customer to payment, venue and courier |
| Absolute catalog control | Create/edit/suspend/verify restaurants and drivers; create/edit/approve products; ownership/account setup | Onboarding and management APIs use Supabase one-time invitations, trusted role metadata and pending operational profiles; no administrator-selected password is accepted or returned | Complete | P0 | `test:secure-invitations` passes 6/6; direct browser creation succeeds without a password; activation page, build, API safety and security gates pass |
| Zones and pricing | Polygon/radius, fees/minimums/surge policy, effective dates, preview/test address, overlap detection | Persisted Supabase rules are the single source for zone check, cart quote and signed checkout draft; version/effective windows, geometry/overlap validation, bounded Berlin-time surge schedules, transparent customer fee breakdown, admin coordinate tester and accessible editor are implemented | Complete | P0 | `test:zone-pricing` passes 19/19 including a live server quote, `test:zone-surge` passes 11/11 including overnight/DST behavior, and `test:zone-ui` passes 10/10; draft records the exact rule/version and explicit base/surge amounts |
| Dispatch and exceptions | Manual assign/reassign, driver release, courier shortage, venue delay, failed delivery, escalation | Live ops, assignment, driver release, delay and failed-delivery APIs; direct assignment and the operations console now require a 5–500 character reason for reassign/cancel/pause/resume and persist it in the audit event | Partial: end-to-end exception console QA remains | P0 | `test:admin-overrides` passes 9/9; every privileged override rejects a missing reason before mutation and stores the supplied reason |
| Orders/refunds/recovery | Search/filter, timeline, partial/full refund, payment reconciliation, recovery queue, idempotency | Strong existing API/pages/tests | Complete | P0 | Refund/order/payment totals reconcile under retries and webhook disorder |
| Promotions and campaigns | Coupon/promo approval, budget/risk limits, attribution, abuse signals, merchant campaign review | Coupons/promotions pages | Partial | P1 | No negative totals, self-referral or uncontrolled repeated redemption |
| Support console | Unified tickets with customer/order/payment/driver/venue context, assignment, SLA, templates, attachments | Admin support foundation | Partial | P0 | Role-based PII reveal, audit log and retention rules |
| Finance | GMV/net revenue, commissions, VAT, merchant/courier payouts, failed transfers, statements | Integer-cent reconciliation dashboard; immutable balanced journals; idempotent cash/Stripe order, successful-refund, courier payout and merchant-settlement posting; admin settlement creation/payment controls; CSV operational export; exception/data-quality visibility. Finance tests 25/25; live Arabic UI and controls verified | Partial: ledger foundation complete | P0 | Apply hosted migration, backfill historical orders, and obtain accountant review for tax/VAT exports |
| Trust, privacy and security | Role/permission management, suspensions, audit, DSAR/export/deletion, consent, secret/integration status | Admins/users/audit/integrations/legal APIs | Partial | P0 | Least privilege, MFA for privileged users, session revocation, no secrets in UI/logs |
| Reliability and scale | Health/readiness, metrics, queues, retries, rate limits, alerting, backups/restore drill, load/error budgets | Health/metrics/cron/recovery infrastructure | Partial | P0 | Staging load test and restore drill with documented RTO/RPO before production |

## Two-week launch sequence

1. **Data correctness first**: complete scheduled-order contract, substitution preference model, special hours, regulated product data, merchant statements, and German company placeholders.
2. **Operational closure**: every order state must have a customer, merchant, courier and admin action or an explicit automated transition.
3. **Money closure**: reconcile quote → draft → payment → order → refund → payout; no UI-computed financial truth.
4. **Failure closure**: offline, retry, duplicate click, webhook replay/out-of-order, stale GPS, unavailable item, venue/driver shortage and service outage.
5. **Release gate**: production build, zero lint errors, critical automated journeys, mobile/desktop DE/AR/EN visual audit, keyboard/screen-reader pass, load/security/backup tests, and German lawyer/accountant review.

## Reference sources

- Wolt Order API lifecycle and order fields: https://developer.wolt.com/docs/api/order
- Wolt restaurant order types and scheduled-order horizon: https://developer.wolt.com/docs/orderrestaurantguide
- Wolt venue health, online state, regular and special opening times: https://developer.wolt.com/docs/venueguide
- Wolt Germany courier tools and employment context: https://explore.wolt.com/de/deu/couriers
- Wolt Germany merchant portal capabilities: https://explore.wolt.com/de/deu/merchant/blog/explore-your-new-merchant-portal
- Wolt merchant campaign reporting and invoice download: https://explore.wolt.com/de/deu/merchant/learning-center/interpret-marketing-campaign-results
- Wolt Germany retailer out-of-stock guidance: https://explore.wolt.com/de/deu/retailers/faq
- Supabase Row Level Security guidance: https://supabase.com/docs/guides/database/postgres/row-level-security
