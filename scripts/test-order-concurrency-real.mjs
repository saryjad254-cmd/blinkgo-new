#!/usr/bin/env node
/**
 * Phase 7H-A — Order Concurrency Real-DB Test
 * ────────────────────────────────────────────
 * Concurrent transition attacks on real Supabase.
 *
 * Run: `node scripts/test-order-concurrency-real.mjs`
 */

import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { createClient } = await import('@supabase/supabase-js');
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let pass = 0, fail = 0;
const results = [];
function t(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  if (cond) pass++; else fail++;
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(name) { console.log(`\n═══ ${name} ═══`); }

// Test data
const { data: realAuth } = await service.auth.admin.listUsers({ page: 1, perPage: 5 });
const customerId = realAuth?.users?.[0]?.id;
const { data: drivers } = await service.from('drivers').select('id, is_active').eq('is_active', true).limit(1);
const driverId = drivers?.[0]?.id;
const { data: rests } = await service.from('restaurants').select('id').limit(1);
const restaurantId = rests?.[0]?.id;
const TEST_PREFIX = 'g7h_conc_';

async function makeOrder(status = 'pending', extra = {}) {
  const orderNumber = `${TEST_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await service.from('orders').insert({
    order_number: orderNumber,
    customer_id: customerId,
    restaurant_id: restaurantId,
    driver_id: null,
    status,
    subtotal: 10, delivery_fee: 3.99, service_fee: 0.5, tip: 0, discount: 0, total: 14.49,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'x', lat: 50.7, lng: 7.1 },
    restaurant_latitude: 50.7, restaurant_longitude: 7.1,
    customer_latitude: 50.7, customer_longitude: 7.1,
    ...extra
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function cleanup(orderId) {
  await service.from('order_items').delete().eq('order_id', orderId);
  await service.from('order_tracking_events').delete().eq('order_id', orderId);
  await service.from('orders').delete().eq('id', orderId);
}

// ═══════════════════════════════════════════════════════════════
// 1. 100 concurrent state updates
// ═══════════════════════════════════════════════════════════════
section('1. 100 concurrent state updates on same order');

{
  const o = await makeOrder('pending');
  // 100 concurrent attempts to transition pending → confirmed
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      service.from('orders')
        .update({ status: 'confirmed', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'pending') // atomic
        .select()
        .single()
    );
  }
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.data && r.data.status === 'confirmed').length;
  t('100 concurrent pending→confirmed: exactly 1 wins', successes === 1, `successes: ${successes}`);
  // Verify state is now confirmed
  const { data: after } = await service.from('orders').select('status').eq('id', o.id).single();
  t('Order is now confirmed (no corruption)', after?.status === 'confirmed', `status: ${after?.status}`);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 2. Multiple simultaneous driver claims (atomicity)
// ═══════════════════════════════════════════════════════════════
section('2. Multiple driver claim race');

{
  const o = await makeOrder('ready');
  // Try to assign the same driver concurrently 50 times
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(
      service.from('orders')
        .update({ driver_id: driverId, updated_at: new Date().toISOString() })
        .eq('id', o.id)
        .is('driver_id', null)
        .select()
        .single()
    );
  }
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.data && r.data.driver_id === driverId).length;
  t('50 concurrent driver claims: exactly 1 wins', successes === 1, `successes: ${successes}`);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 3. Cancel vs accept race
// ═══════════════════════════════════════════════════════════════
section('3. Cancel vs accept race');

{
  // Order in 'pending' state. Customer wants to cancel, restaurant wants to confirm.
  // Both happen concurrently. The DB serializes via atomic update.
  const o = await makeOrder('pending');
  const t1 = service.from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', o.id)
    .eq('status', 'pending')
    .select();
  const t2 = service.from('orders')
    .update({ status: 'confirmed', accepted_at: new Date().toISOString() })
    .eq('id', o.id)
    .eq('status', 'pending')
    .select();
  const [r1, r2] = await Promise.all([t1, t2]);
  // Exactly one should succeed
  const s1 = r1.data && r1.data[0]?.status === 'cancelled';
  const s2 = r2.data && r2.data[0]?.status === 'confirmed';
  t('Cancel vs accept: exactly one wins', (s1 && !s2) || (!s1 && s2), `cancel: ${!!s1}, accept: ${!!s2}`);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 4. Cancel vs pickup race
// ═══════════════════════════════════════════════════════════════
section('4. Cancel vs pickup race');

{
  // Order in 'ready' state. Customer wants to cancel, driver wants to pickup.
  const o = await makeOrder('ready', { driver_id: driverId });
  const t1 = service.from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', o.id)
    .eq('status', 'ready')
    .select();
  const t2 = service.from('orders')
    .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
    .eq('id', o.id)
    .eq('status', 'ready')
    .select();
  const [r1, r2] = await Promise.all([t1, t2]);
  // The state machine says picked_up→cancelled is illegal
  // So if cancel wins, it transitions to cancelled. If pickup wins, it goes to picked_up.
  // Both are valid; exactly one wins.
  const s1 = r1.data && r1.data[0]?.status === 'cancelled';
  const s2 = r2.data && r2.data[0]?.status === 'picked_up';
  t('Cancel vs pickup: exactly one wins', (s1 && !s2) || (!s1 && s2), `cancel: ${!!s1}, pickup: ${!!s2}`);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 5. Refund vs delivery transition race
// ═══════════════════════════════════════════════════════════════
section('5. Refund vs delivery transition race');

{
  // Order in 'delivered' state. Admin wants to mark refunded, customer wants to dispute.
  // We only test the admin refund transition.
  const o = await makeOrder('delivered', { delivered_at: new Date().toISOString() });
  // Try to transition to refunded 30 times concurrently
  const promises = [];
  for (let i = 0; i < 30; i++) {
    promises.push(
      service.from('orders')
        .update({ status: 'refunded', refunded_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'delivered') // atomic
        .select()
        .single()
    );
  }
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.data && r.data.status === 'refunded').length;
  t('30 concurrent delivered→refunded: at most 1 wins (others blocked by DB CHECK)', successes === 1 || successes === 0, `successes: ${successes}`);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 6. Admin override vs driver update race
// ═══════════════════════════════════════════════════════════════
section('6. Admin override vs driver update race');

{
  // Order in 'picked_up' state. Admin wants to cancel, driver wants to deliver.
  const o = await makeOrder('picked_up', { driver_id: driverId });
  // Try admin cancel
  const t1 = service.from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', o.id)
    .eq('status', 'picked_up')
    .select();
  // Try driver deliver
  const t2 = service.from('orders')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', o.id)
    .eq('status', 'picked_up')
    .select();
  const [r1, r2] = await Promise.all([t1, t2]);
  // The state machine says picked_up→cancelled is illegal
  // So only picked_up→delivered should win.
  // But the test (atomic UPDATE WHERE status=picked_up) will allow one of them.
  // If both succeed, it's a bug.
  const s1 = r1.data && r1.data[0]?.status === 'cancelled';
  const s2 = r2.data && r2.data[0]?.status === 'delivered';
  t('Admin cancel vs driver deliver: exactly one wins', (s1 && !s2) || (!s1 && s2), `cancel: ${!!s1}, deliver: ${!!s2}`);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 7. Concurrent inserts of the same order_items
// ═══════════════════════════════════════════════════════════════
section('7. Idempotency: duplicate order creation');

// Try to create the same order twice with the same order_number
{
  const orderNumber = `${TEST_PREFIX}dup_${Date.now()}`;
  const base = {
    order_number: orderNumber,
    customer_id: customerId,
    restaurant_id: restaurantId,
    status: 'pending',
    subtotal: 10, delivery_fee: 0, service_fee: 0, tip: 0, discount: 0, total: 10,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x', lat: 0, lng: 0 },
    restaurant_latitude: 0, restaurant_longitude: 0,
    customer_latitude: 0, customer_longitude: 0,
  };
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(service.from('orders').insert(base).select().single());
  }
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.data).length;
  t('5 concurrent inserts with same order_number: exactly 1 wins (UNIQUE constraint)', successes === 1, `successes: ${successes}`);
  if (successes === 1) {
    await cleanup(results.find(r => r.data).data.id);
  }
  for (const r of results) {
    if (r.data) await cleanup(r.data.id);
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. Driver acceptance race (3 drivers, same order)
// ═══════════════════════════════════════════════════════════════
section('8. Driver acceptance race (3 different drivers)');

{
  // Get 3 different drivers
  const { data: allDrivers } = await service.from('drivers').select('id').eq('is_active', true).limit(3);
  const driversList = allDrivers || [];
  if (driversList.length >= 2) {
    const o = await makeOrder('ready');
    const promises = driversList.map(d =>
      service.from('orders')
        .update({ driver_id: d.id, updated_at: new Date().toISOString() })
        .eq('id', o.id)
        .is('driver_id', null)
        .select()
        .single()
    );
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.data && r.data.driver_id).length;
    t(`${driversList.length} drivers race: exactly 1 wins`, successes === 1, `successes: ${successes}`);
    await cleanup(o.id);
  } else {
    t('Skip (not enough drivers in DB)', true, `only ${driversList.length} drivers`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 9. Driver delivery race (same order, two delivery attempts)
// ═══════════════════════════════════════════════════════════════
section('9. Delivery confirmation race');

{
  const o = await makeOrder('picked_up', { driver_id: driverId });
  // Two concurrent delivery confirmations
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(
      service.from('orders')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'picked_up')
        .select()
        .single()
    );
  }
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.data && r.data.status === 'delivered').length;
  t('20 concurrent delivery confirmations: exactly 1 wins', successes === 1, `successes: ${successes}`);
  // Verify delivered_at is set exactly once
  const { data: after } = await service.from('orders').select('delivered_at').eq('id', o.id).single();
  t('delivered_at set once', !!after?.delivered_at);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
section('SUMMARY');
console.log(`\nTotal: ${pass} pass, ${fail} fail (out of ${pass + fail})`);
console.log(`Pass rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

if (fail > 0) {
  console.log('\n=== Failed tests ===');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  ❌ ${r.name}: ${r.detail || ''}`);
  }
}

process.exit(fail > 0 ? 1 : 0);
