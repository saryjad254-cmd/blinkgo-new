-- Persist the latest courier position on the active order so customer
-- tracking can receive it through the existing orders Realtime channel.
-- All columns are nullable because an order has no courier position before
-- assignment and older completed orders do not need a backfill.

alter table public.orders
  add column if not exists driver_latitude double precision,
  add column if not exists driver_longitude double precision,
  add column if not exists driver_bearing double precision,
  add column if not exists driver_speed double precision,
  add column if not exists driver_accuracy double precision,
  add column if not exists last_location_update timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_driver_latitude_range') then
    alter table public.orders add constraint orders_driver_latitude_range
      check (driver_latitude is null or driver_latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_driver_longitude_range') then
    alter table public.orders add constraint orders_driver_longitude_range
      check (driver_longitude is null or driver_longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_driver_bearing_range') then
    alter table public.orders add constraint orders_driver_bearing_range
      check (driver_bearing is null or (driver_bearing >= 0 and driver_bearing < 360));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_driver_speed_nonnegative') then
    alter table public.orders add constraint orders_driver_speed_nonnegative
      check (driver_speed is null or driver_speed >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_driver_accuracy_nonnegative') then
    alter table public.orders add constraint orders_driver_accuracy_nonnegative
      check (driver_accuracy is null or driver_accuracy >= 0);
  end if;
end
$$;

create index if not exists idx_orders_driver_location_freshness
  on public.orders (driver_id, last_location_update desc)
  where driver_id is not null and last_location_update is not null;
