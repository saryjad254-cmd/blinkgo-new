create table if not exists public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  document_number text not null unique,
  document_type text not null check (document_type in ('customer_receipt','merchant_transaction_statement')),
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid references public.users(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  status text not null default 'issued' check (status in ('issued','superseded')),
  currency text not null default 'EUR' check (currency = 'EUR'),
  snapshot jsonb not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz not null default now(),
  superseded_by uuid references public.financial_documents(id) on delete restrict,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financial_documents_one_kind_per_order unique (order_id, document_type),
  constraint financial_documents_supersede_state check (
    (status = 'issued' and superseded_by is null) or (status = 'superseded' and superseded_by is not null)
  )
);

create sequence if not exists public.financial_document_number_seq;

create or replace function public.issue_financial_document(
  p_document_type text,
  p_order_id uuid,
  p_customer_id uuid,
  p_restaurant_id uuid,
  p_snapshot jsonb,
  p_snapshot_sha256 text,
  p_created_by uuid
) returns public.financial_documents
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.financial_documents;
  result public.financial_documents;
  prefix text;
begin
  if p_document_type not in ('customer_receipt','merchant_transaction_statement') then
    raise exception 'unsupported_document_type';
  end if;
  select * into existing from public.financial_documents
   where order_id = p_order_id and document_type = p_document_type;
  if found then return existing; end if;
  prefix := case p_document_type when 'customer_receipt' then 'BG-BELEG' else 'BG-TRANS' end;
  insert into public.financial_documents (
    document_number, document_type, order_id, customer_id, restaurant_id,
    snapshot, snapshot_sha256, created_by
  ) values (
    prefix || '-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.financial_document_number_seq')::text, 8, '0'),
    p_document_type, p_order_id, p_customer_id, p_restaurant_id,
    p_snapshot, p_snapshot_sha256, p_created_by
  ) returning * into result;
  return result;
exception when unique_violation then
  select * into result from public.financial_documents
   where order_id = p_order_id and document_type = p_document_type;
  return result;
end;
$$;

alter table public.financial_documents enable row level security;
revoke all on table public.financial_documents from anon, authenticated;
grant select, insert, update on table public.financial_documents to service_role;
revoke all on function public.issue_financial_document(text,uuid,uuid,uuid,jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.issue_financial_document(text,uuid,uuid,uuid,jsonb,text,uuid) to service_role;

create or replace function public.prevent_financial_document_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'financial_documents_are_retained'; end if;
  if old.document_number is distinct from new.document_number
     or old.document_type is distinct from new.document_type
     or old.order_id is distinct from new.order_id
     or old.customer_id is distinct from new.customer_id
     or old.restaurant_id is distinct from new.restaurant_id
     or old.currency is distinct from new.currency
     or old.snapshot is distinct from new.snapshot
     or old.snapshot_sha256 is distinct from new.snapshot_sha256
     or old.issued_at is distinct from new.issued_at
     or old.created_by is distinct from new.created_by then
    raise exception 'issued_financial_document_is_immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_financial_document_immutable on public.financial_documents;
create trigger trg_financial_document_immutable before update or delete on public.financial_documents
for each row execute function public.prevent_financial_document_mutation();

create index if not exists financial_documents_customer_idx on public.financial_documents(customer_id, issued_at desc);
create index if not exists financial_documents_restaurant_idx on public.financial_documents(restaurant_id, issued_at desc);

comment on table public.financial_documents is
  'Immutable order receipt and merchant transaction snapshots. Not a tax invoice until issuer tax configuration and accountant approval are complete.';
