alter table public.products add column if not exists storefront_vertical text;

-- Schema-owned classification backfill. Merchant governance stays active for
-- every application request and is disabled only inside this migration step.
alter table public.products disable trigger trg_protect_product_governance_fields;
update public.products as product
set storefront_vertical = case
  when exists (select 1 from public.restaurants as merchant where merchant.id = product.restaurant_id and coalesce(merchant.type, 'restaurant') = 'restaurant') then 'restaurant'
  when lower(coalesce(product.category, '')) in ('lebensmittel', 'groceries', 'food', 'getrÃ¤nke', 'beverages', 'pflege', 'personal care', 'pharmacy', 'apotheke', 'baby', 'tierbedarf') then 'market'
  else 'shop'
end
where storefront_vertical is null or storefront_vertical not in ('restaurant', 'market', 'shop');
alter table public.products enable trigger trg_protect_product_governance_fields;

alter table public.products alter column storefront_vertical set default 'restaurant';
alter table public.products alter column storefront_vertical set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_storefront_vertical_check' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_storefront_vertical_check check (storefront_vertical in ('restaurant', 'market', 'shop'));
  end if;
end
$$;

create index if not exists products_storefront_catalog_idx
  on public.products (storefront_vertical, approval_status, is_available, is_featured desc, sold_count desc)
  where archived_at is null;

comment on column public.products.storefront_vertical is 'Customer discovery surface: restaurant, market, or shop. A retail merchant may sell in both market and shop.';
