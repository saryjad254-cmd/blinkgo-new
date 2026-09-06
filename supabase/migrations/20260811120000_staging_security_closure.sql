-- Final security closure for the canonical BlinkGo schema.
-- Safe to run repeatedly after all feature migrations.

-- Metadata/operations tables are deliberately service-role only. Explicit
-- policies document the contract and keep the database linter useful.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'admin_notifications',
    'automation_executions',
    'automation_rules',
    'rate_limit_log',
    'restaurant_verifications',
    'webhook_deliveries',
    'webhooks'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      table_name
    );
  END LOOP;
END;
$$;

-- Aggregation views must evaluate permissions and RLS as their caller.
ALTER VIEW IF EXISTS public.restaurant_daily_stats SET (security_invoker = true);
ALTER VIEW IF EXISTS public.driver_daily_stats SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_unacked_notifications SET (security_invoker = true);

-- Pin every public function to a non-user-controlled search path.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.signature);
  END LOOP;
END;
$$;

-- SECURITY DEFINER is denied by default. Server routes use service_role.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END;
$$;

-- These two RPCs are intentionally available to signed-in callers and enforce
-- their own identity/role checks internally.
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_product_request(uuid, jsonb) TO authenticated;

-- Table RLS remains authoritative, but browser roles never need schema-level
-- powers that bypass ordinary row operations.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Remove duplicate indexes left by the historical migration chain.
DROP INDEX IF EXISTS public.consent_records_created_at_idx;
DROP INDEX IF EXISTS public.idx_loyalty_transactions_order;
DROP INDEX IF EXISTS public.idx_loyalty_transactions_user_created;
DROP INDEX IF EXISTS public.idx_payment_security_events_ip_created;
DROP INDEX IF EXISTS public.idx_products_is_active;
DROP INDEX IF EXISTS public.idx_products_sold_count;
