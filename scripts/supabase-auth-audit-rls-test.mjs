import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const primarySql = readFileSync(
  'supabase/migrations/20260826023033_secure_auth_and_audit_logs.sql',
  'utf8',
);
const servicePolicySql = readFileSync(
  'supabase/migrations/20260826023754_add_explicit_service_policies_for_internal_auth_tables.sql',
  'utf8',
);
const sql = `${primarySql}\n${servicePolicySql}`;
const executableSql = sql.replace(/^\s*--.*$/gm, '');

for (const table of [
  'login_attempts',
  'magic_link_tokens',
  'geocode_cache',
  'security_audit_log',
  'activity_log',
  'admin_daily_reset_log',
]) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from`, 'i'));
}

assert.match(sql, /drop policy if exists "Service role full access" on public\.login_attempts/i);
assert.match(sql, /drop policy if exists login_attempts_service_insert/i);
assert.match(sql, /alter policy login_attempts_admin_read[\s\S]*?to authenticated[\s\S]*?auth_role\(\)/i);
assert.match(sql, /revoke all on table public\.magic_link_tokens from anon, authenticated/i);
assert.match(sql, /revoke all on table public\.geocode_cache from anon, authenticated/i);
assert.match(sql, /create policy magic_link_tokens_service[\s\S]*?to service_role[\s\S]*?using \(true\)[\s\S]*?with check \(true\)/i);
assert.match(sql, /create policy geocode_cache_service[\s\S]*?to service_role[\s\S]*?using \(true\)[\s\S]*?with check \(true\)/i);

for (const table of ['security_audit_log', 'activity_log', 'admin_daily_reset_log']) {
  assert.match(sql, new RegExp(`revoke\\s+insert,\\s*update,\\s*delete\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+authenticated`, 'i'));
}
assert.match(sql, /drop policy if exists "System can insert activity"/i);
assert.match(sql, /create policy admin_daily_reset_log_admin_read[\s\S]*?for select[\s\S]*?to authenticated/i);
assert.doesNotMatch(executableSql, /auth\.role\(\)/i);
assert.doesNotMatch(executableSql, /(?<!select\s)auth\.uid\(\)/i);

console.log('Auth/audit RLS contract: PASS (6 sensitive tables)');
