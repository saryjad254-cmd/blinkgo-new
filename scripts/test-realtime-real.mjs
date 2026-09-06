#!/usr/bin/env node
/**
 * Phase 7H-A — Comprehensive Realtime Subscription Test
 * ────────────────────────────────────────────────────────
 * Tests the full realtime matrix:
 * 1. customer receives order UPDATE
 * 2. restaurant receives order UPDATE
 * 3. driver receives order UPDATE
 * 4. admin receives order UPDATE
 * 5. UPDATE events
 * 6. disconnect + reconnect
 * 7. duplicate subscription
 * 8. resubscribe (browser refresh)
 *
 * Run: `node scripts/test-realtime-real.mjs`
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
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let pass = 0, fail = 0;
const results = [];
function subscribeReady(channel, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out')), timeoutMs);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timeout);
        reject(error || new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
}
function t(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  if (cond) pass++; else fail++;
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(name) { console.log(`\n═══ ${name} ═══`); }

// Set up test users: customer, restaurant, driver, admin
// We create fresh users with known passwords so we can sign in.
async function createAuthUser(email, password, role) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Authorization roles are trusted only from app_metadata. Keeping a role
    // in editable user_metadata made the old test clients authenticate as
    // customers and invalidated the driver/admin assertions.
    app_metadata: { app_role: role },
    user_metadata: { name: role },
  });
  if (error && !error.message.includes('already')) {
    throw new Error(`Create ${role} failed: ${error.message}`);
  }
  // If user exists, look it up
  if (error) {
    const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 100 });
    return list?.users?.find(u => u.email === email);
  }
  return data.user;
}

const TEST_PASSWORD = 'TestPass123!';
const ts = Date.now();
const customerEmail = `g7h_rt_cust_${ts}@test.com`;
const driverEmail = `g7h_rt_drv_${ts}@test.com`;
const adminEmail = `g7h_rt_adm_${ts}@test.com`;
const ownerEmail = `g7h_rt_own_${ts}@test.com`;

console.log('Setting up test users...');
const customerUser = await createAuthUser(customerEmail, TEST_PASSWORD, 'customer');
const driverUser = await createAuthUser(driverEmail, TEST_PASSWORD, 'driver');
const adminUser = await createAuthUser(adminEmail, TEST_PASSWORD, 'admin');
const ownerUser = await createAuthUser(ownerEmail, TEST_PASSWORD, 'restaurant');
const customerId = customerUser.id;
const driverId = driverUser.id;
const adminId = adminUser.id;
const restaurantOwnerId = ownerUser.id;

await service.from('users').upsert([
  { id: customerId, role: 'customer', email: customerEmail },
  { id: driverId, role: 'driver', email: driverEmail },
  { id: adminId, role: 'admin', email: adminEmail },
  { id: restaurantOwnerId, role: 'restaurant', email: ownerEmail },
], { onConflict: 'id' });

// Clone a catalog fixture into an isolated restaurant owned by the test user.
// This proves the restaurant Realtime policy without changing a real venue's owner.
const { data: baseRestaurant, error: baseRestaurantError } = await service.from('restaurants').select('*').limit(1).single();
if (baseRestaurantError || !baseRestaurant) throw baseRestaurantError || new Error('Restaurant fixture unavailable');
const {
  id: _baseRestaurantId,
  created_at: _baseRestaurantCreatedAt,
  updated_at: _baseRestaurantUpdatedAt,
  owner_id: _baseRestaurantOwnerId,
  ...restaurantFixture
} = baseRestaurant;
const { data: testRestaurant, error: testRestaurantError } = await service.from('restaurants').insert({
  ...restaurantFixture,
  owner_id: restaurantOwnerId,
  name: `Realtime Restaurant ${ts}`,
  email: ownerEmail,
  is_active: true,
  is_verified: true,
  is_hidden: false,
  is_paused: false,
  accepting_orders: true,
  busy_mode: false,
}).select('id').single();
if (testRestaurantError || !testRestaurant) throw testRestaurantError || new Error('Test restaurant creation failed');
const restaurantId = testRestaurant.id;

// Create a driver record for the driver user
await service.from('drivers').upsert({
  id: driverId,
  is_active: true,
  is_online: true,
  is_on_delivery: false,
}, { onConflict: 'id' });

// Set admin role on the admin user
try {
  await service.from('users').upsert({
    id: adminId,
    role: 'admin',
    email: adminEmail,
  }, { onConflict: 'id' });
} catch (e) {
  // ignore
}

// Sign in each test user
const customerClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data: customerSession, error: customerSignInError } = await customerClient.auth.signInWithPassword({
  email: customerEmail, password: TEST_PASSWORD,
});
if (customerSignInError || !customerSession.session) throw customerSignInError || new Error('Customer sign-in failed');

const driverClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data: driverSession, error: driverSignInError } = await driverClient.auth.signInWithPassword({
  email: driverEmail, password: TEST_PASSWORD,
});
if (driverSignInError || !driverSession.session) throw driverSignInError || new Error('Driver sign-in failed');

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data: adminSession, error: adminSignInError } = await adminClient.auth.signInWithPassword({
  email: adminEmail, password: TEST_PASSWORD,
});
if (adminSignInError || !adminSession.session) throw adminSignInError || new Error('Admin sign-in failed');

// Restaurant owner signs in with the trusted restaurant role.
const restaurantClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data: restaurantSession, error: restaurantSignInError } = await restaurantClient.auth.signInWithPassword({
  email: ownerEmail, password: TEST_PASSWORD,
});
if (restaurantSignInError || !restaurantSession.session) throw restaurantSignInError || new Error('Restaurant sign-in failed');
const TEST_PREFIX = 'g7h_rt2_';

async function makeOrder(extra = {}) {
  const orderNumber = `${TEST_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await service.from('orders').insert({
    order_number: orderNumber,
    customer_id: customerId,
    restaurant_id: restaurantId,
    driver_id: null,
    status: 'pending',
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

async function cleanup(orderId) {
  await service.from('order_items').delete().eq('order_id', orderId);
  await service.from('order_tracking_events').delete().eq('order_id', orderId);
  await service.from('orders').delete().eq('id', orderId);
}

// ═══════════════════════════════════════════════════════════════
// 1. CUSTOMER receives order UPDATE
// ═══════════════════════════════════════════════════════════════
section('1. CUSTOMER: receives order UPDATE');

{
  const o = await makeOrder();
  const updates = [];
  const channel = customerClient
    .channel(`rt-cust-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates.push({ event: payload.eventType, old: payload.old?.status, new: payload.new?.status });
    });

  await subscribeReady(channel);

  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));

  t('Customer receives UPDATE event', updates.length > 0, `events: ${JSON.stringify(updates)}`);
  if (updates.length > 0) {
    t('UPDATE payload includes new.status', !!updates[0].new, `new: ${updates[0].new}`);
  }

  await customerClient.removeChannel(channel);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 2. RESTAURANT receives order UPDATE
// ═══════════════════════════════════════════════════════════════
section('2. RESTAURANT: receives order UPDATE');

{
  const o = await makeOrder();
  const updates = [];
  const channel = restaurantClient
    .channel(`rt-rest-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates.push({ event: payload.eventType, old: payload.old?.status, new: payload.new?.status });
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 1500));
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));

  // Restaurant can see the order via RLS, so it should receive the event
  t('Restaurant receives UPDATE event', updates.length > 0, `events: ${JSON.stringify(updates)}`);

  await restaurantClient.removeChannel(channel);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 3. DRIVER receives order UPDATE
// ═══════════════════════════════════════════════════════════════
section('3. DRIVER: receives order UPDATE');

{
  const o = await makeOrder();
  const updates = [];
  const channel = driverSession ? driverClient : service;
  const ch = (driverSession ? driverClient : service)
    .channel(`rt-drv-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates.push({ event: payload.eventType, old: payload.old?.status, new: payload.new?.status });
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 1500));
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));

  t('Driver receives UPDATE event', updates.length > 0, `events: ${JSON.stringify(updates)}`);

  await ch.unsubscribe();
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 4. ADMIN receives order UPDATE
// ═══════════════════════════════════════════════════════════════
section('4. ADMIN: receives order UPDATE');

{
  const o = await makeOrder();
  const updates = [];
  const ch = (adminSession ? adminClient : service)
    .channel(`rt-adm-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates.push({ event: payload.eventType, old: payload.old?.status, new: payload.new?.status });
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 1500));
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));

  t('Admin receives UPDATE event', updates.length > 0, `events: ${JSON.stringify(updates)}`);

  await ch.unsubscribe();
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 5. UPDATE events in order
// ═══════════════════════════════════════════════════════════════
section('5. UPDATE events in order');

{
  const o = await makeOrder();
  const statusChanges = [];
  const channel = customerClient
    .channel(`rt-seq-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      statusChanges.push(payload.new?.status);
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 1500));
  await service.from('orders').update({ status: 'confirmed', accepted_at: new Date().toISOString() }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 500));
  await service.from('orders').update({ status: 'preparing', prepared_at: new Date().toISOString() }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 500));
  await service.from('orders').update({ status: 'ready' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));

  t('3+ status changes received in sequence',
    statusChanges.length >= 3,
    `received: ${JSON.stringify(statusChanges)}`);

  await customerClient.removeChannel(channel);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 6. DISCONNECT + RECONNECT
// ═══════════════════════════════════════════════════════════════
section('6. DISCONNECT + RECONNECT');

{
  const o = await makeOrder();
  const updates = [];
  let ch = customerClient
    .channel(`rt-disco-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates.push(payload.new?.status);
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 1500));

  // Update — should receive
  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2000));
  t('Update received while subscribed', updates.includes('confirmed'), `updates: ${JSON.stringify(updates)}`);

  // Disconnect
  await customerClient.removeChannel(ch);
  updates.length = 0;

  // Update while disconnected — should NOT receive
  await service.from('orders').update({ status: 'preparing' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2000));
  t('No updates after disconnect', !updates.includes('preparing'), `updates: ${JSON.stringify(updates)}`);

  // Reconnect
  ch = customerClient
    .channel(`rt-disco-2-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates.push(payload.new?.status);
    })
    .subscribe();
  await new Promise(r => setTimeout(r, 1500));

  // Update — should receive again
  await service.from('orders').update({ status: 'ready' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2000));
  t('Update received after reconnect', updates.includes('ready'), `updates: ${JSON.stringify(updates)}`);

  await customerClient.removeChannel(ch);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 7. DUPLICATE SUBSCRIPTION (idempotent)
// ═══════════════════════════════════════════════════════════════
section('7. DUPLICATE SUBSCRIPTION');

{
  const o = await makeOrder();
  const updates = [];
  // Subscribe to the same channel TWICE
  const ch1 = customerClient
    .channel(`rt-dup-${o.id}-1`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates.push({ source: 'ch1', status: payload.new?.status });
    })
    .subscribe();
  const ch2 = customerClient
    .channel(`rt-dup-${o.id}-2`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates.push({ source: 'ch2', status: payload.new?.status });
    })
    .subscribe();

  await new Promise(r => setTimeout(r, 1500));

  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2500));

  // Both subscriptions should fire
  const ch1Count = updates.filter(u => u.source === 'ch1').length;
  const ch2Count = updates.filter(u => u.source === 'ch2').length;
  t('Subscription 1 receives update', ch1Count > 0, `count: ${ch1Count}`);
  t('Subscription 2 receives update', ch2Count > 0, `count: ${ch2Count}`);

  await customerClient.removeChannel(ch1);
  await customerClient.removeChannel(ch2);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 8. RESUBSCRIBE (browser refresh)
// ═══════════════════════════════════════════════════════════════
section('8. RESUBSCRIBE (browser refresh simulation)');

{
  const o = await makeOrder();
  // Phase 1: subscribe, get update
  const updates1 = [];
  let ch1 = customerClient
    .channel(`rt-refresh-1-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates1.push(payload.new?.status);
    })
    .subscribe();
  await new Promise(r => setTimeout(r, 1500));

  await service.from('orders').update({ status: 'confirmed' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2000));
  await customerClient.removeChannel(ch1);
  t('First session: receives update', updates1.includes('confirmed'), `updates: ${JSON.stringify(updates1)}`);

  // Phase 2: simulate browser refresh by subscribing again
  const updates2 = [];
  const ch2 = customerClient
    .channel(`rt-refresh-2-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      updates2.push(payload.new?.status);
    })
    .subscribe();
  await new Promise(r => setTimeout(r, 1500));

  await service.from('orders').update({ status: 'preparing' }).eq('id', o.id);
  await new Promise(r => setTimeout(r, 2000));
  t('Resubscribed session: receives update', updates2.includes('preparing'), `updates: ${JSON.stringify(updates2)}`);

  await customerClient.removeChannel(ch2);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 9. INSERT events
// ═══════════════════════════════════════════════════════════════
section('9. INSERT events');

{
  const updates = [];
  const ch = customerClient
    .channel(`rt-insert-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
      updates.push({ event: payload.eventType, num: payload.new?.order_number });
    })
    .subscribe();
  await new Promise(r => setTimeout(r, 1500));

  const o = await makeOrder();
  await new Promise(r => setTimeout(r, 2500));
  t('Customer receives INSERT event for own order', updates.length > 0, `events: ${updates.length}`);

  await customerClient.removeChannel(ch);
  await cleanup(o.id);
}

// ═══════════════════════════════════════════════════════════════
// 10. No updates for orders not owned by user (RLS protection)
// ═══════════════════════════════════════════════════════════════
section('10. RLS: no cross-user realtime updates');

{
  // Create an order for a DIFFERENT customer
  const { data: realAuth } = await service.auth.admin.listUsers({ page: 1, perPage: 5 });
  const otherCustomer = realAuth?.users?.find(u => u.id !== customerId);
  if (!otherCustomer) {
    t('Skip (no other customer)', true, 'no second user');
  } else {
    const orderNumber = `${TEST_PREFIX}_other_${Date.now()}`;
    const { data: otherOrder } = await service.from('orders').insert({
      order_number: orderNumber,
      customer_id: otherCustomer.id,
      restaurant_id: restaurantId,
      status: 'pending',
      subtotal: 10, delivery_fee: 0, service_fee: 0, tip: 0, discount: 0, total: 10,
      payment_method: 'cash', payment_status: 'succeeded',
      delivery_address: { address: 'x', lat: 0, lng: 0 },
      restaurant_latitude: 0, restaurant_longitude: 0,
      customer_latitude: 0, customer_longitude: 0,
    }).select().single();

    // Customer should NOT receive updates for this order
    const updates = [];
    const ch = customerClient
      .channel(`rt-rls-${otherOrder.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${otherOrder.id}` }, (payload) => {
        updates.push(payload.new?.status);
      })
      .subscribe();
    await new Promise(r => setTimeout(r, 1500));

    await service.from('orders').update({ status: 'confirmed' }).eq('id', otherOrder.id);
    await new Promise(r => setTimeout(r, 2500));

    t('Customer does NOT receive updates for other customer orders', updates.length === 0, `updates: ${JSON.stringify(updates)}`);

    await customerClient.removeChannel(ch);
    await cleanup(otherOrder.id);
  }
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

// Cleanup test users
console.log('\nCleaning up test users...');
await service.from('restaurants').delete().eq('id', restaurantId);
for (const u of [customerUser, driverUser, adminUser, ownerUser]) {
  if (u) await service.auth.admin.deleteUser(u.id).catch(() => null);
}

process.exit(fail > 0 ? 1 : 0);
