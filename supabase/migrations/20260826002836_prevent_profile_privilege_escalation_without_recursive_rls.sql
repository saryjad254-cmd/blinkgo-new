-- The former self-update WITH CHECK selected immutable values back from the
-- users table. PostgreSQL correctly rejected that self-reference as recursive
-- RLS. Keep the ownership policy row-local and enforce immutable privilege
-- fields with a BEFORE UPDATE trigger that also protects non-Data-API writes.

create or replace function public.guard_user_privilege_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.is_verified is distinct from old.is_verified then
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'privileged_profile_fields_are_server_managed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_user_privilege_fields() from public, anon, authenticated;
grant execute on function public.guard_user_privilege_fields() to service_role;

drop trigger if exists guard_user_privilege_fields on public.users;
create trigger guard_user_privilege_fields
before update of role, is_active, is_verified on public.users
for each row execute function public.guard_user_privilege_fields();

alter policy users_self_update on public.users
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy users_admin_update_role on public.users
  to authenticated
  using ((select public.auth_role()) in ('admin', 'super_admin'));
