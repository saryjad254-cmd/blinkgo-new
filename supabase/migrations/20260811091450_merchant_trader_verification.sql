create table if not exists public.restaurant_verifications (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  legal_name text not null,
  legal_form text,
  representative_name text not null,
  contact_email text not null,
  contact_phone text not null,
  street_address text not null,
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  city text not null,
  country_code text not null default 'DE' check (country_code ~ '^[A-Z]{2}$'),
  trade_register_name text not null,
  trade_register_number text not null,
  vat_id text,
  tax_number text,
  identity_document_ref text not null,
  business_document_ref text not null,
  payout_account_last4 text not null check (payout_account_last4 ~ '^[0-9]{4}$'),
  self_certified_at timestamptz not null,
  submitted_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_verification_review_state check (
    (status not in ('approved', 'rejected') or (reviewed_by is not null and reviewed_at is not null))
    and (status <> 'rejected' or length(trim(coalesce(rejection_reason, ''))) >= 5)
  )
);

comment on table public.restaurant_verifications is 'DSA trader traceability evidence. Service-role only; document_ref values point to separately protected verification documents.';

alter table public.restaurant_verifications enable row level security;
revoke all on table public.restaurant_verifications from anon, authenticated;
grant select, insert, update, delete on table public.restaurant_verifications to service_role;

create index if not exists restaurant_verifications_status_idx
  on public.restaurant_verifications (status, submitted_at desc);
