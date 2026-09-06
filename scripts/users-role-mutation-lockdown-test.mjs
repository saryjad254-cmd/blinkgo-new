import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'supabase/migrations/20260831150000_lock_down_users_role_mutation.sql',
  'utf8',
);
const safeUpdatesSql = readFileSync(
  'supabase/migrations/20260831151500_allow_safe_users_profile_updates.sql',
  'utf8',
);
const executableSql = `${sql}\n${safeUpdatesSql}`.replace(/^\s*--.*$/gm, '');

assert.match(sql, /revoke all on table public\.users from anon/i);
assert.match(sql, /revoke all on table public\.users from authenticated/i);
assert.match(sql, /grant select on table public\.users to authenticated/i);
assert.doesNotMatch(executableSql, /grant\s+(?:insert|delete|all)[\s\S]*?public\.users[\s\S]*?authenticated/i);
assert.match(safeUpdatesSql, /grant update \(name, phone, avatar_url\) on table public\.users to authenticated/i);
assert.equal([...safeUpdatesSql.matchAll(/grant\s+update\s*\(([^)]+)\)/gi)].length, 1);

for (const policy of [
  'users_insert_self',
  'users_update_own',
  'users_admin_all',
  'users_admin_update_role',
  'users_insert_signup',
  'users_self_update',
]) {
  assert.match(sql, new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${policy}\\s+on\\s+public\\.users`, 'i'));
}

const selfSelect = sql.match(/create policy users_self_select[\s\S]*?;/i)?.[0] ?? '';
assert.match(selfSelect, /for select/i);
assert.match(selfSelect, /to authenticated/i);
assert.match(selfSelect, /id\s*=\s*\(select auth\.uid\(\)\)/i);

const privilegedSelect = sql.match(/create policy users_privileged_select[\s\S]*?;/i)?.[0] ?? '';
assert.match(privilegedSelect, /for select/i);
assert.match(privilegedSelect, /public\.auth_role\(\)/i);
const selfUpdate = safeUpdatesSql.match(/create policy users_self_update[\s\S]*?;/i)?.[0] ?? '';
assert.match(selfUpdate, /for update/i);
assert.match(selfUpdate, /using \(id = \(select auth\.uid\(\)\)\)/i);
assert.match(selfUpdate, /with check \(id = \(select auth\.uid\(\)\)\)/i);
assert.doesNotMatch(executableSql, /create policy[\s\S]*?for\s+(?:insert|delete|all)[\s\S]*?on public\.users/i);

console.log('Users authorization profile lockdown: PASS (safe profile fields only)');
