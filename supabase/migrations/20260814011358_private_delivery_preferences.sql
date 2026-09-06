create table if not exists public.order_delivery_preferences (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete restrict,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_delivery_preferences_shape check (
    jsonb_typeof(preferences) = 'object'
    and coalesce(preferences->>'handoff', 'hand_to_me') in ('hand_to_me', 'leave_at_door')
    and length(coalesce(preferences->>'recipient_name', '')) <= 80
    and length(coalesce(preferences->>'bell_name', '')) <= 80
    and length(coalesce(preferences->>'floor', '')) <= 20
    and length(coalesce(preferences->>'instructions', '')) <= 300
  )
);

alter table public.order_delivery_preferences enable row level security;
revoke all on public.order_delivery_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.order_delivery_preferences to service_role;

create index if not exists order_delivery_preferences_customer_idx
  on public.order_delivery_preferences(customer_id, created_at desc);

comment on table public.order_delivery_preferences is
  'Private courier handoff data. Never expose through customer, merchant, or pre-acceptance offer queries.';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.capture_order_delivery_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  captured_preferences jsonb;
begin
  if new.fulfillment_type = 'delivery' and jsonb_typeof(new.delivery_address) = 'object' then
    captured_preferences := new.delivery_address->'delivery_preferences';

    if captured_preferences is not null and captured_preferences <> '{}'::jsonb then
      insert into public.order_delivery_preferences (order_id, customer_id, preferences)
      values (new.id, new.customer_id, captured_preferences)
      on conflict (order_id) do update
        set preferences = excluded.preferences,
            updated_at = now();
    end if;

    if new.delivery_address ? 'delivery_preferences' then
      update public.orders
      set delivery_address = new.delivery_address - 'delivery_preferences'
      where id = new.id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_order_delivery_preferences() from public, anon, authenticated;

drop trigger if exists capture_order_delivery_preferences_after_insert on public.orders;
create trigger capture_order_delivery_preferences_after_insert
after insert on public.orders
for each row execute function private.capture_order_delivery_preferences();
