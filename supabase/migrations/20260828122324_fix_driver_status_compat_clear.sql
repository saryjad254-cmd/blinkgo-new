-- The legacy compatibility trigger previously used COALESCE for order IDs.
-- That made an explicit current_order_id = NULL impossible whenever the
-- mirrored active_order_id still held an old value.
create or replace function public.sync_driver_status_compat()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.current_order_id := coalesce(new.current_order_id, new.active_order_id);
    new.active_order_id := new.current_order_id;
  elsif new.current_order_id is distinct from old.current_order_id then
    -- current_order_id is the canonical application field, including an
    -- intentional NULL used when a delivery finishes.
    new.active_order_id := new.current_order_id;
  elsif new.active_order_id is distinct from old.active_order_id then
    -- Preserve compatibility for the few legacy writers that still update
    -- active_order_id directly.
    new.current_order_id := new.active_order_id;
  else
    new.active_order_id := new.current_order_id;
  end if;

  new.latitude := coalesce(new.latitude, new.current_lat, new.last_location_lat);
  new.longitude := coalesce(new.longitude, new.current_lng, new.last_location_lng);
  new.current_lat := new.latitude;
  new.current_lng := new.longitude;
  new.last_location_lat := new.latitude;
  new.last_location_lng := new.longitude;
  new.last_location_at := coalesce(new.last_location_at, new.updated_at, now());
  new.heading := coalesce(new.heading, new.bearing);
  new.bearing := new.heading;
  return new;
end;
$$;

-- Repair rows affected by the old COALESCE behavior. Both compatibility
-- columns must be cleared in the same statement.
update public.driver_status as ds
set current_order_id = null,
    active_order_id = null,
    is_on_delivery = false,
    updated_at = now()
where coalesce(ds.current_order_id, ds.active_order_id) is not null
  and not exists (
    select 1
    from public.orders as active_order
    where active_order.id = coalesce(ds.current_order_id, ds.active_order_id)
      and active_order.driver_id = ds.driver_id
      and active_order.status in (
        'pending', 'confirmed', 'preparing', 'ready',
        'assigned', 'picked_up', 'delivering'
      )
  );
