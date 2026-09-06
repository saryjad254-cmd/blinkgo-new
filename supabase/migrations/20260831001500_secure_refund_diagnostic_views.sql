-- These operational views contain platform-wide payment and order data.
-- SECURITY INVOKER makes PostgreSQL evaluate the underlying table privileges
-- as the caller instead of silently using the view owner's privileges.

alter view if exists public.v_duplicate_refund_requests
  set (security_invoker = true);
revoke all on public.v_duplicate_refund_requests
  from public, anon, authenticated;
grant select on public.v_duplicate_refund_requests to service_role;

alter view if exists public.v_stuck_cancel_refunds
  set (security_invoker = true);
revoke all on public.v_stuck_cancel_refunds
  from public, anon, authenticated;
grant select on public.v_stuck_cancel_refunds to service_role;

