-- =====================================================
-- 44 — Performance Extra Indexes (Phase 9)
-- =====================================================
-- Additional indexes for query patterns identified in audit.
-- Includes covering indexes and partial indexes for hot paths.

-- Search: restaurant name ILIKE
CREATE INDEX IF NOT EXISTS idx_restaurants_name_trgm
  ON public.restaurants USING gin (name gin_trgm_ops)
  WHERE is_active = true;

-- Search: product name ILIKE
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name gin_trgm_ops)
  WHERE is_available = true;

-- Composite indexes for hot admin queries
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created
  ON public.orders (restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON public.orders (customer_id, created_at DESC);

-- Driver dashboard: my active orders
CREATE INDEX IF NOT EXISTS idx_orders_driver_status
  ON public.orders (driver_id, status)
  WHERE driver_id IS NOT NULL;

-- Notifications: unread for user
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Order items: faster joins
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);

-- Driver status: online drivers lookup
CREATE INDEX IF NOT EXISTS idx_driver_status_online_updated
  ON public.driver_status (is_online, updated_at DESC)
  WHERE is_online = true;

-- Reviews: by restaurant
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_created
  ON public.reviews (restaurant_id, created_at DESC);

-- Loyalty: per user
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user
  ON public.loyalty_transactions (user_id, created_at DESC);

-- Coupons: by code (used in checkout)
CREATE INDEX IF NOT EXISTS idx_coupons_code_active
  ON public.coupons (code)
  WHERE is_active = true AND valid_until > NOW();

-- Payouts: by driver
CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver_created
  ON public.driver_payouts (driver_id, created_at DESC);

-- Support tickets: by user
CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON public.support_tickets (user_id, created_at DESC);

-- Geocode cache: by key
CREATE INDEX IF NOT EXISTS idx_geocode_cache_key_lookup
  ON public.geocode_cache (cache_key, expires_at DESC);

-- Driver working hours: by driver
CREATE INDEX IF NOT EXISTS idx_driver_working_hours_driver_day
  ON public.driver_working_hours (driver_id, day_of_week);

-- Restaurant menu items: by category
CREATE INDEX IF NOT EXISTS idx_products_restaurant_category
  ON public.products (restaurant_id, category)
  WHERE is_available = true;

-- Stats function shortcut
ANALYZE public.orders;
ANALYZE public.products;
ANALYZE public.restaurants;
ANALYZE public.users;
ANALYZE public.notifications;
