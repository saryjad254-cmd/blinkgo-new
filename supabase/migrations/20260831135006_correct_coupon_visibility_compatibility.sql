begin;

-- The reconciled schema temporarily carries both legacy and canonical coupon
-- date/usage columns. A coupon is public only when every populated constraint
-- is valid; COALESCE would incorrectly let one default mask the other.
-- The compatibility trigger supplies now() only when neither date is present;
-- a column default here would overwrite an explicitly supplied start_date.
alter table public.coupons alter column valid_from drop default;

drop policy if exists coupons_read on public.coupons;
create policy coupons_read
  on public.coupons for select
  to anon, authenticated
  using (
    is_active = true
    and deleted_at is null
    and (valid_from is null or valid_from <= now())
    and (start_date is null or start_date <= now())
    and (valid_until is null or valid_until >= now())
    and (end_date is null or end_date >= now())
    and (usage_limit is null or coalesce(usage_count, 0) < usage_limit)
    and (max_uses is null or coalesce(current_uses, 0) < max_uses)
  );

commit;
