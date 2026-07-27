-- ============================================================================
-- v31 Performance Indexes — Speed up all hot queries
-- ============================================================================
-- This migration adds indexes that target the most-frequent query patterns:
--   1. orders: customer/driver/restaurant lookups + status filters
--   2. users: role-based listings + email lookup
--   3. restaurants: city/is_active filters + geolocation
--   4. order_items: order lookup
--   5. notifications: user + read status
--   6. menu_items: restaurant lookup
--   7. reviews: restaurant + order
--   8. coupons: code lookup
--   9. loyalty_transactions: user + recent
--  10. driver_locations: driver + recency
-- ============================================================================

-- 1. ORDERS — used by customer / driver / restaurant dashboards, tracking
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON public.orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON public.orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created ON public.orders(customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_driver_status ON public.orders(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created ON public.orders(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_active ON public.orders(status) WHERE status IN ('pending', 'preparing', 'ready', 'picked_up', 'in_transit');
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- 2. USERS — role-based + email lookup
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);

-- 3. RESTAURANTS — listings + map queries
CREATE INDEX IF NOT EXISTS idx_restaurants_active ON public.restaurants(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON public.restaurants(city);
CREATE INDEX IF NOT EXISTS idx_restaurants_owner ON public.restaurants(owner_id);

-- 4. ORDER_ITEMS
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 5. NOTIFICATIONS
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- 6. MENU_ITEMS
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON public.menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON public.menu_items(restaurant_id, available) WHERE available = true;

-- 7. REVIEWS
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant ON public.reviews(restaurant_id, created_at DESC);

-- 8. COUPONS
CREATE INDEX IF NOT EXISTS idx_coupons_code_lower ON public.coupons(LOWER(code));
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(is_active) WHERE is_active = true;

-- 9. LOYALTY
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON public.loyalty_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_user ON public.loyalty_points(user_id);

-- 10. DRIVER LOCATIONS — most-recent per driver
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_updated ON public.driver_locations(driver_id, updated_at DESC);

-- 11. ANALYTICS — composite for dashboard
-- (already covered by orders indexes above)

-- 12. ADDRESSES — user default address lookup
CREATE INDEX IF NOT EXISTS idx_addresses_user_default ON public.addresses(user_id, is_default) WHERE is_default = true;

-- 13. PAYMENT METHODS — user defaults
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_default ON public.payment_methods(user_id, is_default) WHERE is_default = true;

-- ============================================================================
-- ANALYZE tables to update query planner statistics
-- ============================================================================
ANALYZE public.orders;
ANALYZE public.users;
ANALYZE public.restaurants;
ANALYZE public.menu_items;
ANALYZE public.notifications;
ANALYZE public.order_items;
ANALYZE public.coupons;
ANALYZE public.loyalty_transactions;
ANALYZE public.driver_locations;
ANALYZE public.addresses;
ANALYZE public.payment_methods;
ANALYZE public.reviews;
