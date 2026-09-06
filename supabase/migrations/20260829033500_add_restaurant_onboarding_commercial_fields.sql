-- Keep the production restaurants schema aligned with the admin onboarding
-- contract. Existing restaurants receive the same safe defaults already used
-- by the API, while new onboarding records can persist the submitted values.
alter table public.restaurants
  add column if not exists delivery_radius_km numeric(8,2) not null default 5,
  add column if not exists commission_pct numeric(5,2) not null default 15;

alter table public.restaurants
  drop constraint if exists restaurants_delivery_radius_km_range,
  add constraint restaurants_delivery_radius_km_range
    check (delivery_radius_km > 0 and delivery_radius_km <= 100),
  drop constraint if exists restaurants_commission_pct_range,
  add constraint restaurants_commission_pct_range
    check (commission_pct >= 0 and commission_pct <= 100);

comment on column public.restaurants.delivery_radius_km is
  'Maximum merchant delivery radius configured during onboarding.';
comment on column public.restaurants.commission_pct is
  'BlinkGo commission percentage agreed for the merchant account.';
