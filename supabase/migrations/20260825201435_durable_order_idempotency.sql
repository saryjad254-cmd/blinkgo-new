-- Durable, cross-instance idempotency for state-changing API operations.
-- The service role is the only caller. Client roles receive no table or
-- function privileges; RLS remains enabled as defense in depth.

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  scope text not null,
  request_fingerprint text,
  state text not null default 'processing',
  owner_token uuid,
  locked_until timestamptz,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idempotency_keys_key_scope_unique unique (key, scope),
  constraint idempotency_keys_state_check
    check (state in ('processing', 'completed'))
);

-- Upgrade databases that already received the historical deploy SQL.
alter table public.idempotency_keys
  add column if not exists request_fingerprint text,
  add column if not exists state text not null default 'processing',
  add column if not exists owner_token uuid,
  add column if not exists locked_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Historical rows were not user-scoped and have no request fingerprint, so
-- replaying them after this upgrade would be unsafe. They are only a 24-hour
-- cache, not business records, and can be discarded safely.
delete from public.idempotency_keys where request_fingerprint is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.idempotency_keys'::regclass
      and conname = 'idempotency_keys_state_check'
  ) then
    alter table public.idempotency_keys
      add constraint idempotency_keys_state_check
      check (state in ('processing', 'completed'));
  end if;
end;
$$;

create unique index if not exists idempotency_keys_key_scope_uidx
  on public.idempotency_keys (key, scope);

create index if not exists idempotency_keys_expiry_idx
  on public.idempotency_keys (expires_at);

alter table public.idempotency_keys enable row level security;
revoke all on table public.idempotency_keys from anon, authenticated;
grant select, insert, update, delete on table public.idempotency_keys to service_role;

drop policy if exists idempotency_keys_service_all on public.idempotency_keys;
create policy idempotency_keys_service_all
  on public.idempotency_keys
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.claim_idempotency_key(
  p_key text,
  p_scope text,
  p_request_fingerprint text,
  p_owner_token uuid,
  p_ttl_seconds integer default 86400,
  p_lock_seconds integer default 300
)
returns table (
  action text,
  cached_status integer,
  cached_body jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.idempotency_keys%rowtype;
  v_inserted integer := 0;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 200 then
    raise exception 'invalid idempotency key';
  end if;
  if p_scope is null or length(p_scope) < 3 or length(p_scope) > 500 then
    raise exception 'invalid idempotency scope';
  end if;
  if p_request_fingerprint is null or length(p_request_fingerprint) <> 64 then
    raise exception 'invalid request fingerprint';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 604800 then
    raise exception 'invalid idempotency ttl';
  end if;
  if p_lock_seconds < 5 or p_lock_seconds > 900 then
    raise exception 'invalid idempotency lock duration';
  end if;

  insert into public.idempotency_keys (
    key, scope, request_fingerprint, state, owner_token, locked_until, expires_at
  ) values (
    p_key,
    p_scope,
    p_request_fingerprint,
    'processing',
    p_owner_token,
    now() + make_interval(secs => p_lock_seconds),
    now() + make_interval(secs => p_ttl_seconds)
  )
  on conflict (key, scope) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return query select 'acquired'::text, null::integer, null::jsonb;
    return;
  end if;

  select i.* into v_row
  from public.idempotency_keys i
  where i.key = p_key and i.scope = p_scope
  for update;

  if not found then
    raise exception 'idempotency claim disappeared';
  end if;

  if v_row.expires_at <= now() then
    update public.idempotency_keys i
    set request_fingerprint = p_request_fingerprint,
        state = 'processing',
        owner_token = p_owner_token,
        locked_until = now() + make_interval(secs => p_lock_seconds),
        response_status = null,
        response_body = null,
        expires_at = now() + make_interval(secs => p_ttl_seconds),
        updated_at = now()
    where i.id = v_row.id;
    return query select 'acquired'::text, null::integer, null::jsonb;
    return;
  end if;

  if v_row.request_fingerprint is not null
     and v_row.request_fingerprint <> p_request_fingerprint then
    return query select 'conflict'::text, null::integer, null::jsonb;
    return;
  end if;

  if v_row.state = 'completed' and v_row.response_body is not null then
    return query select
      'cached'::text,
      coalesce(v_row.response_status, 200),
      v_row.response_body;
    return;
  end if;

  if v_row.locked_until is null or v_row.locked_until <= now() then
    update public.idempotency_keys i
    set request_fingerprint = p_request_fingerprint,
        owner_token = p_owner_token,
        locked_until = now() + make_interval(secs => p_lock_seconds),
        expires_at = now() + make_interval(secs => p_ttl_seconds),
        updated_at = now()
    where i.id = v_row.id;
    return query select 'acquired'::text, null::integer, null::jsonb;
    return;
  end if;

  return query select 'in_progress'::text, null::integer, null::jsonb;
end;
$$;

create or replace function public.complete_idempotency_key(
  p_key text,
  p_scope text,
  p_owner_token uuid,
  p_response_status integer,
  p_response_body jsonb,
  p_ttl_seconds integer default 86400
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.idempotency_keys i
  set state = 'completed',
      response_status = p_response_status,
      response_body = p_response_body,
      owner_token = null,
      locked_until = null,
      expires_at = now() + make_interval(secs => p_ttl_seconds),
      updated_at = now()
  where i.key = p_key
    and i.scope = p_scope
    and i.state = 'processing'
    and i.owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.release_idempotency_key(
  p_key text,
  p_scope text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.idempotency_keys i
  where i.key = p_key
    and i.scope = p_scope
    and i.state = 'processing'
    and i.owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.cleanup_idempotency_keys()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.idempotency_keys where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.claim_idempotency_key(text, text, text, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_idempotency_key(text, text, uuid, integer, jsonb, integer) from public, anon, authenticated;
revoke all on function public.release_idempotency_key(text, text, uuid) from public, anon, authenticated;
revoke all on function public.cleanup_idempotency_keys() from public, anon, authenticated;

grant execute on function public.claim_idempotency_key(text, text, text, uuid, integer, integer) to service_role;
grant execute on function public.complete_idempotency_key(text, text, uuid, integer, jsonb, integer) to service_role;
grant execute on function public.release_idempotency_key(text, text, uuid) to service_role;
grant execute on function public.cleanup_idempotency_keys() to service_role;

comment on table public.idempotency_keys is
  'Server-only durable idempotency claims and cached API responses.';
