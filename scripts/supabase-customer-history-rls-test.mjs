import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'supabase/migrations/20260826013158_consolidate_customer_history_loyalty_ratings_rls.sql',
  'utf8',
);
const executableSql = sql.replace(/^\s*--.*$/gm, '');
const ratingModal = readFileSync('components/orders/RateOrderModal.tsx', 'utf8');
const ratingRoute = readFileSync('app/api/ratings/route.ts', 'utf8');

for (const table of ['addresses', 'recently_viewed', 'search_history']) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon`, 'i'));
}
for (const policy of ['addresses_user_all', 'recently_viewed_user', 'Users manage own search history']) {
  const escaped = policy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const statement = sql.match(new RegExp(`alter\\s+policy\\s+"?${escaped}"?[\\s\\S]*?;`, 'i'))?.[0] ?? '';
  assert.match(statement, /to authenticated/i, `${policy} must target authenticated`);
  assert.match(statement, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(statement, /with check \(user_id = \(select auth\.uid\(\)\)\)/i);
}

assert.match(sql, /alter policy loyalty_read_own[\s\S]*?user_id = \(select auth\.uid\(\)\)[\s\S]*?auth_role\(\)/i);
assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.loyalty_points\s+from\s+anon/i);
assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.loyalty_transactions\s+from\s+anon/i);
assert.match(sql, /revoke\s+insert,\s*update,\s*delete\s+on\s+table\s+public\.loyalty_transactions\s+from\s+authenticated/i);
for (const command of ['insert', 'update', 'delete']) {
  assert.match(sql, new RegExp(`create\\s+policy\\s+loyalty_admin_${command}[\\s\\S]*?for\\s+${command}`, 'i'));
}
assert.match(sql, /alter policy loyalty_tx_read_own[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
assert.match(sql, /revoke update, delete on table public\.ratings from authenticated/i);
assert.match(sql, /alter policy ratings_insert_customer[\s\S]*?customer_id = \(select auth\.uid\(\)\)[\s\S]*?auth_role\(\)/i);
assert.match(sql, /rated_order\.customer_id\s*=\s*\(select auth\.uid\(\)\)/i);
assert.match(sql, /rated_order\.status\s*=\s*'delivered'/i);
assert.match(sql, /rated_order\.restaurant_id\s*=\s*ratings\.restaurant_id/i);
assert.match(sql, /rated_order\.driver_id\s+is not distinct from\s+ratings\.driver_id/i);
assert.doesNotMatch(executableSql, /auth\.role\(\)/i);
assert.doesNotMatch(executableSql, /(?<!select\s)auth\.uid\(\)/i);
assert.match(ratingModal, /fetch\('\/api\/ratings'/);
assert.doesNotMatch(ratingModal, /\.from\(['"]ratings['"]\)/);
assert.match(ratingRoute, /order\.customer_id !== user\.id/);
assert.match(ratingRoute, /order\.status !== 'delivered'/);
assert.match(ratingRoute, /\.upsert\(\{/);
assert.match(ratingRoute, /Unable to save rating/);

console.log('Customer history/loyalty RLS contract: PASS (6 tables + verified rating API)');
