create table if not exists public.group_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  host_user_id uuid not null references public.users(id) on delete restrict,
  invite_token_hash text not null unique check (length(invite_token_hash) = 64),
  status text not null default 'open' check (status in ('open', 'locked', 'completed', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  locked_at timestamptz,
  completed_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((status = 'locked' and locked_at is not null) or status <> 'locked')
);

create table if not exists public.group_order_participants (
  id uuid primary key default gen_random_uuid(),
  group_order_id uuid not null references public.group_orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (group_order_id, user_id)
);

create unique index if not exists group_order_single_host_idx
  on public.group_order_participants(group_order_id) where is_host;

create table if not exists public.group_order_items (
  id uuid primary key default gen_random_uuid(),
  group_order_id uuid not null references public.group_orders(id) on delete cascade,
  participant_id uuid not null references public.group_order_participants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  config_key text not null check (char_length(config_key) between 8 and 300),
  configuration jsonb not null default '{}'::jsonb,
  product_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, config_key)
);

create index if not exists group_orders_host_status_idx on public.group_orders(host_user_id, status, created_at desc);
create index if not exists group_order_items_group_idx on public.group_order_items(group_order_id, participant_id);

alter table public.group_orders enable row level security;
alter table public.group_order_participants enable row level security;
alter table public.group_order_items enable row level security;

-- Group-order mutations are deliberately available only through BlinkGo's
-- ownership-checking API routes. The browser never receives direct table
-- privileges, which avoids invite-token and cross-participant IDOR risks.
revoke all on public.group_orders, public.group_order_participants, public.group_order_items from anon, authenticated;
grant select, insert, update, delete on public.group_orders, public.group_order_participants, public.group_order_items to service_role;

create or replace function public.finalize_group_order(
  p_group_order_id uuid,
  p_order_id uuid,
  p_host_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_id uuid;
begin
  update public.group_orders g
    set status = 'completed', completed_order_id = p_order_id, updated_at = now()
  where g.id = p_group_order_id
    and g.status = 'locked'
    and g.completed_order_id is null
    and g.host_user_id = p_host_user_id
    and exists (
      select 1 from public.orders o
      where o.id = p_order_id
        and o.customer_id = p_host_user_id
        and o.restaurant_id = g.restaurant_id
    )
  returning g.id into v_updated_id;

  if v_updated_id is not null then return true; end if;
  return exists (
    select 1 from public.group_orders g
    where g.id = p_group_order_id
      and g.host_user_id = p_host_user_id
      and g.status = 'completed'
      and g.completed_order_id = p_order_id
  );
end;
$$;

revoke all on function public.finalize_group_order(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_group_order(uuid, uuid, uuid) to service_role;
