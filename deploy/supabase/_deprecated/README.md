# DEPRECATED Migrations (v83)

These migrations are **DEPRECATED and SHOULD NOT BE APPLIED TO PRODUCTION**.

## Why deprecated

When the v83 production schema was audited (July 2026), it was discovered that:

1. **`refunds` table** (created by migration 22-missing-features-v29.sql) was **never deployed to production**.
2. **`payments` table** is the migration-21 schema (`amount_cents`, `payment_method`, `payment_provider`, `provider_payment_id`), NOT the migration-19 schema.
3. The Stripe webhook code was reading `payments.stripe_payment_intent_id` (migration-19 column name), which doesn't exist in production.

## Files in this folder

### `54-refunds-unique-constraint.sql`

This migration:
- Created a partial unique index on `refunds(order_id)` — but `refunds` table doesn't exist.
- Defined `request_refund` RPC — works against the non-existent `refunds` table.

**Status:** INVALID. Will fail on production.

**v84 replacement:** `56-schema-reconcile.sql` defines `request_refund` to use the `payments` table instead.

### `55-cancel-with-refund-atomic.sql`

This migration:
- Extends the `enforce_order_transition` DB trigger to allow the `cancel_refund_pending` state.
- Adds the `cancel_refund_pending → cancelled/refunded` transitions.

**Status:** The trigger extension is mostly compatible with production, BUT the migration references the `refunds` table for the diagnostic view `v_duplicate_refunds`.

**v84 replacement:** `56-schema-reconcile.sql` re-defines `enforce_order_transition` (CREATE OR REPLACE — safe) and re-defines the diagnostic views to use the `payments` table.

## What to do

**DO NOT** apply 54 or 55.

**DO** apply `56-schema-reconcile.sql` instead. It is idempotent and works with the actual production schema.

## Code changes that depended on these migrations

The v83 code was written assuming these migrations would be applied. The v84 code fixes:

- `app/api/orders/[id]/refund/route.ts` — has RPC fallback that does a direct INSERT if `request_refund` RPC is missing.
- `app/api/admin/refunds/route.ts` — now uses the `payments` table (status='refund_requested' / 'refund_processing' / 'refund_succeeded' / 'refund_failed') for the refund workflow.
- `app/(customer)/payment-history/page.tsx` — falls back to `payments` if the `refunds` table is missing.
- `app/admin/refunds/page.tsx` — same.
- `app/api/stripe/webhook/route.ts` — still reads by `stripe_payment_intent_id`, but `56-schema-reconcile` adds this column to `payments` if it's missing.
- `app/api/stripe/create-payment-intent/route.ts` — now writes to BOTH `provider_payment_id` and `stripe_payment_intent_id` so the webhook can find the row.
