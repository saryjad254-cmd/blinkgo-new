begin;

-- Public storefronts must never expose hidden, inactive, or unverified
-- restaurants. Owners and platform operators retain their dedicated policies.
drop policy if exists restaurants_public_read on public.restaurants;
create policy restaurants_public_read
  on public.restaurants for select
  to anon, authenticated
  using (
    is_active = true
    and coalesce(is_verified, false) = true
    and coalesce(is_hidden, false) = false
  );

-- Only currently redeemable coupons belong in the customer-facing catalog.
-- Validation still happens server-side at checkout; this policy prevents
-- enumeration of expired, deleted, future, or exhausted codes.
drop policy if exists coupons_read on public.coupons;
create policy coupons_read
  on public.coupons for select
  to anon, authenticated
  using (
    is_active = true
    and deleted_at is null
    and (valid_from is null or valid_from <= now())
    and (start_date is null or start_date <= now())
    and (valid_until is null or valid_until >= now())
    and (end_date is null or end_date >= now())
    and (usage_limit is null or coalesce(usage_count, 0) < usage_limit)
    and (max_uses is null or coalesce(current_uses, 0) < max_uses)
  );

-- Legacy reviews contain internal order/customer/driver identifiers. Raw rows
-- are participant-only; public presentation must use a redacted server API.
revoke all on table public.reviews from anon;
revoke all on table public.reviews from authenticated;
grant select, insert on table public.reviews to authenticated;

drop policy if exists reviews_read on public.reviews;
drop policy if exists reviews_insert on public.reviews;
drop policy if exists reviews_participant_read on public.reviews;
drop policy if exists reviews_customer_insert on public.reviews;

create policy reviews_participant_read
  on public.reviews for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    or driver_id = (select auth.uid())
    or exists (
      select 1
      from public.restaurants as reviewed_restaurant
      where reviewed_restaurant.id = reviews.restaurant_id
        and reviewed_restaurant.owner_id = (select auth.uid())
    )
    or (select public.auth_role()) in ('manager', 'admin', 'super_admin')
  );

create policy reviews_customer_insert
  on public.reviews for insert
  to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (
      select 1
      from public.orders as reviewed_order
      where reviewed_order.id = reviews.order_id
        and reviewed_order.customer_id = (select auth.uid())
        and reviewed_order.restaurant_id = reviews.restaurant_id
        and reviewed_order.status = 'delivered'
        and (reviews.driver_id is null or reviews.driver_id = reviewed_order.driver_id)
    )
  );

commit;
