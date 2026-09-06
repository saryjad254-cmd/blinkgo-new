-- Production-advisor closure for legacy policies that predate the
-- server-authoritative order and tracking APIs.

revoke insert, update, delete on table public.orders
  from anon, authenticated;
drop policy if exists orders_update_involved on public.orders;

revoke insert, update, delete on table public.order_tracking_events
  from anon, authenticated;
drop policy if exists tracking_events_insert_driver
  on public.order_tracking_events;

-- Public buckets deliver objects through their public URLs without a broad
-- storage.objects SELECT policy. Removing these policies prevents anonymous
-- clients from listing every object key while keeping public image URLs live.
drop policy if exists product_images_public_read on storage.objects;
drop policy if exists restaurant_images_public_read on storage.objects;

