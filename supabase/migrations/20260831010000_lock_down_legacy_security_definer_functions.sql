-- Legacy production installs granted owner-privileged functions to PUBLIC,
-- anon and authenticated. BlinkGo's current architecture invokes these
-- operations only through role-checked server APIs using service_role.

create or replace function public.auth_role()
returns text
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select case
    when (select auth.uid()) is null then 'anon'
    else coalesce(
      nullif((select auth.jwt())->'app_metadata'->>'app_role', ''),
      'customer'
    )
  end;
$$;

revoke all on function public.auth_role() from public;
grant execute on function public.auth_role() to anon, authenticated, service_role;

do $$
declare
  target record;
  server_only_names constant text[] := array[
    'award_loyalty_points',
    'cleanup_expired_otps',
    'create_order_atomic',
    'create_order_with_items',
    'dispatch_scheduled_orders',
    'handle_email_confirmed',
    'handle_new_user',
    'handle_user_update',
    'increment_coupon_usage',
    'increment_share_view',
    'notify_order_status_change',
    'redeem_loyalty_points',
    'request_refund',
    'rls_auto_enable',
    'tg_payment_refunds_recompute',
    'update_order_status'
  ];
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(server_only_names)
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      target.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      target.signature
    );
  end loop;
end
$$;
