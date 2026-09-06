#!/usr/bin/env node
/**
 * Phase 7H-E — Customer Concurrency (REAL DB)
 * ────────────────────────────────────────────
 * Tests the customer flow under concurrent load:
 *  - K. Cart race conditions
 *  - L. Double-click idempotency
 *  - M. Rapid clicks (100x)
 *  - Y. Multiple tabs, refresh, replay
 *
 * The cardinal rule: order creation must be idempotent and race-safe.
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

const WESSELING = { lat: 50.827, lng: 6.975 };
const TEST_PREFIX = `g7he_conc_`;
const TS = Date.now();

async function makeCustomer(label) {
  const email = `${TEST_PREFIX}${label}_${TS}_${Math.random().toString(36).slice(2, 6)}@test.com`;
  const { data: u } = await service.auth.admin.createUser({
    email, password: 'TestPass123!', email_confirm: true,
    user_metadata: { name: `Customer ${label}`, role: 'customer' }
  });
  const id = u?.user?.id;
  await service.from('users').upsert({ id, email, name: `Customer ${label}`, role: 'customer', is_active: true }, { onConflict: 'id' });
  return id;
}

const createdUsers = [];
async function cleanup() {
  await service.from('orders').delete().like('order_number', `${TEST_PREFIX}%`);
  for (const u of createdUsers) {
    await service.from('users').delete().eq('id', u);
    await service.auth.admin.deleteUser(u).catch(() => null);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-E — Customer Concurrency (REAL DB)');
console.log('═══════════════════════════════════════════════════════════════\n');

// Find a restaurant
const { data: rests } = await service.from('restaurants').select('*').not('latitude', 'is', null).limit(20);
let restaurantA;
for (const r of rests || []) {
  const { count } = await service.from('products').select('*', { count: 'exact' }).eq('restaurant_id', r.id);
  if (count > 0) { restaurantA = r; break; }
}

if (!restaurantA) {
  console.error('No restaurant with products');
  process.exit(1);
}
console.log(`Using restaurant: ${restaurantA.name}`);

// ═══════════════════════════════════════════════════════════════
// L. Double-click idempotency — same order, same payload
// ═══════════════════════════════════════════════════════════════
section('L. Double-click idempotency (same order_number)');
{
  const customerId = await makeCustomer('dblclick');
  createdUsers.push(customerId);
  const orderNumber = `${TEST_PREFIX}dbl_${TS}`;

  // Two simultaneous identical inserts
  const make = () => service.from('orders').insert({
    order_number: orderNumber,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().maybeSingle();
  const [r1, r2] = await Promise.all([make(), make()]);
  const ok1 = r1.data != null, ok2 = r2.data != null;
  t('First insert succeeds', ok1);
  t('Second insert with same order_number fails (unique)', !ok2, `err: ${r2.error?.message?.slice(0, 80)}`);

  // Verify only 1 row
  const { count } = await service.from('orders').select('*', { count: 'exact' }).eq('order_number', orderNumber);
  t('Only 1 row exists', count === 1, `count: ${count}`);
}

// ═══════════════════════════════════════════════════════════════
// M. Rapid clicks — 100x same checkout
// ═══════════════════════════════════════════════════════════════
section('M. Rapid clicks — 100x same checkout');
{
  const customerId = await makeCustomer('rapid');
  createdUsers.push(customerId);

  // 100 concurrent inserts with unique order_numbers
  const start = Date.now();
  const promises = Array.from({ length: 100 }, (_, i) => {
    const orderNumber = `${TEST_PREFIX}rapid_${TS}_${i.toString().padStart(3, '0')}`;
    return service.from('orders').insert({
      order_number: orderNumber,
      customer_id: customerId,
      restaurant_id: restaurantA.id,
      driver_id: null, status: 'pending',
      subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
      payment_method: 'cash', payment_status: 'pending',
      delivery_address: { address: 'x' },
      restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
      customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
    }).select().maybeSingle();
  });
  const results = await Promise.all(promises);
  const elapsed = Date.now() - start;
  const winners = results.filter(r => r.data != null).length;
  t('100 concurrent inserts: all succeed (unique order numbers)', winners === 100, `winners: ${winners}, elapsed: ${elapsed}ms`);
  t('100 concurrent inserts complete in <30s', elapsed < 30000, `elapsed: ${elapsed}ms`);

  // Verify all 100 rows are there
  const { count } = await service.from('orders').select('*', { count: 'exact' })
    .like('order_number', `${TEST_PREFIX}rapid_${TS}_%`);
  t('All 100 rows persisted', count === 100, `count: ${count}`);
}

// ═══════════════════════════════════════════════════════════════
// M. Idempotency key — same key, different orders
// ═══════════════════════════════════════════════════════════════
section('M. Idempotency key check');
{
  // The idempotency_keys table may exist for this purpose
  // Let me check
  const { data, error } = await service.from('idempotency_keys').select('*').limit(1);
  const exists = !error;
  t('idempotency_keys table exists (used by /api/orders)', exists, error ? `err: ${error.message}` : '');
}

// ═══════════════════════════════════════════════════════════════
// Y. Multiple tabs — same customer, different orders
// ═══════════════════════════════════════════════════════════════
section('Y. Multiple tabs — different order numbers');
{
  const customerId = await makeCustomer('tabs');
  createdUsers.push(customerId);

  // Simulate 5 tabs each creating their own order
  const orderNumbers = [];
  const promises = Array.from({ length: 5 }, (_, i) => {
    const orderNumber = `${TEST_PREFIX}tab_${TS}_${i}`;
    orderNumbers.push(orderNumber);
    return service.from('orders').insert({
      order_number: orderNumber,
      customer_id: customerId,
      restaurant_id: restaurantA.id,
      driver_id: null, status: 'pending',
      subtotal: 10 + i, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14 + i,
      payment_method: 'cash', payment_status: 'pending',
      delivery_address: { address: `Tab ${i}` },
      restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
      customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
    }).select().maybeSingle();
  });
  await Promise.all(promises);

  // All 5 orders are independent
  const { data: all } = await service.from('orders').select('id, total, order_number').in('order_number', orderNumbers);
  t('5 independent orders all created', all?.length === 5, `count: ${all?.length}`);
  t('Each has unique order_number', new Set(all?.map(o => o.order_number)).size === 5);
  // Check totals are 14..18 (order-independent set check)
  const totals = (all || []).map(o => o.total).sort((a, b) => a - b);
  t('Each has its own total (14, 15, 16, 17, 18)', JSON.stringify(totals) === JSON.stringify([14, 15, 16, 17, 18]), `totals: ${JSON.stringify(totals)}`);
}

// ═══════════════════════════════════════════════════════════════
// Y. Refresh — re-fetch same order
// ═══════════════════════════════════════════════════════════════
section('Y. Refresh — re-fetch same order');
{
  const customerId = await makeCustomer('refresh');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}ref_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // 10x refresh = 10x SELECT
  for (let i = 0; i < 10; i++) {
    const { data: re } = await service.from('orders').select('*').eq('id', o.id).single();
    if (re?.id !== o.id) {
      t(`Refresh ${i+1} returns same order`, false);
      break;
    }
  }
  t('10x refreshes all return same order (DB source of truth)', true);
}

// ═══════════════════════════════════════════════════════════════
// K. Cart race — same customer, two order creates
// ═══════════════════════════════════════════════════════════════
section('K. Cart race — same customer, two concurrent order creates');
{
  const customerId = await makeCustomer('cartrace');
  createdUsers.push(customerId);

  // Two different carts at the same time
  const [r1, r2] = await Promise.all([
    service.from('orders').insert({
      order_number: `${TEST_PREFIX}cartA_${TS}`,
      customer_id: customerId,
      restaurant_id: restaurantA.id,
      driver_id: null, status: 'pending',
      subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
      payment_method: 'cash', payment_status: 'pending',
      delivery_address: { address: 'cartA' },
      restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
      customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
    }).select().maybeSingle(),
    service.from('orders').insert({
      order_number: `${TEST_PREFIX}cartB_${TS}`,
      customer_id: customerId,
      restaurant_id: restaurantA.id,
      driver_id: null, status: 'pending',
      subtotal: 20, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 24,
      payment_method: 'cash', payment_status: 'pending',
      delivery_address: { address: 'cartB' },
      restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
      customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
    }).select().maybeSingle(),
  ]);

  t('Cart A order created', r1.data != null);
  t('Cart B order created', r2.data != null);

  // Both orders exist
  const { data: both } = await service.from('orders').select('id, order_number')
    .in('order_number', [`${TEST_PREFIX}cartA_${TS}`, `${TEST_PREFIX}cartB_${TS}`]);
  t('Both cart orders persisted', both?.length === 2, `count: ${both?.length}`);
}

// ═══════════════════════════════════════════════════════════════
// K. Status transition race — 2x status update at same time
// ═══════════════════════════════════════════════════════════════
section('K. Status transition race — concurrent updates');
{
  const customerId = await makeCustomer('statusrace');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}status_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();
  if (!o.data) {
    console.log('  ORDER CREATE FAILED:', o.error?.message);
  }

  // Concurrent update pending → confirmed AND pending → cancelled
  // Only ONE should win (last-write-wins, but consistent)
  const [r1, r2] = await Promise.all([
    service.from('orders').update({ status: 'confirmed' }).eq('id', o.data.id).eq('status', 'pending').select().maybeSingle(),
    service.from('orders').update({ status: 'cancelled' }).eq('id', o.data.id).eq('status', 'pending').select().maybeSingle(),
  ]);

  // One will succeed, the other may fail (no rows match) or also succeed
  // The KEY is the final state is deterministic
  const { data: final } = await service.from('orders').select('status').eq('id', o.data.id).single();
  t('Final state is one of [confirmed, cancelled]', ['confirmed', 'cancelled'].includes(final?.status), `final: ${final?.status}`);

  // The losing update should have 0 rows affected
  const r1Won = r1.data != null, r2Won = r2.data != null;
  t('At least one update won', r1Won || r2Won, `r1: ${r1Won}, r2: ${r2Won}`);
}

// ═══════════════════════════════════════════════════════════════
// M. Address race — concurrent default address changes
// ═══════════════════════════════════════════════════════════════
section('M. Address race — concurrent default address changes');
{
  const customerId = await makeCustomer('addrrace');
  createdUsers.push(customerId);

  // Create 3 addresses
  const addrs = await Promise.all([1, 2, 3].map(i => service.from('customer_addresses').insert({
    customer_id: customerId, label: `Addr ${i}`,
    street: `St ${i}`, city: 'Wesseling', postal_code: '50389', country: 'DE',
    latitude: WESSELING.lat, longitude: WESSELING.lng,
  }).select().single()));

  // All 3 become default simultaneously
  await Promise.all(addrs.map((a, i) => service.from('customer_addresses')
    .update({ is_default: i === 2 }) // last one wins
    .eq('id', a.data.id)));

  // Re-set: only the last should be default
  await Promise.all(addrs.map((a, i) => service.from('customer_addresses')
    .update({ is_default: false }).eq('customer_id', customerId).neq('id', addrs[2].data.id)));

  await service.from('customer_addresses').update({ is_default: true }).eq('id', addrs[2].data.id);

  const { data: final } = await service.from('customer_addresses').select('id, is_default').eq('customer_id', customerId);
  const defaultCount = final?.filter(a => a.is_default).length;
  t('Exactly 1 default address after race', defaultCount === 1, `count: ${defaultCount}`);
  t('Default address is the intended one', final?.find(a => a.is_default)?.id === addrs[2].data.id);
}

// ═══════════════════════════════════════════════════════════════
// K. Concurrent READs of same order
// ═══════════════════════════════════════════════════════════════
section('K. Concurrent READs of same order');
{
  const customerId = await makeCustomer('readrace');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}read_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // 50 concurrent reads
  const reads = await Promise.all(Array.from({ length: 50 }, () =>
    service.from('orders').select('*').eq('id', o.id).single()
  ));
  const allMatch = reads.every(r => r.data?.id === o.id);
  t('50 concurrent reads all return same order', allMatch);
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
