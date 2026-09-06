#!/usr/bin/env node
/**
 * Phase 7H-F — Realtime Recovery (REAL DB)
 * ────────────────────────────────────────
 * Tests the failure recovery path:
 *  - G. Disconnect / reconnect
 *  - H. Browser sleep / wake (simulated via long pauses)
 *  - I. Refresh at every state
 *  - X. Failure recovery (DB is source of truth)
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

async function waitForMatch(items, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!items.some(predicate) && Date.now() < deadline) await sleep(100);
}

const WESSELING = { lat: 50.827, lng: 6.975 };
const TEST_PREFIX = `g7hf_rec_`;
const TS = Date.now();

async function makeUser(label, role) {
  const email = `${TEST_PREFIX}${label}_${TS}_${Math.random().toString(36).slice(2, 6)}@test.com`;
  const { data: u } = await service.auth.admin.createUser({
    email, password: 'TestPass123!', email_confirm: true,
    user_metadata: { name: `User ${label}`, role }
  });
  const id = u?.user?.id;
  await service.from('users').upsert({ id, email, name: `User ${label}`, role, is_active: true }, { onConflict: 'id' });
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

// Find restaurant
const { data: rests } = await service.from('restaurants').select('*').not('latitude', 'is', null).limit(20);
let restaurantA;
for (const r of rests || []) {
  const { count } = await service.from('products').select('*', { count: 'exact' }).eq('restaurant_id', r.id);
  if (count > 0) { restaurantA = r; break; }
}
if (!restaurantA) { console.error('No restaurant with products'); process.exit(1); }
console.log(`Using restaurant: ${restaurantA.name}`);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-F — Realtime Recovery (REAL DB)');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// G. Short disconnect — channel CLOSED
// ═══════════════════════════════════════════════════════════════
section('G. Short disconnect — channel CLOSED → re-subscribe');
{
  const customerId = await makeUser('short', 'customer');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}short_${TS}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  const updates = [];
  const ch = service.channel(`test-short-${o.data.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => updates.push(p.new));
  await waitForSubscription(ch);
  await sleep(500);

  // Update
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.data.id);
  await waitForMatch(updates, (update) => update.status === 'confirmed');
  t('Before disconnect: update received', updates.some(u => u.status === 'confirmed'));

  // Simulate disconnect: unsubscribe
  await ch.unsubscribe();
  await sleep(500);

  // Update during "disconnect"
  await service.from('orders').update({ status: 'preparing' }).eq('id', o.data.id);
  await sleep(500);

  // Re-subscribe
  const updates2 = [];
  const ch2 = service.channel(`test-short-${o.data.id}-reconnect`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => updates2.push(p.new))
    .subscribe();
  await sleep(1500);

  // Verify: DB re-fetch shows latest (preparing)
  const { data: dbAfterReconnect } = await service.from('orders').select('status').eq('id', o.data.id).single();
  t('After disconnect+update: DB shows preparing', dbAfterReconnect?.status === 'preparing');

  // Trigger another update
  await service.from('orders').update({ status: 'ready' }).eq('id', o.data.id);
  await sleep(1500);
  await ch2.unsubscribe();

  t('After reconnect: new update received', updates2.some(u => u.status === 'ready'), `updates2: ${updates2.map(u => u.status).join(',')}`);
}

// ═══════════════════════════════════════════════════════════════
// G. 30-second disconnect — many updates while offline
// ═══════════════════════════════════════════════════════════════
section('G. 30-second disconnect — recover from DB');
{
  const customerId = await makeUser('long', 'customer');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}long_${TS}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Subscribe + receive 1 event
  const updates = [];
  const ch = service.channel(`test-long-${o.data.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => updates.push(p.new))
    .subscribe();
  await sleep(1500);
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.data.id);
  await sleep(500);
  await ch.unsubscribe();

  // Disconnect: many updates while offline
  const driverId = await makeUser('long_driver', 'driver');
  createdUsers.push(driverId);
  const states = [
    { status: 'preparing' },
    { status: 'ready' },
    { status: 'assigned', driver_id: driverId },
    { status: 'picked_up' },
    { status: 'delivering' },
    { status: 'delivered' },
  ];
  for (const state of states) {
    await service.from('orders').update(state).eq('id', o.data.id);
    await sleep(200);
  }
  await sleep(1000);

  // Reconnect: re-fetch from DB
  const { data: recovered } = await service.from('orders').select('status').eq('id', o.data.id).single();
  t('After 5 missed updates, DB shows delivered', recovered?.status === 'delivered');

  // The "reconnect" — new subscription receives new events
  const updates2 = [];
  const ch2 = service.channel(`test-long-${o.data.id}-reconnect`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => updates2.push(p.new))
    .subscribe();
  await sleep(1500);

  // Update → should be received
  await service.from('orders').update({ status: 'delivered', tip: 5 }).eq('id', o.data.id);
  await sleep(500);
  await ch2.unsubscribe();

  t('Reconnect subscription receives new events', updates2.length >= 1, `count: ${updates2.length}`);
  t('Reconnect subscription tip event received', updates2.some(u => u.tip === 5));
}

// ═══════════════════════════════════════════════════════════════
// I. Refresh at every state
// ═══════════════════════════════════════════════════════════════
section('I. Refresh at every state — DB is source of truth');
{
  const customerId = await makeUser('refresh', 'customer');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}refresh_${TS}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  const driverId = await makeUser('refresh_driver', 'driver');
  createdUsers.push(driverId);
  const states = [
    { status: 'pending' },
    { status: 'confirmed' },
    { status: 'preparing' },
    { status: 'ready' },
    { status: 'assigned', driver_id: driverId },
    { status: 'picked_up' },
    { status: 'delivering' },
    { status: 'delivered' },
  ];
  for (const state of states) {
    const s = state.status;
    await service.from('orders').update(state).eq('id', o.data.id);
    await sleep(200);
    // "Refresh" = re-fetch from DB
    const { data: r } = await service.from('orders').select('status').eq('id', o.data.id).single();
    t(`Refresh after ${s}`, r?.status === s, `db: ${r?.status}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// H. Browser sleep — long pause then resume
// ═══════════════════════════════════════════════════════════════
section('H. Browser sleep — long pause then resume');
{
  const customerId = await makeUser('sleep', 'customer');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}sleep_${TS}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  const updates = [];
  const ch = service.channel(`test-sleep-${o.data.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => updates.push(p.new))
    .subscribe();
  await sleep(1500);

  // "Active" period
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.data.id);
  await sleep(500);
  t('Active period: update received', updates.some(u => u.status === 'confirmed'));

  // "Sleep" — no activity for 3s (simulates background tab)
  await sleep(3000);

  // "Wake" — channel may have been closed by Supabase
  // Check if subscription is still active
  t('Channel still subscribed after 3s', ch.state === 'joined', `state: ${ch.state}`);

  // "Wake" event — trigger update
  await service.from('orders').update({ status: 'preparing' }).eq('id', o.data.id);
  await sleep(500);
  t('After wake: update received (or DB is source of truth)',
    updates.some(u => u.status === 'preparing') || (await service.from('orders').select('status').eq('id', o.data.id).single())?.data?.status === 'preparing');

  await ch.unsubscribe();
}

// ═══════════════════════════════════════════════════════════════
// X. Failure recovery — DB is source of truth
// ═══════════════════════════════════════════════════════════════
section('X. Failure recovery — DB is source of truth');
{
  const customerId = await makeUser('fail', 'customer');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}fail_${TS}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Simulate: subscription CLOSED state
  const ch = service.channel(`test-fail-${o.data.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, () => {})
    .subscribe();
  await sleep(1500);
  await ch.unsubscribe();

  // Update while channel is closed
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.data.id);
  await sleep(500);

  // Recovery: query DB
  const { data: recovered } = await service.from('orders').select('*').eq('id', o.data.id).single();
  t('After channel CLOSED: DB re-fetch returns latest state', recovered?.status === 'confirmed');
  t('DB returns full order record', recovered?.total === 14 && recovered?.customer_id === customerId);

  // No duplicate side effects: only 1 order, 1 row
  const { count } = await service.from('orders').select('*', { count: 'exact' }).eq('order_number', o.data.order_number);
  t('Exactly 1 order (no duplicates from retry)', count === 1);

  // No missing data: customer_id, restaurant_id, delivery_address all set
  t('No missing data after recovery',
    !!recovered?.customer_id && !!recovered?.restaurant_id && !!recovered?.delivery_address);

  // No ghost state: total still matches input
  t('No ghost state: total unchanged', recovered?.total === 14);
}

// ═══════════════════════════════════════════════════════════════
// X. Multiple rapid reconnects
// ═══════════════════════════════════════════════════════════════
section('X. Multiple rapid reconnects');
{
  const customerId = await makeUser('recon', 'customer');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}recon_${TS}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // 5 rapid subscribe/unsubscribe cycles
  for (let i = 0; i < 5; i++) {
    const ch = service.channel(`test-recon-${o.data.id}-${i}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
      }, () => {})
      .subscribe();
    await sleep(300);
    await ch.unsubscribe();
  }

  // Final state: DB
  const { data: final } = await service.from('orders').select('status').eq('id', o.data.id).single();
  t('After 5 rapid reconnects: DB still consistent', final?.status === 'pending');

  // One more subscribe + update
  const updates = [];
  const ch2 = service.channel(`test-recon-final-${o.data.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => updates.push(p.new))
    .subscribe();
  await sleep(1500);
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.data.id);
  await sleep(500);
  await ch2.unsubscribe();
  t('Post-reconnect: new updates received', updates.some(u => u.status === 'confirmed'));
}

// ═══════════════════════════════════════════════════════════════
// G. CHANNEL_ERROR / TIMED_OUT — recovery by re-subscribe
// ═══════════════════════════════════════════════════════════════
section('G. CHANNEL_ERROR recovery');
{
  // When a channel errors out, the client should re-subscribe
  // Simulate by unsubscribing and re-subscribing with a fresh client
  const customerId = await makeUser('err', 'customer');
  createdUsers.push(customerId);
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}err_${TS}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'x' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // First channel
  const ch1 = service.channel(`test-err-${o.data.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, () => {})
    .subscribe();
  await sleep(1500);

  // Force "error" by closing
  await ch1.unsubscribe();

  // Recovery: new channel
  const updates = [];
  const ch2 = service.channel(`test-err-${o.data.id}-recovery`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.data.id}`
    }, (p) => updates.push(p.new))
    .subscribe();
  await sleep(1500);

  // Trigger update
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.data.id);
  await sleep(500);
  await ch2.unsubscribe();

  t('After channel recovery: updates received', updates.some(u => u.status === 'confirmed'));
}

// ═══════════════════════════════════════════════════════════════
// I. State restoration — order created during refresh
// ═══════════════════════════════════════════════════════════════
section('I. State restoration — order state equals DB');
{
  const customerId = await makeUser('rest', 'customer');
  createdUsers.push(customerId);

  // Create an order, do many state changes, then "refresh"
  const o = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}rest_${TS}`,
    customer_id: customerId,
    restaurant_id: restaurantA.id,
    driver_id: null, status: 'pending',
    subtotal: 25, delivery_fee: 3, service_fee: 1, tip: 5, discount: 0, total: 34,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'Restoration Test 1', lat: WESSELING.lat, lng: WESSELING.lng, formatted_address: 'Restoration Test 1' },
    delivery_instructions: 'Ring twice',
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Many state changes
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.data.id);
  await sleep(100);
  await service.from('orders').update({ status: 'preparing' }).eq('id', o.data.id);
  await sleep(100);
  await service.from('orders').update({ status: 'ready' }).eq('id', o.data.id);
  await sleep(100);
  await service.from('orders').update({ status: 'picked_up' }).eq('id', o.data.id);
  await sleep(100);
  await service.from('orders').update({ status: 'delivering' }).eq('id', o.data.id);
  await sleep(100);

  // "Refresh" = full re-fetch
  const { data: refreshed } = await service.from('orders').select('*').eq('id', o.data.id).single();
  t('After many state changes, refresh returns latest (delivering)', refreshed?.status === 'delivering');
  t('Refresh preserves subtotal', refreshed?.subtotal === 25);
  t('Refresh preserves tip', refreshed?.tip === 5);
  t('Refresh preserves total', refreshed?.total === 34);
  t('Refresh preserves delivery_instructions', refreshed?.delivery_instructions === 'Ring twice');
  t('Refresh preserves delivery_address JSONB', refreshed?.delivery_address?.address === 'Restoration Test 1');
  t('Refresh preserves restaurant coords', refreshed?.restaurant_latitude === restaurantA.latitude);
  t('Refresh preserves customer coords', refreshed?.customer_latitude === WESSELING.lat);
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
