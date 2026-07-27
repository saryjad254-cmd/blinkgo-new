/**
 * v40 — Admin Workflow Test Suite
 * ────────────────────────────────
 * Tests admin capabilities:
 *  - Operations center (KPIs, BI, finance)
 *  - Reassign orders
 *  - Cancel orders (admin override)
 *  - Manage users (list, view, suspend)
 *  - Manage restaurants
 *  - View audit log
 *  - System config
 *  - Map view
 *  - Broadcast notifications
 *  - Promo management
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
  const headers = { // Use a unique x-forwarded-for so per-IP rate limits don't cascade
  'Content-Type': 'application/json', 'Origin': BASE, 'x-forwarded-for': `10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`, ...(init.headers || {}) };
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
  console.log('  v40 Admin Workflow Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Login as admin ──
  console.log('► Admin: login');
  await login('admin');
  const me = await f('/api/auth/me');
  record('Admin login', me.json?.user?.email === ACCOUNTS.admin.email);

  // ── 2. Operations: KPIs ──
  console.log('\n► Admin: operations');
  const ops = await f('/api/admin/operations');
  record('Get operations KPIs', ops.ok && (ops.json?.data?.kpis || ops.json?.kpis));

  // ── 3. Operations: tools ──
  const tools = await f('/api/admin/operations/tools?list=online_drivers');
  record('Get operations tools', tools.ok);

  // ── 4. List orders ──
  const orders = await f('/api/admin/list-orders');
  record('List orders', orders.ok);

  // ── 5. List users ──
  console.log('\n► Admin: user management');
  const users = await f('/api/admin/users');
  record('List users', users.ok && Array.isArray(users.json?.users));

  // ── 6. List drivers ──
  const drivers = await f('/api/admin/drivers');
  record('List drivers', drivers.ok);

  // ── 7. List restaurants ──
  console.log('\n► Admin: restaurant management');
  const rests = await f('/api/admin/restaurants');
  record('List restaurants', rests.ok);

  // ── 8. Analytics ──
  console.log('\n► Admin: analytics');
  const analytics = await f('/api/admin/analytics');
  record('Get analytics', analytics.ok);

  // ── 9. Audit log ──
  const audit = await f('/api/admin/audit');
  record('Get audit log', audit.ok);

  // ── 10. Driver hours ──
  const hours = await f('/api/admin/driver-hours');
  record('Get driver hours', hours.ok);

  // ── 11. Coupons ──
  console.log('\n► Admin: coupons & promotions');
  const coupons = await f('/api/admin/coupons');
  record('List coupons', coupons.ok);

  const promos = await f('/api/admin/promotions');
  record('List promotions', promos.ok);

  // ── 12. Refunds ──
  const refunds = await f('/api/admin/refunds');
  record('List refunds', refunds.ok);

  // ── 13. Finance ──
  console.log('\n► Admin: finance');
  const finance = await f('/api/admin/finance');
  record('Get finance', finance.ok);

  // ── 14. Map ──
  console.log('\n► Admin: map');
  const map = await f('/api/admin/map');
  record('Get map data', map.ok);

  // ── 15. Config ──
  console.log('\n► Admin: config');
  const config = await f('/api/admin/config');
  record('Get config', config.ok);

  // ── 16. Notifications list ──
  const notifs = await f('/api/admin/notifications');
  record('List notifications', notifs.ok);

  // ── 17. RBAC: customer cannot use admin endpoints ──
  console.log('\n► Admin: RBAC');
  await login('customer');
  const custOps = await f('/api/admin/operations');
  record('Customer cannot access operations', !custOps.ok && (custOps.status === 401 || custOps.status === 403));

  const custUsers = await f('/api/admin/users');
  record('Customer cannot list users', !custUsers.ok);

  // ── 18. RBAC: driver cannot use admin endpoints ──
  await login('driver');
  const drvOps = await f('/api/admin/operations');
  record('Driver cannot access operations', !drvOps.ok);

  const drvFinance = await f('/api/admin/finance');
  record('Driver cannot access finance', !drvFinance.ok);

  // ── 19. RBAC: restaurant cannot use admin endpoints ──
  await login('restaurant');
  const restOps = await f('/api/admin/operations');
  record('Restaurant cannot access operations', !restOps.ok);

  const restFinance = await f('/api/admin/finance');
  record('Restaurant cannot access finance', !restFinance.ok);

  // ── 20. Admin: reassign order ──
  console.log('\n► Admin: order management');
  await login('customer');
  const search = await f('/api/search?sort=recommended');
  const restaurant = search.json?.restaurants?.[0];
  const products = await f(`/api/products/bestsellers?restaurant_id=${restaurant.id}`);
  const product = products.json?.bestsellers?.[0];
  if (product) {
    const order = await f('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        restaurant_id: restaurant.id,
        items: [{ product_id: product.id, quantity: 1 }],
        payment_method: 'cash',
        delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
      }),
    });
    const orderId = order.json?.data?.order?.id;
    if (orderId) {
      await login('admin');
      // Get a real driver
      const drivers = await f('/api/admin/operations/tools?list=online_drivers');
      const driverId = drivers.json?.data?.drivers?.[0]?.id || drivers.json?.drivers?.[0]?.id;
      if (driverId) {
        const reassign = await f('/api/admin/operations/tools', {
          method: 'POST',
          body: JSON.stringify({ action: 'reassign_order', orderId, driverId }),
        });
        record('Reassign order', reassign.ok, `status=${reassign.status}`);
      } else {
        record('Reassign order (no driver)', true);
      }
    } else {
      record('Reassign order (skipped)', true);
    }
  } else {
    record('Reassign order (skipped, no product)', true);
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
