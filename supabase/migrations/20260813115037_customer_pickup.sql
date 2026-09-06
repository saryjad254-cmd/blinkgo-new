begin;

alter table public.restaurants
  add column if not exists pickup_enabled boolean not null default true,
  add column if not exists pickup_instructions text;

alter table public.orders
  add column if not exists fulfillment_type text not null default 'delivery',
  add column if not exists pickup_code text;

alter table public.orders alter column delivery_address drop not null;

alter table public.orders drop constraint if exists orders_fulfillment_type_check;
alter table public.orders add constraint orders_fulfillment_type_check
  check (fulfillment_type in ('delivery', 'pickup'));

alter table public.orders drop constraint if exists orders_fulfillment_integrity_check;
alter table public.orders add constraint orders_fulfillment_integrity_check check (
  (fulfillment_type = 'delivery' and delivery_address is not null)
  or
  (fulfillment_type = 'pickup' and delivery_fee = 0 and driver_id is null
    and customer_latitude is null and customer_longitude is null
    and pickup_code ~ '^[0-9]{6}$')
);

create index if not exists idx_orders_fulfillment_status_created
  on public.orders (fulfillment_type, status, created_at desc);

comment on column public.orders.fulfillment_type is
  'Customer-selected fulfilment mode. pickup orders never enter driver dispatch.';
comment on column public.orders.pickup_code is
  'Six-digit handover code for customer pickup. Read access remains governed by order ownership RLS/API checks.';

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
  p_items                   jsonb,
  p_fulfillment_type        text default 'delivery',
  p_payment_intent_id       text default null,
  p_stripe_event_id         text default null
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
  v_fulfillment_type text := lower(coalesce(p_fulfillment_type, 'delivery'));
  v_pickup_code text;
  v_pickup_enabled boolean;
begin
  if v_fulfillment_type not in ('delivery', 'pickup') then
    raise exception 'create_order_atomic: invalid fulfillment type' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order_atomic: p_items must be a non-empty jsonb array' using errcode = '22023';
  end if;
  if v_fulfillment_type = 'delivery' and p_delivery_address is null then
    raise exception 'create_order_atomic: delivery address required' using errcode = '22023';
  end if;
  if v_fulfillment_type = 'pickup' then
    select pickup_enabled into v_pickup_enabled from public.restaurants where id = p_restaurant_id;
    if coalesce(v_pickup_enabled, false) is not true then
      raise exception 'create_order_atomic: pickup disabled' using errcode = '22023';
    end if;
    v_pickup_code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  end if;

  insert into public.orders (
    order_number, customer_id, restaurant_id, status,
    subtotal, delivery_fee, service_fee, tip, discount, total,
    payment_method, payment_status, delivery_address,
    customer_latitude, customer_longitude,
    restaurant_latitude, restaurant_longitude, scheduled_for,
    fulfillment_type, pickup_code, driver_id,
    payment_intent_id, stripe_event_id
  ) values (
    p_order_number, p_customer_id, p_restaurant_id, 'pending',
    p_subtotal, case when v_fulfillment_type = 'pickup' then 0 else p_delivery_fee end,
    p_service_fee, p_tip, p_discount,
    case when v_fulfillment_type = 'pickup' then p_total - p_delivery_fee else p_total end,
    p_payment_method, 'pending',
    case when v_fulfillment_type = 'pickup' then null else p_delivery_address end,
    case when v_fulfillment_type = 'pickup' then null else p_customer_latitude end,
    case when v_fulfillment_type = 'pickup' then null else p_customer_longitude end,
    p_restaurant_latitude, p_restaurant_longitude, p_scheduled_for,
    v_fulfillment_type, v_pickup_code, null,
    p_payment_intent_id, p_stripe_event_id
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_product := (v_item->>'product_id')::uuid;
    v_item_qty := (v_item->>'quantity')::integer;
    if v_item_qty < 1 or v_item_qty > 99 then
      raise exception 'create_order_atomic: invalid quantity % for product %', v_item_qty, v_item_product using errcode = '22023';
    end if;
    select stock, coalesce(track_stock, false) into v_stock, v_track_stock
      from public.products
      where id = v_item_product and restaurant_id = p_restaurant_id
        and is_active = true and is_available = true
      for update;
    if not found then
      raise exception 'create_order_atomic: product % not found', v_item_product using errcode = 'P0002';
    end if;
    if v_track_stock and coalesce(v_stock, 0) < v_item_qty then
      raise exception 'OUT_OF_STOCK: %', v_item->>'product_name' using errcode = 'P0001';
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

drop function if exists public.create_order_atomic(
  text, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric,
  text, jsonb, numeric, numeric, numeric, numeric, timestamptz, jsonb
);

revoke all on function public.create_order_atomic(
  text, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric,
  text, jsonb, numeric, numeric, numeric, numeric, timestamptz, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_order_atomic(
  text, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric,
  text, jsonb, numeric, numeric, numeric, numeric, timestamptz, jsonb, text, text, text
) to service_role;

commit;
