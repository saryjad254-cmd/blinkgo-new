begin;

-- Driver presence and coordinates are writable only by the matching driver.
-- Restaurant users may only see a driver assigned to one of their active orders.
revoke all on table public.driver_status from anon;
revoke all on table public.driver_status from authenticated;
grant select, insert, update, delete on table public.driver_status to authenticated;

drop policy if exists driver_status_self on public.driver_status;
drop policy if exists driver_status_self_read on public.driver_status;
drop policy if exists driver_status_self_write on public.driver_status;
drop policy if exists driver_status_read_staff on public.driver_status;

create policy driver_status_self_read
  on public.driver_status for select
  to authenticated
  using (
    (
      driver_id = (select auth.uid())
      and (select public.auth_role()) = 'driver'
    )
    or (select public.auth_role()) in ('admin', 'super_admin', 'manager')
    or (
      (select public.auth_role()) = 'restaurant'
      and exists (
        select 1
        from public.orders as active_order
        join public.restaurants as owning_restaurant
          on owning_restaurant.id = active_order.restaurant_id
        where active_order.driver_id = driver_status.driver_id
          and owning_restaurant.owner_id = (select auth.uid())
          and active_order.status in ('confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'delivering')
      )
    )
  );

create policy driver_status_self_write
  on public.driver_status for all
  to authenticated
  using (
    driver_id = (select auth.uid())
    and (select public.auth_role()) = 'driver'
  )
  with check (
    driver_id = (select auth.uid())
    and (select public.auth_role()) = 'driver'
  );

-- Restaurant onboarding is server/admin controlled. A restaurant principal can
-- maintain only its own row and cannot turn an ordinary customer into a merchant.
revoke all on table public.restaurants from anon;
revoke all on table public.restaurants from authenticated;
grant select on table public.restaurants to anon;
grant select, insert, update on table public.restaurants to authenticated;

drop policy if exists restaurants_owner_all on public.restaurants;
drop policy if exists restaurants_admin_update on public.restaurants;
drop policy if exists restaurants_owner_read on public.restaurants;
drop policy if exists restaurants_owner_insert on public.restaurants;
drop policy if exists restaurants_owner_update on public.restaurants;
drop policy if exists restaurants_admin_all on public.restaurants;

create policy restaurants_owner_read
  on public.restaurants for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.auth_role()) = 'restaurant'
  );

create policy restaurants_owner_insert
  on public.restaurants for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.auth_role()) = 'restaurant'
  );

create policy restaurants_owner_update
  on public.restaurants for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and (select public.auth_role()) = 'restaurant'
  )
  with check (
    owner_id = (select auth.uid())
    and (select public.auth_role()) = 'restaurant'
  );

create policy restaurants_admin_all
  on public.restaurants for all
  to authenticated
  using ((select public.auth_role()) in ('manager', 'admin', 'super_admin'))
  with check ((select public.auth_role()) in ('manager', 'admin', 'super_admin'));

commit;
