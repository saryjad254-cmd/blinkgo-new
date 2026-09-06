-- Restore a column required by driver release and order operations.
-- Some staging databases were provisioned before application_data_contract.sql
-- and therefore missed public.orders.notes.

alter table public.orders
  add column if not exists notes text;

comment on column public.orders.notes is
  'Internal order notes, including structured driver-release annotations; never rendered as trusted HTML.';
