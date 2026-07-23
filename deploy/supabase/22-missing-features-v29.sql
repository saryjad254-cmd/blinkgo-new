-- ════════════════════════════════════════════════════════════════
-- BlinkGo — v29 Final Feature Completion Migration
-- ════════════════════════════════════════════════════════════════
-- Adds:
--   1. referrals              — customer referral system
--   2. loyalty_points         — earn/redeem loyalty points
--   3. promotions             — site-wide and restaurant promos
--   4. share_links            — shareable tracking URLs
--   5. push_subscriptions     — web push notification subscriptions
--   6. config                 — global configuration / feature flags
--   7. refunds                — payment refund records
-- All tables are idempotent (safe to re-run).
-- ════════════════════════════════════════════════════════════════

-- 1. REFERRALS
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL,
  referee_email TEXT NOT NULL,
  referee_id UUID,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, signed_up, completed, rewarded
  reward_type TEXT,                         -- credit, discount, points
  reward_value NUMERIC(10,2) DEFAULT 0,
  referee_reward_value NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(code);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON public.referrals(referee_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referrals_read_own" ON public.referrals;
CREATE POLICY "referrals_read_own" ON public.referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referee_id = auth.uid());
DROP POLICY IF EXISTS "referrals_insert_own" ON public.referrals;
CREATE POLICY "referrals_insert_own" ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (referrer_id = auth.uid());
DROP POLICY IF EXISTS "referrals_admin_all" ON public.referrals;
CREATE POLICY "referrals_admin_all" ON public.referrals FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- 2. LOYALTY POINTS
CREATE TABLE IF NOT EXISTS public.loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'bronze',  -- bronze, silver, gold, platinum
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_user ON public.loyalty_points(user_id);

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loyalty_read_own" ON public.loyalty_points;
CREATE POLICY "loyalty_read_own" ON public.loyalty_points FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));
DROP POLICY IF EXISTS "loyalty_admin_write" ON public.loyalty_points;
CREATE POLICY "loyalty_admin_write" ON public.loyalty_points FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- Loyalty transactions (earn/redeem log)
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID,
  amount INTEGER NOT NULL,  -- positive = earned, negative = redeemed
  reason TEXT NOT NULL,     -- order_completed, signup_bonus, referral, redemption, etc.
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user ON public.loyalty_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_order ON public.loyalty_transactions(order_id);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loyalty_tx_read_own" ON public.loyalty_transactions;
CREATE POLICY "loyalty_tx_read_own" ON public.loyalty_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- 3. PROMOTIONS
CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percentage',  -- percentage, fixed
  discount_value NUMERIC(10,2) NOT NULL,
  min_order_amount NUMERIC(10,2) DEFAULT 0,
  restaurant_id UUID,  -- NULL = site-wide
  code TEXT UNIQUE,    -- Optional promo code
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON public.promotions(is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_restaurant ON public.promotions(restaurant_id);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promotions_read" ON public.promotions;
CREATE POLICY "promotions_read" ON public.promotions FOR SELECT TO authenticated USING (is_active = true);
DROP POLICY IF EXISTS "promotions_admin_all" ON public.promotions;
CREATE POLICY "promotions_admin_all" ON public.promotions FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin', 'restaurant')));

-- 4. SHARE LINKS (for order tracking)
CREATE TABLE IF NOT EXISTS public.share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL,  -- 'order', 'restaurant', 'menu_item'
  resource_id UUID NOT NULL,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON public.share_links(token);

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "share_links_read" ON public.share_links;
CREATE POLICY "share_links_read" ON public.share_links FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "share_links_insert_own" ON public.share_links;
CREATE POLICY "share_links_insert_own" ON public.share_links FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- 5. PUSH SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_subs_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_own" ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- 6. CONFIG (key-value)
CREATE TABLE IF NOT EXISTS public.config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_read" ON public.config;
CREATE POLICY "config_read" ON public.config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "config_admin_write" ON public.config;
CREATE POLICY "config_admin_write" ON public.config FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- Insert default config values
INSERT INTO public.config (key, value, description) VALUES
  ('loyalty.enabled', 'true'::jsonb, 'Enable loyalty points system'),
  ('loyalty.points_per_euro', '1'::jsonb, 'Points earned per euro spent'),
  ('loyalty.signup_bonus', '50'::jsonb, 'Bonus points on signup'),
  ('referral.enabled', 'true'::jsonb, 'Enable referral system'),
  ('referral.reward_credit', '5.00'::jsonb, 'Credit given to referrer on successful referral'),
  ('referral.referee_credit', '5.00'::jsonb, 'Credit given to new user via referral'),
  ('order.scheduling_enabled', 'true'::jsonb, 'Allow customers to schedule orders in advance'),
  ('order.min_advance_minutes', '30'::jsonb, 'Minimum minutes in advance to schedule'),
  ('order.max_advance_days', '7'::jsonb, 'Maximum days in advance to schedule'),
  ('push.enabled', 'true'::jsonb, 'Enable web push notifications'),
  ('payment.stripe_enabled', 'true'::jsonb, 'Enable Stripe payments'),
  ('payment.cod_enabled', 'true'::jsonb, 'Enable cash on delivery')
ON CONFLICT (key) DO NOTHING;

-- 7. REFUNDS
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID,
  order_id UUID NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
  stripe_refund_id TEXT,
  processed_by UUID,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "refunds_read" ON public.refunds;
CREATE POLICY "refunds_read" ON public.refunds FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin'))
         OR order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid()));
DROP POLICY IF EXISTS "refunds_admin_write" ON public.refunds;
CREATE POLICY "refunds_admin_write" ON public.refunds FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'super_admin')));

-- 8. Add scheduled_for to orders (if not present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'scheduled_for') THEN
    ALTER TABLE public.orders ADD COLUMN scheduled_for TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'discount') THEN
    ALTER TABLE public.orders ADD COLUMN discount NUMERIC(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'coupon_id') THEN
    ALTER TABLE public.orders ADD COLUMN coupon_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'promotion_id') THEN
    ALTER TABLE public.orders ADD COLUMN promotion_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'referral_id') THEN
    ALTER TABLE public.orders ADD COLUMN referral_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'points_redeemed') THEN
    ALTER TABLE public.orders ADD COLUMN points_redeemed INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'referral_code') THEN
    ALTER TABLE public.users ADD COLUMN referral_code TEXT UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'referred_by') THEN
    ALTER TABLE public.users ADD COLUMN referred_by UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'cancellation_reason') THEN
    ALTER TABLE public.orders ADD COLUMN cancellation_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'refunded_at') THEN
    ALTER TABLE public.orders ADD COLUMN refunded_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'refund_amount') THEN
    ALTER TABLE public.orders ADD COLUMN refund_amount NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

-- Create indices for new columns
CREATE INDEX IF NOT EXISTS idx_orders_scheduled ON public.orders(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_coupon ON public.orders(coupon_id) WHERE coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code) WHERE referral_code IS NOT NULL;
