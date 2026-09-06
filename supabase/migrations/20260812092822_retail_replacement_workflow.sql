create table if not exists public.order_item_replacements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  original_product_id uuid references public.products(id) on delete set null,
  original_product_name text not null,
  original_unit_price numeric(12,2) not null check (original_unit_price >= 0),
  original_quantity integer not null check (original_quantity > 0),
  replacement_product_id uuid not null references public.products(id) on delete restrict,
  replacement_product_name text not null,
  replacement_unit_price numeric(12,2) not null check (replacement_unit_price >= 0),
  replacement_quantity integer not null check (replacement_quantity > 0),
  original_line_total numeric(12,2) not null check (original_line_total >= 0),
  replacement_line_total numeric(12,2) not null check (replacement_line_total >= 0),
  adjustment_amount numeric(12,2) generated always as (original_line_total - replacement_line_total) stored,
  reason text check (char_length(reason) <= 240),
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','expired','applied','refund_pending','refunded','failed')),
  expires_at timestamptz not null,
  proposed_by uuid not null references auth.users(id),
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (replacement_line_total <= original_line_total)
);

create unique index if not exists order_item_replacements_one_open
  on public.order_item_replacements(order_item_id)
  where status = 'proposed';
create index if not exists order_item_replacements_order_created
  on public.order_item_replacements(order_id, created_at desc);
create index if not exists order_item_replacements_expiry
  on public.order_item_replacements(expires_at)
  where status = 'proposed';

create table if not exists public.order_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  replacement_id uuid not null unique references public.order_item_replacements(id) on delete restrict,
  adjustment_type text not null check (adjustment_type = 'retail_substitution_refund'),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','not_required')),
  payment_refund_id uuid references public.payment_refunds(id) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.order_item_replacements enable row level security;
alter table public.order_financial_adjustments enable row level security;

revoke all on public.order_item_replacements from public, anon;
revoke all on public.order_financial_adjustments from public, anon;
grant select on public.order_item_replacements to authenticated;
grant select on public.order_financial_adjustments to authenticated;
grant all on public.order_item_replacements to service_role;
grant all on public.order_financial_adjustments to service_role;

drop policy if exists replacement_customer_read on public.order_item_replacements;
create policy replacement_customer_read on public.order_item_replacements for select to authenticated
using (exists (
  select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())
));
drop policy if exists replacement_merchant_read on public.order_item_replacements;
create policy replacement_merchant_read on public.order_item_replacements for select to authenticated
using (exists (
  select 1 from public.orders o join public.restaurants r on r.id = o.restaurant_id
  where o.id = order_id and r.owner_id = (select auth.uid())
));
drop policy if exists replacement_admin_read on public.order_item_replacements;
create policy replacement_admin_read on public.order_item_replacements for select to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin','super_admin')));

drop policy if exists financial_adjustment_customer_read on public.order_financial_adjustments;
create policy financial_adjustment_customer_read on public.order_financial_adjustments for select to authenticated
using (exists (
  select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())
));
drop policy if exists financial_adjustment_merchant_read on public.order_financial_adjustments;
create policy financial_adjustment_merchant_read on public.order_financial_adjustments for select to authenticated
using (exists (
  select 1 from public.orders o join public.restaurants r on r.id = o.restaurant_id
  where o.id = order_id and r.owner_id = (select auth.uid())
));
drop policy if exists financial_adjustment_admin_read on public.order_financial_adjustments;
create policy financial_adjustment_admin_read on public.order_financial_adjustments for select to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin','super_admin')));

comment on table public.order_item_replacements is
  'Auditable customer-consent workflow for retail item replacements. Replacement totals may never exceed the accepted original line total.';
comment on table public.order_financial_adjustments is
  'Reconciliation queue for customer credits caused by accepted lower-priced retail substitutions.';

create or replace function public.propose_order_item_replacement(
  p_order_id uuid,
  p_order_item_id uuid,
  p_replacement_product_id uuid,
  p_replacement_quantity integer,
  p_reason text,
  p_actor_id uuid,
  p_expires_at timestamptz
) returns setof public.order_item_replacements
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_product public.products%rowtype;
  v_preference text;
  v_original_total numeric(12,2);
  v_replacement_total numeric(12,2);
  v_result public.order_item_replacements%rowtype;
