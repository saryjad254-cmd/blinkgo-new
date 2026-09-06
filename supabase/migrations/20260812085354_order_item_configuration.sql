begin;

alter table public.order_items
  add column if not exists configuration jsonb not null default '{}'::jsonb;

comment on column public.order_items.configuration is
  'Immutable server-validated line configuration, including modifiers, notes, and retail substitution preference.';

create or replace function public.create_order_atomic(
  p_order_number            text,
  p_customer_id             uuid,
  p_restaurant_id           uuid,
  p_subtotal                numeric,
  p_delivery_fee            numeric,
  p_service_fee             numeric,
  p_tip                     numeric,
  p_discount                numeric,
  p_total                   numeric,
  p_payment_method          text,
  p_delivery_address        jsonb,
  p_customer_latitude       numeric,
  p_customer_longitude      numeric,
  p_restaurant_latitude     numeric,
  p_restaurant_longitude    numeric,
  p_scheduled_for           timestamptz,
  p_items                   jsonb
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_item_product uuid;
  v_item_qty integer;
  v_stock integer;
  v_track_stock boolean;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order_atomic: p_items must be a non-empty jsonb array' using errcode = '22023';
  end if;

  insert into public.orders (
    order_number, customer_id, restaurant_id, status,
    subtotal, delivery_fee, service_fee, tip, discount, total,
    payment_method, payment_status, delivery_address,
    customer_latitude, customer_longitude,
    restaurant_latitude, restaurant_longitude, scheduled_for
  ) values (
    p_order_number, p_customer_id, p_restaurant_id, 'pending',
    p_subtotal, p_delivery_fee, p_service_fee, p_tip, p_discount, p_total,
    p_payment_method, 'pending',
    p_delivery_address,
    p_customer_latitude, p_customer_longitude,
    p_restaurant_latitude, p_restaurant_longitude, p_scheduled_for
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_product := (v_item->>'product_id')::uuid;
    v_item_qty := (v_item->>'quantity')::integer;
    if v_item_qty < 1 or v_item_qty > 99 then
      raise exception 'create_order_atomic: invalid quantity % for product %', v_item_qty, v_item_product using errcode = '22023';
    end if;

    select stock, coalesce(track_stock, false)
      into v_stock, v_track_stock
      from public.products
      where id = v_item_product and restaurant_id = p_restaurant_id and is_active = true and is_available = true
      for update;
    if not found then
      raise exception 'create_order_atomic: product % not found', v_item_product using errcode = 'P0002';
    end if;
    if v_track_stock and coalesce(v_stock, 0) < v_item_qty then
      raise exception 'create_order_atomic: insufficient stock for product %', v_item_product using errcode = 'P0001';
    end if;

    update public.products
      set stock = case when v_track_stock then stock - v_item_qty else stock end,
          sold_count = coalesce(sold_count, 0) + v_item_qty,
          updated_at = now()
      where id = v_item_product;

    insert into public.order_items (
      order_id, product_id, product_name, product_price, quantity, subtotal, configuration
    ) values (
      v_order_id, v_item_product, v_item->>'product_name',
      (v_item->>'product_price')::numeric, v_item_qty,
      (v_item->>'subtotal')::numeric, coalesce(v_item->'configuration', '{}'::jsonb)
    );
  end loop;

  return query select v_order_id, p_order_number;
end;
$$;

revoke all on function public.create_order_atomic(
  text, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric,
  text, jsonb, numeric, numeric, numeric, numeric, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.create_order_atomic(
  text, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric,
  text, jsonb, numeric, numeric, numeric, numeric, timestamptz, jsonb
) to service_role;

commit;
