# BlinkGo production schema upgrade gate

Last measured: 2026-08-31

This document is the authoritative gate for reconciling the current production
database with the application schema. It intentionally contains no credentials
or personal data.

## Verified drift

The comparison uses `information_schema.columns` for `public` base tables and
includes column type, nullability and default in each table signature.

- production project: `rhdaffhlrglyknxtucux`
- validated staging project: `egjehqoilbjvzgbnksds`
- production base tables: **44**
- staging base tables: **121**
- tables present in staging but absent in production: **80**
- legacy tables present only in production: **3**
- shared tables with a different column contract: **26**
- shared tables with the same column contract: **15**

Production-only legacy tables are `conversations`, `coupon_usage`, and
`messages`. They must be preserved during the forward migration until their
data has been explicitly reconciled.

The missing production relations cover launch-critical contracts including
addresses, driver locations and documents, order status history, idempotency
and job records, refunds, payment intents, wallets, audit/security records,
webhook delivery, feature flags, consent/legal acceptance and operational
settings. Deploying the current application against this schema is therefore a
P0 blocker.

The 26 changed shared tables are:

`categories`, `coupons`, `customer_addresses`, `delivery_zones`,
`driver_earnings`, `driver_status`, `driver_working_hours`, `drivers`,
`email_otps`, `favorites`, `notification_preferences`, `notifications`,
`order_items`, `order_tracking_events`, `orders`, `payments`,
`product_extras`, `product_variants`, `products`, `push_subscriptions`,
`ratings`, `restaurants`, `reviews`, `stripe_webhook_events`,
`support_tickets`, and `users`.

## Required safe sequence

The branch acceptance must include the final migrations
`20260831122957_enforce_principal_role_boundaries.sql`,
`20260831124921_remove_legacy_public_data_exposure.sql`,
`20260831125502_restrict_rating_participant_data.sql`,
`20260831150000_lock_down_users_role_mutation.sql` and
`20260831151500_allow_safe_users_profile_updates.sql`, plus
`20260831134416_restrict_public_catalog_visibility.sql`,
`20260831135006_correct_coupon_visibility_compatibility.sql` and
`20260831135623_allow_future_coupon_start_dates.sql`, followed by
`75-production-sensitive-read-rls-repair.sql` when the legacy production policy
names are still present. Real authenticated negative tests must cover protected
`users` fields, self-provisioned driver/restaurant authority, cross-user
payment/tracking/rating reads, driver-profile exposure and privileged profile
mutation. Catalog tests must also prove that unverified/hidden restaurants,
future/expired/deleted/exhausted coupons and raw non-participant reviews are
not visible, while an explicitly scheduled future coupon keeps its start date.

1. Create a Supabase development branch from production. Do not run the hosted
   staging migration ledger directly on production.
2. Replay the exact ordered SQL stored in
   `supabase_migrations.schema_migrations.statements` from the validated staging
   project onto the branch. Preserve production-only legacy tables during this
   pass.
3. Resolve every non-idempotent or production-shape conflict on the branch and
   commit the resulting forward-only compatibility SQL to this repository.
4. Verify on the branch:
   - all 121 required base-table contracts;
   - migration privilege and advisor-closure tests;
   - Security and Performance Advisors;
   - customer, restaurant, driver and admin RLS suites;
   - full order lifecycle, realtime/tracking and payment suites;
   - Auth invitation, signup and recovery regression;
   - production build, typecheck and lint errors = 0.
5. Take a fresh production backup and record row counts plus constraints for
   every table touched by the compatibility migration.
6. Apply only the reviewed forward-only compatibility migrations to production
   during a maintenance window. Never bulk-run the legacy `deploy/supabase`
   directory.
7. Repeat the schema-signature comparison and all production acceptance checks.
8. Remove a legacy table only in a separate later migration after its data has
   been migrated and verified. This production upgrade does not drop any of the
   three legacy tables.

## Hosted ledger safety scan

The validated staging ledger currently contains 127 migrations and 505,602
characters of SQL. It is the source of truth for the target schema, but it is not a
production-ready replay bundle:

- two historical migrations contain `DROP TABLE`;
- five contain row deletion statements;
- seven contain explicit transaction control;
- four add enum values;
- one configures or references an external scheduler.

The destructive migrations are `replace_legacy_referrals_shape` and
`current_order_lifecycle_contract`. They may be exercised only on the isolated
branch to identify compatibility requirements; they must be replaced by
forward-only table/data reconciliation before any production apply. Explicit
transaction wrappers, enum additions and scheduler SQL must likewise be
normalized in the final production migration series.

## Stop conditions

Stop before production mutation if the branch replay attempts to drop a legacy
table, rewrites real rows without a deterministic mapping, weakens RLS, exposes
an internal relation to `anon`/`authenticated`, disables an audit trigger, or
leaves any P0 acceptance test failing.

## Cost approval

Supabase reported the development-branch cost as **0.01344 per hour** for the
current organization. Creating the branch requires the owner's explicit cost
confirmation immediately before the branch API call.
