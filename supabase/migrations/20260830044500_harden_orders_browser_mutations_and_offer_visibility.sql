-- The orders ledger is server-authoritative. Browser sessions may read only
-- the rows permitted by RLS; all mutations must pass through BlinkGo APIs/RPCs
-- that validate prices, ownership, workflow transitions and audit evidence.

revoke insert, update, delete, truncate, references, trigger
  on table public.orders
  from anon, authenticated;

grant select on table public.orders to authenticated;

-- Unassigned delivery offers are visible to drivers only. The previous
-- `driver_id is null` branch applied to every authenticated role and exposed
-- other customers' unassigned orders over PostgREST and Realtime.
alter policy orders_driver_read on public.orders
  using (
    driver_id = (select auth.uid())
    or (
      driver_id is null
      and (select public.auth_role()) = 'driver'
    )
  );
