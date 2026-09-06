-- Repair remote schema drift in the order transition guard.
--
-- An older deployed version referenced NEW.is_admin_override even though
-- public.orders has no such column. Every real status update therefore raised
-- 42703 before the state machine could evaluate it. Keep the database guard,
-- but align it with the canonical transition graph used by the application.

alter type public.order_status add value if not exists 'cancel_refund_pending';

create or replace function public.enforce_order_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_allowed text[];
begin
  if old.status = new.status then
    return new;
  end if;

  -- Compare through text so this migration is safe in the same transaction
  -- that adds cancel_refund_pending to the enum.
  v_allowed := case old.status::text
    when 'pending'               then array['confirmed', 'cancelled', 'cancel_refund_pending']
    when 'confirmed'             then array['preparing', 'cancelled', 'cancel_refund_pending']
    when 'preparing'             then array['ready', 'cancelled', 'cancel_refund_pending']
    when 'ready'                 then array['picked_up', 'cancelled', 'cancel_refund_pending']
    when 'picked_up'             then array['delivering', 'delivered', 'could_not_deliver']
    when 'delivering'            then array['delivered', 'could_not_deliver']
    when 'delivered'             then array['refunded']
    when 'cancelled'             then array['refunded']
    when 'could_not_deliver'     then array['cancelled', 'refunded', 'cancel_refund_pending']
    when 'cancel_refund_pending' then array['cancelled', 'refunded']
    when 'refunded'              then array[]::text[]
    else array[]::text[]
  end;

  if not (new.status::text = any(v_allowed)) then
    raise exception 'ORDER_TRANSITION_BLOCKED: cannot move order % from % to %',
      new.id, old.status, new.status
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

comment on function public.enforce_order_transition() is
  'Guards public.orders status changes using BlinkGo canonical transitions; repaired 2026-08-14 to remove a reference to the nonexistent is_admin_override column.';
