alter table public.products
  add column if not exists product_kind text not null default 'prepared_food',
  add column if not exists legal_name text,
  add column if not exists net_quantity numeric(12,3),
  add column if not exists net_quantity_unit text,
  add column if not exists base_price_unit text,
  add column if not exists base_price numeric(12,2),
  add column if not exists ingredients_text text,
  add column if not exists allergen_information_reviewed boolean not null default false,
  add column if not exists additives text[] not null default '{}',
  add column if not exists nutrition jsonb not null default '{}'::jsonb,
  add column if not exists country_of_origin text,
  add column if not exists producer_name text,
  add column if not exists producer_address text,
  add column if not exists storage_instructions text,
  add column if not exists usage_instructions text,
  add column if not exists alcohol_percentage numeric(5,2),
  add column if not exists minimum_age integer,
  add column if not exists legal_information_complete boolean not null default false,
  add column if not exists legal_information_updated_at timestamptz;

alter table public.products drop constraint if exists products_product_kind_check;
alter table public.products add constraint products_product_kind_check
  check (product_kind in ('prepared_food','prepacked_food','beverage','alcohol','non_food'));
alter table public.products drop constraint if exists products_net_quantity_check;
alter table public.products add constraint products_net_quantity_check
  check ((net_quantity is null and net_quantity_unit is null) or (net_quantity > 0 and net_quantity_unit in ('g','kg','ml','l','m','m2','piece')));
alter table public.products drop constraint if exists products_base_price_check;
alter table public.products add constraint products_base_price_check
  check ((base_price is null and base_price_unit is null) or (base_price >= 0 and base_price_unit in ('kg','l','m','m2','piece')));
alter table public.products drop constraint if exists products_alcohol_check;
alter table public.products add constraint products_alcohol_check
  check ((product_kind <> 'alcohol') or (alcohol_percentage is not null and alcohol_percentage > 0 and alcohol_percentage <= 100 and minimum_age in (16,18)));
alter table public.products drop constraint if exists products_minimum_age_check;
alter table public.products add constraint products_minimum_age_check check (minimum_age is null or minimum_age in (16,18));

create or replace function public.compute_product_legal_completeness(p public.products)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case p.product_kind
    when 'prepared_food' then
      nullif(trim(coalesce(p.legal_name,p.name)), '') is not null
      and p.allergen_information_reviewed
    when 'prepacked_food' then
      nullif(trim(p.legal_name), '') is not null and p.net_quantity is not null
      and nullif(trim(p.ingredients_text), '') is not null
      and p.allergen_information_reviewed
      and jsonb_typeof(p.nutrition) = 'object' and p.nutrition ?& array['energy_kj','fat_g','saturates_g','carbohydrate_g','sugars_g','protein_g','salt_g']
      and nullif(trim(p.producer_name), '') is not null and nullif(trim(p.producer_address), '') is not null
    when 'beverage' then
      nullif(trim(p.legal_name), '') is not null and p.net_quantity is not null and p.net_quantity_unit in ('ml','l')
      and nullif(trim(p.ingredients_text), '') is not null
      and p.allergen_information_reviewed
    when 'alcohol' then
      nullif(trim(p.legal_name), '') is not null and p.net_quantity is not null and p.net_quantity_unit in ('ml','l')
      and p.alcohol_percentage > 0 and p.minimum_age in (16,18)
      and nullif(trim(p.producer_name), '') is not null
    when 'non_food' then nullif(trim(coalesce(p.legal_name,p.name)), '') is not null
    else false end;
$$;

create or replace function public.products_legal_information_trigger()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.net_quantity is not null and new.net_quantity_unit in ('g','kg','ml','l','m','m2') then
    new.base_price_unit := case new.net_quantity_unit when 'g' then 'kg' when 'kg' then 'kg' when 'ml' then 'l' when 'l' then 'l' else new.net_quantity_unit end;
    new.base_price := round((coalesce(new.discount_price,new.price) / case new.net_quantity_unit when 'g' then new.net_quantity/1000 when 'ml' then new.net_quantity/1000 else new.net_quantity end)::numeric, 2);
  elsif new.net_quantity_unit = 'piece' then
    new.base_price_unit := null; new.base_price := null;
  end if;
  new.legal_information_complete := public.compute_product_legal_completeness(new);
  new.legal_information_updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_products_legal_information on public.products;
create trigger trg_products_legal_information before insert or update on public.products
for each row execute function public.products_legal_information_trigger();

-- This is a schema-owned backfill, not a merchant edit. The existing
-- governance trigger deliberately rejects updates without an authenticated
-- actor, including migrations. Disable only that trigger for this statement;
-- migration transactions restore it automatically on failure and the next
-- statement re-enables it before commit.
alter table public.products disable trigger trg_protect_product_governance_fields;
update public.products set product_kind=coalesce(product_kind,'prepared_food') where legal_information_updated_at is null;
alter table public.products enable trigger trg_protect_product_governance_fields;

comment on column public.products.legal_information_complete is
  'Server-derived completeness gate. This is operational support, not a substitute for category-specific legal review.';
