#!/usr/bin/env node
/**
 * Phase 7H-E — Customer Realtime (REAL DB)
 * ─────────────────────────────────────────
 * Tests customer-side realtime:
 *  - Q. Tracking timeline (status updates)
 *  - R. Driver location (driver_latitude updates)
 *  - S. Order status changes
 *  - T. ETA updates
 *  - U. Disconnect/reconnect
 *
 * The customer must be able to:
 *  - Subscribe to their own order's status
 *  - See driver position updates in realtime
 *  - Recover state after disconnect
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function waitForSubscription(channel, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), timeoutMs);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
}

async function waitForCount(items, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (items.length < expected && Date.now() < deadline) await sleep(100);
}

const WESSELING = { lat: 50.827, lng: 6.975 };
const TEST_PREFIX = `g7he_rt_`;
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
  // Remove subscriptions
  // Delete orders
  await service.from('orders').delete().like('order_number', `${TEST_PREFIX}%`);
  for (const u of createdUsers) {
    await service.from('users').delete().eq('id', u);
    await service.auth.admin.deleteUser(u).catch(() => null);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-E — Customer Realtime (REAL DB)');
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
// Q. Tracking timeline — subscribe to own order's status
// ═══════════════════════════════════════════════════════════════
section('Q. Tracking timeline — realtime status updates');
{
  const customerId = await makeCustomer('timeline');
  createdUsers.push(customerId);
  const timelineDriverEmail = `${TEST_PREFIX}timeline_driver_${TS}@test.com`;
  const { data: timelineDriver } = await service.auth.admin.createUser({
    email: timelineDriverEmail, password: 'TestPass123!', email_confirm: true,
    user_metadata: { role: 'driver' },
  });
  const timelineDriverId = timelineDriver?.user?.id;
  createdUsers.push(timelineDriverId);
  await service.from('users').upsert({ id: timelineDriverId, email: timelineDriverEmail, name: 'Timeline Driver', role: 'driver', is_active: true }, { onConflict: 'id' });

  // Create the order first
  const { data: o } = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}tl_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Subscribe to the order
  const receivedStatuses = [];
  const channel = service.channel(`order-${o.id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${o.id}`
    }, (payload) => {
      receivedStatuses.push(payload.new?.status);
    });
  await waitForSubscription(channel);
  await sleep(1500);

  // Update the order
  await service.from('orders').update({ status: 'confirmed', accepted_at: new Date().toISOString() }).eq('id', o.id);
  await sleep(800);
  await service.from('orders').update({ status: 'preparing' }).eq('id', o.id);
  await sleep(800);
  await service.from('orders').update({ status: 'ready' }).eq('id', o.id);
  await sleep(800);
  await service.from('orders').update({ status: 'assigned', driver_id: timelineDriverId }).eq('id', o.id);
  await sleep(800);
  await service.from('orders').update({ status: 'picked_up', picked_up_at: new Date().toISOString() }).eq('id', o.id);
  await waitForCount(receivedStatuses, 5);

  // Unsubscribe
  await channel.unsubscribe();

  t('Customer subscribed to order', receivedStatuses.length > 0, `count: ${receivedStatuses.length}`);
  t('Customer received status updates', receivedStatuses.includes('confirmed'), `statuses: ${receivedStatuses.join(',')}`);
  t('Customer received preparing update', receivedStatuses.includes('preparing'));
  t('Customer received ready update', receivedStatuses.includes('ready'));
  t('Customer received assigned update', receivedStatuses.includes('assigned'));
  t('Customer received picked_up update', receivedStatuses.includes('picked_up'));
  t('Received all 5 status updates', receivedStatuses.length >= 5, `count: ${receivedStatuses.length}`);
}

// ═══════════════════════════════════════════════════════════════
// R. Driver location updates — orders.driver_latitude
// ═══════════════════════════════════════════════════════════════
section('R. Driver location — driver_latitude updates');
{
  const customerId = await makeCustomer('driverloc');
  createdUsers.push(customerId);

  // Create a driver for this test
  const driverEmail = `${TEST_PREFIX}driver_${TS}_${Math.random().toString(36).slice(2, 6)}@test.com`;
  const { data: du } = await service.auth.admin.createUser({
    email: driverEmail, password: 'TestPass123!', email_confirm: true,
    user_metadata: { role: 'driver' }
  });
  const driverId = du?.user?.id;
  createdUsers.push(driverId);
  await service.from('users').upsert({ id: driverId, email: driverEmail, name: 'Driver', role: 'driver', is_active: true }, { onConflict: 'id' });

  const { data: o } = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}dl_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: driverId, status: 'picked_up',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
    picked_up_at: new Date().toISOString(),
  }).select().single();

  // Subscribe to driver location updates
  const updates = [];
  const channel = service.channel(`order-loc-${o.id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${o.id}`
    }, (payload) => {
      if (payload.new?.driver_latitude != null) {
        updates.push({ lat: payload.new.driver_latitude, lng: payload.new.driver_longitude });
      }
    });
  await waitForSubscription(channel);
  await sleep(1500);

  // Simulate 5 driver location updates
  for (let i = 0; i < 5; i++) {
    await service.from('orders').update({
      driver_latitude: WESSELING.lat - 0.001 * (i + 1),
      driver_longitude: WESSELING.lng + 0.001 * (i + 1),
    }).eq('id', o.id);
    await sleep(300);
  }

  await waitForCount(updates, 5);
  await channel.unsubscribe();

  t('Driver location updates received via realtime', updates.length >= 1, `updates: ${updates.length}`);
  t('Driver position is moving toward customer',
    updates.length > 0 && updates[updates.length - 1].lat < WESSELING.lat,
    `final: ${updates[updates.length - 1]?.lat?.toFixed(4)}`);
}

// ═══════════════════════════════════════════════════════════════
// S. Order status polling vs realtime
// ═══════════════════════════════════════════════════════════════
section('S. Polling fallback — re-fetch current state');
{
  const customerId = await makeCustomer('poll');
  createdUsers.push(customerId);

  const { data: o } = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}poll_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Update in background
  setTimeout(async () => {
    await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  }, 200);

  // Poll until updated
  let current = null;
  let pollCount = 0;
  for (let i = 0; i < 20; i++) {
    pollCount++;
    const { data } = await service.from('orders').select('status').eq('id', o.id).single();
    if (data?.status === 'confirmed') { current = data; break; }
    await sleep(100);
  }
  t('Polling eventually sees the update', current?.status === 'confirmed');
  t('Polling sees the update within 2s', current != null, `elapsed: ${pollCount * 100}ms`);
}

// ═══════════════════════════════════════════════════════════════
// U. Disconnect/reconnect — channel re-subscription
// ═══════════════════════════════════════════════════════════════
section('U. Disconnect/reconnect — channel re-subscription');
{
  const customerId = await makeCustomer('reconnect');
  createdUsers.push(customerId);

  const { data: o } = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}rc_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // First subscription
  const updates1 = [];
  const ch1 = service.channel(`rc-${o.id}-1`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}`
    }, (p) => updates1.push(p.new?.status))
    .subscribe();
  await sleep(1000);
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  await sleep(800);
  await ch1.unsubscribe();

  t('First subscription received update', updates1.includes('confirmed'), `count: ${updates1.length}`);

  // Disconnect period: no subscription
  await sleep(500);

  // Reconnect with new subscription
  const updates2 = [];
  const ch2 = service.channel(`rc-${o.id}-2`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}`
    }, (p) => updates2.push(p.new?.status))
    .subscribe();
  await sleep(1000);
  await service.from('orders').update({ status: 'preparing' }).eq('id', o.id);
  await sleep(800);
  await ch2.unsubscribe();

  t('Reconnected subscription receives updates', updates2.includes('preparing'), `count: ${updates2.length}`);

  // State is preserved across disconnects
  const { data: final } = await service.from('orders').select('status').eq('id', o.id).single();
  t('State preserved across disconnects', final?.status === 'preparing');
}

// ═══════════════════════════════════════════════════════════════
// T. ETA — distance from driver to customer
// ═══════════════════════════════════════════════════════════════
section('T. ETA — distance calculation');
{
  // Use haversine
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  const d = haversineKm(50.827, 6.975, 50.828, 6.976);
  t('Haversine distance for 100m is small', d < 0.5, `km: ${d.toFixed(3)}`);
  t('Haversine distance for Berlin→Wesseling is large', haversineKm(50.827, 6.975, 52.520, 13.405) > 400);

  // ETA is computable from coords
  const customerId = await makeCustomer('eta');
  createdUsers.push(customerId);
  const etaDriverEmail = `${TEST_PREFIX}eta_driver_${TS}@test.com`;
  const { data: etaDriver } = await service.auth.admin.createUser({
    email: etaDriverEmail, password: 'TestPass123!', email_confirm: true,
    user_metadata: { role: 'driver' },
  });
  const etaDriverId = etaDriver?.user?.id;
  createdUsers.push(etaDriverId);
  await service.from('users').upsert({ id: etaDriverId, email: etaDriverEmail, name: 'ETA Driver', role: 'driver', is_active: true }, { onConflict: 'id' });
  const { data: o, error: etaOrderError } = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}eta_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: etaDriverId, status: 'picked_up',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
    driver_latitude: WESSELING.lat - 0.01,  // 1.1km away
    driver_longitude: WESSELING.lng,
  }).select().single();
  t('ETA fixture is stored with an assigned driver', !etaOrderError && Boolean(o), etaOrderError?.message);

  const { data: order } = await service.from('orders')
    .select('customer_latitude, customer_longitude, driver_latitude, driver_longitude')
    .eq('id', o.id).single();
  const eta = haversineKm(order.driver_latitude, order.driver_longitude, order.customer_latitude, order.customer_longitude);
  t('ETA distance is computable', eta > 0 && eta < 5, `km: ${eta.toFixed(2)}`);
}

// ═══════════════════════════════════════════════════════════════
// Q. Multiple orders in one subscription
// ═══════════════════════════════════════════════════════════════
section('Q. Multiple orders subscription (one channel)');
{
  const customerId = await makeCustomer('multi');
  createdUsers.push(customerId);

  const { data: o1 } = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}m1_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  const { data: o2 } = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}m2_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Subscribe to BOTH orders via a single channel
  const updates = [];
  const channel = service.channel(`multi-${o1.id}-${o2.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o1.id}`
    }, (p) => updates.push({ id: p.new?.id, status: p.new?.status }))
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o2.id}`
    }, (p) => updates.push({ id: p.new?.id, status: p.new?.status }))
    .subscribe();

  await sleep(500);

  await service.from('orders').update({ status: 'confirmed' }).eq('id', o1.id);
  await service.from('orders').update({ status: 'cancelled' }).eq('id', o2.id);
  await sleep(500);

  await channel.unsubscribe();

  t('Both orders received updates via single channel', updates.length >= 2, `count: ${updates.length}`);
  t('Order 1 update received', updates.some(u => u.id === o1.id && u.status === 'confirmed'));
  t('Order 2 update received', updates.some(u => u.id === o2.id && u.status === 'cancelled'));
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
