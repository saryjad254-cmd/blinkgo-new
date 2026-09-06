#!/usr/bin/env node

import fs from 'node:fs';

const BASE = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const MOCK = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const RESTAURANT_ID = '00000000-0000-0000-0000-000000000020';
const PRODUCT_ID = 'a1111111-0000-0000-0000-000000000001';
const RESTAURANT_POINT = { latitude: 50.9375, longitude: 6.9603, accuracy: 8 };
const CUSTOMER_POINT = { latitude: 50.8275, longitude: 6.9742, accuracy: 8 };
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let passed = 0;
let sessionIndex = 0;

function check(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function session(email, password) {
  sessionIndex += 1;
  const testIp = `10.92.${process.pid % 250}.${sessionIndex}`;
  const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp }, body: JSON.stringify({ email, password }) });
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  check(response.ok && cookie, `${email} signs in`);
  return async (path, init = {}) => {
    const response = await fetch(`${BASE}${path}`, { ...init, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
  };
}

const customer = await session('demo@blinkgo.de', 'DemoCustomer!2024');
const admin = await session('admin@blinkgo.com', 'BlinkGoAdmin2026!');
const driver = await session('driver@blinkgo.com', 'BlinkGoDriver2026!');

async function cleanupDriverFixture() {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE)) {
    throw new Error('Delivery-outcome fixture cleanup is restricted to a local test server');
  }
  await driver('/api/driver/location', { method: 'POST', body: JSON.stringify(RESTAURANT_POINT) });
  const online = await driver('/api/driver/online', { method: 'POST', body: JSON.stringify({ is_online: true }) });
  if (!online.ok) throw new Error(`Could not prepare local driver fixture: ${JSON.stringify(online.body)}`);
  const active = await driver('/api/driver/active-order');
  const order = active.body?.data?.order ?? active.body?.order ?? null;
  if (order) {
    const isInTransit = ['picked_up', 'delivering'].includes(order.status);
    const action = isInTransit ? 'fail-delivery' : 'reject';
    const released = await driver(`/api/driver/orders/${order.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify(isInTransit
        ? { reason_code: 'unsafe_location', details: 'Local delivery-outcome fixture cleanup', contact_attempts: 0 }
        : { reason_code: 'other', details: 'Local delivery-outcome fixture cleanup' }),
    });
    if (!released.ok) {
      throw new Error(`Could not release stale local order ${order.id}: ${JSON.stringify(released.body)}`);
    }
  }
  // Keep the fixture offline while the restaurant moves the order to ready;
  // otherwise the production auto-dispatch path assigns it before this test
  // can exercise the separate driver-acceptance contract.
  const offline = await driver('/api/driver/online', { method: 'POST', body: JSON.stringify({ is_online: false }) });
  if (!offline.ok) throw new Error(`Could not reset local driver availability: ${JSON.stringify(offline.body)}`);
}

await cleanupDriverFixture();
const configuration = { selected_modifiers: { size: ['s'], crust: ['classic'] } };
const validation = await fetch(`${BASE}/api/cart/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurant_id: RESTAURANT_ID, items: [{ product_id: PRODUCT_ID, quantity: 2, ...configuration }] }) }).then((response) => response.json());
const items = [{ product_id: PRODUCT_ID, quantity: 2, config_key: validation.lines?.[0]?.config_key, configuration }];
check(validation.ok && items[0].config_key, 'Server derives a canonical order line');

async function createOrder(handoff) {
  const placed = await customer('/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': `delivery-outcome-${handoff}-${Date.now()}-${Math.random()}` },
    body: JSON.stringify({
      restaurant_id: RESTAURANT_ID,
      fulfillment_type: 'delivery',
      payment_method: 'cash',
      items,
      delivery_address: {
        address: 'Flach-Fengler-Straße 120, 50389 Wesseling', lat: CUSTOMER_POINT.latitude, lng: CUSTOMER_POINT.longitude,
        delivery_preferences: { handoff, recipient_name: 'Demo Customer', bell_name: 'Customer', floor: '2', instructions: 'Bitte leise klingeln' },
      },
    }),
  });
  if (!placed.ok) console.error('CREATE_DEBUG', JSON.stringify(placed));
  const orderId = placed.body?.data?.order?.id;
  check(placed.ok && orderId, `${handoff} order is created`);
  for (const status of ['confirmed', 'preparing', 'ready']) {
    const transition = await admin('/api/orders/status', { method: 'PATCH', body: JSON.stringify({ order_id: orderId, status }) });
    check(transition.ok, `Order reaches ${status}`);
  }
  return orderId;
}

