-- ============================================================================
-- BLINKGO PRODUCTION UPGRADE MIGRATION v2
-- 2026-07-08
-- Uses existing tables where possible (orders, notifications, users)
-- ============================================================================

-- 1) Add missing columns to existing orders table
DO $$
BEGIN
  -- driver_bearing is the heading
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'driver_speed'
  ) THEN
    ALTER TABLE orders ADD COLUMN driver_speed REAL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'driver_accuracy'
  ) THEN
    ALTER TABLE orders ADD COLUMN driver_accuracy REAL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'last_location_update'
  ) THEN
    ALTER TABLE orders ADD COLUMN last_location_update TIMESTAMPTZ;
  END IF;
END $$;

-- 2) Order tracking events table (audit trail)
CREATE TABLE IF NOT EXISTS order_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.users(id),
  event_type TEXT NOT NULL,
  status TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_tracking_events_order_id ON order_tracking_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_tracking_events_driver_id ON order_tracking_events(driver_id);

-- 3) Customer saved addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label TEXT,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  details TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);

-- 4) Ratings/reviews
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.users(id),
  restaurant_rating SMALLINT CHECK (restaurant_rating BETWEEN 1 AND 5),
  driver_rating SMALLINT CHECK (driver_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, customer_id)
);

-- 5) Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  method TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  failed_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- 6) admin_daily_reset_log
CREATE TABLE IF NOT EXISTS admin_daily_reset_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reset_by UUID REFERENCES public.users(id),
  reset_date DATE NOT NULL,
  orders_reset INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7) ENABLE REALTIME on orders
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE order_tracking_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 8) RLS
ALTER TABLE order_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_daily_reset_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_tracking_events_read ON order_tracking_events;
CREATE POLICY order_tracking_events_read ON order_tracking_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM orders o WHERE o.id = order_tracking_events.order_id 
    AND (o.customer_id = auth.uid() OR o.driver_id = auth.uid()))
);

DROP POLICY IF EXISTS order_tracking_events_write ON order_tracking_events;
CREATE POLICY order_tracking_events_write ON order_tracking_events FOR INSERT TO authenticated WITH CHECK (
  driver_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_id
      AND o.driver_id = auth.uid()
  )
);

DROP POLICY IF EXISTS customer_addresses_all ON customer_addresses;
CREATE POLICY customer_addresses_all ON customer_addresses FOR ALL TO authenticated 
  USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS ratings_read ON ratings;
CREATE POLICY ratings_read ON ratings FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS ratings_insert ON ratings;
CREATE POLICY ratings_insert ON ratings FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS payments_read ON payments;
CREATE POLICY payments_read ON payments FOR SELECT TO authenticated USING (
  customer_id = auth.uid() OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

DROP POLICY IF EXISTS admin_daily_reset_log_admin ON admin_daily_reset_log;
CREATE POLICY admin_daily_reset_log_admin ON admin_daily_reset_log FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

