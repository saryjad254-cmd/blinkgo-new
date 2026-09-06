-- public.users is the application's authoritative authorization profile.
-- All profile creation and mutation already runs through authenticated
-- server APIs using service_role. Direct Data API clients therefore need
-- read access only; leaving UPDATE on role/is_verified/is_active would let a
-- user promote or reactivate their own account through the REST endpoint.

revoke all on table public.users from anon;
revoke all on table public.users from authenticated;
grant select on table public.users to authenticated;

drop policy if exists users_insert_self on public.users;
drop policy if exists users_select_admin on public.users;
drop policy if exists users_select_own on public.users;
drop policy if exists users_select_self on public.users;
drop policy if exists users_service_role on public.users;
drop policy if exists users_update_admin on public.users;
drop policy if exists users_update_own on public.users;

drop policy if exists users_admin_all on public.users;
drop policy if exists users_admin_update_role on public.users;
drop policy if exists users_insert_signup on public.users;
drop policy if exists users_self_select on public.users;
drop policy if exists users_self_update on public.users;
drop policy if exists users_privileged_select on public.users;

create policy users_self_select
  on public.users for select
  to authenticated
  using (id = (select auth.uid()));

create policy users_privileged_select
  on public.users for select
  to authenticated
  using ((select public.auth_role()) in ('manager', 'admin', 'super_admin'));

