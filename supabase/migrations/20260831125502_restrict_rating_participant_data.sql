begin;

-- Ratings include order/customer/driver identifiers. Public review rendering
-- is served through a redacted server endpoint; raw rows remain participant-only.
revoke all on table public.ratings from anon;
revoke all on table public.ratings from authenticated;
grant select on table public.ratings to authenticated;

drop policy if exists "Public can read ratings" on public.ratings;
drop policy if exists ratings_read on public.ratings;
drop policy if exists ratings_participant_read on public.ratings;

create policy ratings_participant_read
  on public.ratings for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    or driver_id = (select auth.uid())
    or exists (
      select 1
      from public.restaurants as rated_restaurant
      where rated_restaurant.id = ratings.restaurant_id
        and rated_restaurant.owner_id = (select auth.uid())
    )
    or (select public.auth_role()) in ('manager', 'admin', 'super_admin')
  );

commit;
