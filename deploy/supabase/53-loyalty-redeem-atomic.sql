-- ════════════════════════════════════════════════════════════════
-- BlinkGo v82 — Atomic Loyalty Redeem (v82-senior-qa-11)
-- ════════════════════════════════════════════════════════════════
-- Fixes the silent failure in app/api/orders/route.ts and
-- lib/services/loyalty-service.ts where `redeem_loyalty_points(...)`
-- is invoked but the SQL function is not defined in any migration.
-- Without this function, every customer who redeems points on an
-- order has the points NOT deducted (the RPC raises an error and the
-- route swallows it).
--
-- The new function:
--   1. Locks the user's loyalty_points row (SELECT ... FOR UPDATE)
--   2. Verifies balance >= points
--   3. Decrements balance and increments total_redeemed atomically
--   4. Inserts a loyalty_transactions row (negative amount)
--   5. Returns the new balance + total_redeemed
--
-- Concurrent redeem calls are serialized via the row lock — two
-- parallel orders from the same user cannot double-spend.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_user_id  uuid,
  p_points   integer,
  p_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id        uuid,
  new_balance    integer,
  new_redeemed   integer,
  discount_eur   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance       integer;
  v_redeemed      integer;
  v_earned        integer;
  v_tier          text;
  v_discount_eur  numeric;
BEGIN
  -- Lock the row so two concurrent redeems can't both pass the
  -- balance check.
  SELECT balance, total_redeemed, total_earned, tier
    INTO v_balance, v_redeemed, v_earned, v_tier
    FROM public.loyalty_points
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    -- No row yet — create one with zero balance so the customer gets
    -- a clear INSUFFICIENT_POINTS error rather than a silent no-op.
    INSERT INTO public.loyalty_points (user_id, balance, total_redeemed, total_earned, tier)
      VALUES (p_user_id, 0, 0, 0, 'bronze')
      ON CONFLICT (user_id) DO NOTHING;
    RAISE EXCEPTION 'INSUFFICIENT_POINTS: user % has 0 points', p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_balance < p_points THEN
    RAISE EXCEPTION 'INSUFFICIENT_POINTS: user % has % points, needs %',
      p_user_id, v_balance, p_points
      USING ERRCODE = 'P0001';
  END IF;

  v_discount_eur := p_points / 100.0; -- 100 points = €1

  UPDATE public.loyalty_points
     SET balance        = balance - p_points,
         total_redeemed = total_redeemed + p_points,
         updated_at     = now()
   WHERE user_id = p_user_id
   RETURNING balance, total_redeemed
     INTO v_balance, v_redeemed;

  INSERT INTO public.loyalty_transactions (user_id, order_id, amount, reason, description)
    VALUES (
      p_user_id,
      p_order_id,
      -p_points,
      'redemption',
      'Redeemed ' || p_points || ' points for €' || v_discount_eur::text || ' discount'
    );

  RETURN QUERY
    SELECT p_user_id, v_balance, v_redeemed, v_discount_eur;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_points(uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(uuid, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.redeem_loyalty_points IS
  'Atomically redeems loyalty points with row-level locking. Raises
   INSUFFICIENT_POINTS if the user has fewer points than requested.
   Used by /api/orders (best-effort, swallows errors) and
   /api/loyalty/redeem (the primary caller).';

-- Companion credit function (used by the signup bonus and order-completed
-- points award). Idempotent on (user_id, order_id, reason) so a retry of
-- the same order_completed does not double-award.
CREATE OR REPLACE FUNCTION public.award_loyalty_points(
  p_user_id  uuid,
  p_points   integer,
  p_reason   text,
  p_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id       uuid,
  new_balance   integer,
  new_earned    integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance  integer;
  v_earned   integer;
  v_redeemed integer;
  v_tier     text;
  v_existing integer;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'award_loyalty_points: points must be positive, got %', p_points
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: if a transaction with this (user_id, order_id, reason)
  -- already exists, no-op. (signup_bonus has order_id = NULL so
  -- the unique check would let a second signup through, but in
  -- practice the signup flow only calls this once per user.)
  IF p_order_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_existing
      FROM public.loyalty_transactions
     WHERE user_id = p_user_id
       AND order_id = p_order_id
       AND reason = p_reason;
    IF v_existing > 0 THEN
      -- Idempotent no-op; return the current balance.
      SELECT balance, total_earned INTO v_balance, v_earned
        FROM public.loyalty_points WHERE user_id = p_user_id;
      IF NOT FOUND THEN
        v_balance := 0; v_earned := 0;
      END IF;
      RETURN QUERY SELECT p_user_id, v_balance, v_earned;
      RETURN;
    END IF;
  END IF;

  -- Lock the row (or create).
  SELECT balance, total_earned, total_redeemed, tier
    INTO v_balance, v_earned, v_redeemed, v_tier
    FROM public.loyalty_points
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.loyalty_points (user_id, balance, total_earned, total_redeemed, tier)
      VALUES (p_user_id, p_points, p_points, 0, 'bronze')
      ON CONFLICT (user_id) DO NOTHING
      RETURNING balance, total_earned INTO v_balance, v_earned;
    -- If RETURNING didn't fire (race), re-select.
    IF v_balance IS NULL THEN
      SELECT balance, total_earned INTO v_balance, v_earned
        FROM public.loyalty_points WHERE user_id = p_user_id;
    END IF;
  ELSE
    v_balance := v_balance + p_points;
    v_earned  := v_earned + p_points;
    UPDATE public.loyalty_points
       SET balance = v_balance,
           total_earned = v_earned,
           tier = CASE
             WHEN v_earned >= 5000 THEN 'platinum'
             WHEN v_earned >= 2000 THEN 'gold'
             WHEN v_earned >= 500  THEN 'silver'
             ELSE 'bronze'
           END,
           updated_at = now()
     WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.loyalty_transactions (user_id, order_id, amount, reason, description)
    VALUES (
      p_user_id,
      p_order_id,
      p_points,
      p_reason,
      'Awarded ' || p_points || ' points (' || p_reason || ')'
    );

  RETURN QUERY SELECT p_user_id, v_balance, v_earned;
END;
$$;

REVOKE ALL ON FUNCTION public.award_loyalty_points(uuid, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_loyalty_points(uuid, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_loyalty_points(uuid, integer, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.award_loyalty_points IS
  'Atomically awards loyalty points with row-level locking. Idempotent
   on (user_id, order_id, reason). Used by signup bonus, order
   completion, and admin manual grants.';

SELECT '✅ Migration 53-loyalty-redeem-atomic applied' AS status;
