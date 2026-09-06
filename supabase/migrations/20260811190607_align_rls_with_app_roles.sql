-- Replace legacy checks against Supabase's reserved JWT `role` claim with the
-- canonical database-backed BlinkGo role helper.
DROP POLICY IF EXISTS coupons_admin_all ON public.coupons;
CREATE POLICY coupons_admin_all ON public.coupons
FOR ALL TO authenticated
USING ((SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin'))
WITH CHECK ((SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin'));

DROP POLICY IF EXISTS restaurants_owner_all ON public.restaurants;
CREATE POLICY restaurants_owner_all ON public.restaurants
FOR ALL TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR (SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin')
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  OR (SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin')
);

DROP POLICY IF EXISTS users_admin_all ON public.users;
CREATE POLICY users_admin_all ON public.users
FOR ALL TO authenticated
USING ((SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin'))
WITH CHECK ((SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin'));

DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update ON public.orders
FOR UPDATE TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  OR driver_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = orders.restaurant_id AND r.owner_id = (SELECT auth.uid())
  )
  OR (SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin')
)
WITH CHECK (
  customer_id = (SELECT auth.uid())
  OR driver_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = orders.restaurant_id AND r.owner_id = (SELECT auth.uid())
  )
  OR (SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin')
);

DROP POLICY IF EXISTS orders_admin_read ON public.orders;
CREATE POLICY orders_admin_read ON public.orders
FOR SELECT TO authenticated
USING ((SELECT public.auth_role())::text IN ('manager', 'admin', 'super_admin'));
