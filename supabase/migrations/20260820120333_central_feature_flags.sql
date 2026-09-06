-- BlinkGo central feature-flag and operational kill-switch control plane.
-- Server-only by design: browser roles receive no table privileges.

create table if not exists public.platform_feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  kind text not null default 'feature' check (kind in ('feature', 'kill_switch', 'surface')),
  description text not null check (char_length(description) between 3 and 500),
  enabled boolean not null,
  rollout_percentage smallint not null default 100 check (rollout_percentage between 0 and 100),
  dependencies text[] not null default '{}'::text[],
  scope jsonb not null default '{}'::jsonb check (jsonb_typeof(scope) = 'object'),
  active_order_policy text not null default 'allow'
    check (active_order_policy in ('allow', 'preserve_active', 'block_all')),
  version bigint not null default 1 check (version > 0),
  change_reason text not null default 'initial configuration'
    check (char_length(change_reason) between 3 and 500),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (key = any(dependencies)))
);

create table if not exists public.platform_feature_flag_versions (
  id bigint generated always as identity primary key,
  flag_key text not null references public.platform_feature_flags(key) on delete restrict,
  version bigint not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  change_reason text not null check (char_length(change_reason) between 3 and 500),
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (flag_key, version)
);

create or replace function public.validate_platform_feature_flag_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.version <> old.version + 1 then
    raise exception 'feature_flag_version_must_increment_by_one';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.capture_platform_feature_flag_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.platform_feature_flag_versions (
    flag_key, version, snapshot, change_reason, changed_by
  ) values (
    new.key,
    new.version,
    jsonb_build_object(
      'key', new.key,
      'kind', new.kind,
      'description', new.description,
      'enabled', new.enabled,
      'rollout_percentage', new.rollout_percentage,
      'dependencies', to_jsonb(new.dependencies),
      'scope', new.scope,
      'active_order_policy', new.active_order_policy
    ),
    new.change_reason,
    new.updated_by
  );
  return new;
end;
$$;

drop trigger if exists trg_platform_feature_flag_version on public.platform_feature_flags;
drop trigger if exists trg_platform_feature_flag_validate on public.platform_feature_flags;
create trigger trg_platform_feature_flag_validate
before update on public.platform_feature_flags
for each row execute function public.validate_platform_feature_flag_update();
create trigger trg_platform_feature_flag_version
after insert or update on public.platform_feature_flags
for each row execute function public.capture_platform_feature_flag_version();

alter table public.platform_feature_flags enable row level security;
alter table public.platform_feature_flag_versions enable row level security;

revoke all on public.platform_feature_flags from public, anon, authenticated;
revoke all on public.platform_feature_flag_versions from public, anon, authenticated;
grant select, insert, update on public.platform_feature_flags to service_role;
grant select, insert on public.platform_feature_flag_versions to service_role;
revoke execute on function public.capture_platform_feature_flag_version() from public, anon, authenticated;
revoke execute on function public.validate_platform_feature_flag_update() from public, anon, authenticated;
grant execute on function public.capture_platform_feature_flag_version() to service_role;
grant execute on function public.validate_platform_feature_flag_update() to service_role;

create index if not exists platform_feature_flags_kind_idx
  on public.platform_feature_flags(kind, enabled);
create index if not exists platform_feature_flag_versions_lookup_idx
  on public.platform_feature_flag_versions(flag_key, changed_at desc);

insert into public.platform_feature_flags
  (key, kind, description, enabled, rollout_percentage, dependencies, active_order_policy, change_reason)
values
  ('surface.customer.write.enabled', 'surface', 'Allow customer write operations.', true, 100, '{}', 'preserve_active', 'Master Directive control-plane baseline'),
  ('surface.merchant.write.enabled', 'surface', 'Allow merchant write operations.', true, 100, '{}', 'preserve_active', 'Master Directive control-plane baseline'),
  ('surface.courier.write.enabled', 'surface', 'Allow courier write operations.', true, 100, '{}', 'preserve_active', 'Master Directive control-plane baseline'),
  ('checkout.enabled', 'kill_switch', 'Allow customers to create and validate new checkout drafts.', true, 100, array['surface.customer.write.enabled'], 'preserve_active', 'Master Directive control-plane baseline'),
  ('orders.create.enabled', 'kill_switch', 'Allow creation of new orders from valid checkout drafts.', true, 100, array['checkout.enabled'], 'preserve_active', 'Master Directive control-plane baseline'),
  ('payments.stripe.enabled', 'kill_switch', 'Allow creation of new Stripe payments.', true, 100, array['orders.create.enabled'], 'preserve_active', 'Master Directive control-plane baseline'),
  ('payments.cash.enabled', 'kill_switch', 'Allow creation of new cash orders.', true, 100, array['orders.create.enabled'], 'preserve_active', 'Master Directive control-plane baseline'),
  ('dispatch.offers.enabled', 'kill_switch', 'Allow creation and acceptance of new courier offers.', true, 100, array['surface.courier.write.enabled'], 'preserve_active', 'Master Directive control-plane baseline'),
  ('notifications.delivery.enabled', 'kill_switch', 'Allow outbound transactional notification delivery.', true, 100, '{}', 'allow', 'Master Directive control-plane baseline'),
  ('features.customer_pickup.enabled', 'feature', 'Expose customer pickup checkout.', true, 100, array['checkout.enabled'], 'allow', 'Existing verified workflow'),
  ('features.group_orders.enabled', 'feature', 'Expose group ordering.', true, 100, array['checkout.enabled'], 'allow', 'Existing verified workflow'),
  ('features.retail_substitutions.enabled', 'feature', 'Expose retail replacement approvals.', true, 100, array['surface.merchant.write.enabled'], 'preserve_active', 'Existing verified workflow'),
  ('features.blinkgo_plus.enabled', 'feature', 'Expose BlinkGo membership benefits.', false, 0, '{}', 'allow', 'Commercial and legal dependencies incomplete'),
  ('features.owned_commerce.enabled', 'feature', 'Expose BlinkGo-owned inventory operations.', false, 0, '{}', 'allow', 'Ownership and settlement model incomplete'),
  ('features.b2b_delivery.enabled', 'feature', 'Expose external B2B delivery contracts.', false, 0, '{}', 'allow', 'Partner API and outbox dependencies incomplete'),
  ('features.age_restricted.enabled', 'feature', 'Expose age-restricted regulated products.', false, 0, '{}', 'block_all', 'German legal and handoff controls incomplete')
on conflict (key) do nothing;

comment on table public.platform_feature_flags is
  'Server-only typed feature flags, surfaces and operational kill switches with dependency and active-order policies.';
comment on table public.platform_feature_flag_versions is
  'Immutable version history for every feature-flag mutation.';
