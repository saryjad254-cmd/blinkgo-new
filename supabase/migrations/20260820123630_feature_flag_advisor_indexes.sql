-- Cover the administrator foreign keys reported by the Supabase performance advisor.
create index if not exists platform_feature_flags_updated_by_idx
  on public.platform_feature_flags(updated_by)
  where updated_by is not null;

create index if not exists platform_feature_flag_versions_changed_by_idx
  on public.platform_feature_flag_versions(changed_by)
  where changed_by is not null;

-- RLS deliberately has no browser policies on these server-only control tables.
-- Grants are revoked from public/anon/authenticated in the preceding migration;
-- service_role is the sole application role with explicit table privileges.
