-- Reconcile the deployed driver_payouts table with the operational payout API.
-- Monetary totals remain canonical in total_base, total_tips and total_payout.

alter table public.driver_payouts
  add column if not exists payment_reference text,
  add column if not exists payment_method text,
  add column if not exists notes text;

create unique index if not exists driver_payouts_driver_period_unique
  on public.driver_payouts (driver_id, period_start, period_end);

create index if not exists driver_payouts_status_period_idx
  on public.driver_payouts (status, period_end desc);

comment on column public.driver_payouts.payment_reference is
  'External bank or settlement reference. Required by the API before marking a payout paid.';
