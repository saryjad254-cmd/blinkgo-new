-- Consolidate overlapping customer-data policies. Every predicate preserves
-- ownership, caches auth.uid() once per statement, and excludes anon at the
-- role/grant layer before PostgreSQL evaluates row predicates.

revoke all on table public.favorites from anon;
drop policy if exists "Users manage own favorites" on public.favorites;
drop policy if exists favorites_user_read on public.favorites;
alter policy favorites_user_write on public.favorites
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.notification_preferences from anon;
drop policy if exists notif_prefs_read on public.notification_preferences;
alter policy notif_prefs_update on public.notification_preferences
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.push_subscriptions from anon;
drop policy if exists push_subs_own on public.push_subscriptions;
alter policy push_subs_user on public.push_subscriptions
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Notifications are server-created. Clients may only read their rows and
-- acknowledge them; arbitrary client INSERT/DELETE and payload edits are not
-- part of the product contract.
revoke all on table public.notifications from anon;
revoke all on table public.notifications from authenticated;
grant select on table public.notifications to authenticated;
grant update (is_read, read_at) on table public.notifications to authenticated;

drop policy if exists "System inserts notifications" on public.notifications;
drop policy if exists "Users read own notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;
drop policy if exists notif_user_all on public.notifications;
drop policy if exists notifications_user_select on public.notifications;
drop policy if exists notifications_user_acknowledge on public.notifications;

create policy notifications_user_select
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_user_acknowledge
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_service_all on public.notifications;
create policy notifications_service_all
  on public.notifications for all
  to service_role
  using (true)
  with check (true);
