-- Re-open only the cross-environment profile fields that are safe for a user
-- to edit directly. Column privileges remain the primary boundary: role,
-- activation, verification, restaurant ownership and audit fields are absent.

revoke update on table public.users from authenticated;
grant update (name, phone, avatar_url) on table public.users to authenticated;

drop policy if exists users_self_update on public.users;
create policy users_self_update
  on public.users for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

