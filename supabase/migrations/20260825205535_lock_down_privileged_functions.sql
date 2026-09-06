-- SECURITY DEFINER functions inherit EXECUTE for PUBLIC unless explicitly
-- revoked. award_loyalty_points accepts a user and amount, so client access
-- would permit arbitrary balance manipulation. All awards must pass through
-- trusted server workflows using the service role.

revoke all on function public.award_loyalty_points(uuid, integer, text, uuid)
  from public, anon, authenticated;

grant execute on function public.award_loyalty_points(uuid, integer, text, uuid)
  to service_role;

comment on function public.award_loyalty_points(uuid, integer, text, uuid) is
  'Server-only atomic loyalty award. Client roles cannot execute this privileged function.';

-- The reconciliation view contains platform financial data. Make it obey the
-- caller's privileges and remove every client-role access path explicitly.
alter view if exists public.financial_journal_reconciliation
  set (security_invoker = true);
revoke all on public.financial_journal_reconciliation
  from public, anon, authenticated;
grant select on public.financial_journal_reconciliation to service_role;
