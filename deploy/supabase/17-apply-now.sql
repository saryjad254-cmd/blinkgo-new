-- ============================================
-- 19 — APPLY IMMEDIATELY (CRITICAL COLUMNS)
-- ============================================
-- Run this in Supabase Dashboard SQL Editor NOW to fix
-- the order tracking and driver location features.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_location_lat DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS last_location_lng DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS last_location_updated_at TIMESTAMPTZ;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discount_price DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS track_stock BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preparation_time INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ingredients TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS market_section TEXT,
  ADD COLUMN IF NOT EXISTS pharmacy_category TEXT;

-- Migrate existing image_url to image_urls[0] if missing
UPDATE public.products
SET image_urls = ARRAY[image_url]::TEXT[]
WHERE image_url IS NOT NULL AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS accepting_orders BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pause_message TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'restaurant';

-- Search history
CREATE TABLE IF NOT EXISTS public.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON public.search_history(user_id, created_at DESC);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own search history" ON public.search_history;
CREATE POLICY "Users manage own search history" ON public.search_history
  FOR ALL USING (auth.uid() = user_id);

-- Recently viewed
CREATE TABLE IF NOT EXISTS public.recently_viewed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON public.recently_viewed(user_id, viewed_at DESC);

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own recently viewed" ON public.recently_viewed;
CREATE POLICY "Users manage own recently viewed" ON public.recently_viewed
  FOR ALL USING (auth.uid() = user_id);

-- Categories
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

-- Addresses
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

-- Favorites
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

-- Ratings
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

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can rate own orders" ON public.ratings;
CREATE POLICY "Users can rate own orders" ON public.ratings
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Public can read ratings" ON public.ratings;
CREATE POLICY "Public can read ratings" ON public.ratings
  FOR SELECT USING (true);

-- Notifications
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

-- Delivery proofs
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

-- Activity log + daily stats (admin)
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view activity log" ON public.activity_log;
CREATE POLICY "Admins can view activity log" ON public.activity_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "System can insert activity" ON public.activity_log;
CREATE POLICY "System can insert activity" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

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

ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read daily stats" ON public.daily_stats;
CREATE POLICY "Public can read daily stats" ON public.daily_stats
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage daily stats" ON public.daily_stats;
CREATE POLICY "Admins manage daily stats" ON public.daily_stats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_products_sold ON public.products(sold_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_display_order ON public.products(restaurant_id, display_order);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(is_featured) WHERE is_featured = TRUE;
