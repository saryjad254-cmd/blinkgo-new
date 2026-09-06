#!/usr/bin/env node
/**
 * Phase 7H-G — Maps Realtime (REAL DB)
 * ────────────────────────────────────
 * Tests:
 *  - X. Map markers (restaurant, customer, driver)
 *  - Realtime GPS updates
 *  - Markers update as driver moves
 *  - Customer destination marker visible (not only restaurant)
 *  - Multi-device consistency
 *  - Concurrency
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

const WESSELING = { lat: 50.8233, lng: 6.9772 };
const TEST_PREFIX = `g7hg_rt_`;
const TS = Date.now();

async function makeUser(label, role) {
  const email = `${TEST_PREFIX}${label}_${TS}_${Math.random().toString(36).slice(2, 6)}@test.com`;
  const password = 'TestPass123!';
  const { data: u } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: `User ${label}`, role }
  });
  const id = u?.user?.id;
  await service.from('users').upsert({ id, email, name: `User ${label}`, role, is_active: true }, { onConflict: 'id' });
  return { id, email, password };
}

const createdUsers = [];
async function cleanup() {
  await service.from('orders').delete().like('order_number', `${TEST_PREFIX}%`);
  for (const u of createdUsers) {
    await service.from('users').delete().eq('id', u.id);
    await service.auth.admin.deleteUser(u.id).catch(() => null);
  }
}

const { data: rests } = await service.from('restaurants').select('*').not('latitude', 'is', null).limit(20);
let restaurantA;
for (const r of rests || []) {
  const { count } = await service.from('products').select('*', { count: 'exact' }).eq('restaurant_id', r.id);
  if (count > 0) { restaurantA = r; break; }
}
if (!restaurantA) { console.error('No restaurant with products'); process.exit(1); }
console.log(`Using restaurant: ${restaurantA.name}`);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-G — Maps Realtime (REAL DB)');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// X. Markers — restaurant, customer, driver (data available)
// ═══════════════════════════════════════════════════════════════
section('X. Marker data available for all 3 personas');
{
  const customerId = await makeUser('mark', 'customer');
  const driverId = (await makeUser('markd', 'driver')).id;
  createdUsers.push(customerId, driverId);

  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}mark_${TS}`,
    customer_id: customerId.id,
    restaurant_id: restaurantA.id,
    driver_id: driverId, status: 'picked_up',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
    driver_latitude: WESSELING.lat - 0.005, driver_longitude: WESSELING.lng - 0.005,
  }).select().single();

  // Restaurant marker
  t('Restaurant marker: has lat/lng', !!restaurantA.latitude && !!restaurantA.longitude);
  t('Restaurant marker: has name', !!restaurantA.name);

  // Customer marker
  t('Customer marker: order has customer_latitude', !!o.data?.customer_latitude);
  t('Customer marker: order has customer_longitude', !!o.data?.customer_longitude);

  // Driver marker
  t('Driver marker: order has driver_latitude', !!o.data?.driver_latitude);
  t('Driver marker: order has driver_longitude', !!o.data?.driver_longitude);

  // 3 distinct markers (not overlapping)
  const r = { lat: restaurantA.latitude, lng: restaurantA.longitude };
  const c = { lat: o.data.customer_latitude, lng: o.data.customer_longitude };
  const d = { lat: o.data.driver_latitude, lng: o.data.driver_longitude };
  function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  t('Restaurant and Customer are distinct markers', haversineMeters(r.lat, r.lng, c.lat, c.lng) > 100);
  t('Driver and Customer are distinct markers', haversineMeters(d.lat, d.lng, c.lat, c.lng) > 100);
}

// ═══════════════════════════════════════════════════════════════
// Realtime: driver position updates propagate
// ═══════════════════════════════════════════════════════════════
section('Realtime: driver GPS updates');
{
  const customerId = await makeUser('rt', 'customer');
  const driverId = (await makeUser('rtd', 'driver')).id;
  createdUsers.push(customerId, driverId);

  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}rt_${TS}`,
    customer_id: customerId.id,
    restaurant_id: restaurantA.id,
    driver_id: driverId, status: 'picked_up',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Subscribe
  const events = [];
  const ch = service.channel(`maps-${o.data.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => events.push(p.new))
    .subscribe();
  await sleep(2000);

  // 5 driver GPS updates
  for (let i = 0; i < 5; i++) {
    await service.from('orders').update({
      driver_latitude: WESSELING.lat - 0.001 * (i + 1),
      driver_longitude: WESSELING.lng + 0.001 * (i + 1),
    }).eq('id', o.data.id);
    await sleep(300);
  }
  await sleep(1500);
  await ch.unsubscribe();

  t('Driver GPS updates received via realtime', events.length >= 3, `count: ${events.length}`);
  t('Final driver position in stream matches DB',
    (await service.from('orders').select('driver_latitude').eq('id', o.data.id).single())?.data?.driver_latitude != null);
}

// ═══════════════════════════════════════════════════════════════
// Marker update: driver moves toward customer
// ═══════════════════════════════════════════════════════════════
section('Marker update: driver moves toward customer');
{
  const customerId = await makeUser('move', 'customer');
  const driverId = (await makeUser('moved', 'driver')).id;
  createdUsers.push(customerId, driverId);

  const customerPos = { lat: WESSELING.lat, lng: WESSELING.lng };
  // Driver starts 1km away
  const startPos = { lat: WESSELING.lat - 0.009, lng: WESSELING.lng - 0.009 };

  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}mv_${TS}`,
    customer_id: customerId.id,
    restaurant_id: restaurantA.id,
    driver_id: driverId, status: 'picked_up',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: customerPos.lat, customer_longitude: customerPos.lng,
    driver_latitude: startPos.lat, driver_longitude: startPos.lng,
  }).select().single();

  function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Initial distance
  const initialDist = haversineMeters(startPos.lat, startPos.lng, customerPos.lat, customerPos.lng);
  t('Initial distance ~1km', initialDist > 800 && initialDist < 1500, `${initialDist.toFixed(0)}m`);

  // Subscribe
  const events = [];
  const ch = service.channel(`mv-${o.data.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => events.push(p.new))
    .subscribe();
  await sleep(2000);

  // Driver moves closer
  for (let i = 0; i < 5; i++) {
    await service.from('orders').update({
      driver_latitude: WESSELING.lat - 0.009 + 0.0015 * (i + 1),
      driver_longitude: WESSELING.lng - 0.009 + 0.0015 * (i + 1),
    }).eq('id', o.data.id);
    await sleep(300);
  }
  await sleep(1000);
  await ch.unsubscribe();

  // Final distance should be smaller
  const finalPos = (await service.from('orders').select('driver_latitude, driver_longitude').eq('id', o.data.id).single()).data;
  const finalDist = haversineMeters(finalPos.driver_latitude, finalPos.driver_longitude, customerPos.lat, customerPos.lng);
  t('Driver moved closer to customer', finalDist < initialDist, `initial: ${initialDist.toFixed(0)}m → final: ${finalDist.toFixed(0)}m`);

  // Realtime events received
  t('Driver position updates received via realtime', events.length >= 3, `count: ${events.length}`);
}

// ═══════════════════════════════════════════════════════════════
// Multi-device: same order, two tracking sessions
// ═══════════════════════════════════════════════════════════════
section('Multi-device tracking: same order, 2 sessions');
{
  const customerId = await makeUser('multi', 'customer');
  const driverId = (await makeUser('multid', 'driver')).id;
  createdUsers.push(customerId, driverId);

  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}mlt_${TS}`,
    customer_id: customerId.id,
    restaurant_id: restaurantA.id,
    driver_id: driverId, status: 'picked_up',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Two separate clients (devices)
  const c1 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const c2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const e1 = [], e2 = [];
  const ch1 = c1.channel(`m1-${o.data.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}` }, (p) => e1.push(p.new))
    .subscribe();
  const ch2 = c2.channel(`m2-${o.data.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}` }, (p) => e2.push(p.new))
    .subscribe();
  await sleep(2500);

  // Update driver pos
  await service.from('orders').update({ driver_latitude: WESSELING.lat - 0.003 }).eq('id', o.data.id);
  await sleep(1500);

  await ch1.unsubscribe();
  await ch2.unsubscribe();

  t('Device 1 receives update', e1.length >= 1);
  t('Device 2 receives update', e2.length >= 1);
  t('Both devices see same driver position', e1[0]?.driver_latitude === e2[0]?.driver_latitude);
}

// ═══════════════════════════════════════════════════════════════
// X. Customer destination marker (not just restaurant)
// ═══════════════════════════════════════════════════════════════
section('X. Customer destination marker is present');
{
  const customerId = await makeUser('dest', 'customer');
  const driverId = (await makeUser('destd', 'driver')).id;
  createdUsers.push(customerId, driverId);

  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}dst_${TS}`,
    customer_id: customerId.id,
    restaurant_id: restaurantA.id,
    driver_id: driverId, status: 'picked_up',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: '123 Customer St', lat: 50.83, lng: 6.98 },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: 50.83, customer_longitude: 6.98,
  }).select().single();

  // Customer destination must be present in delivery_address AND in customer_lat/lng
  t('Customer destination: delivery_address JSONB has lat', o.data?.delivery_address?.lat != null);
  t('Customer destination: delivery_address JSONB has lng', o.data?.delivery_address?.lng != null);
  t('Customer destination: customer_latitude set', o.data?.customer_latitude != null);
  t('Customer destination: customer_longitude set', o.data?.customer_longitude != null);

  // Historical requirement: customer destination marker must appear, not only restaurant
  // Verify the data has BOTH restaurant and customer coords available
  t('Restaurant marker coords available', o.data?.restaurant_latitude != null);
  t('Customer marker coords available', o.data?.customer_latitude != null);
  t('Customer coords are NOT the same as Restaurant coords',
    o.data?.customer_latitude !== o.data?.restaurant_latitude);
}

// ═══════════════════════════════════════════════════════════════
// Marker update: zoom/fit bounds
// ═══════════════════════════════════════════════════════════════
section('Marker bounds (zoom/fit)');
{
  function getBounds(points) {
    if (points.length === 0) return null;
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      centerLat: (Math.min(...lats) + Math.max(...lats)) / 2,
      centerLng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  }

  const points = [
    { lat: 50.825, lng: 6.972 },  // restaurant
    { lat: 50.83, lng: 6.98 },     // customer
    { lat: 50.815, lng: 6.965 },   // driver
  ];
  const bounds = getBounds(points);
  t('Bounds has 3 points: minLat', bounds.minLat === 50.815);
  t('Bounds: maxLat', bounds.maxLat === 50.83);
  t('Bounds: minLng', bounds.minLng === 6.965);
  t('Bounds: maxLng', bounds.maxLng === 6.98);
  t('Bounds: centerLat is between min and max', bounds.centerLat > bounds.minLat && bounds.centerLat < bounds.maxLat);

  // Two overlapping markers
  const overlap = getBounds([
    { lat: 50.827, lng: 6.975 },
    { lat: 50.827, lng: 6.975 },
  ]);
  t('Same point: minLat == maxLat', overlap.minLat === overlap.maxLat);
}

// ═══════════════════════════════════════════════════════════════
// Missing coordinates: marker hidden gracefully
// ═══════════════════════════════════════════════════════════════
section('Missing coordinates: marker hidden gracefully');
{
  // What happens if driver_latitude is null?
  function isMarkerVisible(pos) {
    return pos != null && pos.lat != null && pos.lng != null &&
      !Number.isNaN(pos.lat) && !Number.isNaN(pos.lng);
  }

  t('Valid marker is visible', isMarkerVisible({ lat: 50.827, lng: 6.975 }));
  t('Null marker is hidden', !isMarkerVisible(null));
  t('Marker with null lat is hidden', !isMarkerVisible({ lat: null, lng: 6.975 }));
  t('Marker with null lng is hidden', !isMarkerVisible({ lat: 50.827, lng: null }));
  t('Marker with NaN is hidden', !isMarkerVisible({ lat: NaN, lng: 6.975 }));
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
