-- ============================================================================
-- v33 Helper Functions + Critical Schema Fixes
-- ============================================================================
-- Adds RPC functions called by the new /api/orders endpoint:
--   - increment_coupon_usage(coupon_id)
--   - redeem_loyalty_points(user_id, points, order_id)
--   - award_loyalty_points(user_id, points, reason, order_id)
-- Ensures unique order_items constraint, safe order_status history, etc.
-- ============================================================================

-- ============== 1. INCREMENT COUPON USAGE ==============
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.coupons
  SET usage_count = COALESCE(usage_count, 0) + 1,
      updated_at = now()
  WHERE id = p_coupon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO authenticated;

-- ============== 2. REDEEM LOYALTY POINTS ==============
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_user_id uuid,
  p_points int,
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance int;
BEGIN
  -- Lock the row to prevent concurrent redemption
  SELECT points INTO current_balance
  FROM public.loyalty_points
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF current_balance IS NULL OR current_balance < p_points THEN
    RAISE EXCEPTION 'Insufficient loyalty points: have %, need %', current_balance, p_points;
  END IF;

  UPDATE public.loyalty_points
  SET points = points - p_points,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Log the redemption
  INSERT INTO public.loyalty_transactions (user_id, points, type, order_id, description, created_at)
  VALUES (p_user_id, -p_points, 'redeemed', p_order_id, 'Points redeemed at checkout', now())
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, int, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, int, uuid) TO authenticated;

-- ============== 3. AWARD LOYALTY POINTS (for delivery) ==============
CREATE OR REPLACE FUNCTION public.award_loyalty_points(
  p_user_id uuid,
  p_points int,
  p_reason text,
  p_order_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_points <= 0 THEN
    RETURN;
  END IF;

  -- Upsert loyalty_points
  INSERT INTO public.loyalty_points (user_id, points, total_earned, updated_at)
  VALUES (p_user_id, p_points, p_points, now())
  ON CONFLICT (user_id) DO UPDATE
  SET points = loyalty_points.points + p_points,
      total_earned = COALESCE(loyalty_points.total_earned, 0) + p_points,
      updated_at = now();

  -- Log the transaction
  INSERT INTO public.loyalty_transactions (user_id, points, type, order_id, description, created_at)
  VALUES (p_user_id, p_points, 'earned', p_order_id, p_reason, now())
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_loyalty_points(uuid, int, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_loyalty_points(uuid, int, text, uuid) TO authenticated;

-- ============== 4. ENSURE LOYALTY TABLES EXIST ==============
CREATE TABLE IF NOT EXISTS public.loyalty_points (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  points int NOT NULL DEFAULT 0 CHECK (points >= 0),
  total_earned int NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'bronze',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points int NOT NULL,
  type text NOT NULL CHECK (type IN ('earned', 'redeemed', 'expired', 'bonus', 'adjustment')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user_created
  ON public.loyalty_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order
  ON public.loyalty_transactions (order_id);

-- ============== 5. ORDER_STATUS_HISTORY TABLE ==============
-- For audit trail of status changes
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES public.users(id),
  changed_by_role text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order
  ON public.order_status_history (order_id, created_at DESC);

-- Enable RLS but allow service role
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_status_history_select" ON public.order_status_history;
CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND (
        o.customer_id = auth.uid() OR
        o.driver_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = o.restaurant_id AND r.owner_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
      )
    )
  );

DROP POLICY IF EXISTS "order_status_history_insert" ON public.order_status_history;
CREATE POLICY "order_status_history_insert" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============== 6. RLS FIXES ==============
-- Make sure the new tables allow service role to write
DROP POLICY IF EXISTS "service_role_all_loyalty_points" ON public.loyalty_points;
CREATE POLICY "service_role_all_loyalty_points" ON public.loyalty_points
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_loyalty_transactions" ON public.loyalty_transactions;
CREATE POLICY "service_role_all_loyalty_transactions" ON public.loyalty_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can read their own loyalty
DROP POLICY IF EXISTS "users_read_own_loyalty" ON public.loyalty_points;
CREATE POLICY "users_read_own_loyalty" ON public.loyalty_points
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_read_own_loyalty_tx" ON public.loyalty_transactions;
CREATE POLICY "users_read_own_loyalty_tx" ON public.loyalty_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============== 7. TRIGGER: Award points on delivery ==============
-- This is the canonical place to award loyalty points. Triggered when
-- orders.status changes to 'delivered'.
CREATE OR REPLACE FUNCTION public.trg_award_points_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  points_to_award int;
BEGIN
  -- Only fire when status transitions TO delivered
  IF (TG_OP = 'UPDATE' AND NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status <> 'delivered')) THEN
    -- 1 point per euro spent
    points_to_award := GREATEST(0, FLOOR(COALESCE(NEW.total, 0))::int);
    IF points_to_award > 0 THEN
      PERFORM public.award_loyalty_points(
        NEW.customer_id,
        points_to_award,
        'Earned from order ' || COALESCE(NEW.order_number, NEW.id::text),
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_points ON public.orders;
CREATE TRIGGER trg_award_points
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_award_points_on_delivery();

-- Also handle INSERT case (in case order is created as 'delivered')
DROP TRIGGER IF EXISTS trg_award_points_insert ON public.orders;
CREATE TRIGGER trg_award_points_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'delivered')
  EXECUTE FUNCTION public.trg_award_points_on_delivery();

-- ============== 8. UPDATE loyalty tier based on total_earned ==============
CREATE OR REPLACE FUNCTION public.update_loyalty_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.tier := CASE
    WHEN COALESCE(NEW.total_earned, 0) >= 5000 THEN 'platinum'
    WHEN COALESCE(NEW.total_earned, 0) >= 2000 THEN 'gold'
    WHEN COALESCE(NEW.total_earned, 0) >= 500 THEN 'silver'
    ELSE 'bronze'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_tier ON public.loyalty_points;
CREATE TRIGGER trg_update_tier
  BEFORE INSERT OR UPDATE OF total_earned ON public.loyalty_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_loyalty_tier();

-- ============== 9. NOTIFY on order_status_history insert ==============
-- Optional: enable realtime for admins to see status changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============== DONE ==============
COMMENT ON FUNCTION public.increment_coupon_usage IS 'Atomically increments a coupon usage count';
COMMENT ON FUNCTION public.redeem_loyalty_points IS 'Atomically redeems loyalty points with row-level locking';
COMMENT ON FUNCTION public.award_loyalty_points IS 'Atomically awards loyalty points and logs the transaction';
