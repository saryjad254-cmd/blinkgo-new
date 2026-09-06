-- Forward-only production repair for two legacy allow-all SELECT policies.
-- Prepared 2026-08-31. NOT APPLIED: validate on the production-derived branch
-- and obtain explicit production-change approval before execution.

begin;

-- Precise tracking coordinates and operational events are visible only to a
-- party to the order or an operations administrator. Writes remain server-only.
revoke all on table public.order_tracking_events from anon;
revoke all on table public.order_tracking_events from authenticated;
grant select on table public.order_tracking_events to authenticated;

drop policy if exists tracking_events_read on public.order_tracking_events;
drop policy if exists order_tracking_events_read on public.order_tracking_events;
drop policy if exists order_tracking_events_select on public.order_tracking_events;

create policy order_tracking_events_read
  on public.order_tracking_events for select
  to authenticated
  using (
    (select public.auth_role()) in ('admin', 'super_admin', 'manager')
    or exists (
      select 1
      from public.orders as tracked_order
      where tracked_order.id = order_tracking_events.order_id
        and (
          tracked_order.customer_id = (select auth.uid())
          or tracked_order.driver_id = (select auth.uid())
          or exists (
            select 1
            from public.restaurants as tracked_restaurant
            where tracked_restaurant.id = tracked_order.restaurant_id
              and tracked_restaurant.owner_id = (select auth.uid())
          )
        )
    )
  );

-- Raw payment rows contain provider identifiers and failure metadata. Direct
-- clients may read only their own rows; privileged dashboards use server-side
-- service-role repositories and do not require a broad client policy.
revoke all on table public.payments from anon;
revoke all on table public.payments from authenticated;
grant select on table public.payments to authenticated;

drop policy if exists payments_read on public.payments;
drop policy if exists payments_customer_read on public.payments;

create policy payments_customer_read
  on public.payments for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    or (select public.auth_role()) in ('admin', 'super_admin', 'finance', 'payment_support')
  );

commit;
