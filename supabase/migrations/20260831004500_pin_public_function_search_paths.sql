-- Pin every legacy public function that still inherits the caller's mutable
-- search_path. This preserves existing function signatures and behavior while
-- preventing object-shadowing attacks through attacker-controlled schemas.

do $$
declare
  target record;
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as setting
        where setting like 'search_path=%'
      )
  loop
    execute format(
      'alter function %s set search_path = public, pg_temp',
      target.signature
    );
  end loop;
end
$$;

