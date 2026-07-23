-- ============================================
-- 17 — Activity Log + Reset Support Tables
-- ============================================

-- Activity log for audit trail
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON public.activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log(created_at DESC);

-- RLS for activity_log: only admins can read, anyone authenticated can write
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view activity log" ON public.activity_log;
CREATE POLICY "Admins can view activity log" ON public.activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "System can insert activity" ON public.activity_log;
CREATE POLICY "System can insert activity" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Daily stats table (for reset to track previous day)
CREATE TABLE IF NOT EXISTS public.daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_orders INTEGER DEFAULT 0,
  delivered_orders INTEGER DEFAULT 0,
  cancelled_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(10, 2) DEFAULT 0,
  total_delivery_fees DECIMAL(10, 2) DEFAULT 0,
  total_commission DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON public.daily_stats(date DESC);

ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage daily stats" ON public.daily_stats;
CREATE POLICY "Admins manage daily stats" ON public.daily_stats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Public can read daily stats" ON public.daily_stats;
CREATE POLICY "Public can read daily stats" ON public.daily_stats
  FOR SELECT USING (true);

-- Favorites (Stage 3)
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, restaurant_id)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own favorites" ON public.favorites;
CREATE POLICY "Users manage own favorites" ON public.favorites
  FOR ALL USING (auth.uid() = user_id);

-- Addresses (Stage 3)
CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON public.addresses(user_id);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own addresses" ON public.addresses;
CREATE POLICY "Users manage own addresses" ON public.addresses
  FOR ALL USING (auth.uid() = user_id);

-- Product categories (Stage 4)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON public.categories(restaurant_id);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read categories" ON public.categories;
CREATE POLICY "Public can read categories" ON public.categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners manage categories" ON public.categories;
CREATE POLICY "Owners manage categories" ON public.categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = categories.restaurant_id AND r.owner_id = auth.uid()
    )
  );

-- Driver status (Stage 5)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_location_lat DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS last_location_lng DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS last_location_updated_at TIMESTAMPTZ;

-- Order ratings (Stage 3)
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurant_rating INTEGER CHECK (restaurant_rating BETWEEN 1 AND 5),
  driver_rating INTEGER CHECK (driver_rating BETWEEN 1 AND 5),
  food_rating INTEGER CHECK (food_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_order ON public.ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_ratings_restaurant ON public.ratings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ratings_driver ON public.ratings(driver_id);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can rate own orders" ON public.ratings;
CREATE POLICY "Users can rate own orders" ON public.ratings
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Public can read ratings" ON public.ratings;
CREATE POLICY "Public can read ratings" ON public.ratings
  FOR SELECT USING (true);

-- Delivery proof (Stage 5)
CREATE TABLE IF NOT EXISTS public.delivery_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
  driver_id UUID REFERENCES auth.users(id),
  photo_url TEXT,
  signature TEXT,
  notes TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.delivery_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers manage delivery proofs" ON public.delivery_proofs;
CREATE POLICY "Drivers manage delivery proofs" ON public.delivery_proofs
  FOR ALL USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Public can read delivery proofs" ON public.delivery_proofs;
CREATE POLICY "Public can read delivery proofs" ON public.delivery_proofs
  FOR SELECT USING (true);

-- Notifications (Stage 3)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  data JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;
CREATE POLICY "System inserts notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- Stripe payment fields (Stage 8)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
