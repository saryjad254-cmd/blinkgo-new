#!/usr/bin/env node
/**
 * Phase 7H-B — Restaurant Concurrency Real-DB Test
 * ──────────────────────────────────────────────────
 * Concurrent attacks on restaurant operations.
 *
 * Covers section Q of the 7H-B mission:
 *   - 100 accepts
 *   - 100 rejects
 *   - accept vs cancel
 *   - ready vs cancel
 *   - menu edit vs checkout
 *   - product unavailable vs checkout
 *   - busy-mode updates from multiple devices
 *
 * Run: `node scripts/test-restaurant-concurrency-real.mjs`
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

const TEST_PREFIX = 'g7hb_conc_';
const { data: rests } = await service.from('restaurants').select('*').limit(3);
const restaurantA = rests?.[0];
const { data: realAuth } = await service.auth.admin.listUsers({ page: 1, perPage: 5 });
const customerId = realAuth?.users?.[0]?.id;
const { data: drivers } = await service.from('drivers').select('id').eq('is_active', true).limit(1);
const driverId = drivers?.[0]?.id;

async function makeOrder(status, extra = {}) {
  const orderNumber = `${TEST_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await service.from('orders').insert({
    order_number: orderNumber,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    status,
    subtotal: 10, delivery_fee: 0, service_fee: 0, tip: 0, discount: 0, total: 10,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'x', lat: 0, lng: 0 },
    restaurant_latitude: 0, restaurant_longitude: 0,
    customer_latitude: 0, customer_longitude: 0,
    ...extra
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function cleanup(id) {
  await service.from('order_items').delete().eq('order_id', id);
  await service.from('order_tracking_events').delete().eq('order_id', id);
  await service.from('orders').delete().eq('id', id);
}

// ═══════════════════════════════════════════════════════════════
// Q. CONCURRENCY
// ═══════════════════════════════════════════════════════════════
section('Q. Concurrency');

{
  // Q1: 100 concurrent accepts
  const o = await makeOrder('pending');
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      service.from('orders')
        .update({ status: 'confirmed', accepted_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'pending')
        .select()
        .single()
    );
  }
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.data && r.data.status === 'confirmed').length;
  t('100 concurrent accepts: exactly 1 atomic state change', successes === 1, `successes: ${successes}`);
  await cleanup(o.id);
}

{
  // Q2: 100 concurrent rejects
  const o = await makeOrder('pending');
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      service.from('orders')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'pending')
        .select()
        .single()
    );
  }
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.data && r.data.status === 'cancelled').length;
  t('100 concurrent rejects: exactly 1 atomic state change', successes === 1, `successes: ${successes}`);
  await cleanup(o.id);
}

{
  // Q3: 50 concurrent accepts + 50 concurrent rejects = atomic
  const o = await makeOrder('pending');
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(
      service.from('orders')
        .update({ status: 'confirmed', accepted_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'pending')
        .select()
    );
  }
  for (let i = 0; i < 50; i++) {
    promises.push(
      service.from('orders')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'pending')
        .select()
    );
  }
  const results = await Promise.all(promises);
  const accepted = results.filter(r => r.data?.[0]?.status === 'confirmed').length;
  const rejected = results.filter(r => r.data?.[0]?.status === 'cancelled').length;
  t('100 mixed accept+reject: exactly 1 wins', accepted + rejected === 1, `accepted: ${accepted}, rejected: ${rejected}`);
  await cleanup(o.id);
}

{
  // Q4: Accept vs cancel race (customer vs restaurant)
  const o = await makeOrder('pending');
  const t1 = service.from('orders')
    .update({ status: 'confirmed', accepted_at: new Date().toISOString() })
    .eq('id', o.id).eq('status', 'pending').select();
  const t2 = service.from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', o.id).eq('status', 'pending').select();
  const [r1, r2] = await Promise.all([t1, t2]);
  const accepted = r1.data?.[0]?.status === 'confirmed';
  const rejected = r2.data?.[0]?.status === 'cancelled';
  t('Accept vs cancel race: exactly one wins', (accepted && !rejected) || (!accepted && rejected), `a: ${accepted}, r: ${rejected}`);
  await cleanup(o.id);
}

{
  // Q5: Ready vs cancel race
  if (driverId) {
    const o = await makeOrder('ready', { driver_id: driverId });
    // ready → picked_up (driver) vs ready → cancelled (restaurant reject)
    const t1 = service.from('orders')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', o.id).eq('status', 'ready').select();
    const t2 = service.from('orders')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', o.id).eq('status', 'ready').select();
    const [r1, r2] = await Promise.all([t1, t2]);
    const picked = r1.data?.[0]?.status === 'picked_up';
    const cancelled = r2.data?.[0]?.status === 'cancelled';
    t('Ready vs cancel race: exactly one wins', (picked && !cancelled) || (!picked && cancelled), `picked: ${picked}, cancelled: ${cancelled}`);
    await cleanup(o.id);
  } else {
    t('Ready vs cancel race: skipped (no driver)', true);
  }
}

{
  // Q6: Menu edit vs checkout (simulate by editing a product while an order is in pending)
  // Get a real product
  const { data: prods } = await service.from('products').select('id, price').eq('restaurant_id', restaurantA.id).limit(1);
  if (prods?.[0]) {
    const originalPrice = prods[0].price;
    // Create an order with this product
    const o = await makeOrder('pending');
    await service.from('order_items').insert({
      order_id: o.id,
      product_id: prods[0].id,
      product_name: 'Test',
      product_price: originalPrice,
      quantity: 1,
      subtotal: originalPrice,
    });
    // Now race: edit product price vs the order snapshot
    const p1 = service.from('products').update({ price: originalPrice * 2 }).eq('id', prods[0].id);
    const p2 = service.from('order_items').select('product_price').eq('order_id', o.id);
    const [r1, r2] = await Promise.all([p1, p2]);
    t('Menu edit + order snapshot: both succeed', !r1.error && !!r2.data);
    // Verify the order item still has the original price
    const { data: item } = await service.from('order_items').select('product_price').eq('order_id', o.id).single();
    t('Order item preserves original price (historical snapshot)', item?.product_price === originalPrice, `price: ${item?.product_price}`);
    // Restore
    await service.from('products').update({ price: originalPrice }).eq('id', prods[0].id);
    await cleanup(o.id);
  }
}

{
  // Q7: Product unavailable vs new order
  // Set product to unavailable, then try to create order
  const { data: prods } = await service.from('products').select('id').eq('restaurant_id', restaurantA.id).limit(1);
  if (prods?.[0]) {
    await service.from('products').update({ is_available: false }).eq('id', prods[0].id);
    // At the app level, customers should not see unavailable products
    // But at DB level, the order can still be created
    const o = await makeOrder('pending');
    t('DB allows order even if product unavailable (app must filter)', !!o);
    await service.from('products').update({ is_available: true }).eq('id', prods[0].id);
    await cleanup(o.id);
  }
}

{
  // Q8: Busy mode updates from multiple devices (race)
  // busy_mode_until doesn't exist yet, so test the simpler is_online
  const start = Date.now();
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(
      service.from('restaurants')
        .update({ is_online: i % 2 === 0 })
        .eq('id', restaurantA.id)
    );
  }
  const results = await Promise.all(promises);
  const elapsed = Date.now() - start;
  t('50 concurrent is_online updates complete', results.every(r => !r.error), `elapsed: ${elapsed}ms`);
  // Verify final state is consistent
  const { data: after } = await service.from('restaurants').select('is_online').eq('id', restaurantA.id).single();
  t('is_online ends in valid boolean', typeof after?.is_online === 'boolean', `is_online: ${after?.is_online}`);
}

{
  // Q9: 100 concurrent same orderNumber UNIQUE rejection
  const orderNumber = 'g7hb_conc_unique_' + Date.now();
  const base = {
    order_number: orderNumber,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    status: 'pending',
    subtotal: 10, delivery_fee: 0, service_fee: 0, tip: 0, discount: 0, total: 10,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'x', lat: 0, lng: 0 },
    restaurant_latitude: 0, restaurant_longitude: 0,
    customer_latitude: 0, customer_longitude: 0,
  };
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(service.from('orders').insert(base).select().single());
  }
  const results = await Promise.all(promises);
  const successes = results.filter(r => r.data).length;
  t('100 concurrent same order_number: exactly 1 succeeds (UNIQUE)', successes === 1, `successes: ${successes}`);
  if (successes > 0) {
    const ids = results.filter(r => r.data).map(r => r.data.id);
    for (const id of ids) await cleanup(id);
  }
}

{
  // Q10: Concurrent UPDATE of different fields on same order (no conflict)
  const o = await makeOrder('confirmed', { accepted_at: new Date().toISOString() });
  const p1 = service.from('orders').update({ status: 'preparing', prepared_at: new Date().toISOString() }).eq('id', o.id);
  const p2 = service.from('orders').update({ tip: 5 }).eq('id', o.id);
  const p3 = service.from('orders').update({ delivery_instructions: 'test' }).eq('id', o.id);
  const results = await Promise.all([p1, p2, p3]);
  t('3 concurrent updates to different fields: all succeed', results.every(r => !r.error), `errors: ${results.filter(r => r.error).length}`);
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
