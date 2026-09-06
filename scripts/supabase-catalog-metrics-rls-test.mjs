import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policySql = readFileSync('supabase/migrations/20260826032012_secure_catalog_and_internal_metrics_rls.sql', 'utf8');
const governanceSql = readFileSync('supabase/migrations/20260826032550_align_product_governance_with_merchant_fields.sql', 'utf8');
const sql = `${policySql}\n${governanceSql}`;
const executableSql = sql.replace(/^\s*--.*$/gm, '');

for (const table of ['categories', 'products', 'daily_stats', 'delivery_proofs']) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon,\\s*authenticated`, 'i'));
}
assert.match(sql, /grant select on table public\.categories to anon, authenticated/i);
assert.match(sql, /grant select on table public\.products to anon, authenticated/i);
assert.match(sql, /grant update \([\s\S]*?price[\s\S]*?minimum_age[\s\S]*?\) on table public\.products to authenticated/i);
assert.doesNotMatch(sql, /grant update on table public\.products/i);
assert.match(sql, /create policy products_anon_visible[\s\S]*?approval_status = 'approved'[\s\S]*?is_available = true/i);
assert.match(sql, /create policy products_authenticated_visible[\s\S]*?auth_role\(\)/i);
assert.match(sql, /create policy products_owner_update[\s\S]*?for update[\s\S]*?with check/i);
assert.match(sql, /create or replace function public\.protect_product_governance_fields\(\)[\s\S]*?security definer/i);
assert.match(sql, /legal_information_complete[\s\S]*?legal_information_updated_at/i);
assert.match(sql, /revoke all on function public\.protect_product_governance_fields\(\) from public, anon, authenticated/i);
for (const table of ['daily_stats', 'delivery_proofs']) {
  assert.match(sql, new RegExp(`create\\s+policy\\s+${table}_service[\\s\\S]*?to\\s+service_role[\\s\\S]*?using\\s*\\(true\\)[\\s\\S]*?with check\\s*\\(true\\)`, 'i'));
}
assert.doesNotMatch(executableSql, /auth\.role\(\)/i);
assert.doesNotMatch(executableSql, /(?<!select\s)auth\.uid\(\)/i);

console.log('Catalog/metrics RLS contract: PASS (4 tables)');
