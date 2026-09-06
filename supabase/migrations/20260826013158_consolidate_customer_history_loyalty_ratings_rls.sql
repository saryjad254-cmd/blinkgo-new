-- Customer-owned history tables: one cached ownership policy per table.
revoke all on table public.addresses from anon;
drop policy if exists "Users manage own addresses" on public.addresses;
alter policy addresses_user_all on public.addresses
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.recently_viewed from anon;
drop policy if exists "Users manage own recently viewed" on public.recently_viewed;
alter policy recently_viewed_user on public.recently_viewed
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.search_history from anon;
alter policy "Users manage own search history" on public.search_history
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Loyalty is readable by the owner and operations staff, but writable only
-- through an explicit admin operation (or service_role). Split ALL by command
-- so the admin write policy does not overlap the SELECT policy.
revoke all on table public.loyalty_points from anon;
revoke all on table public.loyalty_transactions from anon;
revoke insert, update, delete on table public.loyalty_transactions from authenticated;
drop policy if exists users_read_own_loyalty on public.loyalty_points;
drop policy if exists loyalty_admin_write on public.loyalty_points;
alter policy loyalty_read_own on public.loyalty_points
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.auth_role()) in ('admin', 'super_admin')
  );

create policy loyalty_admin_insert
  on public.loyalty_points for insert
  to authenticated
  with check ((select public.auth_role()) in ('admin', 'super_admin'));

create policy loyalty_admin_update
  on public.loyalty_points for update
  to authenticated
  using ((select public.auth_role()) in ('admin', 'super_admin'))
  with check ((select public.auth_role()) in ('admin', 'super_admin'));

create policy loyalty_admin_delete
  on public.loyalty_points for delete
  to authenticated
  using ((select public.auth_role()) in ('admin', 'super_admin'));

drop policy if exists users_read_own_loyalty_tx on public.loyalty_transactions;
alter policy loyalty_tx_read_own on public.loyalty_transactions
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.auth_role()) in ('admin', 'super_admin')
  );

-- Ratings remain public to read. Customer inserts must describe a delivered
-- order owned by that customer and must preserve the order's merchant/driver.
-- This keeps verified-purchase enforcement at the database boundary even if a
-- client bypasses the application API. Clients cannot alter/delete ratings.
revoke insert, update, delete on table public.ratings from anon;
revoke update, delete on table public.ratings from authenticated;
drop policy if exists "Users can rate own orders" on public.ratings;
drop policy if exists ratings_insert on public.ratings;
drop policy if exists ratings_read on public.ratings;
alter policy ratings_insert_customer on public.ratings
  to authenticated
  with check (
    (
      customer_id = (select auth.uid())
      and order_id is not null
      and exists (
        select 1
        from public.orders as rated_order
        where rated_order.id = ratings.order_id
          and rated_order.customer_id = (select auth.uid())
          and rated_order.status = 'delivered'
          and rated_order.restaurant_id = ratings.restaurant_id
          and rated_order.driver_id is not distinct from ratings.driver_id
      )
    )
    or (select public.auth_role()) in ('admin', 'super_admin')
  );
