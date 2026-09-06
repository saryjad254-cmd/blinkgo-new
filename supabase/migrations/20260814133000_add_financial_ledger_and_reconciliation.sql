create table if not exists public.financial_journals (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in (
    'order','refund','driver_payout','merchant_payout','adjustment','opening_balance'
  )),
  source_id text not null,
  idempotency_key text not null unique,
  currency text not null default 'EUR' check (currency = 'EUR'),
  description text not null check (char_length(description) between 3 and 500),
  occurred_at timestamptz not null,
  posted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  unique (source_type, source_id)
);

create table if not exists public.financial_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.financial_journals(id) on delete restrict,
  line_number smallint not null check (line_number > 0),
  account_code text not null check (account_code in (
    'cash_stripe','cash_cod','cash_bank','customer_receivable','refunds_payable',
    'merchant_payable','driver_payable','tips_payable',
    'platform_commission_revenue','service_fee_revenue','delivery_fee_revenue',
    'promotions_expense','payment_processing_expense','rounding_adjustment'
  )),
  owner_type text check (owner_type is null or owner_type in ('customer','restaurant','driver','platform')),
  owner_id uuid,
  debit_cents bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  memo text,
  created_at timestamptz not null default now(),
  unique (journal_id, line_number),
  check ((debit_cents > 0 and credit_cents = 0) or (credit_cents > 0 and debit_cents = 0)),
  check ((owner_type is null and owner_id is null) or (owner_type is not null and owner_id is not null))
);

create or replace function public.post_financial_journal(
  p_source_type text,
  p_source_id text,
  p_idempotency_key text,
  p_description text,
  p_occurred_at timestamptz,
  p_lines jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_journal_id uuid;
  v_debits bigint;
  v_credits bigint;
  v_line jsonb;
  v_number integer := 0;
begin
  select id into v_journal_id from public.financial_journals
   where idempotency_key = p_idempotency_key;
  if found then return v_journal_id; end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'journal_requires_at_least_two_lines';
  end if;

  select coalesce(sum((line->>'debit_cents')::bigint), 0),
         coalesce(sum((line->>'credit_cents')::bigint), 0)
    into v_debits, v_credits
    from jsonb_array_elements(p_lines) line;
  if v_debits <= 0 or v_debits <> v_credits then
    raise exception 'unbalanced_financial_journal: debits %, credits %', v_debits, v_credits;
  end if;

  insert into public.financial_journals (
    source_type, source_id, idempotency_key, description, occurred_at, metadata, created_by
  ) values (
    p_source_type, p_source_id, p_idempotency_key, p_description,
    p_occurred_at, coalesce(p_metadata, '{}'::jsonb), p_created_by
  ) returning id into v_journal_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_number := v_number + 1;
    insert into public.financial_ledger_entries (
      journal_id, line_number, account_code, owner_type, owner_id,
      debit_cents, credit_cents, memo
    ) values (
      v_journal_id, v_number, v_line->>'account_code',
      nullif(v_line->>'owner_type',''), nullif(v_line->>'owner_id','')::uuid,
      coalesce((v_line->>'debit_cents')::bigint, 0),
      coalesce((v_line->>'credit_cents')::bigint, 0), v_line->>'memo'
    );
  end loop;
  return v_journal_id;
exception when unique_violation then
  select id into v_journal_id from public.financial_journals
   where idempotency_key = p_idempotency_key;
  return v_journal_id;
end;
$$;

create or replace function public.prevent_financial_ledger_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'financial_ledger_is_append_only';
end;
$$;

drop trigger if exists trg_financial_journal_immutable on public.financial_journals;
create trigger trg_financial_journal_immutable before update or delete on public.financial_journals
for each row execute function public.prevent_financial_ledger_mutation();
drop trigger if exists trg_financial_entry_immutable on public.financial_ledger_entries;
create trigger trg_financial_entry_immutable before update or delete on public.financial_ledger_entries
for each row execute function public.prevent_financial_ledger_mutation();

create or replace view public.financial_journal_reconciliation as
select j.id, j.source_type, j.source_id, j.idempotency_key, j.occurred_at,
       coalesce(sum(e.debit_cents), 0)::bigint as debit_cents,
       coalesce(sum(e.credit_cents), 0)::bigint as credit_cents,
       (coalesce(sum(e.debit_cents), 0) = coalesce(sum(e.credit_cents), 0)) as balanced
from public.financial_journals j
left join public.financial_ledger_entries e on e.journal_id = j.id
group by j.id;

alter table public.financial_journals enable row level security;
alter table public.financial_ledger_entries enable row level security;
revoke all on public.financial_journals, public.financial_ledger_entries from anon, authenticated;
grant select, insert on public.financial_journals, public.financial_ledger_entries to service_role;
revoke all on function public.post_financial_journal(text,text,text,text,timestamptz,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.post_financial_journal(text,text,text,text,timestamptz,jsonb,jsonb,uuid) to service_role;
revoke all on public.financial_journal_reconciliation from anon, authenticated;
grant select on public.financial_journal_reconciliation to service_role;

create index if not exists financial_journals_occurred_idx on public.financial_journals(occurred_at desc);
create index if not exists financial_entries_account_idx on public.financial_ledger_entries(account_code, created_at desc);
create index if not exists financial_entries_owner_idx on public.financial_ledger_entries(owner_type, owner_id, created_at desc);

comment on table public.financial_journals is 'Immutable balanced operational journals. These are not tax invoices.';
comment on table public.financial_ledger_entries is 'Append-only double-entry operational ledger in integer cents.';

create table if not exists public.merchant_payouts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  gross_sales_cents bigint not null check (gross_sales_cents >= 0),
  refunds_cents bigint not null default 0 check (refunds_cents >= 0),
  commission_cents bigint not null default 0 check (commission_cents >= 0),
  adjustments_cents bigint not null default 0,
  net_payout_cents bigint not null check (net_payout_cents >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','cancelled')),
  payment_reference text,
  failure_reason text,
  paid_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, period_start, period_end),
  check ((status = 'paid' and payment_reference is not null and paid_at is not null) or status <> 'paid')
);
alter table public.merchant_payouts enable row level security;
revoke all on public.merchant_payouts from anon, authenticated;
grant select, insert, update on public.merchant_payouts to service_role;
create index if not exists merchant_payouts_restaurant_period_idx on public.merchant_payouts(restaurant_id, period_end desc);
comment on table public.merchant_payouts is 'Operational merchant settlements in integer cents; not a tax invoice.';
