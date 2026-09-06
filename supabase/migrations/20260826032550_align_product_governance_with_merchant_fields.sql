-- The legal-information trigger derives base-price/completeness fields before
-- this governance trigger runs. Treat those derived fields as part of the
-- permitted merchant operation while keeping governance fields immutable.

begin;

create or replace function public.protect_product_governance_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  request_claims jsonb;
begin
  request_claims := case
    when nullif(current_setting('request.jwt.claims', true), '') is null then '{}'::jsonb
    else current_setting('request.jwt.claims', true)::jsonb
  end;

  if current_setting('role', true) = 'service_role'
     or current_setting('request.jwt.claim.role', true) = 'service_role'
     or request_claims ->> 'role' = 'service_role' then
    return new;
  end if;

  select role::text
  into actor_role
  from public.users
  where id = (select auth.uid());

  if actor_role in ('admin', 'super_admin') then
    return new;
  end if;

  if not exists (
    select 1
    from public.restaurants restaurant
    where restaurant.id = old.restaurant_id
      and restaurant.owner_id = (select auth.uid())
  ) then
    raise exception 'product_not_owned' using errcode = '42501';
  end if;

  if (
    to_jsonb(new) - array[
      'price', 'discount_price', 'is_available', 'stock', 'stock_count',
      'track_stock', 'preparation_time', 'prep_time', 'product_kind',
      'legal_name', 'net_quantity', 'net_quantity_unit', 'ingredients_text',
      'allergens', 'additives', 'allergen_information_reviewed', 'nutrition',
      'country_of_origin', 'producer_name', 'producer_address',
      'storage_instructions', 'usage_instructions', 'alcohol_percentage',
      'minimum_age', 'base_price', 'base_price_unit',
      'legal_information_complete', 'legal_information_updated_at',
      'updated_at', 'updated_by'
    ]
  ) is distinct from (
    to_jsonb(old) - array[
      'price', 'discount_price', 'is_available', 'stock', 'stock_count',
      'track_stock', 'preparation_time', 'prep_time', 'product_kind',
      'legal_name', 'net_quantity', 'net_quantity_unit', 'ingredients_text',
      'allergens', 'additives', 'allergen_information_reviewed', 'nutrition',
      'country_of_origin', 'producer_name', 'producer_address',
      'storage_instructions', 'usage_instructions', 'alcohol_percentage',
      'minimum_age', 'base_price', 'base_price_unit',
      'legal_information_complete', 'legal_information_updated_at',
      'updated_at', 'updated_by'
    ]
  ) then
    raise exception 'restaurant_may_only_edit_operational_product_fields'
      using errcode = '42501';
  end if;

  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.protect_product_governance_fields() from public, anon, authenticated;
grant execute on function public.protect_product_governance_fields() to service_role;

commit;
