-- ============================================================================
-- Phase 7G-A: Order UNIQUE on payment_intent_id
-- ============================================================================
-- Prevents duplicate orders from duplicate webhooks.
--
-- Rule R2: Every payment operation is idempotent.
-- Adding a UNIQUE constraint on payment_intent_id makes the order
-- creation race-safe at the database level. Even if two webhook
-- deliveries race to INSERT an order for the same payment_intent_id,
-- the second INSERT fails with a unique violation, and the application
-- catches it and returns the existing order.
-- ============================================================================

-- 1. Add new columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_event_id   TEXT,
  ADD COLUMN IF NOT EXISTS payment_status    TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'succeeded', 'failed', 'refunded'));

-- 2. Create UNIQUE index (partial — only for non-null payment_intent_id)
--    This is the core of duplicate-charge prevention.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_intent_id_unique
  ON public.orders(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- 3. Index for forensics
CREATE INDEX IF NOT EXISTS idx_orders_stripe_event_id
  ON public.orders(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON public.orders(payment_status);

-- 4. Comments
COMMENT ON COLUMN public.orders.payment_intent_id IS
  'Stripe PaymentIntent ID. UNIQUE — prevents duplicate orders from duplicate webhooks.';

COMMENT ON COLUMN public.orders.stripe_event_id IS
  'Stripe Event ID that triggered this order creation. For forensics.';

COMMENT ON COLUMN public.orders.payment_status IS
  'Payment status: pending | succeeded | failed | refunded';
