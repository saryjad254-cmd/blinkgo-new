-- Keep driver availability consistent with the order referenced by
-- driver_status.current_order_id. A stale terminal/missing order must not
-- permanently remove an otherwise available driver from dispatch.

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

  update public.driver_status as ds
  set current_order_id = case
        when exists (
          select 1
          from public.orders as active_order
          where active_order.id = ds.current_order_id
            and active_order.driver_id = p_driver_id
            and active_order.status in (
              'pending', 'confirmed', 'preparing', 'ready',
              'assigned', 'picked_up', 'delivering'
            )
        ) then ds.current_order_id
        else null
      end,
      is_on_delivery = exists (
        select 1
        from public.orders as active_order
        where active_order.id = ds.current_order_id
          and active_order.driver_id = p_driver_id
          and active_order.status in (
            'pending', 'confirmed', 'preparing', 'ready',
            'assigned', 'picked_up', 'delivering'
          )
      ),
      updated_at = completion_time
  where ds.driver_id = p_driver_id;

  return next completed_order;
end;
$$;

revoke all on function public.complete_driver_delivery(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.complete_driver_delivery(uuid, uuid, text, text, integer)
  to service_role;

-- One-time repair for already-stale pointers. Valid active assignments are
-- deliberately preserved.
update public.driver_status as ds
set current_order_id = null,
    active_order_id = null,
    is_on_delivery = false,
    updated_at = now()
where ds.current_order_id is not null
  and not exists (
    select 1
    from public.orders as active_order
    where active_order.id = ds.current_order_id
      and active_order.driver_id = ds.driver_id
      and active_order.status in (
        'pending', 'confirmed', 'preparing', 'ready',
        'assigned', 'picked_up', 'delivering'
      )
  );
