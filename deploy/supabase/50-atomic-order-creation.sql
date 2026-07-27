-- ════════════════════════════════════════════════════════════════
-- BlinkGo v80 — Atomic Order Creation + Stock Decrement
-- ════════════════════════════════════════════════════════════════
-- Round-2 audit fixes (BACKEND BLOCKER 2 + BLOCKER 3):
--
--   BLOCKER 2 — Order + order_items were inserted in two separate
--     PostgREST calls. If the second call failed, the order was left
--     orphaned. The compensating `delete()` was best-effort and
--     unprotected by a try/catch.
--
--   BLOCKER 3 — Stock decrement in order creation was a read-then-write
--     pattern. Two concurrent customers could both see stock=1 and both
--     decrement, causing oversell.
--
-- This migration provides `create_order_atomic(...)` which:
--   1. Inserts the `orders` row
--   2. For each item in `p_items`:
--        a. SELECT ... FOR UPDATE on the product row (row lock)
--        b. If `track_stock = TRUE` and current stock < requested qty,
--           RAISE EXCEPTION 'OUT_OF_STOCK' (rolls back the whole txn)
--        c. Atomic UPDATE: stock = stock - qty, sold_count = sold_count + qty
--        d. INSERT into order_items
--   3. Returns the new order id + order_number
--
-- Everything runs inside a single plpgsql transaction so the inserts
-- and the stock decrements are atomic. The function is SECURITY DEFINER
-- and GRANT'd only to service_role to prevent customers from invoking
-- it directly with manipulated prices.
--
-- The orders route (`app/api/orders/route.ts`) keeps server-authoritative
-- price calculation, delivery-zone check, coupon validation, loyalty
-- redemption, and notification; it only delegates the write phase here.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order_number           TEXT,
  p_customer_id            UUID,
  p_restaurant_id          UUID,
  p_subtotal               NUMERIC,
  p_delivery_fee           NUMERIC,
  p_service_fee            NUMERIC,
  p_tip                    NUMERIC,
  p_discount               NUMERIC,
  p_total                  NUMERIC,
  p_payment_method         TEXT,
  p_delivery_address       JSONB,
  p_customer_latitude      NUMERIC,
  p_customer_longitude     NUMERIC,
  p_restaurant_latitude    NUMERIC,
  p_restaurant_longitude   NUMERIC,
  p_scheduled_for          TIMESTAMPTZ,
  p_items                  JSONB  -- [{product_id, product_name, product_price, quantity, subtotal}]
)
RETURNS TABLE (
  order_id      UUID,
  order_number  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id       UUID;
  v_item           JSONB;
  v_item_qty       INTEGER;
  v_item_product   UUID;
  v_track_stock    BOOLEAN;
  v_current_stock  INTEGER;
  v_actual_name    TEXT;
  v_actual_price   NUMERIC;
  v_actual_sub     NUMERIC;
BEGIN
  -- ═════════════ 1. Insert order ═════════════
  INSERT INTO public.orders (
    order_number,
    customer_id,
    restaurant_id,
    status,
    subtotal,
    delivery_fee,
    service_fee,
    tip,
    discount,
    total,
    payment_method,
    payment_status,
    delivery_address,
    customer_latitude,
    customer_longitude,
    restaurant_latitude,
    restaurant_longitude,
    scheduled_for
  ) VALUES (
    p_order_number,
    p_customer_id,
    p_restaurant_id,
    'pending',
    p_subtotal,
    p_delivery_fee,
    p_service_fee,
    p_tip,
    p_discount,
    p_total,
    p_payment_method,
    'pending',
    p_delivery_address,
    p_customer_latitude,
    p_customer_longitude,
    p_restaurant_latitude,
    p_restaurant_longitude,
    p_scheduled_for
  )
  RETURNING public.orders.id INTO v_order_id;

  -- ═════════════ 2. Insert items + atomic stock decrement ═════════════
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'create_order_atomic: p_items must be a non-empty jsonb array'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_qty     := (v_item->>'quantity')::INTEGER;
    v_item_product := (v_item->>'product_id')::UUID;

    IF v_item_qty IS NULL OR v_item_qty < 1 THEN
      RAISE EXCEPTION 'create_order_atomic: invalid quantity % for product %', v_item_qty, v_item_product
        USING ERRCODE = 'P0001';
    END IF;

    -- Row lock on the product — concurrent inserts block here until
    -- our transaction commits, so the subsequent stock check is
    -- race-free.
    SELECT
      COALESCE(p.track_stock, FALSE),
      COALESCE(p.stock, 0),
      p.name,
      p.price
    INTO
      v_track_stock,
      v_current_stock,
      v_actual_name,
      v_actual_price
    FROM public.products p
    WHERE p.id = v_item_product
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'create_order_atomic: product % not found', v_item_product
        USING ERRCODE = 'P0001';
    END IF;

    -- Stock guard: if the restaurant tracks stock, the decrement must
    -- not take stock below zero. RAISE here aborts the WHOLE transaction
    -- (no order row, no order_items, no decrement) — the caller sees a
    -- 409 OUT_OF_STOCK and the DB stays consistent.
    IF v_track_stock AND v_current_stock < v_item_qty THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: % has only % left, need %',
        v_actual_name, v_current_stock, v_item_qty
        USING ERRCODE = 'P0001';
    END IF;

    -- Atomic stock decrement + sold_count bump (only when tracking).
    IF v_track_stock THEN
      UPDATE public.products
      SET stock      = stock - v_item_qty,
          sold_count = COALESCE(sold_count, 0) + v_item_qty,
          updated_at = now()
      WHERE id = v_item_product;
    ELSE
      -- Still bump sold_count for bestsellers / popularity ranking.
      UPDATE public.products
      SET sold_count = COALESCE(sold_count, 0) + v_item_qty,
          updated_at = now()
      WHERE id = v_item_product;
    END IF;

    -- Insert the order_items row using the caller-supplied price/name
    -- (which were server-authoritatively computed in the API; this
    -- function deliberately does not re-derive them to keep the call
    -- shape simple and avoid divergence with the rest of the request).
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      product_price,
      quantity,
      subtotal
    ) VALUES (
      v_order_id,
      v_item_product,
      v_item->>'product_name',
      (v_item->>'product_price')::NUMERIC,
      v_item_qty,
      (v_item->>'subtotal')::NUMERIC
    );
  END LOOP;

  -- ═════════════ 3. Return the new order ═════════════
  RETURN QUERY
    SELECT v_order_id, p_order_number;
