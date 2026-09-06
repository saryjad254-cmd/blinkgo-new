-- Authentication attempts are sensitive security telemetry. Only trusted
-- server workflows write them; operations staff may inspect but never mutate.
revoke all on table public.login_attempts from anon;
revoke insert, update, delete on table public.login_attempts from authenticated;
drop policy if exists "Service role full access" on public.login_attempts;
drop policy if exists login_attempts_service_insert on public.login_attempts;
alter policy login_attempts_admin_read on public.login_attempts
  to authenticated
  using ((select public.auth_role()) in ('admin', 'super_admin', 'manager'));

-- Magic-link tokens and the geocode cache are internal implementation data and
-- must never be readable or writable through a browser session.
revoke all on table public.magic_link_tokens from anon, authenticated;
drop policy if exists "Service role full access" on public.magic_link_tokens;

revoke all on table public.geocode_cache from anon, authenticated;
drop policy if exists geocode_cache_service_only on public.geocode_cache;

-- Security and operational audit trails are append-only from trusted server
-- code. Admin sessions can inspect them but cannot create, rewrite or delete
-- evidence. auth_role() reads protected app_metadata and is cached per query.
revoke all on table public.security_audit_log from anon;
revoke insert, update, delete on table public.security_audit_log from authenticated;
alter policy security_audit_log_admin_read on public.security_audit_log
  to authenticated
  using ((select public.auth_role()) in ('admin', 'super_admin', 'manager'));

revoke all on table public.activity_log from anon;
revoke insert, update, delete on table public.activity_log from authenticated;
drop policy if exists "System can insert activity" on public.activity_log;
alter policy "Admins can view activity log" on public.activity_log
  to authenticated
  using ((select public.auth_role()) in ('admin', 'super_admin', 'manager'));

revoke all on table public.admin_daily_reset_log from anon;
revoke insert, update, delete on table public.admin_daily_reset_log from authenticated;
drop policy if exists admin_daily_reset_log_admin on public.admin_daily_reset_log;
create policy admin_daily_reset_log_admin_read
  on public.admin_daily_reset_log for select
  to authenticated
  using ((select public.auth_role()) in ('admin', 'super_admin', 'manager'));