begin
  if p_replacement_quantity < 1 or p_replacement_quantity > 99 then raise exception 'INVALID_QUANTITY'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 minutes' then raise exception 'INVALID_EXPIRY'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('pending','confirmed','preparing') then raise exception 'ORDER_STATE_LOCKED'; end if;
  select * into v_restaurant from public.restaurants where id = v_order.restaurant_id;
  if v_restaurant.owner_id is distinct from p_actor_id then raise exception 'FORBIDDEN'; end if;
  if coalesce(v_restaurant.type, 'restaurant') not in ('market','pharmacy') then raise exception 'RETAIL_ONLY'; end if;
  select * into v_item from public.order_items where id = p_order_item_id and order_id = p_order_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_preference := coalesce(v_item.configuration->>'substitution_preference', 'refund_item');
  if v_item.configuration ? 'fulfillment_status' then raise exception 'ITEM_ALREADY_RESOLVED'; end if;
  if v_preference = 'refund_item' then raise exception 'CUSTOMER_REQUESTED_REFUND'; end if;
  select * into v_product from public.products
    where id = p_replacement_product_id and restaurant_id = v_order.restaurant_id
      and is_active = true and is_available = true and approval_status = 'approved' and archived_at is null;
  if not found then raise exception 'REPLACEMENT_UNAVAILABLE'; end if;
  if v_product.id = v_item.product_id then raise exception 'SAME_PRODUCT'; end if;
  v_original_total := round(coalesce(v_item.subtotal, v_item.product_price * v_item.quantity)::numeric, 2);
  v_replacement_total := round((coalesce(v_product.discount_price, v_product.price) * p_replacement_quantity)::numeric, 2);
  if v_replacement_total > v_original_total then raise exception 'REPLACEMENT_MORE_EXPENSIVE'; end if;

  insert into public.order_item_replacements (
    order_id, order_item_id, original_product_id, original_product_name, original_unit_price,
    original_quantity, replacement_product_id, replacement_product_name, replacement_unit_price,
    replacement_quantity, original_line_total, replacement_line_total, reason, expires_at, proposed_by
  ) values (
    v_order.id, v_item.id, v_item.product_id, v_item.product_name, v_item.product_price,
    v_item.quantity, v_product.id, v_product.name, coalesce(v_product.discount_price, v_product.price),
    p_replacement_quantity, v_original_total, v_replacement_total, nullif(left(trim(coalesce(p_reason,'')),240),''), p_expires_at, p_actor_id
  ) returning * into v_result;
  return next v_result;
end;
$$;

create or replace function public.respond_order_item_replacement(
  p_order_id uuid,
  p_replacement_id uuid,
  p_action text,
  p_actor_id uuid
) returns setof public.order_item_replacements
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_replacement public.order_item_replacements%rowtype;
  v_credit numeric(12,2);
  v_credit_cents integer;
  v_adjustment_status text;
