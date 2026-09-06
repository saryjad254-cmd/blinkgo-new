-- Read-only audit for the hosted Supabase migration ledger.
-- Run against a non-production project before attempting any replay.
select
  version,
  name,
  cardinality(statements)::int as statement_count,
  length(array_to_string(statements, E'\n'))::int as sql_bytes,
  array_to_string(statements, E'\n') ilike '%drop table%' as drops_table,
  array_to_string(statements, E'\n') ilike '%drop column%' as drops_column,
  array_to_string(statements, E'\n') ilike '%truncate %' as truncates,
  array_to_string(statements, E'\n') ilike '%delete from%' as deletes_rows,
  (
    array_to_string(statements, E'\n') ilike '%begin;%'
    or array_to_string(statements, E'\n') ilike '%commit;%'
  ) as transaction_control,
  array_to_string(statements, E'\n') ilike '%alter type%add value%' as enum_add_value,
  array_to_string(statements, E'\n') ~* 'pg_cron|cron\.schedule|net\.http|vault\.' as external_scheduler
from supabase_migrations.schema_migrations
order by version;
