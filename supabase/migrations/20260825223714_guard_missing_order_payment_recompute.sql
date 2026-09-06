-- Financial RPCs must not return plausible values for an order that does not
-- exist. The previous implementation left v_received NULL after SELECT INTO
-- found no row; PostgreSQL then skipped every comparison and returned
-- "succeeded" from the final ELSE branch.

create or replace function public.recompute_order_payment_status(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_received bigint;
  v_refunded bigint;
  v_pending bigint;
  v_failed bigint;
  v_new_status text;
begin
  select round(o.total * 100)::bigint
    into v_received
    from public.orders o
   where o.id = p_order_id;

  if not found then
    raise exception 'order_not_found'
      using errcode = 'P0002', detail = 'No order exists for the supplied identifier.';
  end if;

  v_received := coalesce(v_received, 0);

  select coalesce(sum(pr.refunded_amount_cents) filter (where pr.status = 'succeeded'), 0),
         coalesce(sum(pr.refunded_amount_cents) filter (where pr.status = 'pending'), 0),
         coalesce(sum(pr.refunded_amount_cents) filter (where pr.status in ('failed', 'requires_review')), 0)
    into v_refunded, v_pending, v_failed
    from public.payment_refunds pr
   where pr.order_id = p_order_id;

  if v_received <= 0 then
    v_new_status := 'pending';
  elsif v_refunded >= v_received and v_pending = 0 and v_failed = 0 then
    v_new_status := 'refunded';
  elsif v_refunded > 0 and v_refunded < v_received then
    v_new_status := 'partially_refunded';
  elsif v_pending > 0 and v_refunded < v_received then
    v_new_status := 'refund_pending';
  elsif v_failed > 0 and v_refunded = 0 then
    v_new_status := 'refund_failed';
  else
    v_new_status := 'succeeded';
  end if;

  update public.orders
     set payment_status = v_new_status,
         amount_refunded_cents = v_refunded,
         last_refund_status = (
           select status from public.payment_refunds
            where order_id = p_order_id order by created_at desc limit 1
         ),
         last_refund_at = (
           select updated_at from public.payment_refunds
            where order_id = p_order_id order by created_at desc limit 1
         ),
         updated_at = now()
   where id = p_order_id;

  return v_new_status;
end;
$$;

revoke all on function public.recompute_order_payment_status(uuid)
  from public, anon, authenticated;
grant execute on function public.recompute_order_payment_status(uuid) to service_role;

comment on function public.recompute_order_payment_status(uuid) is
  'Server-only payment status recomputation. Raises P0002 when the order does not exist.';

create or replace function public.refund_max_amount_cents(p_order_id uuid)
returns table (
  received_cents bigint,
  already_refunded_cents bigint,
  pending_cents bigint,
  max_refundable_cents bigint,
  can_full_refund boolean,
  currency char(3)
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_received bigint;
  v_refunded bigint;
  v_pending bigint;
  v_currency char(3) := 'EUR';
begin
  select round(o.total * 100)::bigint
    into v_received
    from public.orders o
   where o.id = p_order_id;

  if not found then
    raise exception 'order_not_found'
      using errcode = 'P0002', detail = 'No order exists for the supplied identifier.';
  end if;

  v_received := coalesce(v_received, 0);

  select coalesce(sum(pr.refunded_amount_cents) filter (where pr.status = 'succeeded'), 0),
         coalesce(sum(pr.refunded_amount_cents) filter (where pr.status = 'pending'), 0)
    into v_refunded, v_pending
    from public.payment_refunds pr
   where pr.order_id = p_order_id;

  return query
  select v_received,
         v_refunded,
         v_pending,
         greatest(0, v_received - v_refunded - v_pending),
         (v_received > 0 and v_refunded + v_pending = 0),
         v_currency;
end;
$$;

revoke all on function public.refund_max_amount_cents(uuid)
  from public, anon, authenticated;
grant execute on function public.refund_max_amount_cents(uuid) to service_role;

comment on function public.refund_max_amount_cents(uuid) is
  'Server-only refundable-balance computation. Raises P0002 when the order does not exist.';
