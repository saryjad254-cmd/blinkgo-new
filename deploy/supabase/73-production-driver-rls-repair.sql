-- Restore the driver policies required by the application after production
-- schema drift left both RLS-enabled tables without policies.
-- Applied to production project rhdaffhlrglyknxtucux on 2026-08-31.

DROP POLICY IF EXISTS drivers_self_read ON public.drivers;
CREATE POLICY drivers_self_read ON public.drivers
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin', 'restaurant')
    )
  );

DROP POLICY IF EXISTS drivers_self_update ON public.drivers;
CREATE POLICY drivers_self_update ON public.drivers
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS drivers_admin_all ON public.drivers;
CREATE POLICY drivers_admin_all ON public.drivers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS drivers_service_role_all ON public.drivers;
CREATE POLICY drivers_service_role_all ON public.drivers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS driver_working_hours_self_read ON public.driver_working_hours;
CREATE POLICY driver_working_hours_self_read ON public.driver_working_hours
  FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS driver_working_hours_self_write ON public.driver_working_hours;
CREATE POLICY driver_working_hours_self_write ON public.driver_working_hours
  FOR ALL TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS driver_working_hours_service_role_all ON public.driver_working_hours;
CREATE POLICY driver_working_hours_service_role_all ON public.driver_working_hours
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
