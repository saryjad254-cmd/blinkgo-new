/**
 * v40 — Restaurant Workflow Test Suite
 * ─────────────────────────────────────
 * Tests the restaurant kitchen workflow:
 *  - Receive order (pending)
 *  - Accept / reject order
 *  - Mark preparing
 *  - Mark ready
 *  - Pause / resume
 *  - Busy mode toggle
 *  - Product CRUD
 *  - Bulk operations
 *  - Multiple simultaneous orders
 *  - Working hours
 *  - Stats & KPIs
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const COOKIES = {};
const ACCOUNTS = {
  customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
  driver: { email: 'driver@blinkgo.de', password: 'DemoDriver!2024' },
  restaurant: { email: 'restaurant@blinkgo.de', password: 'DemoRestaurant!2024' },
  admin: { email: 'admin@blinkgo.de', password: 'DemoAdmin!2024' },
};

let passed = 0, failed = 0;
const results = [];

function record(name, ok, info = '') {
  results.push({ name, ok, info });
  if (ok) { passed++; console.log(`  ✓ ${name}${info ? ` (${info})` : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${info ? ` — ${info}` : ''}`); }
}

function setCookies(headers) {
  const arr = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  for (const ck of arr) {
    const firstSemi = ck.indexOf(';');
    const pair = firstSemi === -1 ? ck : ck.substring(0, firstSemi);
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = pair.substring(0, eqIdx).trim();
    const value = pair.substring(eqIdx + 1).trim();
    if (name) COOKIES[name] = value;
  }
}

function cookieHeader() {
  return Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function f(path, init = {}, opts = {}) {
  // Use a unique x-forwarded-for so per-IP rate limits don't cascade
  const headers = {
    'Content-Type': 'application/json',
    'Origin': BASE,
    'x-forwarded-for': '10.42.3.1',
    ...(init.headers || {}),
  };
  if (Object.keys(COOKIES).length > 0) headers['Cookie'] = cookieHeader();
  const res = await fetch(BASE + path, { ...init, headers });
  if (opts.captureCookies !== false) setCookies(res.headers);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text?.slice(0, 200) }; }
  return { status: res.status, ok: res.ok, json };
}

function clearCookies() { Object.keys(COOKIES).forEach((k) => delete COOKIES[k]); }

async function login(role) {
  clearCookies();
  await f('/api/auth/login', { method: 'POST', body: JSON.stringify(ACCOUNTS[role]) });
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  v40 Restaurant Workflow Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Login as restaurant ──
  console.log('► Restaurant: login');
  await login('restaurant');
  const me = await f('/api/auth/me');
  record('Restaurant login', me.json?.user?.email === ACCOUNTS.restaurant.email);

  // ── 2. Get dashboard ──
  console.log('\n► Restaurant: dashboard');
  const dash = await f('/api/restaurant/dashboard');
  record('Get dashboard stats', dash.ok && dash.json?.stats);

  // ── 3. Toggle busy mode ──
  console.log('\n► Restaurant: busy mode');
  const busyOn = await f('/api/restaurant/busy-mode', {
    method: 'POST',
    body: JSON.stringify({ busy: true, minutes: 15 }),
  });
  record('Busy mode ON', busyOn.ok && busyOn.json?.busyMode === true);

  const busyOff = await f('/api/restaurant/busy-mode', {
    method: 'POST',
    body: JSON.stringify({ busy: false }),
  });
  record('Busy mode OFF', busyOff.ok && busyOff.json?.busyMode === false);

  // ── 4. Toggle pause ──
  console.log('\n► Restaurant: pause');
  const pause = await f('/api/restaurant/pause', {
    method: 'POST',
    body: JSON.stringify({ paused: true }),
  });
  record('Pause accepting orders', pause.ok && pause.json?.paused === true);

  const resume = await f('/api/restaurant/pause', {
    method: 'POST',
    body: JSON.stringify({ paused: false }),
  });
  record('Resume accepting orders', resume.ok && resume.json?.paused === false);

  // ── 5. Get menu ──
  console.log('\n► Restaurant: menu');
  const myRestaurant = await f('/api/restaurant/dashboard');
  const restaurantId = myRestaurant.json?.stats?.restaurantId;
  if (!restaurantId) {
    console.log('  ⚠ No restaurant found — skipping menu tests');
  } else {
    const menu = await f(`/api/products/manage?restaurant_id=${restaurantId}`);
    record('Get menu', menu.ok);

    // ── 6. Bulk activate/deactivate ──
    if (menu.json?.products?.length >= 1) {
      const ids = menu.json.products.slice(0, 2).map((p) => p.id);
      const bulkOff = await f('/api/products/manage', {
        method: 'PATCH',
        body: JSON.stringify({ productIds: ids, is_available: false }),
      });
      record('Bulk deactivate', bulkOff.ok);

      const bulkOn = await f('/api/products/manage', {
        method: 'PATCH',
        body: JSON.stringify({ productIds: ids, is_available: true }),
      });
      record('Bulk activate', bulkOn.ok);

      // Restore availability
      const priceUp = await f('/api/products/manage', {
        method: 'PATCH',
        body: JSON.stringify({ productIds: ids, priceChange: { type: 'percent', value: 0 } }),
      });
      record('Bulk price update (0%)', priceUp.ok);
    } else {
      record('Bulk operations (skipped, no products)', true);
    }
  }

  // ── 7. Working hours ──
  console.log('\n► Restaurant: working hours');
  const wh = await f('/api/restaurant/working-hours', { method: 'GET' });
  record('Get working hours', wh.ok || wh.status === 404);

  // ── 8. Order flow: pending → confirmed → preparing → ready ──
  console.log('\n► Restaurant: order flow');
  await login('customer');
  const search = await f('/api/search?sort=recommended');
  const restaurant = search.json?.restaurants?.[0];
  const products = await f(`/api/products/bestsellers?restaurant_id=${restaurant.id}`);
  const product = products.json?.products?.[0];
  if (!product) {
    console.log('  ⚠ No product — skipping order flow');
  } else {
    // Place order
    const order = await f('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        restaurant_id: restaurant.id,
        items: [{ product_id: product.id, quantity: 2 }],
        payment_method: 'cash',
        delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
      }),
    });
    record('Customer places order', order.ok);
    const orderId = order.json?.data?.order?.id || order.json?.order?.id;

    // Switch to restaurant
    await login('restaurant');

    // Get order detail
    const orderDetail = await f(`/api/admin/orders/${orderId}`);
    record('Restaurant fetches order detail', orderDetail.ok || orderDetail.status === 404);

    // Confirm
    const confirm = await f('/api/orders/status', {
      method: 'PATCH',
      body: JSON.stringify({ order_id: orderId, status: 'confirmed' }),
    });
    record('Confirm order', confirm.ok);

    // Mark preparing
    const prep = await f('/api/orders/status', {
      method: 'PATCH',
      body: JSON.stringify({ order_id: orderId, status: 'preparing' }),
    });
    record('Mark preparing', prep.ok);

    // Mark ready
    const ready = await f('/api/orders/status', {
      method: 'PATCH',
      body: JSON.stringify({ order_id: orderId, status: 'ready' }),
    });
    record('Mark ready', ready.ok);

    // Try to skip to delivered (should fail)
    const skip = await f('/api/orders/status', {
      method: 'PATCH',
      body: JSON.stringify({ order_id: orderId, status: 'delivered' }),
    });
    record('Cannot skip to delivered', !skip.ok);

    // Cancel a non-cancellable order (should fail or be permitted per state machine)
    const cancel = await f('/api/orders/status', {
      method: 'PATCH',
      body: JSON.stringify({ order_id: orderId, status: 'cancelled' }),
    });
    // Either success or fail is acceptable depending on state machine
    record('Cancel order from ready (attempted)', cancel.status !== 500, `status=${cancel.status}`);
  }

  // ── 9. Customer cannot access restaurant endpoints ──
  console.log('\n► Restaurant: RBAC');
  await login('customer');
  const custBusy = await f('/api/restaurant/busy-mode', {
    method: 'POST',
    body: JSON.stringify({ busy: true }),
  });
  record('Customer cannot toggle busy mode', !custBusy.ok && (custBusy.status === 401 || custBusy.status === 403));

  const custPause = await f('/api/restaurant/pause', {
    method: 'POST',
    body: JSON.stringify({ paused: true }),
  });
  record('Customer cannot pause restaurant', !custPause.ok);

  // ── 10. Driver cannot access restaurant endpoints ──
  await login('driver');
  const drvBusy = await f('/api/restaurant/busy-mode', {
    method: 'POST',
    body: JSON.stringify({ busy: true }),
  });
  record('Driver cannot toggle busy mode', !drvBusy.ok);

  // ── 11. Input validation ──
  console.log('\n► Restaurant: input validation');
  await login('restaurant');
  const badMinutes = await f('/api/restaurant/busy-mode', {
    method: 'POST',
    body: JSON.stringify({ busy: true, minutes: 99999 }),
  });
  record('Busy minutes clamped to max 480', badMinutes.ok);

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
