import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = 'supabase/migrations';
const files = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
const combined = files.map((name) => readFileSync(join(directory, name), 'utf8')).join('\n');
const declarations = [...combined.matchAll(
  /create\s+(?:or\s+replace\s+)?function\s+([^\s(]+)\s*\([^)]*\)[\s\S]*?(?=create\s+(?:or\s+replace\s+)?function\s+|$)/gi,
)];

const privileged = declarations
  .filter((match) => /security\s+definer/i.test(match[0]))
  .map((match) => match[1].toLowerCase());

assert.ok(privileged.length > 0, 'expected privileged functions in active migrations');

for (const functionName of new Set(privileged)) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lastDefinition = Math.max(
    combined.toLowerCase().lastIndexOf(`create function ${functionName}`),
    combined.toLowerCase().lastIndexOf(`create or replace function ${functionName}`),
  );
  const tail = combined.slice(lastDefinition);
  const revokes = [...tail.matchAll(
    new RegExp(`revoke\\s+(?:all|execute)\\s+on\\s+function\\s+${escaped}[\\s\\S]*?from\\s+([^;]+);`, 'gi'),
  )].map((match) => match[1].toLowerCase()).join(',');

  assert.match(revokes, /\bpublic\b/, `${functionName} must revoke PUBLIC execute`);
  assert.match(revokes, /\banon\b/, `${functionName} must revoke anon execute`);
  assert.match(revokes, /\bauthenticated\b/, `${functionName} must revoke authenticated execute`);
}

assert.match(
  combined,
  /revoke all on function public\.award_loyalty_points\(uuid, integer, text, uuid\)[\s\S]*?from public, anon, authenticated/i,
  'loyalty award must be server-only',
);
assert.match(
  combined,
  /grant execute on function public\.award_loyalty_points\(uuid, integer, text, uuid\)[\s\S]*?to service_role/i,
  'service role must retain loyalty award access',
);
assert.match(
  combined,
  /alter view if exists public\.financial_journal_reconciliation[\s\S]*?security_invoker\s*=\s*true/i,
  'financial reconciliation view must use caller privileges',
);
assert.match(
  combined,
  /revoke all on public\.financial_journal_reconciliation[\s\S]*?from public, anon, authenticated/i,
  'financial reconciliation view must be inaccessible to client roles',
);
for (const view of ['v_duplicate_refund_requests', 'v_stuck_cancel_refunds']) {
  assert.match(
    combined,
    new RegExp(`alter view if exists public\\.${view}[\\s\\S]*?security_invoker\\s*=\\s*true`, 'i'),
    `${view} must use caller privileges`,
  );
  assert.match(
    combined,
    new RegExp(`revoke all on public\\.${view}[\\s\\S]*?from public, anon, authenticated`, 'i'),
    `${view} must be inaccessible to client roles`,
  );
  assert.match(
    combined,
    new RegExp(`grant select on public\\.${view} to service_role`, 'i'),
    `${view} must remain available to service operations`,
  );
}
assert.match(
  combined,
  /revoke insert, update, delete on table public\.orders[\s\S]*?from anon, authenticated/i,
  'orders must remain server-authoritative',
);
assert.match(
  combined,
  /revoke all on table public\.notifications from anon/i,
  'anonymous users must have no notifications table privileges',
);
assert.match(
  combined,
  /revoke all on table public\.notifications from authenticated/i,
  'authenticated notification privileges must be rebuilt from a deny-all baseline',
);
assert.match(
  combined,
  /grant select on table public\.notifications to authenticated/i,
  'authenticated users must retain notification read access through RLS',
);
assert.match(
  combined,
  /grant update \(is_read, read_at\) on table public\.notifications to authenticated/i,
  'authenticated users may only acknowledge notifications',
);
for (const policy of [
  'System inserts notifications',
  'Users read own notifications',
  'Users update own notifications',
  'notif_user_all',
  'notifications_insert_system',
  'notifications_select_own',
  'notifications_update_own',
]) {
  assert.match(
    combined,
    new RegExp(`drop policy if exists "?${policy}"? on public\\.notifications`, 'i'),
    `legacy notifications policy ${policy} must be removed`,
  );
}
assert.match(
  combined,
  /create policy notifications_user_select[\s\S]*?on public\.notifications[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?user_id\s*=\s*\(select auth\.uid\(\)\)/i,
  'notification reads must be scoped to the authenticated owner',
);
assert.match(
  combined,
  /create policy notifications_user_acknowledge[\s\S]*?on public\.notifications[\s\S]*?for update[\s\S]*?to authenticated[\s\S]*?using \(user_id = \(select auth\.uid\(\)\)\)[\s\S]*?with check \(user_id = \(select auth\.uid\(\)\)\)/i,
  'notification acknowledgements must remain scoped to the authenticated owner',
);
assert.match(
  combined,
  /create policy notifications_service_all[\s\S]*?on public\.notifications[\s\S]*?for all[\s\S]*?to service_role/i,
  'service operations must retain explicit notification access',
);
assert.match(
  combined,
  /drop policy if exists orders_update_involved on public\.orders/i,
  'legacy unrestricted order update policy must be removed',
);
assert.match(
  combined,
  /drop policy if exists tracking_events_insert_driver[\s\S]*?on public\.order_tracking_events/i,
  'legacy unrestricted tracking insert policy must be removed',
);
for (const policy of ['product_images_public_read', 'restaurant_images_public_read']) {
  assert.match(
    combined,
    new RegExp(`drop policy if exists ${policy} on storage\\.objects`, 'i'),
    `${policy} must not permit public bucket listing`,
  );
}
assert.match(
  combined,
  /p\.oid::regprocedure as signature[\s\S]*?alter function %s set search_path = public, pg_temp/i,
  'all legacy public functions must receive a pinned search_path',
);
assert.match(
  combined,
  /create or replace function public\.auth_role\(\)[\s\S]*?security invoker[\s\S]*?set search_path = pg_catalog, pg_temp/i,
  'auth_role must not bypass RLS',
);
assert.match(
  combined,
  /server_only_names constant text\[\][\s\S]*?revoke all on function %s from public, anon, authenticated[\s\S]*?grant execute on function %s to service_role/i,
  'legacy privileged functions must be server-only',
);
assert.match(
  combined,
  /function public\.recompute_order_payment_status\(p_order_id uuid\)[\s\S]*?if not found then[\s\S]*?errcode\s*=\s*'P0002'/i,
  'payment status recomputation must fail closed for a missing order',
);
assert.match(
  combined,
  /function public\.refund_max_amount_cents\(p_order_id uuid\)[\s\S]*?if not found then[\s\S]*?errcode\s*=\s*'P0002'/i,
  'refundable-balance computation must fail closed for a missing order',
);

console.log(`Migration privilege audit: PASS (${new Set(privileged).size} SECURITY DEFINER functions checked)`);
