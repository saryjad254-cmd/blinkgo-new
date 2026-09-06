import assert from 'node:assert/strict';
import fs from 'node:fs';

const visibilitySql = fs.readFileSync(
  new URL('../supabase/migrations/20260831134416_restrict_public_catalog_visibility.sql', import.meta.url),
  'utf8',
);
const compatibilitySql = fs.readFileSync(
  new URL('../supabase/migrations/20260831135006_correct_coupon_visibility_compatibility.sql', import.meta.url),
  'utf8',
);

assert.match(visibilitySql, /restaurants_public_read[\s\S]*is_active = true[\s\S]*is_verified[\s\S]*is_hidden/i);
assert.match(visibilitySql, /coupons_read[\s\S]*deleted_at is null/i);
assert.match(visibilitySql, /start_date is null or start_date <= now\(\)/i);
assert.match(visibilitySql, /end_date is null or end_date >= now\(\)/i);
assert.match(visibilitySql, /usage_limit is null[\s\S]*usage_count/i);
assert.match(visibilitySql, /max_uses is null[\s\S]*current_uses/i);
assert.match(visibilitySql, /revoke all on table public\.reviews from anon/i);
assert.match(visibilitySql, /reviews_customer_insert[\s\S]*reviewed_order\.customer_id = \(select auth\.uid\(\)\)[\s\S]*status = 'delivered'/i);
assert.match(compatibilitySql, /alter table public\.coupons alter column valid_from drop default/i);

console.log('Public catalog visibility contract: PASS');
