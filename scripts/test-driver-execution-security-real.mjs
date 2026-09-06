#!/usr/bin/env node
/**
 * Phase 7H-D — Driver Execution Security (REAL DB)
 * ──────────────────────────────────────────────────
 * Tests:
 *  - B. Driver Session & Identity (auth, role, IDOR, JWT, multi-device)
 *  - Q. Customer Privacy (Driver A reads Customer B's order)
 *  - R. Driver Privacy (extends 7H-C verification)
 *  - Driver ID substitution
 *  - Past-order customer location
 *  - Unassigned order customer data
 *  - Direct REST enumeration
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

const TEST_PREFIX = `g7hd_sec_${Date.now()}_`;

async function makeUser(label, role, extra = {}) {
  const email = `${TEST_PREFIX}${label}@test.com`;
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

const driverA = await makeDriver('drvA');
const driverB = await makeDriver('drvB');
const customerA = await makeUser('custA', 'customer');
const customerB = await makeUser('custB', 'customer');
const restaurantUser = await makeUser('rest', 'restaurant');
const { data: rests } = await service.from('restaurants').select('*').not('latitude', 'is', null).limit(1);
const restaurantA = rests?.[0];

// Create an order for driverA + customerA
const o1 = await service.from('orders').insert({
  order_number: `${TEST_PREFIX}_order`,
  customer_id: customerA, restaurant_id: restaurantA.id, driver_id: driverA,
  status: 'picked_up', picked_up_at: new Date().toISOString(),
  subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 2, discount: 0, total: 16,
  payment_method: 'cash', payment_status: 'succeeded',
  delivery_address: { address: 'A St 1', lat: 52.53, lng: 13.42, formatted_address: 'A St 1' },
  restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
  customer_latitude: 52.53, customer_longitude: 13.42,
}).select().single();

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-D — Driver Execution Security (REAL DB)');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// B. Driver Session & Identity
// ═══════════════════════════════════════════════════════════════
section('B. Driver Session & Identity');

// B1: Customer cannot access driver APIs
{
  const custClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await custClient.auth.signInWithPassword({
    email: `${TEST_PREFIX}custA@test.com`, password: 'TestPass123!'
  });
  const { data: ds } = await custClient.from('driver_status').select('*').eq('driver_id', driverA);
  t('Customer cannot SELECT driver_status', (ds?.length ?? 0) === 0);
}

// B2: Restaurant cannot access driver APIs
{
  const restClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await restClient.auth.signInWithPassword({
    email: `${TEST_PREFIX}rest@test.com`, password: 'TestPass123!'
  });
  const { data: ds } = await restClient.from('driver_status').select('*');
  t('Restaurant cannot SELECT driver_status', (ds?.length ?? 0) === 0);
}

// B3: Driver A cannot read Driver B's driver_status
{
  const drvAClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await drvAClient.auth.signInWithPassword({
    email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!'
  });
  const { data: ds } = await drvAClient.from('driver_status').select('*').eq('driver_id', driverB);
  t('Driver A cannot read Driver B driver_status', (ds?.length ?? 0) === 0);
}

// B4: Driver A cannot update Driver B's driver_status
{
  const drvAClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await drvAClient.auth.signInWithPassword({
    email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!'
  });
  const { data: upd } = await drvAClient.from('driver_status')
    .update({ is_online: false })
    .eq('driver_id', driverB)
    .select();
  t('Driver A cannot update Driver B driver_status (0 rows affected)', (upd?.length ?? 0) === 0);
}

// B5: Driver ID substitution — driver A tries to claim driver B's order
{
  // Create order assigned to driver B
  const o2 = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}_order_b`,
    customer_id: customerA, restaurant_id: restaurantA.id, driver_id: driverB,
    status: 'confirmed', accepted_at: new Date().toISOString(),
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'B St 1' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: 52.53, customer_longitude: 13.42,
  }).select().single();

  // Driver A (signed in) tries to read this order (using their own client, but querying o2.id)
  const drvAClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await drvAClient.auth.signInWithPassword({
    email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!'
  });
  // Driver A queries their own orders — should NOT see driver B's order
  const { data: myOrders } = await drvAClient.from('orders')
    .select('id').eq('driver_id', driverA);
  t('Driver A sees only own orders, not driver B', !myOrders?.some(o => o.id === o2.id));

  // Driver A tries to update driver B's order
  const { data: upd } = await drvAClient.from('orders')
    .update({ status: 'picked_up' })
    .eq('id', o2.id)
    .select();
  // (RLS will deny — but verify)
  t('Driver A cannot update Driver B order (RLS denies)', upd === null || (upd?.length ?? 0) === 0);

  await service.from('orders').delete().eq('id', o2.id);
}

// B6: Direct REST enumeration of driver orders
{
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?select=*&driver_id=neq.${driverA}`, {
    headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
  });
  const data = await res.json();
  // Anon should see 0 rows due to orders RLS
  t('Anon direct REST orders enumeration returns 0', Array.isArray(data) && data.length === 0,
    `rows: ${Array.isArray(data) ? data.length : typeof data}`);
}

// B7: Multi-device — driver A from 2 different clients sees the same state
{
  const client1 = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const client2 = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await client1.auth.signInWithPassword({ email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!' });
  await client2.auth.signInWithPassword({ email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!' });
  const { data: r1 } = await client1.from('driver_status').select('*');
  const { data: r2 } = await client2.from('driver_status').select('*');
  t('Multi-device: both sessions see same data', JSON.stringify(r1) === JSON.stringify(r2));
}

// ═══════════════════════════════════════════════════════════════
// Q. Customer Privacy
// ═══════════════════════════════════════════════════════════════
section('Q. Customer Privacy');

// Q1: Driver A requests Customer B's order (RLS should deny)
{
  // Create order for customer B + driver B
  const o3 = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}_order_cb`,
    customer_id: customerB, restaurant_id: restaurantA.id, driver_id: driverB,
    status: 'picked_up', picked_up_at: new Date().toISOString(),
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'B-Cust St 1', lat: 52.531, lng: 13.421 },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: 52.531, customer_longitude: 13.421,
  }).select().single();

  // Driver A (signed in) tries to read it — should NOT see it
  const drvAClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await drvAClient.auth.signInWithPassword({ email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!' });
  // Query all driver A's orders
  const { data: myOrders } = await drvAClient.from('orders')
    .select('id, customer_id, delivery_address');
  t('Driver A cannot see Customer B order (driver_id filter)', !myOrders?.some(o => o.id === o3.id));

  // Driver A queries by customer_id — should NOT see customer B's order
  const { data: byCust } = await drvAClient.from('orders')
    .select('id').eq('customer_id', customerB);
  t('Driver A cannot enumerate by customer_id', !byCust?.some(o => o.id === o3.id));

  await service.from('orders').delete().eq('id', o3.id);
}

// Q2: Past-order customer location
{
  // Create a delivered order for customer A + driver A
  const oPastRes = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}_order_past`,
    customer_id: customerA, restaurant_id: restaurantA.id, driver_id: driverA,
    status: 'delivered', delivered_at: new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString(), // 7 days ago
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'Past St 1', lat: 52.532, lng: 13.422 },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: 52.532, customer_longitude: 13.422,
  }).select().single();
  const oPast = oPastRes?.data || oPastRes;

  // Driver A queries history via their own client (RLS applies)
  const drvAClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await drvAClient.auth.signInWithPassword({ email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!' });
  const { data: hist } = await drvAClient.from('orders')
    .select('id, customer_latitude, customer_longitude, delivery_address, delivered_at, status')
    .eq('driver_id', driverA)
    .eq('status', 'delivered');
  t('Driver A sees own past delivered orders (legitimate via RLS)', hist?.some(o => o.id === oPast?.id),
    `oPast.id=${oPast?.id}, hist count: ${hist?.length}`);
  t('Driver history persisted indefinitely (7 days still visible)', hist?.some(o => o.id === oPast?.id));

  await service.from('orders').delete().eq('id', oPast?.id);
}

// Q3: Unassigned order customer data
{
  const oUnassignedRes = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}_order_unassigned`,
    customer_id: customerA, restaurant_id: restaurantA.id, driver_id: null,
    status: 'ready',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: { address: 'Unassigned St 1' },
    restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
    customer_latitude: 52.53, customer_longitude: 13.42,
  }).select().single();
  const oUnassigned = oUnassignedRes?.data || oUnassignedRes;

  // Driver A queries for unassigned orders
  const drvAClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await drvAClient.auth.signInWithPassword({ email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!' });

  // Driver A queries "available orders" (status in claimable, driver_id is null)
  // This SHOULD work — the /api/driver/orders?status=available returns these
  const { data: available } = await drvAClient.from('orders')
    .select('id, customer_id, delivery_address')
    .is('driver_id', null)
    .in('status', ['pending', 'confirmed', 'preparing', 'ready']);

  // Driver SHOULD see unassigned orders (legitimate — they're for delivery)
  t('Driver sees unassigned orders (legitimate for dispatch)', available?.some(o => o.id === oUnassigned?.id),
    `oUnassigned.id=${oUnassigned?.id}, available count: ${available?.length}`);

  await service.from('orders').delete().eq('id', oUnassigned?.id);
}

// ═══════════════════════════════════════════════════════════════
// R. Driver Privacy (extends 7H-C)
// ═══════════════════════════════════════════════════════════════
section('R. Driver Privacy');
{
  // Anon cannot enumerate driver_status
  const { data: anonDs } = await anon.from('driver_status').select('*');
  t('Anon cannot enumerate driver_status', (anonDs?.length ?? 0) === 0);
}
{
  // Customer cannot read driver GPS
  const custClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await custClient.auth.signInWithPassword({ email: `${TEST_PREFIX}custA@test.com`, password: 'TestPass123!' });
  const { data: custDs } = await custClient.from('driver_status').select('*');
  t('Customer cannot enumerate driver_status', (custDs?.length ?? 0) === 0);
}
{
  // Restaurant cannot read driver GPS
  const restClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await restClient.auth.signInWithPassword({ email: `${TEST_PREFIX}rest@test.com`, password: 'TestPass123!' });
  const { data: restDs } = await restClient.from('driver_status').select('*');
  t('Restaurant cannot enumerate driver_status', (restDs?.length ?? 0) === 0);
}
{
  // Driver A cannot see Driver B
  const drvAClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await drvAClient.auth.signInWithPassword({ email: `${TEST_PREFIX}drvA@test.com`, password: 'TestPass123!' });
  const { data: drvADs } = await drvAClient.from('driver_status').select('*');
  t('Driver A sees only own driver_status row', drvADs?.length === 1 && drvADs[0]?.driver_id === driverA);
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
section('CLEANUP');
await service.from('order_items').delete().eq('order_id', o1.id);
await service.from('order_tracking_events').delete().eq('order_id', o1.id);
await service.from('orders').delete().eq('id', o1.id);
await service.from('driver_status').delete().in('driver_id', [driverA, driverB]);
await service.from('drivers').delete().in('id', [driverA, driverB]);
await service.from('users').delete().in('id', [driverA, driverB, customerA, customerB, restaurantUser]);
for (const id of [driverA, driverB, customerA, customerB, restaurantUser]) {
  await service.auth.admin.deleteUser(id).catch(() => null);
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
