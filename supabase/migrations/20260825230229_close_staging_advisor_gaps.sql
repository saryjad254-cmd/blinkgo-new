-- Document the server-only contract for tables intentionally hidden from the
-- Data API. Client grants remain revoked; these policies do not broaden access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'financial_documents',
    'financial_journals',
    'financial_ledger_entries',
    'group_order_items',
    'group_order_participants',
    'group_orders',
    'legal_acceptance_records',
    'merchant_payouts',
    'order_delivery_preferences',
    'order_delivery_proofs',
    'order_failed_deliveries',
    'platform_feature_flag_versions',
    'platform_feature_flags',
    'support_ticket_attachments'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists service_role_all on public.%I', table_name);
    execute format(
      'create policy service_role_all on public.%I for all to service_role using (true) with check (true)',
      table_name
    );
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end;
$$;

-- Role authorization lives in protected app_metadata. This helper does not
-- need owner privileges and therefore must not bypass RLS.
create or replace function public.auth_role()
returns text
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select case
    when (select auth.uid()) is null then 'anon'
    else coalesce(
      nullif((select auth.jwt())->'app_metadata'->>'app_role', ''),
      'customer'
    )
  end;
$$;

revoke all on function public.auth_role() from public;
grant execute on function public.auth_role() to anon, authenticated, service_role;

comment on function public.auth_role() is
  'RLS-safe role helper sourced only from protected JWT app_metadata.app_role.';

-- Product approval is an administrative server operation. The prior two-arg
-- function was exposed to every authenticated account and inferred the actor
-- from the caller session. The API now verifies the role, uses service_role,
-- and passes the verified actor explicitly; the database verifies it again.
create or replace function public.approve_product_request(
  p_request_id uuid,
  p_edits jsonb,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req public.product_requests%rowtype;
  new_product_id uuid;
  actor_role text;
  updated_count integer;
begin
  if p_actor_id is null then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select u.role::text
    into actor_role
    from public.users u
   where u.id = p_actor_id
     and coalesce(u.is_active, true);

  if actor_role not in ('manager', 'admin', 'super_admin') then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  p_edits := coalesce(p_edits, '{}'::jsonb);
  if jsonb_typeof(p_edits) <> 'object'
     or exists (
       select 1
         from jsonb_object_keys(p_edits) as edit_keys(edit_key)
        where edit_key not in ('name', 'description', 'category', 'price', 'image_url')
     ) then
    raise exception 'invalid_product_edits' using errcode = '22023';
  end if;

  select *
    into req
    from public.product_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if req.status <> 'pending' then
    raise exception 'request_already_reviewed' using errcode = '23505';
  end if;

  insert into public.products (
    restaurant_id, name, description, category, price, image_url, image_urls,
    is_active, is_available, approval_status, approved_by, approved_at,
    created_by, updated_by
  ) values (
    req.restaurant_id,
    coalesce(nullif(trim(p_edits->>'name'), ''), req.name),
    coalesce(p_edits->>'description', req.description),
    coalesce(nullif(trim(p_edits->>'category'), ''), req.category),
    coalesce(nullif(p_edits->>'price', '')::numeric, req.suggested_price),
    coalesce(nullif(trim(p_edits->>'image_url'), ''), req.image_url),
    case
      when coalesce(nullif(trim(p_edits->>'image_url'), ''), req.image_url) is null then '{}'::text[]
      else array[coalesce(nullif(trim(p_edits->>'image_url'), ''), req.image_url)]
    end,
    true, true, 'approved', p_actor_id, now(), req.requested_by, p_actor_id
  ) returning id into new_product_id;

  update public.product_requests
     set status = 'approved',
         resulting_product_id = new_product_id,
         reviewed_by = p_actor_id,
         reviewed_at = now(),
         rejection_reason = null,
         updated_at = now()
   where id = p_request_id and status = 'pending';
  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'request_already_reviewed' using errcode = '23505';
  end if;

  return new_product_id;
end;
$$;

revoke all on function public.approve_product_request(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_product_request(uuid, jsonb, uuid)
  to service_role;

revoke all on function public.approve_product_request(uuid, jsonb)
  from public, anon, authenticated, service_role;
drop function public.approve_product_request(uuid, jsonb);

comment on function public.approve_product_request(uuid, jsonb, uuid) is
  'Server-only atomic product approval with a verified manager/admin actor.';
