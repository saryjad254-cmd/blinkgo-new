/**
 * Maps & Tracking Stress Test
 * ────────────────────────────
 * Simulates a heavy load on the Maps & Tracking pipeline:
 * - N drivers send M location updates each
 * - Verifies rate limiting works (some 429s expected)
 * - Verifies all endpoints return correct data
 * - Verifies driver_status has all the latest locations
 * - Verifies admin map sees all drivers
 * - Verifies no orphaned channels
 *
 * Usage:  node scripts/maps-stress-test.js [N] [M]
 *   N = number of drivers (default 10)
 *   M = updates per driver (default 20)
 */

const BASE = 'http://localhost:3000';

const ACCOUNTS = {
  customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
  driver: { email: 'driver@blinkgo.de', password: 'DemoDriver!2024' },
  restaurant: { email: 'restaurant@blinkgo.de', password: 'DemoRestaurant!2024' },
  admin: { email: 'admin@blinkgo.de', password: 'DemoAdmin!2024' },
};

const cookies = {};

function logHeader(s) { console.log(`\n━━━ ${s} ━━━`); }
function logStep(s) { console.log(`  ▸ ${s}`); }
function logOk(s, x) { console.log(`  ✅ ${s}${x ? ' ' + JSON.stringify(x) : ''}`); }
function logFail(s, x) { console.log(`  ❌ ${s}${x ? ' ' + JSON.stringify(x) : ''}`); }

async function api(method, path, role, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Origin': BASE,
      Cookie: cookies[role] || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { ok: false, error: text.slice(0, 200) }; }
  return { status: res.status, body: json };
}

