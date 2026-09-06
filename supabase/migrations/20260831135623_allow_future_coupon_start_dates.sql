begin;

-- sync_coupon_compat() already falls back to now() when both compatible start
-- fields are absent. Removing this default lets an explicit legacy start_date
-- survive the BEFORE INSERT trigger instead of being replaced by now().
alter table public.coupons alter column valid_from drop default;

commit;
