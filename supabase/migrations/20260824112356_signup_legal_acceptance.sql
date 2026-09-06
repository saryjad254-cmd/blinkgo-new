create table if not exists public.legal_acceptance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  terms_version text not null,
  privacy_version text not null,
  locale text not null check (locale in ('de', 'ar', 'en')),
  source text not null default 'self_registration' check (source in ('self_registration', 'admin_invitation')),
  accepted_at timestamptz not null default now(),
  constraint legal_acceptance_terms_version_format check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-[a-z0-9-]+)?$'),
  constraint legal_acceptance_privacy_version_format check (privacy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-[a-z0-9-]+)?$'),
  constraint legal_acceptance_unique_version unique (user_id, terms_version, privacy_version)
);

comment on table public.legal_acceptance_records is
  'Append-only, data-minimised evidence of account terms and privacy notice acceptance. No email, IP address, or user-agent is retained.';

alter table public.legal_acceptance_records enable row level security;
revoke all on table public.legal_acceptance_records from anon, authenticated;
grant insert, select on table public.legal_acceptance_records to service_role;

create index if not exists legal_acceptance_records_user_id_idx
  on public.legal_acceptance_records (user_id);

create index if not exists legal_acceptance_records_accepted_at_idx
  on public.legal_acceptance_records (accepted_at desc);
