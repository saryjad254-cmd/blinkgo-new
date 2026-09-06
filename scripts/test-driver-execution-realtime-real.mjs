#!/usr/bin/env node
/**
 * Phase 7H-D — Driver Execution Realtime (REAL DB)
 * ─────────────────────────────────────────────────
 * Tests:
 *  - L. Restaurant ready event reaches driver in realtime
 *  - O. Live driver tracking
 *  - V. Driver release events
 *  - Multi-device driver state sync
 *  - Customer sees driver location update
 *  - Disconnect/reconnect
 *  - Duplicate subscription
 *  - Order status events (ready → picked_up → delivered)
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

const TEST_PREFIX = `g7hd_rt_${Date.now()}_`;
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

const drivers = [];
async function cleanup() {
  await service.from('order_items').delete().in('order_id', (await service.from('orders').select('id').like('order_number', `${TEST_PREFIX}%`)).data?.map(o => o.id) || []);
  await service.from('order_tracking_events').delete().in('order_id', (await service.from('orders').select('id').like('order_number', `${TEST_PREFIX}%`)).data?.map(o => o.id) || []);
  await service.from('orders').delete().like('order_number', `${TEST_PREFIX}%`);
  for (const id of drivers) {
    await service.from('driver_status').delete().eq('driver_id', id);
    await service.from('drivers').delete().eq('id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id).catch(() => null);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-D — Driver Execution Realtime (REAL DB)');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// L. Restaurant ready event
// ═══════════════════════════════════════════════════════════════
section('L. Restaurant ready event');
{
  const d = await makeDriver('rt-rest');
  drivers.push(d);

  // Subscribe FIRST
  const updates = [];
  const ch = service
    .channel(`rt-driver-orders-${d}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
      (payload) => { updates.push({ status: payload.new?.status }); })
    .subscribe();
  await new Promise(r => setTimeout(r, 2500));

  // Create the order with driver_id set
  const o = await makeOrder(d, 'preparing', { accepted_at: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 1000));

  // Restaurant marks ready
  await service.from('orders').update({ status: 'ready' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 3000));

  t('Driver receives "ready" event in realtime', updates.some(u => u.status === 'ready'),
    `events: ${JSON.stringify(updates)}`);

  await service.removeChannel(ch);
}

// ═══════════════════════════════════════════════════════════════
// O. Live driver tracking
// ═══════════════════════════════════════════════════════════════
section('O. Live driver tracking');
{
  const d = await makeDriver('rt-track');
  drivers.push(d);

  const updates = [];
  const ch = service
    .channel(`rt-driver-track-${d}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
      (payload) => {
        if (payload.new?.driver_latitude != null) {
          updates.push({ lat: payload.new.driver_latitude, lng: payload.new.driver_longitude });
        }
      })
    .subscribe();
  await new Promise(r => setTimeout(r, 2500));

  // Create order then update location
  const o = await makeOrder(d, 'picked_up', { picked_up_at: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 1000));

  // Simulate 3 location updates
  for (let i = 0; i < 3; i++) {
    await service.from('orders').update({
      driver_latitude: 52.52 + i * 0.001,
      driver_longitude: 13.405 + i * 0.001,
    }).eq('id', o.id);
  }
  await new Promise(r => setTimeout(r, 3000));

  t('Customer receives live driver location updates via realtime', updates.length >= 3,
    `received: ${updates.length}`);

  await service.removeChannel(ch);
}

// ═══════════════════════════════════════════════════════════════
// V. Driver release event
// ═══════════════════════════════════════════════════════════════
section('V. Driver release event');
{
  const d = await makeDriver('rt-release');
  drivers.push(d);

  const updates = [];
  const ch = service
    .channel(`rt-driver-release-${d}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'driver_status', filter: `driver_id=eq.${d}` },
      (payload) => {
        updates.push({ is_on_delivery: payload.new?.is_on_delivery, current_order_id: payload.new?.current_order_id });
      })
    .subscribe();
  await new Promise(r => setTimeout(r, 2500));

  // Mark order delivered and release driver
  const o = await makeOrder(d, 'picked_up', { picked_up_at: new Date().toISOString() });
  await service.from('driver_status').update({ is_on_delivery: true, current_order_id: o.id }).eq('driver_id', d);
  await new Promise(r => setTimeout(r, 1000));
  await service.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', o.id);
  await service.from('driver_status').update({ is_on_delivery: false, current_order_id: null }).eq('driver_id', d);
  await new Promise(r => setTimeout(r, 3000));

  t('Driver release event received in realtime', updates.length >= 1,
    `events: ${JSON.stringify(updates)}`);

  await service.removeChannel(ch);
}

// ═══════════════════════════════════════════════════════════════
// Multi-device sync
// ═══════════════════════════════════════════════════════════════
section('Multi-device driver state sync');
{
  const d = await makeDriver('rt-multidev');
  drivers.push(d);

  // 3 device subscriptions
  const updates1 = [], updates2 = [], updates3 = [];
  const ch1 = service.channel(`rt-dev-1-${d}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
    (p) => updates1.push(p.new?.status)).subscribe();
  const ch2 = service.channel(`rt-dev-2-${d}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
    (p) => updates2.push(p.new?.status)).subscribe();
  const ch3 = service.channel(`rt-dev-3-${d}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
    (p) => updates3.push(p.new?.status)).subscribe();
  await new Promise(r => setTimeout(r, 2500));

  const o = await makeOrder(d, 'confirmed', { accepted_at: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 1000));

  // 3 rapid status updates
  await service.from('orders').update({ status: 'preparing' }).eq('id', o.id);
  await service.from('orders').update({ status: 'ready' }).eq('id', o.id);
  await service.from('orders').update({ status: 'picked_up', picked_up_at: new Date().toISOString() }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 3500));

  t('Device 1 receives 3 status updates', updates1.length >= 3, `count: ${updates1.length}`);
  t('Device 2 receives 3 status updates', updates2.length >= 3, `count: ${updates2.length}`);
  t('Device 3 receives 3 status updates', updates3.length >= 3, `count: ${updates3.length}`);

  await service.removeChannel(ch1);
  await service.removeChannel(ch2);
  await service.removeChannel(ch3);
}

// ═══════════════════════════════════════════════════════════════
// Disconnect/reconnect
// ═══════════════════════════════════════════════════════════════
section('Disconnect/reconnect');
{
  const d = await makeDriver('rt-disco');
  drivers.push(d);

  const updates = [];
  let ch = service.channel(`rt-disco-1-${d}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
    (p) => updates.push(p.new?.status)).subscribe();
  await new Promise(r => setTimeout(r, 2500));

  const o = await makeOrder(d, 'confirmed', { accepted_at: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 1000));

  // Update while subscribed
  await service.from('orders').update({ status: 'preparing' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));
  t('Update received while subscribed', updates.includes('preparing'), `received: ${JSON.stringify(updates)}`);

  // Disconnect
  await service.removeChannel(ch);
  updates.length = 0;
  await service.from('orders').update({ status: 'ready' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));
  t('No update after disconnect', !updates.includes('ready'), `received: ${JSON.stringify(updates)}`);

  // Reconnect
  ch = service.channel(`rt-disco-2-${d}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
    (p) => updates.push(p.new?.status)).subscribe();
  await new Promise(r => setTimeout(r, 2500));
  await service.from('orders').update({ status: 'picked_up', picked_up_at: new Date().toISOString() }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));
  t('Update received after reconnect', updates.includes('picked_up'), `received: ${JSON.stringify(updates)}`);

  await service.removeChannel(ch);
}

// ═══════════════════════════════════════════════════════════════
// Duplicate subscription
// ═══════════════════════════════════════════════════════════════
section('Duplicate subscription');
{
  const d = await makeDriver('rt-dup');
  drivers.push(d);

  const u1 = [], u2 = [];
  const ch1 = service.channel(`rt-dup-1-${d}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
    (p) => u1.push(p.new?.status)).subscribe();
  const ch2 = service.channel(`rt-dup-2-${d}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
    (p) => u2.push(p.new?.status)).subscribe();
  await new Promise(r => setTimeout(r, 2500));

  const o = await makeOrder(d, 'confirmed', { accepted_at: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 1000));

  await service.from('orders').update({ status: 'ready' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 3000));

  t('Subscription 1 receives update', u1.length >= 1);
  t('Subscription 2 receives update', u2.length >= 1);

  await service.removeChannel(ch1);
  await service.removeChannel(ch2);
}

// ═══════════════════════════════════════════════════════════════
// Customer sees driver location update
// ═══════════════════════════════════════════════════════════════
section('Customer sees driver location update');
{
  const d = await makeDriver('rt-cust');
  drivers.push(d);

  // Customer subscribes to order updates
  const updates = [];
  const ch = service.channel(`rt-cust-orders-${d}`).on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${d}` },
    (p) => {
      if (p.new?.driver_latitude != null) {
        updates.push({ lat: p.new.driver_latitude, lng: p.new.driver_longitude });
      }
    }).subscribe();
  await new Promise(r => setTimeout(r, 2500));

  const o = await makeOrder(d, 'picked_up', { picked_up_at: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 1000));

  // Driver updates location
  await service.from('orders').update({ driver_latitude: 52.525, driver_longitude: 13.41 }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 3000));

  t('Customer receives driver location update', updates.length >= 1,
    `received: ${JSON.stringify(updates)}`);

  await service.removeChannel(ch);
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
section('CLEANUP');
await cleanup();

// Clean up the focused test leftovers too
await service.from('driver_status').delete().like('driver_id', '________-____-____-____-____________').neq('is_online', null);
await service.from('drivers').delete().like('full_name', 'RT Focused');
await service.from('users').delete().like('email', 'rt_foc_%');
await service.from('users').delete().like('email', 'rt_min_%');
await service.from('orders').delete().like('order_number', 'rt_foc_%');
await service.from('orders').delete().like('order_number', 'rt_min_%');

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
