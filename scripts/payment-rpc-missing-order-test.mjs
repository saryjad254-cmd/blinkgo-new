import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260825223714_guard_missing_order_payment_recompute.sql',
  'utf8',
);
const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8');
const mock = readFileSync('scripts/mock-supabase.mjs', 'utf8');

const checks = [
  [
    'payment recompute guards missing orders',
    /function public\.recompute_order_payment_status[\s\S]*?if not found then[\s\S]*?errcode\s*=\s*'P0002'/i,
    migration,
  ],
  [
    'refund limit guards missing orders',
    /function public\.refund_max_amount_cents[\s\S]*?if not found then[\s\S]*?errcode\s*=\s*'P0002'/i,
    migration,
  ],
  [
    'payment recompute remains server-only',
    /revoke all on function public\.recompute_order_payment_status\(uuid\)[\s\S]*?from public, anon, authenticated/i,
    migration,
  ],
  [
    'refund limit remains server-only',
    /revoke all on function public\.refund_max_amount_cents\(uuid\)[\s\S]*?from public, anon, authenticated/i,
    migration,
  ],
  [
    'webhook observes recompute errors',
    /data: recResult, error: recError[\s\S]*?if \(recError\)/,
    webhook,
  ],
  [
    'webhook asks Stripe to retry failed recomputation',
    /PAYMENT_STATE_RECOMPUTE_FAILED[\s\S]*?status: 503/,
    webhook,
  ],
  [
    'mock mirrors missing-order failure',
    /recompute_order_payment_status[\s\S]*?P0002[\s\S]*?order_not_found/,
    mock,
  ],
];

for (const [name, pattern, source] of checks) {
  assert.match(source, pattern, name);
  console.log(`PASS ${name}`);
}

console.log(`Payment RPC missing-order regression: PASS (${checks.length}/${checks.length})`);
