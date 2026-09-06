-- Explicit service-only policies document the intended access model and keep
-- RLS defense-in-depth visible to database advisors. Client table privileges
-- were revoked in the preceding migration.
create policy magic_link_tokens_service
  on public.magic_link_tokens for all
  to service_role
  using (true)
  with check (true);

create policy geocode_cache_service
  on public.geocode_cache for all
  to service_role
  using (true)
  with check (true);
