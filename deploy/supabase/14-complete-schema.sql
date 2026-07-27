-- ════════════════════════════════════════════════════════════════
-- BLINKGO COMPLETE SCHEMA — v5.0
-- This combines everything from PRO HTML features + Next.js app
-- ════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. ROLES (already exists, recreate for safety)
-- ============================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'driver', 'restaurant', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  role user_role DEFAULT 'customer',
  avatar_url TEXT,
  city TEXT,
  language TEXT DEFAULT 'ar',
  addresses JSONB DEFAULT '[]',
  wallet_balance DECIMAL(10,2) DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by UUID REFERENCES public.users(id),
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. RESTAURANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  description_ar TEXT,
  image_url TEXT,
  logo_url TEXT,
  category TEXT,
  cuisine TEXT,
  rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  delivery_time INT DEFAULT 30,
  delivery_fee DECIMAL(10,2) DEFAULT 0,
  min_order DECIMAL(10,2) DEFAULT 0,
  address TEXT,
  city TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  phone TEXT,
  opening_hours JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. PRODUCTS / MENU ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  description_ar TEXT,
  category TEXT NOT NULL,  -- food, grocery, cafe, shop, flowers, pharma
  price DECIMAL(10,2) NOT NULL,
  compare_price DECIMAL(10,2),
  image_url TEXT,
  emoji TEXT,
  badge TEXT,  -- "-20%", "الأكثر طلباً", etc.
  in_stock BOOLEAN DEFAULT true,
  stock_count INT DEFAULT 0,
  prep_time INT DEFAULT 15,
  calories INT,
  rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  vehicle_type TEXT,  -- 'motorcycle', 'car', 'bicycle'
  vehicle_plate TEXT,
  license_number TEXT,
  rating DECIMAL(3,2) DEFAULT 5.0,
  total_trips INT DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0,
  is_online BOOLEAN DEFAULT false,
  is_available BOOLEAN DEFAULT true,
  current_latitude DECIMAL(10,7),
  current_longitude DECIMAL(10,7),
  last_location_update TIMESTAMPTZ,
  city TEXT,
  status TEXT DEFAULT 'active',  -- active, suspended, pending
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. ORDERS
-- ============================================================
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
      'pending', 'confirmed', 'preparing', 'ready', 'assigned',
      'picked_up', 'delivering', 'delivered', 'cancelled', 'refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  driver_id UUID REFERENCES public.users(id),
  status order_status DEFAULT 'pending',
  items JSONB NOT NULL DEFAULT '[]',  -- [{product_id, name, qty, price, options}]
  subtotal DECIMAL(10,2) DEFAULT 0,
  delivery_fee DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  tip DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  coupon_code TEXT,
  total DECIMAL(10,2) NOT NULL,
  payment_method TEXT,  -- 'card', 'cash', 'apple_pay', 'google_pay', 'wallet'
  payment_status TEXT DEFAULT 'pending',  -- pending, paid, failed, refunded
  payment_intent_id TEXT,
  delivery_address JSONB NOT NULL,  -- {street, city, lat, lng, notes}
  delivery_latitude DECIMAL(10,7),
  delivery_longitude DECIMAL(10,7),
  customer_notes TEXT,
  estimated_delivery TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  rating INT,  -- 1-5
  review TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. ORDER STATUS HISTORY (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  changed_by UUID REFERENCES public.users(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. COUPONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  description TEXT,
  discount_type TEXT NOT NULL,  -- 'percentage', 'fixed'
  discount_value DECIMAL(10,2) NOT NULL,
  min_order DECIMAL(10,2) DEFAULT 0,
  max_discount DECIMAL(10,2),
  usage_limit INT,
  usage_count INT DEFAULT 0,
  user_limit INT DEFAULT 1,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  restaurant_id UUID REFERENCES public.restaurants(id),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  images TEXT[],
  is_visible BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'order', 'promo', 'system', 'chat'
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  data JSONB DEFAULT '{}',  -- extra data like order_id, action_url
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. WALLET TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'cashback', 'debit', 'credit', 'refund', 'bonus'
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2),
  description TEXT,
  order_id UUID REFERENCES public.orders(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. ADDRESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label TEXT,  -- 'home', 'work', 'other'
  icon TEXT,
  street TEXT NOT NULL,
  city TEXT,
  building TEXT,
  apartment TEXT,
  floor TEXT,
  notes TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 13. CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,  -- usually "order_<order_id>"
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 14. REFERRALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referred_email TEXT,
  referred_phone TEXT,
  code TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, completed, expired
  reward_amount DECIMAL(10,2) DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. DAILY CHECKIN
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  streak INT DEFAULT 1,
  reward_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, checkin_date)
);

