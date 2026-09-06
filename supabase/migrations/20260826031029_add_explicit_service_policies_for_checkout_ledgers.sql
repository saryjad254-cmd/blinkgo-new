-- These tables are intentionally server-only. Explicit service-role policies
-- document that contract and keep the database advisor free of ambiguous
-- "RLS enabled with no policy" notices.

begin;

drop policy if exists order_drafts_service on public.order_drafts;
create policy order_drafts_service
on public.order_drafts
for all
to service_role
using (true)
with check (true);

drop policy if exists refunds_service on public.refunds;
create policy refunds_service
on public.refunds
for all
to service_role
using (true)
with check (true);

commit;
