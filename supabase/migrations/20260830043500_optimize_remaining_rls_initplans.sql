-- Cache auth claim lookups once per statement in the remaining legacy RLS
-- policies. Access semantics are unchanged; only init-plan evaluation changes.

alter policy badges_read on public.badges
  using (user_id = (select auth.uid()));

alter policy checkin_user_all on public.daily_checkins
  using (user_id = (select auth.uid()));

alter policy reviews_insert on public.reviews
  with check (customer_id = (select auth.uid()));

alter policy customer_addresses_all on public.customer_addresses
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

alter policy customer_addresses_own on public.customer_addresses
  using (
    customer_id = (select auth.uid())
    or (select auth.uid()) in (
      select users.id from public.users where users.role = 'admin'::public.user_role
    )
  )
  with check (customer_id = (select auth.uid()));

alter policy referrals_read_own on public.referrals
  using (
    referrer_id = (select auth.uid())
    or referee_id = (select auth.uid())
  );

alter policy referrals_insert_own on public.referrals
  with check (referrer_id = (select auth.uid()));

alter policy referrals_admin_all on public.referrals
  using (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  );

alter policy promotions_admin_all on public.promotions
  using (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (
        array['admin'::public.user_role, 'super_admin'::public.user_role, 'restaurant'::public.user_role]
      )
    )
  );

alter policy share_links_insert_own on public.share_links
  with check (created_by = (select auth.uid()) or created_by is null);

alter policy config_admin_write on public.config
  using (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  );

alter policy announcements_admin_write on public.system_announcements
  using (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  )
  with check (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  );

alter policy settings_admin_write on public.system_settings
  using (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  )
  with check (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  );

alter policy zones_admin_write on public.delivery_zones
  using (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  )
  with check (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  );

alter policy payouts_driver_read on public.driver_payouts
  using (
    driver_id = (select auth.uid())
    or (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  );

alter policy payouts_admin_write on public.driver_payouts
  using (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  )
  with check (
    (select auth.uid()) in (
      select users.id from public.users
      where users.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  );

alter policy product_requests_owner_select on public.product_requests
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = product_requests.restaurant_id
        and r.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and u.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
    or (select auth.role()) = 'service_role'
  );

alter policy product_requests_owner_insert on public.product_requests
  with check (
    requested_by = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.restaurants r
      where r.id = product_requests.restaurant_id
        and r.owner_id = (select auth.uid())
    )
  );

alter policy product_requests_admin_update on public.product_requests
  using (
    exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and u.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
    or (select auth.role()) = 'service_role'
  );

alter policy expansion_requests_admin on public.expansion_requests
  using (
    exists (
      select 1 from public.users
      where users.id = (select auth.uid())
        and users.role = 'admin'::public.user_role
    )
  );
