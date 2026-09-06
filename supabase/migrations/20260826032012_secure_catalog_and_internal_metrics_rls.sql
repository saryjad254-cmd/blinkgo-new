begin;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.daily_stats enable row level security;
alter table public.delivery_proofs enable row level security;

drop policy if exists "Owners manage categories" on public.categories;
drop policy if exists "Public can read categories" on public.categories;
drop policy if exists categories_read on public.categories;
drop policy if exists categories_service on public.categories;

revoke all on table public.categories from anon, authenticated;
grant select on table public.categories to anon, authenticated;

create policy categories_read
on public.categories
for select
to anon, authenticated
using (true);

create policy categories_service
on public.categories
for all
to service_role
using (true)
with check (true);

drop policy if exists products_admin_delete on public.products;
drop policy if exists products_admin_insert on public.products;
drop policy if exists products_customer_visible on public.products;
drop policy if exists products_owner_or_admin_update on public.products;
drop policy if exists products_anon_visible on public.products;
drop policy if exists products_authenticated_visible on public.products;
drop policy if exists products_owner_update on public.products;
drop policy if exists products_service on public.products;

revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;
grant update (
  price,
  discount_price,
  is_available,
  preparation_time,
  track_stock,
  stock,
  product_kind,
  legal_name,
  net_quantity,
  net_quantity_unit,
  ingredients_text,
  allergens,
  additives,
  allergen_information_reviewed,
  nutrition,
  country_of_origin,
  producer_name,
  producer_address,
  storage_instructions,
  usage_instructions,
  alcohol_percentage,
  minimum_age
) on table public.products to authenticated;

create policy products_anon_visible
on public.products
for select
to anon
using (
  approval_status = 'approved'
  and archived_at is null
  and is_active = true
  and is_available = true
);

create policy products_authenticated_visible
on public.products
for select
to authenticated
using (
  (
    approval_status = 'approved'
    and archived_at is null
    and is_active = true
    and is_available = true
  )
  or exists (
    select 1
    from public.restaurants restaurant
    where restaurant.id = products.restaurant_id
      and restaurant.owner_id = (select auth.uid())
  )
  or (select public.auth_role()) in ('admin', 'super_admin', 'manager')
);

create policy products_owner_update
on public.products
for update
to authenticated
using (
  exists (
    select 1
    from public.restaurants restaurant
    where restaurant.id = products.restaurant_id
      and restaurant.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.restaurants restaurant
    where restaurant.id = products.restaurant_id
      and restaurant.owner_id = (select auth.uid())
  )
);

create policy products_service
on public.products
for all
to service_role
using (true)
with check (true);

drop policy if exists "Admins manage daily stats" on public.daily_stats;
drop policy if exists "Public can read daily stats" on public.daily_stats;
drop policy if exists daily_stats_service on public.daily_stats;
revoke all on table public.daily_stats from anon, authenticated;
create policy daily_stats_service
on public.daily_stats
for all
to service_role
using (true)
with check (true);

drop policy if exists "Drivers manage delivery proofs" on public.delivery_proofs;
drop policy if exists "Public can read delivery proofs" on public.delivery_proofs;
drop policy if exists delivery_proofs_service on public.delivery_proofs;
revoke all on table public.delivery_proofs from anon, authenticated;
create policy delivery_proofs_service
on public.delivery_proofs
for all
to service_role
using (true)
with check (true);

commit;
