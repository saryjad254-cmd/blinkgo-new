begin;

create table if not exists public.restaurant_special_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  service_date date not null,
  is_closed boolean not null default true,
  open_time time without time zone,
  close_time time without time zone,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_special_hours_unique_date unique (restaurant_id, service_date),
  constraint restaurant_special_hours_reason_length check (reason is null or char_length(reason) <= 160),
  constraint restaurant_special_hours_times check (
    (is_closed and open_time is null and close_time is null)
    or
    (not is_closed and open_time is not null and close_time is not null)
  )
);

create index if not exists idx_restaurant_special_hours_date
  on public.restaurant_special_hours (restaurant_id, service_date);

alter table public.restaurant_special_hours enable row level security;

revoke all on public.restaurant_special_hours from anon, authenticated;
grant select on public.restaurant_special_hours to authenticated;
grant insert, update, delete on public.restaurant_special_hours to authenticated;
grant all on public.restaurant_special_hours to service_role;

drop policy if exists restaurant_special_hours_owner_read on public.restaurant_special_hours;
create policy restaurant_special_hours_owner_read
  on public.restaurant_special_hours
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants restaurant
      where restaurant.id = restaurant_special_hours.restaurant_id
        and restaurant.owner_id = (select auth.uid())
    )
  );

drop policy if exists restaurant_special_hours_owner_insert on public.restaurant_special_hours;
create policy restaurant_special_hours_owner_insert
  on public.restaurant_special_hours
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.restaurants restaurant
      where restaurant.id = restaurant_special_hours.restaurant_id
        and restaurant.owner_id = (select auth.uid())
    )
  );

drop policy if exists restaurant_special_hours_owner_update on public.restaurant_special_hours;
create policy restaurant_special_hours_owner_update
  on public.restaurant_special_hours
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants restaurant
      where restaurant.id = restaurant_special_hours.restaurant_id
        and restaurant.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants restaurant
      where restaurant.id = restaurant_special_hours.restaurant_id
        and restaurant.owner_id = (select auth.uid())
    )
  );

drop policy if exists restaurant_special_hours_owner_delete on public.restaurant_special_hours;
create policy restaurant_special_hours_owner_delete
  on public.restaurant_special_hours
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants restaurant
      where restaurant.id = restaurant_special_hours.restaurant_id
        and restaurant.owner_id = (select auth.uid())
    )
  );

comment on table public.restaurant_special_hours is
  'Date-specific venue hours. A matching row overrides the weekly restaurant opening_hours schedule.';

commit;
