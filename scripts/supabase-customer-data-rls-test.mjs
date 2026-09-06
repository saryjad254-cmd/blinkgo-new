import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'supabase/migrations/20260826005815_consolidate_customer_notifications_favorites_rls.sql',
  'utf8',
);
const executableSql = sql.replace(/^\s*--.*$/gm, '');

for (const table of ['favorites', 'notification_preferences', 'push_subscriptions', 'notifications']) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon`, 'i'));
}

for (const policy of ['favorites_user_write', 'notif_prefs_update', 'push_subs_user']) {
  const statement = sql.match(new RegExp(`alter\\s+policy\\s+${policy}[\\s\\S]*?;`, 'i'))?.[0] ?? '';
  assert.match(statement, /to authenticated/i);
  assert.match(statement, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(statement, /with check \(user_id = \(select auth\.uid\(\)\)\)/i);
}

// Revoke the complete table grant first, then opt authenticated users back in
// to SELECT plus the two acknowledgement columns only.  This is stricter than
// revoking the three mutating verbs while leaving an inherited grant behind.
assert.match(sql, /revoke all on table public\.notifications from authenticated/i);
assert.match(sql, /grant select on table public\.notifications to authenticated/i);
assert.match(sql, /grant update \(is_read, read_at\) on table public\.notifications to authenticated/i);
assert.match(sql, /create policy notifications_user_select[\s\S]*?for select[\s\S]*?to authenticated/i);
assert.match(sql, /create policy notifications_user_acknowledge[\s\S]*?for update[\s\S]*?to authenticated/i);
assert.doesNotMatch(executableSql, /auth\.role\(\)/i);
assert.doesNotMatch(executableSql, /(?<!select\s)auth\.uid\(\)/i);

console.log('Customer-data RLS contract: PASS (4 tables, least privilege + cached ownership)');
