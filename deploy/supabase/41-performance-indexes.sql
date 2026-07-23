-- 41. PERFORMANCE INDEXES
-- Add critical missing indexes for hot query paths
-- Idempotent (safe to re-run)

-- Orders: by status + driver_id (for "active order" queries)
CREATE INDEX IF NOT EXISTS idx_orders_status_driver ON public.orders(status, driver_id) WHERE driver_id IS NOT NULL;

-- Orders: by status + restaurant_id (for kitchen view)
CREATE INDEX IF NOT EXISTS idx_orders_status_restaurant ON public.orders(status, restaurant_id);

-- Orders: by customer + status (for "my orders")
CREATE INDEX IF NOT EXISTS idx_orders_customer_status ON public.orders(customer_id, status, created_at DESC);

-- Orders: by created_at (for recent orders, analytics)
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);

-- Products: by restaurant + is_available + is_featured (for search/menu)
CREATE INDEX IF NOT EXISTS idx_products_restaurant_available ON public.products(restaurant_id, is_available, is_featured);

-- Products: by sold_count (for "bestsellers")
CREATE INDEX IF NOT EXISTS idx_products_sold_count ON public.products(sold_count DESC) WHERE is_available = true;

-- Restaurants: by is_active + is_promoted (for featured)
CREATE INDEX IF NOT EXISTS idx_restaurants_active_promoted ON public.restaurants(is_active, is_promoted) WHERE is_active = true;

-- Restaurants: by rating (for "top rated")
CREATE INDEX IF NOT EXISTS idx_restaurants_rating ON public.rating DESC NULLS LAST WHERE is_active = true;

-- Notifications: by user + read + created_at (for bell badge)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read, created_at DESC) WHERE read = false;

-- Driver location: by driver + timestamp (for last known location)
CREATE INDEX IF NOT EXISTS idx_driver_location_driver ON public.driver_location_history(driver_id, recorded_at DESC);

-- Driver earnings: by driver + created_at
CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver_date ON public.driver_earnings(driver_id, created_at DESC);

-- Coupons: by code (for validation)
CREATE INDEX IF NOT EXISTS idx_coupons_code_active ON public.coupons(code) WHERE is_active = true;

-- Reviews: by restaurant + created_at
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_date ON public.reviews(restaurant_id, created_at DESC);

-- Order items: by order_id (already exists, but ensure)
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- Order items: by product_id (for analytics)
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- Favorites: by user + created_at
CREATE INDEX IF NOT EXISTS idx_favorites_user_date ON public.favorites(user_id, created_at DESC);

-- Sessions/Refresh tokens: by user + expires
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON public.sessions(user_id, expires_at) WHERE revoked = false;

-- Push subscriptions: by user
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

-- Customer addresses: by user
CREATE INDEX IF NOT EXISTS idx_addresses_user ON public.addresses(user_id, is_default DESC);

-- System announcements: by active + dates (for banner)
CREATE INDEX IF NOT EXISTS idx_announcements_active_dates ON public.system_announcements(is_active, starts_at, ends_at) WHERE is_active = true;

-- Support tickets: by user + status
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON public.support_tickets(user_id, status, updated_at DESC);

-- Materialized view: daily metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS public.daily_metrics_mv AS
SELECT
  DATE(created_at) AS metric_date,
  restaurant_id,
  COUNT(*) AS order_count,
  SUM(total) AS revenue_total,
  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_count,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
  AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) AS avg_delivery_seconds
FROM public.orders
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE(created_at), restaurant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_metrics_mv_date_restaurant
  ON public.daily_metrics_mv(metric_date, restaurant_id);

-- Function to refresh metrics
CREATE OR REPLACE FUNCTION public.refresh_daily_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_metrics_mv;
END;
$$ LANGUAGE plpgsql;

-- Add covering index for hot "available drivers" query
CREATE INDEX IF NOT EXISTS idx_driver_status_online_location
  ON public.driver_status(is_online, last_location_lat, last_location_lng)
  WHERE is_online = true;

-- Composite for order tracking
CREATE INDEX IF NOT EXISTS idx_orders_id_status ON public.orders(id, status);
