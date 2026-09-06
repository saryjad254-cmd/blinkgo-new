import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'supabase/migrations/20260826000830_optimize_core_rls_initplans_and_support_indexes.sql',
  'utf8',
);
const profileGuard = readFileSync(
  'supabase/migrations/20260826002836_prevent_profile_privilege_escalation_without_recursive_rls.sql',
  'utf8',
);

const policyNames = [
  'users_self_select',
  'users_insert_signup',
  'users_admin_update_role',
  'users_self_update',
  'orders_customer_read',
  'orders_restaurant_read',
  'orders_driver_read',
  'orders_insert',
  'drivers_self_all',
  'driver_status_read_staff',
  'driver_status_self',
];

for (const name of policyNames) {
  assert.match(sql, new RegExp(`alter\\s+policy\\s+${name}\\b`, 'i'), `${name} must be optimized`);
}

assert.doesNotMatch(sql, /(?<!select\s)auth\.uid\(\)/i, 'auth.uid() must be cached through a scalar select');
assert.doesNotMatch(sql, /auth\.role\(\)/i, 'deprecated auth.role() must not be introduced');

for (const table of ['users', 'orders', 'drivers', 'driver_status']) {
  const statements = [...sql.matchAll(new RegExp(`alter\\s+policy[\\s\\S]*?on\\s+public\\.${table}[\\s\\S]*?;`, 'gi'))];
  assert.ok(statements.length > 0, `${table} must have a policy change`);
  for (const [statement] of statements) {
    assert.match(statement, /to authenticated/i, `${table} client policy must target authenticated`);
  }
}

assert.match(sql, /support_ticket_attachments_reply_idx[\s\S]*?\(reply_id\)/i);
assert.match(sql, /support_ticket_attachments_uploader_idx[\s\S]*?\(uploader_id\)/i);

assert.match(profileGuard, /create or replace function public\.guard_user_privilege_fields\(\)/i);
assert.match(profileGuard, /new\.role is distinct from old\.role/i);
assert.match(profileGuard, /new\.is_active is distinct from old\.is_active/i);
assert.match(profileGuard, /new\.is_verified is distinct from old\.is_verified/i);
assert.match(profileGuard, /raise exception 'privileged_profile_fields_are_server_managed'[\s\S]*?errcode = '42501'/i);
assert.match(profileGuard, /before update of role, is_active, is_verified on public\.users/i);
assert.match(profileGuard, /alter policy users_self_update[\s\S]*?using \(id = \(select auth\.uid\(\)\)\)[\s\S]*?with check \(id = \(select auth\.uid\(\)\)\)/i);
assert.doesNotMatch(
  profileGuard.match(/alter policy users_self_update[\s\S]*?;/i)?.[0] ?? '',
  /from public\.users/i,
  'self-update policy must not recursively query users',
);

console.log(`Core RLS performance contract: PASS (${policyNames.length} policies + 2 indexes + profile guard)`);
