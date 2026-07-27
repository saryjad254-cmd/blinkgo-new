-- ════════════════════════════════════════════════════════════════
-- BlinkGo — Remaining Production Tables
-- ════════════════════════════════════════════════════════════════
-- Use this if you already applied 20260708_production_upgrade.sql
-- but some tables were skipped. Idempotent — safe to run multiple times.
--
-- Creates:
--   1. order_tracking_events — live driver location breadcrumbs
--   2. customer_addresses    — saved customer addresses
--   3. ratings               — order ratings/reviews
--   4. payments              — Stripe payment records
-- ════════════════════════════════════════════════════════════════

-- 1. order_tracking_events
CREATE TABLE IF NOT EXISTS order_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID,
  event_type TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_tracking_events_order_id 
  ON order_tracking_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_tracking_events_driver_id 
  ON order_tracking_events(driver_id);

ALTER TABLE order_tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracking_events_read" ON order_tracking_events;
CREATE POLICY "tracking_events_read" ON order_tracking_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tracking_events_insert_driver" ON order_tracking_events;
CREATE POLICY "tracking_events_insert_driver" ON order_tracking_events FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tracking_events_insert_service" ON order_tracking_events;
CREATE POLICY "tracking_events_insert_service" ON order_tracking_events FOR INSERT TO service_role WITH CHECK (true);

-- 2. customer_addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  label TEXT,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT,
  country TEXT DEFAULT 'Germany',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  floor TEXT,
  door TEXT,
  instructions TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id 
  ON customer_addresses(customer_id);

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_addresses_own" ON customer_addresses;
CREATE POLICY "customer_addresses_own" ON customer_addresses FOR ALL TO authenticated 
  USING (customer_id = auth.uid() OR auth.uid() IN (
    SELECT id FROM users WHERE role IN ('admin')
  ))
  WITH CHECK (customer_id = auth.uid());

-- 3. ratings
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  driver_id UUID,
  restaurant_id UUID,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ratings_order ON ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_ratings_driver ON ratings(driver_id);
CREATE INDEX IF NOT EXISTS idx_ratings_restaurant ON ratings(restaurant_id);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ratings_read" ON ratings;
CREATE POLICY "ratings_read" ON ratings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ratings_insert_customer" ON ratings;
CREATE POLICY "ratings_insert_customer" ON ratings FOR INSERT TO authenticated 
  WITH CHECK (customer_id = auth.uid() OR auth.uid() IN (
    SELECT id FROM users WHERE role IN ('admin')
  ));

-- 4. payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  payment_method TEXT NOT NULL,
  payment_provider TEXT,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_read" ON payments;
CREATE POLICY "payments_read" ON payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "payments_service" ON payments;
CREATE POLICY "payments_service" ON payments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_tracking_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

SELECT 'Migration complete!' AS status;
