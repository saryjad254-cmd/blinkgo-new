-- Cache fixed session helpers once per statement instead of evaluating them
-- for every candidate row. The predicates intentionally preserve the current
-- authorization truth table while making the client role explicit.

alter policy users_self_select on public.users
  to authenticated
  using ((select auth.uid()) = id);

alter policy users_insert_signup on public.users
  to authenticated
  with check ((select auth.uid()) = id);

alter policy users_admin_update_role on public.users
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and u.role = any (array['admin'::public.user_role, 'super_admin'::public.user_role])
    )
  );

alter policy users_self_update on public.users
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = (
      select users_1.role
      from public.users users_1
      where users_1.id = (select auth.uid())
    )
    and coalesce(is_active, true) = coalesce((
      select users_1.is_active
      from public.users users_1
      where users_1.id = (select auth.uid())
    ), true)
    and coalesce(is_verified, false) = coalesce((
      select users_1.is_verified
      from public.users users_1
      where users_1.id = (select auth.uid())
    ), false)
  );

alter policy orders_customer_read on public.orders
  to authenticated
  using (customer_id = (select auth.uid()));

alter policy orders_restaurant_read on public.orders
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = orders.restaurant_id
        and r.owner_id = (select auth.uid())
    )
  );

alter policy orders_driver_read on public.orders
  to authenticated
  using (driver_id = (select auth.uid()) or driver_id is null);

alter policy orders_insert on public.orders
  to authenticated
  with check (customer_id = (select auth.uid()));

alter policy drivers_self_all on public.drivers
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy driver_status_read_staff on public.driver_status
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and u.role = any (array['admin'::public.user_role, 'restaurant'::public.user_role])
    )
  );

alter policy driver_status_self on public.driver_status
  to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

-- Cover the two remaining attachment foreign keys. These accelerate parent
-- deletes/updates and attachment lookups without changing data visibility.
create index if not exists support_ticket_attachments_reply_idx
  on public.support_ticket_attachments (reply_id);

create index if not exists support_ticket_attachments_uploader_idx
  on public.support_ticket_attachments (uploader_id);
