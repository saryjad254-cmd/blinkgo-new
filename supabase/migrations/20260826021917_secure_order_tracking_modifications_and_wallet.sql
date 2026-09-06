-- Order modifications are written only by the authenticated application API
-- through service_role. Customers, the owning merchant and operations staff
-- may read the audit trail for orders they are allowed to see.
revoke all on table public.order_modifications from anon;
revoke insert, update, delete on table public.order_modifications from authenticated;
drop policy if exists modifications_insert on public.order_modifications;
drop policy if exists modifications_update on public.order_modifications;
alter policy modifications_read on public.order_modifications
  to authenticated
  using (
    (select public.auth_role()) in ('admin', 'super_admin', 'manager')
    or exists (
      select 1
      from public.orders as modified_order
      where modified_order.id = order_modifications.order_id
        and (
          modified_order.customer_id = (select auth.uid())
          or exists (
            select 1
            from public.restaurants as modified_restaurant
            where modified_restaurant.id = modified_order.restaurant_id
              and modified_restaurant.owner_id = (select auth.uid())
          )
        )
    )
  );

-- Tracking events contain precise location and operational data. All writes
-- go through role-checked APIs; direct clients only receive events for an order
-- they participate in. Remove the legacy allow-all read/insert policies.
revoke all on table public.order_tracking_events from anon;
revoke insert, update, delete on table public.order_tracking_events from authenticated;
drop policy if exists tracking_events_insert_driver on public.order_tracking_events;
drop policy if exists order_tracking_events_write on public.order_tracking_events;
drop policy if exists tracking_events_read on public.order_tracking_events;
alter policy order_tracking_events_read on public.order_tracking_events
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

-- Legacy peer chat remains available to its two participants, but anonymous
-- access and client-side mutation/deletion are removed. service_role bypasses
-- RLS for moderation and retention operations.
revoke all on table public.chat_messages from anon;
revoke update, delete on table public.chat_messages from authenticated;
alter policy chat_insert on public.chat_messages
  to authenticated
  with check (sender_id = (select auth.uid()));
alter policy chat_read on public.chat_messages
  to authenticated
  using (
    sender_id = (select auth.uid())
    or receiver_id = (select auth.uid())
  );

-- Wallet ledger entries are financial records. They are generated only by
-- trusted server workflows; customers may read only their own ledger rows.
revoke all on table public.wallet_transactions from anon;
revoke insert, update, delete on table public.wallet_transactions from authenticated;
drop policy if exists wallet_insert on public.wallet_transactions;
alter policy wallet_user_read on public.wallet_transactions
  to authenticated
  using (user_id = (select auth.uid()));
