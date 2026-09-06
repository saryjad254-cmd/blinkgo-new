#!/usr/bin/env node
/**
 * Phase 7H-D — Driver Execution Concurrency (REAL DB)
 * ────────────────────────────────────────────────────
 * Tests:
 *  - K. Pickup concurrency (100 concurrent pickups)
 *  - T. Delivery concurrency (100 concurrent completions)
 *  - 100 concurrent accepts (driver claims)
 *  - 100 concurrent rejects
 *  - State transition races
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

const TEST_PREFIX = `g7hd_conc_${Date.now()}_`;
const { data: rests } = await service.from('restaurants').select('*').not('latitude', 'is', null).limit(1);
const restaurantA = rests?.[0];
const customerId = (await service.auth.admin.listUsers({ page: 1, perPage: 1 }))?.data?.users?.[0]?.id;

async function makeDriver(label) {
  const email = `${TEST_PREFIX}${label}@test.com`;
  const { data: u } = await service.auth.admin.createUser({
    email, password: 'TestPass123!', email_confirm: true,
    user_metadata: { name: `Driver ${label}`, role: 'driver', is_online: true }
  });
  const id = u?.user?.id;
  await service.from('users').upsert({ id, email, name: `Driver ${label}`, role: 'driver', is_active: true }, { onConflict: 'id' });
  await service.from('drivers').upsert({ id, full_name: `Driver ${label}`, is_active: true, is_available: true }, { onConflict: 'id' });
  await service.from('driver_status').upsert({
    driver_id: id, is_online: true, is_on_delivery: false, current_order_id: null,
    latitude: 52.52, longitude: 13.405, updated_at: new Date().toISOString()
  }, { onConflict: 'driver_id' });
  return id;
}

async function makeOrder(driverIdValue, status, extra = {}) {
  const orderNumber = `${TEST_PREFIX}_${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await service.from('orders').insert({
    order_number: orderNumber,
    customer_id: customerId, restaurant_id: restaurantA.id, driver_id: driverIdValue,
    status,
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: 52.53, customer_longitude: 13.42,
    ...extra
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

const driverIds = [];
async function cleanup() {
  await service.from('order_items').delete().in('order_id', (await service.from('orders').select('id').like('order_number', `${TEST_PREFIX}%`)).data?.map(o => o.id) || []);
  await service.from('order_tracking_events').delete().in('order_id', (await service.from('orders').select('id').like('order_number', `${TEST_PREFIX}%`)).data?.map(o => o.id) || []);
  await service.from('orders').delete().like('order_number', `${TEST_PREFIX}%`);
  for (const id of driverIds) {
    await service.from('driver_status').delete().eq('driver_id', id);
    await service.from('drivers').delete().eq('id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id).catch(() => null);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-D — Driver Execution Concurrency (REAL DB)');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// K. Pickup Concurrency
// ═══════════════════════════════════════════════════════════════
section('K. Pickup Concurrency');

{
  // 100 concurrent pickups on the same order
  const d = await makeDriver('pickup-100');
  driverIds.push(d);
  const o = await makeOrder(d, 'ready', { accepted_at: new Date().toISOString() });

  const promises = Array.from({ length: 100 }, () =>
    service.from('orders')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', o.id)
      .eq('driver_id', d)
      .eq('status', 'ready')
      .select().maybeSingle()
  );
  const results = await Promise.all(promises);
  const winners = results.filter(r => r?.data).length;
  t('100 concurrent pickups → exactly 1 winner', winners === 1, `winners: ${winners}`);
}

// ═══════════════════════════════════════════════════════════════
// T. Delivery Concurrency
// ═══════════════════════════════════════════════════════════════
section('T. Delivery Concurrency');

{
  // 100 concurrent completions on the same order
  const d = await makeDriver('complete-100');
  driverIds.push(d);
  const o = await makeOrder(d, 'picked_up', { picked_up_at: new Date().toISOString() });

  const promises = Array.from({ length: 100 }, () =>
    service.from('orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', o.id)
      .eq('driver_id', d)
      .in('status', ['picked_up', 'delivering'])
      .select().maybeSingle()
  );
  const results = await Promise.all(promises);
  const winners = results.filter(r => r?.data).length;
  t('100 concurrent completions → exactly 1 winner', winners === 1, `winners: ${winners}`);
}

// ═══════════════════════════════════════════════════════════════
// 100 concurrent claims
// ═══════════════════════════════════════════════════════════════
section('100 concurrent claims');

{
  // 100 drivers try to claim the same unassigned order
  const o = await makeOrder(null, 'ready');
  const candidateIds = [];
  for (let i = 0; i < 100; i++) {
    const c = await makeDriver(`claim-${i}`);
    candidateIds.push(c);
    driverIds.push(c);
  }
  const promises = candidateIds.map(c =>
    service.from('orders')
      .update({ driver_id: c, accepted_at: new Date().toISOString() })
      .eq('id', o.id)
      .is('driver_id', null)
      .in('status', ['confirmed', 'preparing', 'ready'])
      .select().maybeSingle()
  );
  const results = await Promise.all(promises);
  const winners = results.filter(r => r?.data).length;
  t('100 concurrent claims → exactly 1 winner', winners === 1, `winners: ${winners}`);

  const { data: finalOrder } = await service.from('orders').select('driver_id').eq('id', o.id).single();
  t('Final order has exactly 1 driver_id', winners === 1 && finalOrder?.driver_id != null);
}

// ═══════════════════════════════════════════════════════════════
// 100 concurrent rejects
// ═══════════════════════════════════════════════════════════════
section('100 concurrent rejects');

{
  // 100 attempts to release the same order (only 1 should succeed)
  const d = await makeDriver('reject-100');
  driverIds.push(d);
  const o = await makeOrder(d, 'confirmed', { accepted_at: new Date().toISOString() });

  const promises = Array.from({ length: 100 }, () =>
    service.from('orders')
      .update({ driver_id: null, accepted_at: null })
      .eq('id', o.id)
      .eq('driver_id', d)
      .in('status', ['confirmed', 'preparing', 'ready'])
      .select().maybeSingle()
  );
  const results = await Promise.all(promises);
  const winners = results.filter(r => r?.data).length;
  t('100 concurrent rejects → exactly 1 winner (order released)', winners === 1, `winners: ${winners}`);
}

// ═══════════════════════════════════════════════════════════════
// State transition races
// ═══════════════════════════════════════════════════════════════
section('State transition races');

{
  // Confirmed → picked_up atomicity (only allowed from 'ready')
  const d = await makeDriver('race-state');
  driverIds.push(d);
  const o = await makeOrder(d, 'confirmed', { accepted_at: new Date().toISOString() });

  // Try to pickup from 'confirmed' (should fail — only allowed from 'ready')
  const { data: bad } = await service.from('orders')
    .update({ status: 'picked_up' })
    .eq('id', o.id)
    .eq('status', 'ready') // WHERE is 'ready' but actual is 'confirmed' → no match
    .select().maybeSingle();
  t('Cannot skip states (confirmed → picked_up blocked)', bad === null);

  // Order should still be 'confirmed'
  const { data: still } = await service.from('orders').select('status').eq('id', o.id).single();
  t('Order status unchanged (still confirmed)', still?.status === 'confirmed');
}

// ═══════════════════════════════════════════════════════════════
// 100 concurrent state transitions (final state deterministic)
// ═══════════════════════════════════════════════════════════════
section('100 concurrent transitions (deterministic)');

{
  const d = await makeDriver('100xstate');
  driverIds.push(d);
  // 100 concurrent pickup attempts from 'ready' → exactly 1 winner → 'picked_up'
  const o = await makeOrder(d, 'ready', { accepted_at: new Date().toISOString() });
  const promises = Array.from({ length: 100 }, () =>
    service.from('orders')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', o.id).eq('status', 'ready')
      .select().maybeSingle()
  );
  const results = await Promise.all(promises);
  const successful = results.filter(r => r?.data).length;
  t('100 concurrent pickup: exactly 1 winner', successful === 1, `successful: ${successful}`);

  // Final state should be picked_up (deterministic)
  const { data: final } = await service.from('orders').select('status').eq('id', o.id).single();
  t('Final state is deterministic (picked_up)', final?.status === 'picked_up');
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
section('CLEANUP');
await cleanup();

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
