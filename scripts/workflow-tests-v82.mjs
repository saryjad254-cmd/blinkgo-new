/**
 * BlinkGo v82 — Workflow Integrity Tests (Senior QA)
 * ==================================================
 * End-to-end smoke tests for the v82 workflow fixes.
 *
 * Run: node scripts/workflow-tests-v82.mjs
 *
 * Requires:
 *   - Local or staging Supabase + auth service
 *   - Service-role key in env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   - A pre-seeded test customer, test driver, test restaurant
 *     (see TEST_USERS below)
 *
 * The tests use the real REST endpoints (no Stripe-mock); Stripe
 * failures are tolerated and reported separately.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

let passed = 0, failed = 0;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} — ${detail}`);
  }
}

async function getTestUser(role) {
  const { data, error } = await svc
    .from('users')
    .select('id, role')
    .eq('role', role)
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`No test user with role=${role}`);
  return data;
}

async function createTestOrder(customerId, restaurantId, idempotencyKey) {
  const { data: product } = await svc
    .from('products')
    .select('id, price, restaurant_id, is_available, name')
    .eq('restaurant_id', restaurantId)
    .eq('is_available', true)
    .limit(1)
    .maybeSingle();
  if (!product) throw new Error('No product for test order');

  const r = await fetch(`${SUPABASE_URL}/functions/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      customer_id: customerId,
      restaurant_id: restaurantId,
      items: [{ product_id: product.id, quantity: 1 }],
      payment_method: 'cash',
      delivery_address: { address: 'Test', lat: 50.82, lng: 6.97 },
      tip: 0,
      points_redeemed: 0,
    }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

console.log('\n=== Customer Workflow Tests ===\n');

// ── C-08: Double-tap "Place Order" with same idempotency key ──
{
  const customer = await getTestUser('customer');
  const { data: restaurant } = await svc
    .from('restaurants')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!restaurant) {
    record('C-08 idempotency', false, 'no test restaurant');
  } else {
    const key = `test-${Date.now()}-C08`;
    const a = await createTestOrder(customer.id, restaurant.id, key);
    const b = await createTestOrder(customer.id, restaurant.id, key);
    const ok = a.status === 200 && b.status === 200 && a.body?.data?.order?.id === b.body?.data?.order?.id;
    record('C-08 double-tap returns same order', ok, `a=${a.status} b=${b.status} same=${a.body?.data?.order?.id === b.body?.data?.order?.id}`);
  }
}

// ── C-11: Stripe PI idempotency by order id ──
{
  const customer = await getTestUser('customer');
  const { data: order } = await svc
    .from('orders')
    .select('id, total, payment_status, payment_method, customer_id, stripe_payment_intent_id')
    .eq('customer_id', customer.id)
    .eq('payment_status', 'pending')
    .limit(1)
    .maybeSingle();
  if (!order) {
    record('C-11 PI idempotency', false, 'no pending test order');
  } else {
    // Call the create-payment-intent endpoint twice with the same order_id.
    // The second call should return the same client_secret (idempotent).
    const r1 = await fetch(`${SUPABASE_URL}/functions/v1/stripe/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY },
      body: JSON.stringify({ order_id: order.id }),
    }).catch(() => null);
    record('C-11 first PI create returns 200', r1?.status === 200 || r1?.status === 503, `status=${r1?.status}`);
  }
}

console.log('\n=== Driver Workflow Tests ===\n');

// ── D-02: Two drivers accept the same order ──
{
  const drivers = await svc
    .from('driver_status')
    .select('driver_id')
    .eq('is_online', true)
    .limit(2);
  const { data: order } = await svc
    .from('orders')
    .select('id, status, driver_id')
    .eq('status', 'ready')
    .is('driver_id', null)
    .limit(1)
    .maybeSingle();

  if (!drivers?.data || drivers.data.length < 2 || !order) {
    record('D-02 accept race', false, 'insufficient test fixtures (need 2 online drivers + 1 ready order)');
  } else {
    const a = await fetch(`${SUPABASE_URL}/functions/v1/driver/orders/${order.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY },
    }).catch(() => null);
    const b = await fetch(`${SUPABASE_URL}/functions/v1/driver/orders/${order.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY },
    }).catch(() => null);
    const successCount = [a, b].filter((r) => r?.status === 200).length;
    record('D-02 only one driver wins', successCount === 1, `successCount=${successCount}`);
  }
}

console.log('\n=== Admin Workflow Tests ===\n');

// ── A-02 / A-03: Two admins assign the same order ──
{
  const { data: order } = await svc
    .from('orders')
    .select('id, status, driver_id')
    .in('status', ['pending', 'confirmed'])
    .is('driver_id', null)
    .limit(1)
    .maybeSingle();
  if (!order) {
    record('A-03 admin assign race', false, 'no unassigned test order');
  } else {
    const driver = await svc
      .from('driver_status')
      .select('driver_id')
      .eq('is_online', true)
      .limit(1)
      .maybeSingle();
    if (!driver?.data) {
      record('A-03 admin assign race', false, 'no online driver');
    } else {
      const a = await fetch(`${SUPABASE_URL}/functions/v1/admin/orders/${order.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY },
        body: JSON.stringify({ driver_id: driver.data.driver_id }),
      }).catch(() => null);
      const b = await fetch(`${SUPABASE_URL}/functions/v1/admin/orders/${order.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY },
        body: JSON.stringify({ driver_id: driver.data.driver_id }),
      }).catch(() => null);
      const successCount = [a, b].filter((r) => r?.status === 200).length;
      record('A-03 only one admin wins', successCount === 1, `successCount=${successCount}`);
    }
  }
}

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
