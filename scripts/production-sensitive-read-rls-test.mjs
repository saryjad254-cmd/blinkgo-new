import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('deploy/supabase/75-production-sensitive-read-rls-repair.sql', 'utf8');

for (const table of ['order_tracking_events', 'payments']) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon`, 'i'));
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+authenticated`, 'i'));
  assert.match(sql, new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+authenticated`, 'i'));
}

const trackingPolicy = sql.match(/create policy order_tracking_events_read[\s\S]*?\n\s*\);/i)?.[0] ?? '';
assert.match(trackingPolicy, /tracked_order\.customer_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(trackingPolicy, /tracked_order\.driver_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(trackingPolicy, /tracked_restaurant\.owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(trackingPolicy, /public\.auth_role\(\)\) in \('admin', 'super_admin', 'manager'\)/i);
assert.doesNotMatch(trackingPolicy, /using\s*\(\s*true\s*\)/i);

const paymentPolicy = sql.match(/create policy payments_customer_read[\s\S]*?\n\s*\);/i)?.[0] ?? '';
assert.match(paymentPolicy, /customer_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(paymentPolicy, /'payment_support'/i);
assert.doesNotMatch(paymentPolicy, /using\s*\(\s*true\s*\)/i);

assert.match(sql, /begin;/i);
assert.match(sql, /commit;/i);

console.log('Production sensitive-read RLS repair: PASS (tracking + payments least privilege)');
