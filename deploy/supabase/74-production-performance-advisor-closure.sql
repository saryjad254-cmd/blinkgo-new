-- Close safe production performance-advisor findings without changing access
-- semantics. Applied to production project rhdaffhlrglyknxtucux on 2026-08-31.

-- Cache auth.uid() once per statement instead of once per row.
DROP POLICY IF EXISTS drivers_self_read ON public.drivers;
CREATE POLICY drivers_self_read ON public.drivers
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('admin', 'super_admin', 'restaurant')
    )
  );

DROP POLICY IF EXISTS drivers_self_update ON public.drivers;
CREATE POLICY drivers_self_update ON public.drivers
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS drivers_admin_all ON public.drivers;
CREATE POLICY drivers_admin_all ON public.drivers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS driver_working_hours_self_read ON public.driver_working_hours;
CREATE POLICY driver_working_hours_self_read ON public.driver_working_hours
  FOR SELECT TO authenticated
  USING (
    driver_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS driver_working_hours_self_write ON public.driver_working_hours;
CREATE POLICY driver_working_hours_self_write ON public.driver_working_hours
  FOR ALL TO authenticated
  USING (driver_id = (SELECT auth.uid()))
  WITH CHECK (driver_id = (SELECT auth.uid()));

-- Cover foreign keys used by deletes, joins, and lifecycle cleanup.
CREATE INDEX IF NOT EXISTS idx_categories_restaurant_id
  ON public.categories (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order_id
  ON public.coupon_usage (order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_id
  ON public.coupon_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_restaurant_id
  ON public.coupons (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_driver_status_current_order_id
  ON public.driver_status (current_order_id);
CREATE INDEX IF NOT EXISTS idx_favorites_restaurant_id
  ON public.favorites (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_order_drafts_confirmed_by
  ON public.order_drafts (confirmed_by);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_modifications_approved_by
  ON public.order_modifications (approved_by);
CREATE INDEX IF NOT EXISTS idx_order_modifications_modified_by
  ON public.order_modifications (modified_by);
CREATE INDEX IF NOT EXISTS idx_product_extras_product_id
  ON public.product_extras (product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id
  ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_user_id
  ON public.support_ticket_replies (user_id);