begin
  if p_action not in ('accept','reject') then raise exception 'INVALID_ACTION'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.customer_id is distinct from p_actor_id then raise exception 'FORBIDDEN'; end if;
  if v_order.status not in ('pending','confirmed','preparing') then raise exception 'ORDER_STATE_LOCKED'; end if;
  select * into v_replacement from public.order_item_replacements
    where id = p_replacement_id and order_id = p_order_id for update;
  if not found then raise exception 'REPLACEMENT_NOT_FOUND'; end if;
  if v_replacement.status <> 'proposed' then raise exception 'ALREADY_RESOLVED'; end if;
  if v_replacement.expires_at <= now() then
    update public.order_item_replacements set status='expired', updated_at=now() where id=v_replacement.id returning * into v_replacement;
    raise exception 'PROPOSAL_EXPIRED';
  end if;

  if p_action = 'accept' then
    v_credit := greatest(0, v_replacement.original_line_total - v_replacement.replacement_line_total);
    update public.order_items set
      product_id = v_replacement.replacement_product_id,
      product_name = v_replacement.replacement_product_name,
      product_price = v_replacement.replacement_unit_price,
      quantity = v_replacement.replacement_quantity,
      subtotal = v_replacement.replacement_line_total,
      configuration = coalesce(configuration,'{}'::jsonb) || jsonb_build_object(
        'replacement_id', v_replacement.id, 'original_product_id', v_replacement.original_product_id,
        'original_product_name', v_replacement.original_product_name, 'fulfillment_status', 'substituted'
      )
    where id = v_replacement.order_item_id;
    update public.order_item_replacements set status='applied', responded_by=p_actor_id, responded_at=now(), applied_at=now(), updated_at=now()
      where id=v_replacement.id returning * into v_replacement;
  else
    v_credit := v_replacement.original_line_total;
    update public.order_items set
      configuration = coalesce(configuration,'{}'::jsonb) || jsonb_build_object(
        'replacement_id', v_replacement.id, 'fulfillment_status', 'unavailable_refund'
      )
    where id = v_replacement.order_item_id;
    update public.order_item_replacements set status='rejected', responded_by=p_actor_id, responded_at=now(), applied_at=now(), updated_at=now()
      where id=v_replacement.id returning * into v_replacement;
  end if;

  if v_credit > 0 then
    if v_order.payment_method <> 'stripe' then
      update public.orders set subtotal = greatest(0, subtotal-v_credit), total=greatest(0,total-v_credit), updated_at=now() where id=v_order.id;
    end if;
    v_credit_cents := round(v_credit * 100)::integer;
    v_adjustment_status := case when v_order.payment_method = 'stripe' and v_order.payment_status in ('paid','succeeded','partially_refunded') then 'pending' else 'not_required' end;
    insert into public.order_financial_adjustments(order_id,replacement_id,adjustment_type,amount_cents,status,completed_at)
      values(v_order.id,v_replacement.id,'retail_substitution_refund',v_credit_cents,v_adjustment_status,
        case when v_adjustment_status='not_required' then now() else null end);
  end if;
  return next v_replacement;
end;
$$;

revoke all on function public.propose_order_item_replacement(uuid,uuid,uuid,integer,text,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.respond_order_item_replacement(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.propose_order_item_replacement(uuid,uuid,uuid,integer,text,uuid,timestamptz) to service_role;
grant execute on function public.respond_order_item_replacement(uuid,uuid,text,uuid) to service_role;

create or replace function public.expire_order_item_replacements(p_now timestamptz default now())
returns table(replacement_id uuid, order_id uuid, amount_cents integer, adjustment_status text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_replacement public.order_item_replacements%rowtype;
  v_order public.orders%rowtype;
  v_status text;
begin
  for v_replacement in
    select * from public.order_item_replacements where status='proposed' and expires_at <= p_now for update skip locked
  loop
    select * into v_order from public.orders where id=v_replacement.order_id for update;
    update public.order_items set configuration=coalesce(configuration,'{}'::jsonb) || jsonb_build_object(
      'replacement_id',v_replacement.id,'fulfillment_status','unavailable_refund'
    ) where id=v_replacement.order_item_id;
    update public.order_item_replacements set status='expired',responded_at=p_now,applied_at=p_now,updated_at=p_now where id=v_replacement.id;
    if v_order.payment_method <> 'stripe' then
      update public.orders set subtotal=greatest(0,subtotal-v_replacement.original_line_total),total=greatest(0,total-v_replacement.original_line_total),updated_at=p_now where id=v_order.id;
    end if;
    v_status := case when v_order.payment_method='stripe' and v_order.payment_status in ('paid','succeeded','partially_refunded') then 'pending' else 'not_required' end;
    insert into public.order_financial_adjustments(order_id,replacement_id,adjustment_type,amount_cents,status,completed_at)
      values(v_order.id,v_replacement.id,'retail_substitution_refund',round(v_replacement.original_line_total*100)::integer,v_status,case when v_status='not_required' then p_now else null end)
      on conflict(replacement_id) do nothing;
    replacement_id := v_replacement.id; order_id := v_order.id; amount_cents := round(v_replacement.original_line_total*100)::integer; adjustment_status := v_status;
    return next;
  end loop;
end;
$$;
revoke all on function public.expire_order_item_replacements(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_order_item_replacements(timestamptz) to service_role;
