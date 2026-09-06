begin;

-- The legacy public policy exposed licence, plate, earnings and coordinates.
-- Driver profiles are now visible only to the matching driver or operations.
revoke all on table public.drivers from anon;
revoke all on table public.drivers from authenticated;
grant select on table public.drivers to authenticated;

drop policy if exists drivers_public_read on public.drivers;
drop policy if exists drivers_self_all on public.drivers;
drop policy if exists drivers_self_read on public.drivers;
drop policy if exists drivers_self_update on public.drivers;
drop policy if exists drivers_admin_all on public.drivers;

create policy drivers_self_read
  on public.drivers for select
  to authenticated
  using (
    (
      (id = (select auth.uid()) or user_id = (select auth.uid()))
      and (select public.auth_role()) = 'driver'
    )
    or (select public.auth_role()) in ('manager', 'admin', 'super_admin')
  );

-- Share tokens are bearer credentials. Listing them is owner/admin only; the
-- public share page performs an exact token lookup through a server-only client.
revoke all on table public.share_links from anon;
revoke all on table public.share_links from authenticated;
grant select, insert on table public.share_links to authenticated;

drop policy if exists share_links_read on public.share_links;
drop policy if exists share_links_insert_own on public.share_links;

create policy share_links_owner_read
  on public.share_links for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.auth_role()) in ('manager', 'admin', 'super_admin')
  );

create policy share_links_owner_insert
  on public.share_links for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- Gamification awards are server-issued. Clients can only read their own.
revoke all on table public.badges from anon;
revoke all on table public.badges from authenticated;
grant select on table public.badges to authenticated;

drop policy if exists badges_insert on public.badges;
drop policy if exists badges_read on public.badges;

create policy badges_owner_read
  on public.badges for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.auth_role()) in ('manager', 'admin', 'super_admin')
  );

-- Public runtime configuration is allowlisted by key so a future secret value
-- cannot become browser-readable merely by adding a row.
revoke all on table public.config from anon;
revoke all on table public.config from authenticated;
grant select on table public.config to anon, authenticated;

drop policy if exists config_read on public.config;
drop policy if exists config_admin_write on public.config;

create policy config_public_read
  on public.config for select
  to anon, authenticated
  using (key in (
    'loyalty.enabled',
    'loyalty.points_per_euro',
    'loyalty.signup_bonus',
    'order.max_advance_days',
    'order.min_advance_minutes',
    'order.scheduling_enabled',
    'payment.cod_enabled',
    'payment.stripe_enabled',
    'push.enabled',
    'referral.enabled',
    'referral.referee_credit',
    'referral.reward_credit'
  ));

revoke all on table public.system_settings from anon;
revoke all on table public.system_settings from authenticated;
grant select on table public.system_settings to anon, authenticated;

drop policy if exists settings_read on public.system_settings;
drop policy if exists system_settings_read on public.system_settings;
drop policy if exists settings_admin_write on public.system_settings;
drop policy if exists system_settings_admin_write on public.system_settings;

create policy system_settings_public_read
  on public.system_settings for select
  to anon, authenticated
  using (key in (
    'currency',
    'default_delivery_radius_km',
    'driver_search_radius_km',
    'free_delivery_threshold',
    'min_order_amount',
    'rating_max',
    'rating_min',
    'surge_enabled',
    'surge_max_multiplier',
    'tax_included',
    'tax_rate'
  ));

commit;