END;
$$;

-- Only the service role may call this — the application validates prices
-- and authorization in TypeScript before invoking the RPC.
REVOKE ALL ON FUNCTION public.create_order_atomic(
  TEXT, UUID, UUID,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  TEXT,
  JSONB,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  TIMESTAMPTZ,
  JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_order_atomic(
  TEXT, UUID, UUID,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  TEXT,
  JSONB,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  TIMESTAMPTZ,
  JSONB
) TO service_role;

COMMENT ON FUNCTION public.create_order_atomic IS
  'Atomically inserts an order, its order_items, and decrements product stock with row-level locks. '
  'Raises OUT_OF_STOCK if any tracked item would go negative — the whole transaction is rolled back. '
  'Service-role only.';

-- ════════════════════════════════════════════════════════════════
-- Sanity check (does not fail the migration if columns are missing —
-- the order create route would have failed long before this RPC is
-- called. This is just an operator hint at the end of the SQL log).
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
  expected TEXT[] := ARRAY[
    'order_number', 'customer_id', 'restaurant_id', 'status',
    'subtotal', 'delivery_fee', 'service_fee', 'tip', 'discount', 'total',
    'payment_method', 'payment_status',
    'delivery_address', 'customer_latitude', 'customer_longitude',
    'restaurant_latitude', 'restaurant_longitude'
  ];
  col TEXT;
BEGIN
  FOREACH col IN ARRAY expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'orders'
        AND column_name  = col
    ) THEN
      missing := array_append(missing, col);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE NOTICE 'create_order_atomic: orders table is missing columns (%) — '
      'the API will fail until the production DB is upgraded. The RPC itself is installed.', array_to_string(missing, ', ');
  ELSE
    RAISE NOTICE '✅ create_order_atomic installed — all required orders columns present';
  END IF;
END $$;

SELECT '✅ Migration 50-atomic-order-creation applied' AS status;
