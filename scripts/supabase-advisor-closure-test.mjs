import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260825230229_close_staging_advisor_gaps.sql',
  'utf8',
);
const route = readFileSync('app/api/admin/product-requests/route.ts', 'utf8');
const mock = readFileSync('scripts/mock-supabase.mjs', 'utf8');

const serverOnlyTables = [
  'financial_documents',
  'financial_journals',
  'financial_ledger_entries',
  'group_order_items',
  'group_order_participants',
  'group_orders',
  'legal_acceptance_records',
  'merchant_payouts',
  'order_delivery_preferences',
  'order_delivery_proofs',
  'order_failed_deliveries',
  'platform_feature_flag_versions',
  'platform_feature_flags',
  'support_ticket_attachments',
];

for (const table of serverOnlyTables) {
  assert.ok(migration.includes(`'${table}'`), `${table} must have an explicit server-only contract`);
}

assert.match(migration, /create policy service_role_all[\s\S]*?to service_role[\s\S]*?using \(true\)[\s\S]*?with check \(true\)/i);
assert.match(migration, /revoke all on table public\.%I from public, anon, authenticated/i);

const authRole = migration.match(/create or replace function public\.auth_role\(\)[\s\S]*?comment on function public\.auth_role\(\)/i)?.[0] ?? '';
assert.match(authRole, /security invoker/i);
assert.match(authRole, /'app_metadata'->>'app_role'/i);
assert.doesNotMatch(authRole, /from public\.users/i);

const approval = migration.match(/create or replace function public\.approve_product_request\([\s\S]*?comment on function public\.approve_product_request\(uuid, jsonb, uuid\)/i)?.[0] ?? '';
assert.match(approval, /p_actor_id uuid/i);
assert.match(approval, /actor_role not in \('manager', 'admin', 'super_admin'\)/i);
assert.match(approval, /revoke all on function public\.approve_product_request\(uuid, jsonb, uuid\)[\s\S]*?from public, anon, authenticated/i);
assert.match(approval, /grant execute on function public\.approve_product_request\(uuid, jsonb, uuid\)[\s\S]*?to service_role/i);
assert.match(approval, /drop function public\.approve_product_request\(uuid, jsonb\)/i);

assert.match(route, /createServiceClient\(\)/);
assert.doesNotMatch(route, /createServerClient/);
assert.match(route, /p_actor_id:\s*admin\.id/);
assert.match(route, /ApprovalEditsSchema[\s\S]*?\.strict\(\)/);
assert.match(mock, /approve_product_request[\s\S]*?if \(!body\?\.p_actor_id\)/);

console.log(`Supabase advisor closure: PASS (${serverOnlyTables.length} server-only tables + 2 function contracts)`);
