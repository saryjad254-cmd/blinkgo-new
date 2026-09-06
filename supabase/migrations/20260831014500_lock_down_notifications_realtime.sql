-- Notifications are private, server-created records. Browser clients may read
-- and acknowledge only their own rows; anonymous users receive no table grant.
-- This migration is intentionally idempotent because the legacy production
-- project has no reliable migration ledger.

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon;
revoke all on table public.notifications from authenticated;
grant select on table public.notifications to authenticated;
grant update (is_read, read_at) on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

drop policy if exists "System inserts notifications" on public.notifications;
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;
drop policy if exists notif_user_all on public.notifications;
drop policy if exists notifications_insert_system on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_user_select on public.notifications;
drop policy if exists notifications_user_acknowledge on public.notifications;
drop policy if exists notifications_service_all on public.notifications;

create policy notifications_user_select
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_user_acknowledge
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_service_all
  on public.notifications for all
  to service_role
  using (true)
  with check (true);