-- ============================================================
-- 16. BADGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  badge_name TEXT,
  description TEXT,
  icon TEXT,
  earned_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);

CREATE INDEX IF NOT EXISTS idx_restaurants_active ON public.restaurants(is_active);
CREATE INDEX IF NOT EXISTS idx_restaurants_owner ON public.restaurants(owner_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON public.restaurants(city);

CREATE INDEX IF NOT EXISTS idx_products_restaurant ON public.products(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);

CREATE INDEX IF NOT EXISTS idx_drivers_online ON public.drivers(is_online);
CREATE INDEX IF NOT EXISTS idx_drivers_available ON public.drivers(is_available);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON public.orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON public.orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON public.notifications(user_id) WHERE NOT is_read;

CREATE INDEX IF NOT EXISTS idx_wallet_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON public.addresses(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_thread ON public.chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active);

-- ============================================================
-- DROP OLD POLICIES (clean slate)
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- RLS POLICIES — NO RECURSION
-- ============================================================

-- USERS
CREATE POLICY "users_self_select" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_admin_all" ON public.users
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_insert_signup" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RESTAURANTS
CREATE POLICY "restaurants_public_read" ON public.restaurants
  FOR SELECT USING (is_active = true);

CREATE POLICY "restaurants_owner_all" ON public.restaurants
  FOR ALL USING (
    owner_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- PRODUCTS
CREATE POLICY "products_public_read" ON public.products
  FOR SELECT USING (is_active = true);

CREATE POLICY "products_restaurant_owner" ON public.products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = products.restaurant_id
      AND (r.owner_id = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
    OR auth.role() = 'service_role'
  );

-- DRIVERS
CREATE POLICY "drivers_public_read" ON public.drivers
  FOR SELECT USING (true);

CREATE POLICY "drivers_self_all" ON public.drivers
  FOR ALL USING (id = auth.uid() OR auth.role() = 'service_role');

-- ORDERS
CREATE POLICY "orders_customer_read" ON public.orders
  FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "orders_restaurant_read" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "orders_driver_read" ON public.orders
  FOR SELECT USING (driver_id = auth.uid() OR driver_id IS NULL);

CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT WITH CHECK (customer_id = auth.uid());

CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE USING (
    customer_id = auth.uid()
    OR driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
    )
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- ORDER STATUS HISTORY
CREATE POLICY "order_history_read" ON public.order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
      AND (o.customer_id = auth.uid() OR o.driver_id = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

CREATE POLICY "order_history_insert" ON public.order_status_history
  FOR INSERT WITH CHECK (true);

-- COUPONS
CREATE POLICY "coupons_read" ON public.coupons
  FOR SELECT USING (is_active = true);

CREATE POLICY "coupons_admin_all" ON public.coupons
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

-- REVIEWS
CREATE POLICY "reviews_read" ON public.reviews
  FOR SELECT USING (is_visible = true);

CREATE POLICY "reviews_insert" ON public.reviews
  FOR INSERT WITH CHECK (customer_id = auth.uid());

-- NOTIFICATIONS
CREATE POLICY "notif_user_all" ON public.notifications
  FOR ALL USING (user_id = auth.uid() OR auth.role() = 'service_role');

-- WALLET
CREATE POLICY "wallet_user_read" ON public.wallet_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "wallet_insert" ON public.wallet_transactions
  FOR INSERT WITH CHECK (true);

-- ADDRESSES
CREATE POLICY "addresses_user_all" ON public.addresses
  FOR ALL USING (user_id = auth.uid());

-- CHAT
CREATE POLICY "chat_read" ON public.chat_messages
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR auth.role() = 'service_role');

CREATE POLICY "chat_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- REFERRALS
CREATE POLICY "referrals_user_read" ON public.referrals
  FOR SELECT USING (referrer_id = auth.uid());

CREATE POLICY "referrals_insert" ON public.referrals
  FOR INSERT WITH CHECK (referrer_id = auth.uid());

-- DAILY CHECKIN
CREATE POLICY "checkin_user_all" ON public.daily_checkins
  FOR ALL USING (user_id = auth.uid());

-- BADGES
CREATE POLICY "badges_read" ON public.badges
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "badges_insert" ON public.badges
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')::user_role,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['users','restaurants','products','drivers','orders','addresses','coupons'])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS touch_updated_at ON public.%I;
      CREATE TRIGGER touch_updated_at
        BEFORE UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
    ', t, t);
  END LOOP;
END $$;

SELECT '✅ Complete schema v5.0 created successfully!' AS status;