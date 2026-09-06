import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const primarySql = readFileSync(
  'supabase/migrations/20260826030035_secure_checkout_support_and_legacy_refunds_rls.sql',
  'utf8',
);
const serviceSql = readFileSync(
  'supabase/migrations/20260826031029_add_explicit_service_policies_for_checkout_ledgers.sql',
  'utf8',
);
const sql = `${primarySql}\n${serviceSql}`;
const executableSql = sql.replace(/^\s*--.*$/gm, '');

for (const table of ['order_drafts', 'refunds']) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon,\\s*authenticated`, 'i'));
}
for (const table of ['support_tickets', 'support_ticket_replies']) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon,\\s*authenticated`, 'i'));
  assert.match(sql, new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+authenticated`, 'i'));
}

assert.match(sql, /create policy support_tickets_participant_read[\s\S]*?for select[\s\S]*?to authenticated/i);
assert.match(sql, /create policy support_ticket_replies_participant_read[\s\S]*?is_internal\s*=\s*false/i);
assert.match(sql, /auth_role\(\)[\s\S]*?'admin'[\s\S]*?'super_admin'[\s\S]*?'manager'/i);
assert.match(sql, /create policy order_drafts_service[\s\S]*?to service_role[\s\S]*?using \(true\)[\s\S]*?with check \(true\)/i);
assert.match(sql, /create policy refunds_service[\s\S]*?to service_role[\s\S]*?using \(true\)[\s\S]*?with check \(true\)/i);
assert.doesNotMatch(executableSql, /create policy[\s\S]*?for (insert|update|delete|all)[\s\S]*?to authenticated/i);
assert.doesNotMatch(executableSql, /auth\.role\(\)/i);
assert.doesNotMatch(executableSql, /(?<!select\s)auth\.uid\(\)/i);

console.log('Checkout/support RLS contract: PASS (4 sensitive tables)');