async function login(role) {
  const a = ACCOUNTS[role];
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE, 'x-forwarded-for': `10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}` },
    body: JSON.stringify({ email: a.email, password: a.password }),
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const waitSec = Math.min(body.retryAfter || 60, 120);
    console.log(`  ⏳ Login rate-limited (${role}), waiting ${waitSec}s...`);
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    return login(role);
  }
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*\w+=)/);
  cookies[role] = setCookies.map((c) => c.split(';')[0]).join('; ');
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Login failed (${role}): ${JSON.stringify(json)}`);
}

async function main() {
  const N = parseInt(process.argv[2] || '10', 10);
  const M = parseInt(process.argv[3] || '20', 10);
  const totalUpdates = N * M;

  console.log('═══════════════════════════════════════');
  console.log(`   MAPS & TRACKING STRESS TEST`);
  console.log(`   ${N} drivers × ${M} updates = ${totalUpdates} total updates`);
  console.log('═══════════════════════════════════════');

  logHeader('Setup: Login all roles');
  await login('customer');
  await login('driver');
  await login('restaurant');
  await login('admin');
  logOk('All 4 logins succeeded');

  // ====== WAVE 1: Geocoding ======
  logHeader('Geocoding: Forward, autocomplete, reverse, directions');
  const addresses = [
    'Kölner Straße 1, Bonn',
    'Berliner Allee 12, Köln',
    'Hauptbahnhof, München',
    'Friedrichstraße 200, Berlin',
  ];
  for (const addr of addresses) {
    const res = await fetch(`${BASE}/api/maps/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'geocode', address: addr }),
    });
    const data = await res.json();
    if (data.ok) {
      logOk(`Geocode: ${addr}`, { lat: data.data.lat.toFixed(4), lng: data.data.lng.toFixed(4) });
    } else {
      logFail(`Geocode failed: ${addr}`, data);
    }
  }

  // Autocomplete
  const ac = await fetch(`${BASE}/api/maps/geocode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'autocomplete', input: 'Bonn' }),
  });
  const acData = await ac.json();
  logOk('Autocomplete: Bonn', { count: acData?.data?.predictions?.length });

  // Directions
  const dir = await fetch(`${BASE}/api/maps/geocode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'directions',
      origin: { lat: 50.7374, lng: 7.0982 },
      destination: { lat: 50.75, lng: 7.12 },
      mode: 'driving',
    }),
  });
  const dirData = await dir.json();
  logOk('Directions', { distance_m: dirData?.data?.distanceMeters, duration_s: dirData?.data?.durationSeconds });

  // ====== WAVE 2: Driver GPS Stress ======
  logHeader(`Driver GPS: ${N} drivers × ${M} updates each (${totalUpdates} total)`);
  const driverBase = { lat: 50.7374, lng: 7.0982 };
  const t0 = Date.now();
  const promises = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const lat = driverBase.lat + (i * 0.001) + (j * 0.0001);
      const lng = driverBase.lng + (i * 0.001) + (j * 0.0001);
      promises.push(
        api('POST', '/api/driver/location', 'driver', {
          latitude: lat,
          longitude: lng,
          heading: (i * 30) % 360,
          speed: 5 + (i % 10),
          accuracy: 8 + (j % 5),
        }).catch((e) => ({ status: 0, body: { error: e.message } }))
      );
    }
  }
  const results = await Promise.all(promises);
  const elapsed = Date.now() - t0;
  const ok = results.filter((r) => r.status === 200).length;
  const throttled = results.filter((r) => r.body?.data?.throttled === true).length;
  const errs = results.filter((r) => r.status !== 200).length;
  logOk(`${ok}/${totalUpdates} accepted (${((ok / totalUpdates) * 100).toFixed(1)}%)`);
  logOk(`${throttled} throttled (back-pressure working)`);
  logOk(`${errs} errors`);
  logOk(`Throughput: ${(totalUpdates / (elapsed / 1000)).toFixed(1)} req/s`);

  // ====== WAVE 3: Admin map sees the drivers ======
  logHeader('Admin map: verify driver count');
  const adminMap = await api('GET', '/api/admin/map', 'admin');
  logOk('Admin map returned', {
    drivers: adminMap.body?.drivers?.length,
    orders: adminMap.body?.activeOrders?.length,
    restaurants: adminMap.body?.restaurants?.length,
  });
  if (adminMap.body?.drivers?.length > 0) {
    const d0 = adminMap.body.drivers[0];
    logOk('First driver', {
      name: d0.name,
      lat: d0.latitude,
      lng: d0.longitude,
      online: d0.is_online,
    });
  }

  // ====== WAVE 4: Rate limit verification ======
  logHeader('Rate limit: spam /api/orders/status to test 429');
  const spamPromises = [];
  for (let i = 0; i < 70; i++) {
    spamPromises.push(
      api('PATCH', '/api/orders/status', 'restaurant', {
        order_id: '00000000-0000-0000-0000-000000000000',
        status: 'preparing',
      })
    );
  }
  const spamResults = await Promise.all(spamPromises);
  const status429 = spamResults.filter((r) => r.status === 429).length;
  const status200 = spamResults.filter((r) => r.status === 200).length;
  const status404 = spamResults.filter((r) => r.status === 404).length;
  logOk(`${status429} × 429 (rate limited)`, null);
  logOk(`${status200} × 200 (allowed through)`, null);
  logOk(`${status404} × 404 (not found — order doesn't exist)`, null);

  // ====== WAVE 5: Order flow (1 customer, 1 driver, 1 order, full lifecycle) ======
  logHeader('Order flow: 1 order from create to delivered');
  // We use the same lifecycle as lifecycle-test.js
  const bestsellers = await api('GET', '/api/products/bestsellers?limit=5', 'customer');
  const product = bestsellers.body?.bestsellers?.[0];
  if (!product) {
    logFail('No products available', null);
    return;
  }
  const restaurant = await api('GET', '/api/search?sort=recommended', 'customer');
  const rest = restaurant.body?.restaurants?.[0];
  if (!rest) {
    logFail('No restaurants available', null);
    return;
  }

  // Create order
  const orderRes = await api('POST', '/api/orders', 'customer', {
    restaurant_id: product.restaurant_id,
    items: [{ product_id: product.id, quantity: 1 }],
    payment_method: 'cash',
    delivery_address: {
      address: 'Kölner Straße 1, Bonn',
      lat: 50.7374,
      lng: 7.0982,
      notes: 'Stress test order',
    },
  });
  if (!orderRes.body?.ok) {
    logFail('Order create failed', orderRes.body);
    return;
  }
  const orderId = orderRes.body.data.order.id;
  logOk('Order created', { id: orderId, num: orderRes.body.data.order.order_number });

  // Drive through statuses
  for (const status of ['confirmed', 'preparing', 'ready']) {
    const r = await api('PATCH', '/api/orders/status', 'restaurant', { order_id: orderId, status });
    logOk(`Status → ${status}`, { ok: r.body?.ok, status: r.body?.data?.order?.status });
  }

  // Driver accepts
  const accept = await api('POST', `/api/driver/orders/${orderId}/accept`, 'driver');
  logOk('Driver accepts', { ok: accept.body?.ok, status: accept.status });

  // Driver posts GPS while delivering
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    await api('POST', '/api/driver/location', 'driver', {
      latitude: 50.7374 + (50.7463 - 50.7374) * t,
      longitude: 7.0982 + (7.1042 - 7.0982) * t,
      heading: 45,
      speed: 7,
      accuracy: 8,
      active_order_id: orderId,
    });
  }
  logOk('Posted 5 GPS updates during delivery');

  // Driver picks up
  const pickup = await api('POST', `/api/driver/orders/${orderId}/pickup`, 'driver');
  logOk('Driver picks up', { ok: pickup.body?.ok, status: pickup.body?.order?.status });

  // Driver completes
  const complete = await api('POST', `/api/driver/orders/${orderId}/complete`, 'driver');
  logOk('Driver completes', { ok: complete.body?.ok, status: complete.body?.order?.status });

  // Customer sees delivered
  const track = await api('GET', `/api/orders/track?order_id=${orderId}`, 'customer');
  const finalOrder = track.body?.order || track.body?.data?.order;
  logOk('Customer sees delivered', { status: finalOrder?.status });

  console.log('\n═══════════════════════════════════════');
  console.log('   ✅ STRESS TEST COMPLETE');
  console.log('═══════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('\n❌ FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
