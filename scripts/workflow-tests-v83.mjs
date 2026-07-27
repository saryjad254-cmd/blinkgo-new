#!/usr/bin/env node
/**
 * BlinkGo v83 — Final Workflow Tests
 * ──────────────────────────────────
 * Complements scripts/race-tests-v83.mjs with deeper end-to-end
 * exercises that require auth. These are integration tests that
 * expect a staging or local environment with seeded fixtures.
 *
 * Run:  node scripts/workflow-tests-v83.mjs
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_KEY, BASE_URL
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE = process.env.BASE_URL || 'http://localhost:3000';

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

let pass = 0, fail = 0;
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else    { fail++; console.log(`  ❌ ${name} — ${detail}`); }
}

async function getTestUser(role) {
  const { data, error } = await svc.from('users').select('id, role').eq('role', role).limit(1).maybeSingle();
  if (error || !data) throw new Error(`No test user with role=${role}`);
  return data;
}

// ─── V83-1: Refund idempotency ─────────────────────────────────────
// Submit a refund for the same order twice in quick succession. The
// second should return the SAME refund row, not create a duplicate.
async function v83_1_refundIdempotency() {
  const customer = await getTestUser('customer');
  const { data: order } = await svc
    .from('orders')
    .select('id, status, total, customer_id')
    .eq('customer_id', customer.id)
    .in('status', ['delivered', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order) {
    record('V83-1 refund idempotency', false, 'no eligible test order (need a delivered/cancelled order)');
    return;
  }
  // Clean any existing refund for the test order
  await svc.from('refunds').delete().eq('order_id', order.id);

  const a = await fetch(`${BASE}/api/orders/${order.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY },
    body: JSON.stringify({ reason: 'food_quality' }),
  }).catch((e) => null);
  const b = await fetch(`${BASE}/api/orders/${order.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY },
    body: JSON.stringify({ reason: 'food_quality' }),
  }).catch((e) => null);

  // After the test, count refunds for this order — must be exactly 1.
  const { data: refunds, count } = await svc
    .from('refunds')
    .select('id', { count: 'exact' })
    .eq('order_id', order.id);
  const isOk = (a?.status === 200 || a?.status === 409) && (b?.status === 200 || b?.status === 409) && (count ?? 0) === 1;
  record('V83-1 refund idempotency (1 row after 2 calls)', isOk, `a=${a?.status} b=${b?.status} count=${count}`);
}

// ─── V83-2: Two parallel order POSTs with the same idempotency key ──
async function v83_2_orderIdempotency() {
  const customer = await getTestUser('customer');
  const { data: product } = await svc
    .from('products')
    .select('id, price, restaurant_id, is_available, name')
    .eq('is_available', true)
    .limit(1)
    .maybeSingle();
  if (!product) {
    record('V83-2 order idempotency', false, 'no test product');
    return;
  }
  const key = 'v83-test-' + Date.now();
  const body = {
    restaurant_id: product.restaurant_id,
    items: [{ product_id: product.id, quantity: 1 }],
    payment_method: 'cash',
    delivery_address: { address: 'Test', lat: 50.82, lng: 6.97 },
    tip: 0,
    points_redeemed: 0,
  };
  const a = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY, 'X-Idempotency-Key': key },
    body: JSON.stringify(body),
  }).catch((e) => null);
  const b = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY, 'X-Idempotency-Key': key },
    body: JSON.stringify(body),
  }).catch((e) => null);

  const aOrder = a?.status === 200 ? (await a.clone().json().catch(() => null))?.data?.order?.id : null;
  const bOrder = b?.status === 200 ? (await b.clone().json().catch(() => null))?.data?.order?.id : null;
  record(
    'V83-2 order idempotency (same key → same order id)',
    a?.status === 200 && b?.status === 200 && aOrder && aOrder === bOrder,
    `a=${a?.status} b=${b?.status} aOrder=${aOrder} bOrder=${bOrder}`,
  );
}

(async () => {
  console.log('\n=== V83 Workflow Tests ===\n');
  try {
    await v83_1_refundIdempotency();
  } catch (e) { record('V83-1 refund idempotency', false, e.message); }
  try {
    await v83_2_orderIdempotency();
  } catch (e) { record('V83-2 order idempotency', false, e.message); }

  console.log(`\n=== Summary ===`);
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${fail}`);
  console.log(`Total:  ${pass + fail}`);
  process.exit(fail > 0 ? 1 : 0);
})();
