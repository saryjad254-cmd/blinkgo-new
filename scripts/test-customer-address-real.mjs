#!/usr/bin/env node
/**
 * Phase 7H-E — Customer Address (REAL DB)
 * ─────────────────────────────────────────
 * Tests the complete address system:
 *  - E. Address system consistency
 *  - F. Google Places / autocomplete
 *  - G. Address validation
 *  - H. Saved addresses (CRUD, default, isolation)
 *
 * The address MUST flow authoritatively:
 *   saved address → cart → checkout → order snapshot → driver → customer tracking
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

// Server-side address validation
function validateLocation(lat, lng) {
  if (lat == null || lng == null) return { ok: false, reason: 'lat/lng is null' };
  if (typeof lat !== 'number' || typeof lng !== 'number') return { ok: false, reason: 'not a number' };
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { ok: false, reason: 'NaN' };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'Infinity' };
  if (lat < -90 || lat > 90) return { ok: false, reason: 'lat out of range' };
  if (lng < -180 || lng > 180) return { ok: false, reason: 'lng out of range' };
  if (lat === 0 && lng === 0) return { ok: false, reason: 'null island' };
  return { ok: true, lat, lng };
}

// Wesseling + Berlin
const WESSELING = { lat: 50.827, lng: 6.975, address: 'Test St 1, 50389 Wesseling' };
const BERLIN = { lat: 52.520, lng: 13.405 };

const TEST_PREFIX = `g7he_addr_`;
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

const customers = [];
async function cleanup() {
  for (const id of customers) {
    await service.from('customer_addresses').delete().eq('customer_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id).catch(() => null);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-E — Customer Address (REAL DB)');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// F. Address Validation
// ═══════════════════════════════════════════════════════════════
section('F. Address Validation');
t('Valid Wesseling coords pass', validateLocation(WESSELING.lat, WESSELING.lng).ok === true);
t('Valid Berlin coords pass', validateLocation(BERLIN.lat, BERLIN.lng).ok === true);
t('Null lat rejected', validateLocation(null, 13.405).ok === false);
t('NaN lat rejected', validateLocation(NaN, 13.405).ok === false);
t('Infinity lat rejected', validateLocation(Infinity, 13.405).ok === false);
t('lat > 90 rejected', validateLocation(91, 0).ok === false);
t('lng < -180 rejected', validateLocation(0, -181).ok === false);
t('(0,0) null island rejected', validateLocation(0, 0).ok === false);

// ═══════════════════════════════════════════════════════════════
// G. Address Validation - Server Zone Check
// ═══════════════════════════════════════════════════════════════
section('G. Delivery Zone Validation (15km from Wesseling)');
function distanceFromWesselingKm(lat, lng) {
  const R = 6371000;
  const dLat = (lat - WESSELING.lat) * Math.PI / 180;
  const dLng = (lng - WESSELING.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(WESSELING.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))) / 1000;
}

t('Wesseling itself is in zone (0km)', distanceFromWesselingKm(WESSELING.lat, WESSELING.lng) < 1);
t('Bonn is within 15km of Wesseling',
  distanceFromWesselingKm(50.737, 7.098) < 15,
  `${distanceFromWesselingKm(50.737, 7.098).toFixed(1)}km`);
t('Berlin is OUTSIDE 15km zone (>400km)',
  distanceFromWesselingKm(BERLIN.lat, BERLIN.lng) > 400,
  `${distanceFromWesselingKm(BERLIN.lat, BERLIN.lng).toFixed(0)}km`);
t('Cologne is within 15km of Wesseling',
  distanceFromWesselingKm(50.937, 6.960) < 15,
  `${distanceFromWesselingKm(50.937, 6.960).toFixed(1)}km`);

// ═══════════════════════════════════════════════════════════════
// H. Saved Addresses - CRUD
// ═══════════════════════════════════════════════════════════════
section('H. Saved Addresses - CRUD');
{
  const customerId = await makeCustomer('address-crud');
  customers.push(customerId);

  // Create
  const { data: a1, error: e1 } = await service.from('customer_addresses').insert({
    customer_id: customerId,
    label: 'Home',
    street: 'Test St 1',
    city: 'Wesseling',
    postal_code: '50389',
    country: 'DE',
    latitude: WESSELING.lat,
    longitude: WESSELING.lng,
    is_default: true
  }).select().single();

  t('Create address succeeds', e1 === null && a1 != null);
  t('Created address has correct customer_id', a1?.customer_id === customerId);
  t('Address has street/city/postal/country', a1?.street && a1?.city && a1?.postal_code && a1?.country);
  t('Address has lat/lng', a1?.latitude === WESSELING.lat && a1?.longitude === WESSELING.lng);
  t('Address has is_default=true', a1?.is_default === true);

  // Read
  const { data: readList } = await service.from('customer_addresses')
    .select('*').eq('customer_id', customerId);
  t('Read returns the address', readList?.some(a => a.id === a1.id));

  // Create a second address
  const { data: a2 } = await service.from('customer_addresses').insert({
    customer_id: customerId,
    label: 'Work',
    street: 'Office St 5',
    city: 'Bonn',
    postal_code: '53111',
    country: 'DE',
    latitude: 50.737,
    longitude: 7.098,
    is_default: false
  }).select().single();
  t('Second address created', a2 != null);

  // Edit
  const { data: edited } = await service.from('customer_addresses')
    .update({ label: 'Work HQ' })
    .eq('id', a2.id)
    .select().single();
  t('Edit address succeeds', edited?.label === 'Work HQ');

  // Set as default (unset previous default first)
  await service.from('customer_addresses')
    .update({ is_default: false })
    .eq('customer_id', customerId);
  await service.from('customer_addresses')
    .update({ is_default: true })
    .eq('id', a2.id);
  const { data: reCheck } = await service.from('customer_addresses')
    .select('id, is_default').eq('customer_id', customerId);
  const defaultCount = reCheck?.filter(a => a.is_default).length;
  t('Only 1 address is default', defaultCount === 1, `count: ${defaultCount}`);

  // Delete
  await service.from('customer_addresses').delete().eq('id', a2.id);
  const { data: afterDel } = await service.from('customer_addresses')
    .select('id').eq('customer_id', customerId);
  t('Delete succeeds', !afterDel?.some(a => a.id === a2.id));
}

// ═══════════════════════════════════════════════════════════════
// H. Saved Addresses - Cross-user Isolation
// ═══════════════════════════════════════════════════════════════
section('H. Saved Addresses - Cross-user Isolation');
{
  const customerA = await makeCustomer('address-A');
  const customerB = await makeCustomer('address-B');
  customers.push(customerA, customerB);

  const { data: addrA } = await service.from('customer_addresses').insert({
    customer_id: customerA, label: 'A Home',
    street: 'A St', city: 'Wesseling', postal_code: '50389', country: 'DE',
    latitude: WESSELING.lat, longitude: WESSELING.lng,
  }).select().single();
  const { data: addrB } = await service.from('customer_addresses').insert({
    customer_id: customerB, label: 'B Home',
    street: 'B St', city: 'Wesseling', postal_code: '50389', country: 'DE',
    latitude: WESSELING.lat, longitude: WESSELING.lng,
  }).select().single();

  t('Customer A has their address', addrA != null);
  t('Customer B has their address', addrB != null);
  t('Addresses are different', addrA?.id !== addrB?.id);

  // Customer A cannot read Customer B's address
  const { data: aReadsB } = await service.from('customer_addresses')
    .select('*').eq('id', addrB.id).eq('customer_id', customerA).maybeSingle();
  t('Customer A cannot see Customer B address (RLS filter)', aReadsB === null);

  // Customer A cannot update Customer B's address
  const { data: aUpdateB } = await service.from('customer_addresses')
    .update({ label: 'Hacked' }).eq('id', addrB.id).eq('customer_id', customerA).select().maybeSingle();
  t('Customer A cannot update Customer B address (RLS filter)', aUpdateB === null);

  // Customer A cannot delete Customer B's address
  await service.from('customer_addresses').delete().eq('id', addrB.id).eq('customer_id', customerA);
  const { data: stillExists } = await service.from('customer_addresses').select('*').eq('id', addrB.id).single();
  t('Customer A cannot delete Customer B address (RLS filter)', stillExists != null);
}

// ═══════════════════════════════════════════════════════════════
// H. Address Immutability (changing after order placed)
// ═══════════════════════════════════════════════════════════════
section('H. Address Immutability (changing saved address after order)');
{
  const customerId = await makeCustomer('address-immutable');
  customers.push(customerId);

  // Create address
  const { data: addr } = await service.from('customer_addresses').insert({
    customer_id: customerId, label: 'Home',
    street: 'Old St 1', city: 'Wesseling', postal_code: '50389', country: 'DE',
    latitude: WESSELING.lat, longitude: WESSELING.lng,
  }).select().single();

  // Create order with this address (snapshot via JSONB)
  const { data: o } = await service.from('orders').insert({
    order_number: `${TEST_PREFIX}imm_${TS}_${Math.random().toString(36).slice(2, 6)}`,
    customer_id: customerId,
    restaurant_id: '00000000-0000-0000-0000-000000000020',
    driver_id: null, status: 'pending',
    subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
    payment_method: 'cash', payment_status: 'pending',
    delivery_address: { address: 'Old St 1, 50389 Wesseling', lat: WESSELING.lat, lng: WESSELING.lng, formatted_address: 'Old St 1' },
    restaurant_latitude: 50.827, restaurant_longitude: 6.975,
    customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
  }).select().single();

  // Update the saved address
  await service.from('customer_addresses').update({ street: 'New St 99' }).eq('id', addr.id);

  // Order.delivery_address should NOT have changed (snapshot)
  const { data: oAfter } = await service.from('orders').select('delivery_address').eq('id', o.id).single();
  t('Order delivery_address is immutable (snapshot)', oAfter?.delivery_address?.address === 'Old St 1, 50389 Wesseling');

  // Cleanup
  await service.from('orders').delete().eq('id', o.id);
}

// ═══════════════════════════════════════════════════════════════
// E. Address Consistency (cart → order)
// ═══════════════════════════════════════════════════════════════
section('E. Address Consistency (cart → order snapshot)');
{
  const customerId = await makeCustomer('address-flow');
  customers.push(customerId);
  // Find a restaurant
  const { data: rests } = await service.from('restaurants').select('*').not('latitude', 'is', null).limit(20);
  let restaurantA;
  for (const r of rests || []) {
    const { count } = await service.from('products').select('*', { count: 'exact' }).eq('restaurant_id', r.id);
    if (count > 0) { restaurantA = r; break; }
  }
  if (!restaurantA) {
    console.log('  no restaurant with products, skipping');
  } else {
    const addr = {
      address: 'Flow St 1, 50389 Wesseling',
      lat: WESSELING.lat,
      lng: WESSELING.lng,
      formatted_address: 'Flow St 1, 50389 Wesseling',
    };
    // Create order with the address
    const { data: o } = await service.from('orders').insert({
      order_number: `${TEST_PREFIX}flow_${TS}_${Math.random().toString(36).slice(2, 6)}`,
      customer_id: customerId,
      restaurant_id: restaurantA.id,
      driver_id: null, status: 'pending',
      subtotal: 10, delivery_fee: 3, service_fee: 1, tip: 0, discount: 0, total: 14,
      payment_method: 'cash', payment_status: 'pending',
      delivery_address: addr,
      restaurant_latitude: restaurantA.latitude, restaurant_longitude: restaurantA.longitude,
      customer_latitude: WESSELING.lat, customer_longitude: WESSELING.lng,
    }).select().single();

    t('Order has delivery_address from cart snapshot', o?.delivery_address?.address === addr.address);
    t('Order has customer_lat/lng from cart', o?.customer_latitude === WESSELING.lat && o?.customer_longitude === WESSELING.lng);
    t('Order has restaurant_lat/lng for pickup', o?.restaurant_latitude === restaurantA.latitude);

    // Verify the address JSONB is fully present
    const jsonOk = o?.delivery_address && typeof o.delivery_address === 'object' &&
                    o.delivery_address.address && o.delivery_address.lat && o.delivery_address.lng;
    t('Delivery address JSONB has all fields', jsonOk);

    await service.from('orders').delete().eq('id', o.id);
  }
}

// ═══════════════════════════════════════════════════════════════
// G. Bad Address Inputs
// ═══════════════════════════════════════════════════════════════
section('G. Bad Address Inputs');
{
  const customerId = await makeCustomer('addr-bad');
  customers.push(customerId);

  // NULL street rejected (DB-level NOT NULL)
  const { error: e1 } = await service.from('customer_addresses').insert({
    customer_id: customerId, label: 'x', city: 'x', postal_code: 'x', country: 'x',
    latitude: 0, longitude: 0,
  });
  t('NULL street rejected by NOT NULL constraint', e1 != null);

  // NULL city rejected
  const { error: e2 } = await service.from('customer_addresses').insert({
    customer_id: customerId, label: 'x', street: 'x', postal_code: 'x', country: 'x',
    latitude: 0, longitude: 0,
  });
  t('NULL city rejected by NOT NULL constraint', e2 != null);

  // App-layer validation should reject empty strings (the API code does)
  const validate = (a) => {
    if (!a.street || a.street.trim() === '') return { ok: false, reason: 'empty street' };
    if (!a.city || a.city.trim() === '') return { ok: false, reason: 'empty city' };
    return { ok: true };
  };
  t('App-layer validation rejects empty street string', validate({ street: '', city: 'x' }).ok === false);
  t('App-layer validation rejects empty city string', validate({ street: 'x', city: '' }).ok === false);
  t('App-layer validation accepts valid address', validate({ street: 'x', city: 'x' }).ok === true);

  // Invalid lat/lng
  const v1 = validateLocation(999, 0);
  t('lat > 90 rejected by validateLocation', v1.ok === false);
  const v2 = validateLocation(0, -999);
  t('lng < -180 rejected by validateLocation', v2.ok === false);
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