async function assignAndReachCustomer(orderId) {
  await driver('/api/driver/location', { method: 'POST', body: JSON.stringify(RESTAURANT_POINT) });
  const online = await driver('/api/driver/online', { method: 'POST', body: JSON.stringify({ is_online: true }) });
  check(online.ok, 'Driver goes online');
  const accepted = await driver(`/api/driver/orders/${orderId}/accept`, { method: 'POST' });
  if (!accepted.ok) console.error('ACCEPT_DEBUG', JSON.stringify(accepted));
  check(accepted.ok, 'Driver atomically accepts the delivery');
  const pickupArrival = await driver(`/api/driver/orders/${orderId}/arrive`, { method: 'POST', body: JSON.stringify({ stage: 'pickup' }) });
  check(pickupArrival.ok, 'Driver records geofenced restaurant arrival');
  const pickup = await driver(`/api/driver/orders/${orderId}/pickup`, { method: 'POST' });
  check(pickup.ok, 'Driver confirms pickup');
  await driver('/api/driver/location', { method: 'POST', body: JSON.stringify({ ...CUSTOMER_POINT, active_order_id: orderId }) });
  const dropoffArrival = await driver(`/api/driver/orders/${orderId}/arrive`, { method: 'POST', body: JSON.stringify({ stage: 'dropoff' }) });
  check(dropoffArrival.ok, 'Driver records geofenced customer arrival');
}

const leaveDoorOrder = await createOrder('leave_at_door');
await assignAndReachCustomer(leaveDoorOrder);
const missingPhoto = await driver(`/api/driver/orders/${leaveDoorOrder}/complete`, { method: 'POST', body: JSON.stringify({}) });
check(missingPhoto.status === 400, 'Leave-at-door completion rejects missing photo');
const fakePhoto = await driver(`/api/driver/orders/${leaveDoorOrder}/complete`, { method: 'POST', body: JSON.stringify({ delivery_photo: 'data:image/png;base64,Zm9v' }) });
check(fakePhoto.status === 400, 'Server rejects image content that does not match its MIME type');
const completed = await driver(`/api/driver/orders/${leaveDoorOrder}/complete`, { method: 'POST', body: JSON.stringify({ delivery_photo: PNG_1X1 }) });
if (!completed.ok) console.error('COMPLETE_DEBUG', JSON.stringify(completed));
check(completed.ok && completed.body?.data?.order?.status === 'delivered', 'Valid private photo completes leave-at-door delivery');
const duplicateComplete = await driver(`/api/driver/orders/${leaveDoorOrder}/complete`, { method: 'POST', body: JSON.stringify({ delivery_photo: PNG_1X1 }) });
check(duplicateComplete.status === 409, 'Completion cannot run twice');
const proof = await customer(`/api/orders/${leaveDoorOrder}/delivery-proof`);
check(proof.ok && proof.body?.data?.proof?.url && proof.body?.data?.proof?.expires_at, 'Customer receives a short-lived signed proof URL');
const publicOrder = await fetch(`${MOCK}/rest/v1/orders?id=eq.${leaveDoorOrder}&select=id,delivery_photo`, { headers: { Accept: 'application/vnd.pgrst.object+json' } }).then((response) => response.json());
check(!publicOrder.delivery_photo, 'Orders table contains no Base64 delivery photo');

await driver('/api/driver/online', { method: 'POST', body: JSON.stringify({ is_online: false }) });
const failedOrderId = await createOrder('hand_to_me');
await assignAndReachCustomer(failedOrderId);
const tooFewCalls = await driver(`/api/driver/orders/${failedOrderId}/fail-delivery`, { method: 'POST', body: JSON.stringify({ reason_code: 'customer_unreachable', details: 'No answer', contact_attempts: 1 }) });
check(tooFewCalls.status === 400, 'Customer-unreachable outcome requires two contact attempts');
const failed = await driver(`/api/driver/orders/${failedOrderId}/fail-delivery`, { method: 'POST', body: JSON.stringify({ reason_code: 'customer_unreachable', details: 'Called twice and rang the bell', contact_attempts: 2 }) });
if (!failed.ok) console.error('FAILED_DELIVERY_DEBUG', JSON.stringify(failed));
check(failed.ok && failed.body?.data?.order?.status === 'could_not_deliver', 'Failed delivery becomes an auditable support case');
const outcome = await fetch(`${MOCK}/rest/v1/order_failed_deliveries?order_id=eq.${failedOrderId}&select=*`, { headers: { Accept: 'application/vnd.pgrst.object+json' } }).then((response) => response.json());
check(outcome.reason_code === 'customer_unreachable' && outcome.contact_attempts === 2, 'Failure reason and contact attempts persist');
const repeatedFailure = await driver(`/api/driver/orders/${failedOrderId}/fail-delivery`, { method: 'POST', body: JSON.stringify({ reason_code: 'customer_unreachable', contact_attempts: 2 }) });
check(repeatedFailure.status === 409, 'Failed-delivery outcome cannot run twice');

const migration = fs.readFileSync(new URL('../supabase/migrations/20260814014408_secure_delivery_outcomes.sql', import.meta.url), 'utf8');
check(/revoke all on public\.order_delivery_proofs from public, anon, authenticated/i.test(migration), 'Proof metadata is denied to browser roles');
check(/file_size_limit[\s\S]*3145728/i.test(migration) && /interval '30 days'/i.test(migration), 'Private bucket enforces size and 30-day retention');
const retentionRoute = fs.readFileSync(new URL('../app/api/cron/delivery-proof-retention/route.ts', import.meta.url), 'utf8');
check(/if \(!expected \|\| !provided\) return false/.test(retentionRoute), 'Retention job fails closed when CRON_SECRET is missing');

console.log(`Delivery outcomes workflow: PASS (${passed}/${passed}) DELIVERED=${leaveDoorOrder} FAILED=${failedOrderId}`);
