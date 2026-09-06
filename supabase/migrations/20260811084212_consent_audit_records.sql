create table if not exists public.consent_records (
  id uuid primary key,
  consent_version text not null,
  action text not null check (action in ('accept_all', 'reject_non_essential', 'custom')),
  categories jsonb not null,
  source text not null default 'global_banner',
  created_at timestamptz not null default now(),
  constraint consent_records_categories_object check (jsonb_typeof(categories) = 'object')
);

comment on table public.consent_records is 'Append-only audit evidence for cookie/privacy choices. No IP address or user-agent is retained.';

alter table public.consent_records enable row level security;
revoke all on table public.consent_records from anon, authenticated;
grant insert, select on table public.consent_records to service_role;

create index if not exists consent_records_created_at_idx
  on public.consent_records (created_at desc);
