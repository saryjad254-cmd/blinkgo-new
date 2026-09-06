insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs',
  'delivery-proofs',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.order_delivery_proofs (
  order_id uuid primary key references public.orders(id) on delete cascade,
  driver_id uuid not null references public.users(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 3145728),
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.order_failed_deliveries (
  order_id uuid primary key references public.orders(id) on delete cascade,
  driver_id uuid not null references public.users(id) on delete restrict,
  reason_code text not null check (reason_code in (
    'customer_unreachable',
    'cannot_find_address',
    'unsafe_location',
    'recipient_refused',
    'damaged_order',
    'other'
  )),
  details text,
  contact_attempts smallint not null check (contact_attempts between 0 and 9),
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  resolution text
);

alter table public.order_delivery_proofs enable row level security;
alter table public.order_failed_deliveries enable row level security;
revoke all on public.order_delivery_proofs from public, anon, authenticated;
revoke all on public.order_failed_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.order_delivery_proofs to service_role;
grant select, insert, update, delete on public.order_failed_deliveries to service_role;

create index if not exists order_delivery_proofs_expiry_idx
  on public.order_delivery_proofs(expires_at)
  where deleted_at is null;
create index if not exists order_failed_deliveries_reported_idx
  on public.order_failed_deliveries(reported_at desc);

comment on table public.order_delivery_proofs is
  'Private proof-of-delivery metadata. Files live in the private delivery-proofs bucket and expire after 30 days.';
comment on table public.order_failed_deliveries is
  'Auditable failed-delivery outcome. Accessible only through authorized server routes.';

create or replace function public.complete_driver_delivery(
  p_order_id uuid,
  p_driver_id uuid,
  p_proof_path text default null,
  p_proof_mime_type text default null,
  p_proof_byte_size integer default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  completed_order public.orders%rowtype;
  completion_time timestamptz := now();
begin
  update public.orders
  set status = 'delivered', delivered_at = completion_time, updated_at = completion_time
  where id = p_order_id
    and driver_id = p_driver_id
    and status in ('picked_up', 'delivering')
  returning * into completed_order;

  if completed_order.id is null then
    raise exception 'DELIVERY_STATE_CHANGED';
  end if;

  if p_proof_path is not null then
    insert into public.order_delivery_proofs (
      order_id, driver_id, storage_path, mime_type, byte_size, captured_at, expires_at
    ) values (
      p_order_id, p_driver_id, p_proof_path, p_proof_mime_type, p_proof_byte_size,
      completion_time, completion_time + interval '30 days'
    )
    on conflict (order_id) do update
      set storage_path = excluded.storage_path,
          mime_type = excluded.mime_type,
          byte_size = excluded.byte_size,
          captured_at = excluded.captured_at,
          expires_at = excluded.expires_at,
          deleted_at = null;
  end if;

  update public.driver_status
  set is_on_delivery = false, current_order_id = null, updated_at = completion_time
  where driver_id = p_driver_id and current_order_id = p_order_id;

  return next completed_order;
end;
$$;

create or replace function public.fail_driver_delivery(
  p_order_id uuid,
  p_driver_id uuid,
  p_reason_code text,
  p_details text,
  p_contact_attempts smallint
)
returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  failed_order public.orders%rowtype;
  failure_time timestamptz := now();
begin
  update public.orders
  set status = 'could_not_deliver', updated_at = failure_time
  where id = p_order_id
    and driver_id = p_driver_id
    and status in ('picked_up', 'delivering')
  returning * into failed_order;

  if failed_order.id is null then
    raise exception 'DELIVERY_STATE_CHANGED';
  end if;

  insert into public.order_failed_deliveries (
    order_id, driver_id, reason_code, details, contact_attempts, reported_at
  ) values (
    p_order_id, p_driver_id, p_reason_code, nullif(trim(p_details), ''), p_contact_attempts, failure_time
  )
  on conflict (order_id) do update
    set reason_code = excluded.reason_code,
        details = excluded.details,
        contact_attempts = excluded.contact_attempts,
        reported_at = excluded.reported_at;

  update public.driver_status
  set is_on_delivery = false, current_order_id = null, updated_at = failure_time
  where driver_id = p_driver_id and current_order_id = p_order_id;

  return next failed_order;
end;
$$;

revoke all on function public.complete_driver_delivery(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.fail_driver_delivery(uuid, uuid, text, text, smallint) from public, anon, authenticated;
grant execute on function public.complete_driver_delivery(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.fail_driver_delivery(uuid, uuid, text, text, smallint) to service_role;
