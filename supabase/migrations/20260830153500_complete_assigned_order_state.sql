-- Complete the canonical BlinkGo delivery lifecycle:
-- pending -> confirmed -> preparing -> ready -> assigned -> picked_up
-- -> delivering -> delivered.
--
-- `ready -> picked_up` remains accepted for backward compatibility with
-- orders created by older application versions. New application code records
-- `assigned` as soon as a driver reservation is made. Releasing a reservation
-- safely returns the order to `ready`.

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

  v_allowed := case old.status::text
    when 'pending'               then array['confirmed', 'cancelled', 'cancel_refund_pending']
    when 'confirmed'             then array['preparing', 'cancelled', 'cancel_refund_pending']
    when 'preparing'             then array['ready', 'cancelled', 'cancel_refund_pending']
    when 'ready'                 then array['assigned', 'picked_up', 'cancelled', 'cancel_refund_pending']
    when 'assigned'              then array['ready', 'picked_up', 'cancelled', 'cancel_refund_pending']
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
  'Guards the canonical BlinkGo order lifecycle, including ready -> assigned -> picked_up and safe assigned -> ready release.';
