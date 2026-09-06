#!/usr/bin/env node
/**
 * Phase 7H-C — Customer + Restaurant Privacy Test
 * ────────────────────────────────────────────────
 * Verifies that:
 *  - Customer cannot enumerate driver_status
 *  - Customer cannot read other drivers' GPS coordinates
 *  - Customer CAN read their own active order (legitimate tracking)
 *  - Restaurant cannot enumerate driver_status
 *  - Restaurant cannot read driver GPS coordinates
 *  - Restaurant CAN read orders for their own restaurant
 *
 * The user requested this as a separate verification path.
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

let pass = 0, fail = 0;
const results = [];
function t(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  if (cond) pass++; else fail++;
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(name) { console.log(`\n═══ ${name} ═══`); }

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TS = Date.now();
const testPrefix = `g7hc_cust_rest_${TS}_`;

// Create test users
async function makeUser(label, role, extra = {}) {
  const email = `${testPrefix}${label}_${Math.random().toString(36).slice(2, 6)}@test.com`;
  const { data: u } = await service.auth.admin.createUser({
    email, password: 'TestPass123!', email_confirm: true,
    user_metadata: { name: `Test ${label}`, role, ...extra }
  });
  const id = u?.user?.id;
  await service.from('users').upsert({ id, email, name: `Test ${label}`, role, is_active: true }, { onConflict: 'id' });
  return id;
}

async function makeDriver(label) {
  const id = await makeUser(label, 'driver', { is_online: true });
  await service.from('drivers').upsert({ id, full_name: `Test ${label}`, is_active: true, is_available: true }, { onConflict: 'id' });
  await service.from('driver_status').upsert({
    driver_id: id, is_online: true, is_on_delivery: false, current_order_id: null,
    latitude: 52.5200, longitude: 13.4050, updated_at: new Date().toISOString()
  }, { onConflict: 'driver_id' });
  return id;
}

const driverId = await makeDriver('drv');
const customerId = await makeUser('cust', 'customer');
const restaurantId = await makeUser('rest', 'restaurant');

// Get a real restaurant for the order (not the test restaurantId)
const { data: realRest } = await service.from('restaurants').select('id, owner_id').not('latitude', 'is', null).limit(1).maybeSingle();
if (!realRest) {
  console.error('No real restaurant found');
  process.exit(1);
}

// Make the restaurant user the owner of the real restaurant (for testing)
await service.from('restaurants').update({ owner_id: restaurantId }).eq('id', realRest.id);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-C — Customer + Restaurant Privacy');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// 1. ANON cannot read driver_status
// ═══════════════════════════════════════════════════════════════
section('1. ANON — driver_status');
{
  const { data } = await anon.from('driver_status').select('*');
  t('ANON cannot enumerate driver_status', (data?.length ?? 0) === 0,
    `rows: ${data?.length ?? 'null'}`);
}
{
  const { data } = await anon.from('driver_status').select('latitude, longitude').eq('driver_id', driverId);
  t('ANON cannot read specific driver GPS', (data?.length ?? 0) === 0);
}
{
  const { data } = await anon.from('drivers').select('*');
  t('ANON cannot enumerate drivers', (data?.length ?? 0) === 0);
}

// ═══════════════════════════════════════════════════════════════
// 2. CUSTOMER cannot read driver_status
// ═══════════════════════════════════════════════════════════════
section('2. CUSTOMER — driver_status');
const customerClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
await customerClient.auth.signInWithPassword({
  email: (await service.auth.admin.getUserById(customerId)).data.user.email,
  password: 'TestPass123!'
});

{
  const { data } = await customerClient.from('driver_status').select('*');
  t('CUSTOMER cannot enumerate driver_status', (data?.length ?? 0) === 0,
    `rows: ${data?.length ?? 'null'}`);
}
{
  const { data } = await customerClient.from('driver_status').select('latitude, longitude').eq('driver_id', driverId);
  t('CUSTOMER cannot read specific driver GPS', (data?.length ?? 0) === 0);
}
{
  const { data } = await customerClient.from('drivers').select('*');
  t('CUSTOMER cannot enumerate drivers', (data?.length ?? 0) === 0,
    `rows: ${data?.length ?? 'null'}`);
}

// ═══════════════════════════════════════════════════════════════
// 3. CUSTOMER legitimate tracking still works
// ═══════════════════════════════════════════════════════════════
section('3. CUSTOMER — legitimate tracking');

let orderId;
{
  // Create an order for the customer
  const { data: order } = await service.from('orders').insert({
    order_number: `${testPrefix}_order`,
    customer_id: customerId,
    restaurant_id: realRest.id,
    driver_id: driverId,
    status: 'picked_up',
    picked_up_at: new Date().toISOString(),
    subtotal: 10, delivery_fee: 0, service_fee: 0, tip: 0, discount: 0, total: 10,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'x', lat: 52.5, lng: 13.4 },
    restaurant_latitude: 52.52, restaurant_longitude: 13.405,
    customer_latitude: 52.5, customer_longitude: 13.4,
  }).select().single();
  orderId = order?.id;
}
{
  const { data: myOrder } = await customerClient.from('orders')
    .select('id, driver_id, status, driver_latitude, driver_longitude')
    .eq('id', orderId)
    .maybeSingle();
  t('CUSTOMER can see own active delivery order', myOrder !== null);
  t('CUSTOMER can see driver_id of own delivery', myOrder?.driver_id === driverId);
}
{
  // Create another order for someone else
  const otherCustId = await makeUser('othercust', 'customer');
  const { data: otherOrder } = await service.from('orders').insert({
    order_number: `${testPrefix}_other_order`,
    customer_id: otherCustId,
    restaurant_id: realRest.id,
    driver_id: driverId,
    status: 'picked_up',
    subtotal: 10, delivery_fee: 0, service_fee: 0, tip: 0, discount: 0, total: 10,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'x', lat: 0, lng: 0 },
    restaurant_latitude: 0, restaurant_longitude: 0,
    customer_latitude: 0, customer_longitude: 0,
  }).select().single();
  const { data: notMyOrder } = await customerClient.from('orders')
    .select('*')
    .eq('id', otherOrder.id)
    .maybeSingle();
  t('CUSTOMER cannot see another customer\'s order', notMyOrder === null);

  // Cleanup other order
  await service.from('orders').delete().eq('id', otherOrder.id);
  await service.from('users').delete().eq('id', otherCustId);
  await service.auth.admin.deleteUser(otherCustId).catch(() => null);
}

// ═══════════════════════════════════════════════════════════════
// 4. RESTAURANT cannot read driver_status
// ═══════════════════════════════════════════════════════════════
section('4. RESTAURANT — driver_status');
const restaurantClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
await restaurantClient.auth.signInWithPassword({
  email: (await service.auth.admin.getUserById(restaurantId)).data.user.email,
  password: 'TestPass123!'
});

{
  const { data } = await restaurantClient.from('driver_status').select('*');
  t('RESTAURANT cannot enumerate driver_status', (data?.length ?? 0) === 0,
    `rows: ${data?.length ?? 'null'}`);
}
{
  const { data } = await restaurantClient.from('driver_status').select('latitude, longitude').eq('driver_id', driverId);
  t('RESTAURANT cannot read specific driver GPS', (data?.length ?? 0) === 0);
}
{
  const { data } = await restaurantClient.from('drivers').select('*');
  t('RESTAURANT cannot enumerate drivers', (data?.length ?? 0) === 0,
    `rows: ${data?.length ?? 'null'}`);
}

// ═══════════════════════════════════════════════════════════════
// 5. RESTAURANT can read own orders
// ═══════════════════════════════════════════════════════════════
section('5. RESTAURANT — own orders');
{
  const { data: myOrders } = await restaurantClient.from('orders')
    .select('id, status, driver_id')
    .eq('restaurant_id', realRest.id);
  t('RESTAURANT can see orders for own restaurant', (myOrders?.length ?? 0) >= 1);
}

// ═══════════════════════════════════════════════════════════════
// 6. ADMIN has intended access
// ═══════════════════════════════════════════════════════════════
section('6. ADMIN — verification');
{
  // Find or create an admin
  const { data: adminList } = await service.from('users').select('id, email').in('role', ['admin']).limit(1);
  let realAdmin = adminList?.[0];
  if (!realAdmin) {
    const id = await makeUser('admin2', 'admin');
    realAdmin = { id, email: (await service.auth.admin.getUserById(id)).data.user.email };
  }
  // Use service role to verify admin CAN read all (this is the system-side check)
  // For the auth check, we use the admin policy which is auth.uid() check
  const { data } = await service.from('driver_status').select('*');
  t('ADMIN (via service role) can read all driver_status', (data?.length ?? 0) >= 1);
}

// ═══════════════════════════════════════════════════════════════
// 7. CLEANUP
// ═══════════════════════════════════════════════════════════════
section('CLEANUP');
if (orderId) await service.from('orders').delete().eq('id', orderId);
await service.from('driver_status').delete().eq('driver_id', driverId);
await service.from('drivers').delete().eq('id', driverId);
await service.from('users').delete().in('id', [driverId, customerId, restaurantId]);
for (const id of [driverId, customerId, restaurantId]) {
  await service.auth.admin.deleteUser(id).catch(() => null);
}
// Revert restaurant owner
await service.from('restaurants').update({ owner_id: realRest.owner_id }).eq('id', realRest.id);

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
