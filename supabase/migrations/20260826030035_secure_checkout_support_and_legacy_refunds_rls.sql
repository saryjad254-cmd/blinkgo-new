-- Sensitive checkout and support writes are performed by authenticated API
-- routes through the service role. Browser sessions only need the narrow
-- support read surface used by the admin server-rendered console.

begin;

alter table public.order_drafts enable row level security;
alter table public.refunds enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_replies enable row level security;

drop policy if exists order_drafts_admin_all on public.order_drafts;
drop policy if exists order_drafts_customer_insert on public.order_drafts;
drop policy if exists order_drafts_customer_select on public.order_drafts;
drop policy if exists order_drafts_customer_update on public.order_drafts;

drop policy if exists refunds_admin_write on public.refunds;
drop policy if exists refunds_read on public.refunds;

drop policy if exists tickets_admin_all on public.support_tickets;
drop policy if exists tickets_user_insert on public.support_tickets;
drop policy if exists tickets_user_read on public.support_tickets;
drop policy if exists tickets_user_update on public.support_tickets;

drop policy if exists replies_insert on public.support_ticket_replies;
drop policy if exists replies_read on public.support_ticket_replies;

-- Checkout drafts and the deprecated refunds ledger contain payment and
-- anti-replay state. They are server-only; customers consume sanitized API
-- responses instead of querying these tables directly.
revoke all on table public.order_drafts from anon, authenticated;
revoke all on table public.refunds from anon, authenticated;

-- Support mutations also pass through /api/support, which validates order
-- ownership, workflow transitions, attachments and audit records.
revoke all on table public.support_tickets from anon, authenticated;
revoke all on table public.support_ticket_replies from anon, authenticated;
grant select on table public.support_tickets to authenticated;
grant select on table public.support_ticket_replies to authenticated;

create policy support_tickets_participant_read
on public.support_tickets
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.auth_role()) in ('admin', 'super_admin', 'manager')
);

create policy support_ticket_replies_participant_read
on public.support_ticket_replies
for select
to authenticated
using (
  (select public.auth_role()) in ('admin', 'super_admin', 'manager')
  or (
    is_internal = false
    and exists (
      select 1
      from public.support_tickets ticket
      where ticket.id = support_ticket_replies.ticket_id
        and ticket.user_id = (select auth.uid())
    )
  )
);

commit;
