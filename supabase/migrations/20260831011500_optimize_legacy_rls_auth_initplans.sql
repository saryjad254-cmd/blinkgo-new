-- Rewrite legacy policy expressions so auth helpers are evaluated once per
-- statement instead of once per row. Placeholder tokens make this idempotent:
-- already optimized `(select auth.*())` expressions are restored unchanged.

do $$
declare
  target record;
  new_using text;
  new_check text;
  statement text;
begin
  for target in
    select
      pol.polname,
      n.nspname as schema_name,
      cls.relname as table_name,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace n on n.oid = cls.relnamespace
    where n.nspname in ('public', 'storage')
  loop
    new_using := target.using_expr;
    new_check := target.check_expr;

    if new_using is not null then
      new_using := replace(new_using, '(SELECT auth.uid())', '__bg_uid__');
      new_using := replace(new_using, '(select auth.uid())', '__bg_uid__');
      new_using := replace(new_using, '(SELECT auth.role())', '__bg_role__');
      new_using := replace(new_using, '(select auth.role())', '__bg_role__');
      new_using := replace(new_using, '(SELECT auth.jwt())', '__bg_jwt__');
      new_using := replace(new_using, '(select auth.jwt())', '__bg_jwt__');
      new_using := replace(new_using, 'auth.uid()', '(select auth.uid())');
      new_using := replace(new_using, 'auth.role()', '(select auth.role())');
      new_using := replace(new_using, 'auth.jwt()', '(select auth.jwt())');
      new_using := replace(new_using, '__bg_uid__', '(select auth.uid())');
      new_using := replace(new_using, '__bg_role__', '(select auth.role())');
      new_using := replace(new_using, '__bg_jwt__', '(select auth.jwt())');
    end if;

    if new_check is not null then
      new_check := replace(new_check, '(SELECT auth.uid())', '__bg_uid__');
      new_check := replace(new_check, '(select auth.uid())', '__bg_uid__');
      new_check := replace(new_check, '(SELECT auth.role())', '__bg_role__');
      new_check := replace(new_check, '(select auth.role())', '__bg_role__');
      new_check := replace(new_check, '(SELECT auth.jwt())', '__bg_jwt__');
      new_check := replace(new_check, '(select auth.jwt())', '__bg_jwt__');
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, 'auth.role()', '(select auth.role())');
      new_check := replace(new_check, 'auth.jwt()', '(select auth.jwt())');
      new_check := replace(new_check, '__bg_uid__', '(select auth.uid())');
      new_check := replace(new_check, '__bg_role__', '(select auth.role())');
      new_check := replace(new_check, '__bg_jwt__', '(select auth.jwt())');
    end if;

    if new_using is distinct from target.using_expr
       or new_check is distinct from target.check_expr then
      statement := format(
        'alter policy %I on %I.%I',
        target.polname,
        target.schema_name,
        target.table_name
      );
      if new_using is not null then
        statement := statement || format(' using (%s)', new_using);
      end if;
      if new_check is not null then
        statement := statement || format(' with check (%s)', new_check);
      end if;
      execute statement;
    end if;
  end loop;
end
$$;

