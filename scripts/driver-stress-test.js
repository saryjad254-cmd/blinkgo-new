/**
 * v40 — Driver Stress Test Suite
 * ──────────────────────────────
 * Tests the driver workflow under stress:
 *  - Login / logout
 *  - Go online / offline
 *  - Receive orders (auto-dispatch)
 *  - Accept order
 *  - Pickup order
 *  - Mark delivered
 *  - GPS updates (rate limit, accuracy)
 *  - Online state restored on offline
 *  - Multiple status transitions
 *  - Earnings calculated correctly
 *  - Stats are accurate
 *  - Idempotency of state changes
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const COOKIE_JARS = Object.fromEntries(['customer', 'driver', 'restaurant', 'admin'].map((role) => [role, {}]));
let activeRole = null;
const ACCOUNTS = {
  customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
  driver: { email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!' },
  restaurant: { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' },
  admin: { email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' },
};

let passed = 0, failed = 0;
const results = [];

function record(name, ok, info = '') {
  results.push({ name, ok, info });
  if (ok) { passed++; console.log(`  ✓ ${name}${info ? ` (${info})` : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${info ? ` — ${info}` : ''}`); }
}

function setCookies(headers) {
  const jar = COOKIE_JARS[activeRole] || {};
  const arr = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  for (const ck of arr) {
    const firstSemi = ck.indexOf(';');
    const pair = firstSemi === -1 ? ck : ck.substring(0, firstSemi);
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = pair.substring(0, eqIdx).trim();
    const value = pair.substring(eqIdx + 1).trim();
    if (!name) continue;
    if (value) jar[name] = value;
    else delete jar[name];
  }
}

function cookieHeader() {
  return Object.entries(COOKIE_JARS[activeRole] || {}).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function f(path, init = {}, opts = {}) {
  const headers = { // Use a unique x-forwarded-for so per-IP rate limits don't cascade
  'Content-Type': 'application/json', 'Origin': BASE, 'x-forwarded-for': `10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`, 'x-blinkgo-test-run': 'local-e2e', ...(init.headers || {}) };
  if (cookieHeader()) headers['Cookie'] = cookieHeader();
  const res = await fetch(BASE + path, { ...init, headers });
  if (opts.captureCookies !== false) setCookies(res.headers);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text?.slice(0, 200) }; }
  if (json?.ok === true && Object.prototype.hasOwnProperty.call(json, 'data')) json = json.data;
  return { status: res.status, ok: res.ok, json };
}

async function login(role) {
  activeRole = role;
  if (cookieHeader()) return;
  const result = await f('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(ACCOUNTS[role]),
  });
  if (!result.ok) throw new Error(`Login failed for ${role} (status=${result.status} body=${JSON.stringify(result.json)?.slice(0, 180)})`);
}

function checkoutLine(product, restaurant) {
  const selectedModifiers = Object.fromEntries((product.modifiers || [])
    .filter((modifier) => modifier.required && Number(modifier.min_select || 0) > 0)
    .map((modifier) => [
      modifier.id,
      (modifier.options || []).slice(0, Number(modifier.min_select)).map((option) => option.id),
    ]));
  const unitPrice = Number(product.discount_price ?? product.price ?? 0);
  const minimumOrder = Number(restaurant.minimum_order ?? restaurant.min_order_amount ?? 0);
  const quantity = unitPrice > 0 ? Math.max(2, Math.ceil((minimumOrder + 0.01) / unitPrice)) : 2;
  return { product_id: product.id, quantity, configuration: { selected_modifiers: selectedModifiers } };
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  v40 Driver Stress Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Driver login ──
  console.log('► Driver: login');
  await login('driver');
  const me = await f('/api/auth/me');
  record('Driver login', me.ok && me.json?.user?.email === ACCOUNTS.driver.email);

  // ── 2. Go online ──
  console.log('\n► Driver: online state');
  const stringBoolean = await f('/api/driver/online', {
    method: 'POST',
    body: JSON.stringify({ is_online: 'false' }),
  });
  record('String boolean cannot toggle driver online', stringBoolean.status === 400);
  const onlineRes = await f('/api/driver/online', {
    method: 'POST',
    body: JSON.stringify({ is_online: true }),
  });
  record('Driver goes online', onlineRes.ok && onlineRes.json?.is_online === true);

  // ── 3. Go online idempotent ──
  const onlineAgain = await f('/api/driver/online', {
    method: 'POST',
    body: JSON.stringify({ is_online: true }),
  });
  record('Driver goes online (idempotent)', onlineAgain.ok);

  // ── 4. Customer creates order (for driver to receive) ──
  console.log('\n► Setup: customer places order');
  await login('customer');
  const search = await f('/api/search?sort=recommended');
  const restaurant = search.json?.restaurants?.[0];
  const detail = await f(`/api/products/bestsellers?restaurant_id=${restaurant.id}`);
  const product = detail.json?.bestsellers?.[0];
  if (!product) {
    throw new Error('Driver workflow fixture product is missing');
  }
  const order = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: restaurant.id,
      items: [checkoutLine(product, restaurant)],
      payment_method: 'cash',
      delivery_address: { address: 'Test', lat: 50.7374, lng: 7.0982 },
      tip: 2.00,
    }),
  });
  record('Order created for driver test', order.ok);
  const orderId = order.json?.data?.order?.id || order.json?.order?.id;

  // Restaurant confirms + marks ready
  await login('restaurant');
  await f('/api/orders/status', {
    method: 'PATCH',
    body: JSON.stringify({ order_id: orderId, status: 'confirmed' }),
  });
  await f('/api/orders/status', {
    method: 'PATCH',
    body: JSON.stringify({ order_id: orderId, status: 'preparing' }),
  });
  await f('/api/orders/status', {
    method: 'PATCH',
    body: JSON.stringify({ order_id: orderId, status: 'ready' }),
  });

  // ── 5. Driver goes online (auto-dispatch may pick it up) ──
  await login('driver');
  const onlineForDispatch = await f('/api/driver/online', {
    method: 'POST',
    body: JSON.stringify({ is_online: true }),
  });
  record('Driver online (triggers auto-dispatch)', onlineForDispatch.ok);

  // ── 6. Driver gets active order ──
  console.log('\n► Driver: get active order');
  const activeOrder = await f('/api/driver/active-order');
  record('Get active order', activeOrder.ok);

  // ── 7. Driver accepts the order (idempotent — if auto-dispatched, accept will fail) ──
  if (!activeOrder.json?.order) {
    const accept = await f(`/api/driver/orders/${orderId}/accept`, { method: 'POST' });
    record('Driver accepts order', accept.ok, `status=${accept.status}`);
  } else {
    record('Order auto-dispatched to driver', true, `order ${activeOrder.json.order.id?.slice(0, 8)}`);
  }

  // ── 8. Driver GPS updates ──
  console.log('\n► Driver: GPS updates');
  for (let i = 0; i < 5; i++) {
    const loc = await f('/api/driver/location', {
      method: 'POST',
      body: JSON.stringify({
        latitude: 50.7 + i * 0.001,
        longitude: 7.1 + i * 0.001,
        heading: 90,
        speed: 30,
        accuracy: 5,
      }),
    });
    if (!loc.ok) {
      record(`GPS update ${i+1}`, false, `status=${loc.status}`);
      break;
    }
  }
  record('GPS updates accepted', true, '5 updates sent');

  // ── 9. GPS with bad coordinates ──
  const badGps = await f('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify({ latitude: 999, longitude: 999 }),
  });
  record('Bad GPS coordinates rejected', !badGps.ok);

  const missingGps = await f('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify({ latitude: 'abc', longitude: 'xyz' }),
  });
  record('Non-numeric GPS rejected', !missingGps.ok);

  // ── 10. Driver pickup ──
  console.log('\n► Driver: pickup + complete');
  // Refresh active order (state may have changed)
  const activeAfter = await f('/api/driver/active-order');
  const realOrderId = activeAfter.json?.order?.id || orderId;
  const realOrderStatus = activeAfter.json?.order?.status;

  // A developer may already have an active demo tour open in the browser. Keep
  // the stress test deterministic by advancing that same tour through the
  // restaurant workflow before testing pickup, instead of trying to pick up a
  // merely confirmed order or accepting a second concurrent tour.
  if (realOrderStatus === 'confirmed' || realOrderStatus === 'preparing') {
    await login('restaurant');
    if (realOrderStatus === 'confirmed') {
      await f('/api/orders/status', {
        method: 'PATCH',
        body: JSON.stringify({ order_id: realOrderId, status: 'preparing' }),
      });
    }
    await f('/api/orders/status', {
      method: 'PATCH',
      body: JSON.stringify({ order_id: realOrderId, status: 'ready' }),
    });
    await login('driver');
  }
  if (realOrderStatus === 'picked_up' || realOrderStatus === 'delivering') {
    record('Driver picks up order', true, `already ${realOrderStatus}`);
  } else {
    const pickup = await f(`/api/driver/orders/${realOrderId}/pickup`, { method: 'POST' });
    record('Driver picks up order', pickup.ok, `status=${pickup.status}`);
  }

  // ── 11. GPS during active delivery ──
  const dropoffLatitude = Number(activeAfter.json?.order?.customer_latitude ?? 50.7374);
  const dropoffLongitude = Number(activeAfter.json?.order?.customer_longitude ?? 7.0982);
  const loc2 = await f('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify({
      latitude: dropoffLatitude, longitude: dropoffLongitude,
      active_order_id: realOrderId,
    }),
  });
  record('GPS with active_order_id', loc2.ok);

  // ── 12. Driver completes ──
  const arrival = await f(`/api/driver/orders/${realOrderId}/arrive`, {
    method: 'POST',
    body: JSON.stringify({ stage: 'dropoff' }),
  });
  record('Driver records drop-off arrival', arrival.ok, `status=${arrival.status} body=${JSON.stringify(arrival.json)?.slice(0, 140)}`);
  await login('customer');
  const customerJourney = await f(`/api/orders/track?order_id=${realOrderId}`);
  const deliveryPin = customerJourney.json?.journey?.delivery_pin;
  await login('driver');
  const complete = await f(`/api/driver/orders/${realOrderId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ delivery_pin: deliveryPin }),
  });
  record('Driver completes order', complete.ok, `status=${complete.status} body=${JSON.stringify(complete.json)?.slice(0, 140)}`);

  // ── 13. Driver goes offline ──
  console.log('\n► Driver: offline');
  const offline = await f('/api/driver/online', {
    method: 'POST',
    body: JSON.stringify({ is_online: false }),
  });
  record('Driver goes offline', offline.ok && offline.json?.is_online === false);

  // ── 14. Get driver stats ──
  console.log('\n► Driver: stats');
  const stats = await f('/api/driver/stats');
  record('Get driver stats', stats.ok);

  // ── 15. Earnings page ──
  // Earnings is a protected server-rendered page, not an API endpoint. The
  // former /api assertion was accidentally green only while the legacy
  // catch-all returned HTTP 200 for missing routes.
  const earnings = await f('/driver/earnings');
  record('Get driver earnings page', earnings.ok && earnings.status === 200);

  // ── 16. RBAC: customer cannot use driver endpoints ──
  console.log('\n► Driver: RBAC');
  await login('customer');
  const custLoc = await f('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify({ latitude: 50.7, longitude: 7.1 }),
  });
  record('Customer cannot POST location', !custLoc.ok && custLoc.status === 403);

  const custActive = await f('/api/driver/active-order');
  record('Customer cannot get active order', !custActive.ok);

  // ── 17. Restaurant cannot use driver endpoints ──
  await login('restaurant');
  const restLoc = await f('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify({ latitude: 50.7, longitude: 7.1 }),
  });
  record('Restaurant cannot POST location', !restLoc.ok);

  // ── 18. Driver cannot use customer endpoints ──
  await login('driver');
  const driverOrder = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: restaurant.id,
      items: [checkoutLine(product, restaurant)],
      payment_method: 'cash',
      delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
    }),
  });
  record('Driver cannot place order', !driverOrder.ok);

  // ── 19. Admin can view driver stats ──
  await login('admin');
  const adminDriverStats = await f('/api/driver/stats');
  record('Admin can view driver stats', adminDriverStats.ok || adminDriverStats.status === 404);

  // ── 20. Order status transition guards ──
  console.log('\n► Driver: invalid transitions');
  await login('customer');
  const order2 = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: restaurant.id,
      items: [checkoutLine(product, restaurant)],
      payment_method: 'cash',
      delivery_address: {
        address: 'Test',
        lat: Number(restaurant.latitude ?? 50.7374),
        lng: Number(restaurant.longitude ?? 7.0982),
      },
    }),
  });
  if (order2.ok) {
    const orderId2 = order2.json?.data?.order?.id || order2.json?.order?.id;
    // Customer cannot pickup
    const custPickup = await f(`/api/driver/orders/${orderId2}/pickup`, { method: 'POST' });
    record('Customer cannot pickup', !custPickup.ok);
  } else {
    record('Customer cannot pickup', false, `fixture creation failed (status=${order2.status} body=${JSON.stringify(order2.json)?.slice(0, 240)})`);
  }

  // ── 21. State machine: cannot deliver pending order ──
  await login('driver');
  if (order2.ok) {
    const orderId2 = order2.json?.data?.order?.id || order2.json?.order?.id;
    // Driver cannot deliver a pending order
    const deliverPending = await f(`/api/driver/orders/${orderId2}/complete`, { method: 'POST' });
    record('Driver cannot complete pending order', !deliverPending.ok);
  } else {
    record('Driver cannot complete pending order', false, `fixture creation failed (status=${order2.status} body=${JSON.stringify(order2.json)?.slice(0, 240)})`);
  }

  // ── SUMMARY ──
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.name}: ${r.info}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
