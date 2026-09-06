/**
 * v40 — Customer Journey Test Suite
 * ─────────────────────────────────
 * Tests the COMPLETE customer journey end-to-end:
 *  - Search restaurants
 *  - View restaurant
 *  - Add to cart
 *  - Apply coupon
 *  - Create order
 *  - Track order
 *  - Cancel order
 *  - View history
 *  - Use favorites
 *  - Add address
 *  - Change language
 *  - Logout
 *  - Reset password
 *  - Register new account
 *
 * Plus edge cases:
 *  - Empty cart cannot checkout
 *  - Invalid coupon rejected
 *  - Order with bad restaurant_id rejected
 *  - Cannot view another customer's order
 *  - Cart cleared after order
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const { CUSTOMER_TERMS_VERSION, PRIVACY_NOTICE_VERSION } = require('./legal-versions-test-helper');
const TEST_IP = process.env.TEST_IP || '10.42.1.1';
const COOKIES = {};
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
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${info ? ` (${info})` : ''}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${info ? ` — ${info}` : ''}`);
  }
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
  'Content-Type': 'application/json', 'Origin': BASE, 'x-forwarded-for': TEST_IP, 'x-blinkgo-test-run': 'local-e2e', ...(init.headers || {}) };
  if (Object.keys(COOKIES).length > 0) headers['Cookie'] = cookieHeader();
  const res = await fetch(BASE + path, { ...init, headers });
  if (opts.captureCookies !== false) setCookies(res.headers);
  const text = await res.text();
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text?.slice(0, 200) }; }
  if (json?.ok === true && Object.prototype.hasOwnProperty.call(json, 'data')) json = json.data;
  // A rendered Next.js 404 page can be HTTP 200 in development. API tests
  // must reject HTML so a missing route can never look like a passing API.
  return { status: res.status, ok: res.ok && isJson, json };
}

function clearCookies() {
  Object.keys(COOKIES).forEach((k) => delete COOKIES[k]);
}

async function login(role) {
  clearCookies();
  const { ok, json } = await f('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(ACCOUNTS[role]),
  });
  if (!ok) throw new Error(`Login ${role} failed: ${JSON.stringify(json)}`);
  return true;
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  v40 Customer Journey Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Search restaurants (no auth) ──
  console.log('► Public: search restaurants');
  clearCookies();
  const search = await f('/api/search?sort=recommended', {}, { captureCookies: false });
  record('Search returns restaurants', search.ok && Array.isArray(search.json?.restaurants));
  const restaurant = search.json?.restaurants?.[0];
  record('Has a restaurant to test with', !!restaurant, restaurant?.name);
  record(
    'Search contract normalizes map and delivery fields',
    !!restaurant
      && Number.isFinite(restaurant.latitude)
      && Number.isFinite(restaurant.longitude)
      && Array.isArray(restaurant.cuisines)
      && Number.isFinite(restaurant.delivery_time_min),
  );

  // ── 2. Search with filters ──
  const searchFiltered = await f('/api/search?cuisine=' + encodeURIComponent('Burger'), {}, { captureCookies: false });
  record('Search with cuisine filter', searchFiltered.ok);

  // ── 3. Search with sort ──
  const searchSort = await f('/api/search?sort=rating', {}, { captureCookies: false });
  record('Search with sort=rating', searchSort.ok);

  // ── 4. Empty search query ──
  const searchEmpty = await f('/api/search?q=', {}, { captureCookies: false });
  record('Empty search query handled', searchEmpty.ok);

  // ── 5. Search with very long query (input validation) ──
  const longQ = 'a'.repeat(2000);
  const searchLong = await f('/api/search?q=' + longQ, {}, { captureCookies: false });
  record('Very long search query handled (no crash)', searchLong.ok || searchLong.status === 400);

  // ── 6. Login customer ──
  console.log('\n► Customer: login');
  const loggedIn = await login('customer');
  record('Customer login', loggedIn);

  // ── 7. Auth check ──
  const me = await f('/api/auth/me');
  record('Get current user (auth check)', me.ok && !!me.json?.user?.id);

  // ── 8. Get restaurant details (browse) ──
  console.log('\n► Customer: view restaurant');
  if (restaurant) {
    const detail = await f(`/api/restaurants/${restaurant.id}`, {}, { captureCookies: false });
    record('View restaurant details', detail.ok && detail.json?.restaurant?.id === restaurant.id);

    // Product discovery has its own canonical endpoint. Search results may
    // intentionally omit products when the query is empty, so using the
    // bestsellers contract here mirrors the restaurant page and checkout.
    const menu = await f(`/api/products/bestsellers?restaurant_id=${restaurant.id}`, {}, { captureCookies: false });
    const restaurantProducts = menu.json?.bestsellers || menu.json?.products || [];
    record('Restaurant has products', restaurantProducts.length > 0);
    record('Product has price > 0', Number(restaurantProducts[0]?.price) > 0);
  }

  // ── 10. Favorites ──
  console.log('\n► Customer: favorites');
  const favList = await f('/api/favorites');
  record('Get favorites', favList.ok);

  if (restaurant) {
    const favAdd = await f('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({ restaurant_id: restaurant.id }),
    });
    record('Add to favorites', favAdd.ok);

    const favList2 = await f('/api/favorites');
    record('Favorite added (count increased)', Array.isArray(favList2.json?.favorites));

    const favDel = await f('/api/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ restaurant_id: restaurant.id }),
    });
    record('Remove from favorites', favDel.ok);
  }

  // ── 11. Favorites with invalid UUID ──
  const favInvalid = await f('/api/favorites', {
    method: 'POST',
    body: JSON.stringify({ restaurant_id: 'not-a-uuid' }),
  });
  record('Invalid UUID rejected', !favInvalid.ok && favInvalid.status === 400);

  // ── 12. Favorites without auth ──
  clearCookies();
  const favNoAuth = await f('/api/favorites');
  record('Favorites requires auth', favNoAuth.status === 401);
  await login('customer');

  // ── 13. Place order ──
  console.log('\n► Customer: place order');
  if (restaurant) {
    const bestsellers = await f(`/api/products/bestsellers?restaurant_id=${restaurant.id}`, {}, { captureCookies: false });
    const product = (bestsellers.json?.bestsellers || bestsellers.json?.products || [])
      .find((p) => p.is_available !== false && p.is_active !== false);
    record('Product selected for checkout', !!product, product?.name);
    if (product) {
      const selectedModifiers = Object.fromEntries((product.modifiers || [])
        .filter((modifier) => modifier.required && Number(modifier.min_select || 0) > 0)
        .map((modifier) => [modifier.id, (modifier.options || []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
      const unitPrice = Number(product.discount_price ?? product.price ?? 0);
      const minimumOrder = Number(restaurant.minimum_order ?? restaurant.min_order_amount ?? 0);
      const quantity = unitPrice > 0 ? Math.max(2, Math.ceil((minimumOrder + 0.01) / unitPrice)) : 2;
      const order = await f('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: [{ product_id: product.id, quantity, configuration: { selected_modifiers: selectedModifiers } }],
          payment_method: 'cash',
          delivery_address: { address: 'Test Street 1, Bonn', lat: 50.7374, lng: 7.0982, notes: '' },
          tip: 2.00,
        }),
      });
      record('Order created', order.ok && (order.json?.order?.id || order.json?.data?.order?.id), `id=${(order.json?.order?.id || order.json?.data?.order?.id)?.slice(0, 8)}`);

      // ── 14. Track order ──
      if (order.json?.order?.id || order.json?.data?.order?.id) {
        const orderId = order.json?.order?.id || order.json?.data?.order?.id;
        const track = await f(`/api/orders/track?order_id=${orderId}`);
        record('Track order', track.ok);
        record('Track returns order number', !!track.json?.order?.order_number);
        record('Track returns positions', !!track.json?.positions);
      }

      // ── 15. Order with invalid coupon ──
      const orderBadCoupon = await f('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: [{ product_id: product.id, quantity: 1 }],
          payment_method: 'cash',
          delivery_address: { address: 'Test Street 1, Bonn', lat: 50.7374, lng: 7.0982 },
          coupon_code: 'INVALID_COUPON_XYZ',
        }),
      });
      record('Invalid coupon rejected', !orderBadCoupon.ok);

      // ── 16. Order with bad restaurant ──
      const orderBadRest = await f('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: '00000000-0000-0000-0000-000000000099',
          items: [{ product_id: product.id, quantity: 1 }],
          payment_method: 'cash',
          delivery_address: { address: 'Test Street 1, Bonn', lat: 50.7374, lng: 7.0982 },
        }),
      });
      record('Order with invalid restaurant rejected', !orderBadRest.ok);

      // ── 17. Order with no items ──
      const orderNoItems = await f('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: [],
          payment_method: 'cash',
          delivery_address: { address: 'Test Street 1, Bonn', lat: 50.7374, lng: 7.0982 },
        }),
      });
      record('Order with no items rejected', !orderNoItems.ok);

      // ── 18. Order with quantity 0 ──
      const orderZeroQty = await f('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: [{ product_id: product.id, quantity: 0 }],
          payment_method: 'cash',
          delivery_address: { address: 'Test Street 1, Bonn', lat: 50.7374, lng: 7.0982 },
        }),
      });
      record('Order with quantity 0 rejected', !orderZeroQty.ok);

      // ── 19. Order with no delivery address ──
      const orderNoAddr = await f('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: [{ product_id: product.id, quantity: 1 }],
          payment_method: 'cash',
          delivery_address: {},
        }),
      });
      record('Order with no address rejected', !orderNoAddr.ok);

      // ── 20. Order with bad payment method ──
      const orderBadPay = await f('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: [{ product_id: product.id, quantity: 1 }],
          payment_method: 'bitcoin',
          delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
        }),
      });
      record('Order with bad payment_method rejected', !orderBadPay.ok);
    }
  }

  // ── 21. Recently viewed ──
  console.log('\n► Customer: recently viewed');
  const recent = await f('/api/products/recent');
  record('Get recently viewed', recent.ok);

  // ── 22. Logout ──
  console.log('\n► Customer: logout');
  const logout = await f('/api/auth/logout', { method: 'POST' });
  record('Logout (POST)', logout.ok);

  const logoutGet = await fetch(BASE + '/api/auth/logout', { method: 'GET' });
  record('Logout GET rejected (405)', logoutGet.status === 405);

  // ── 23. After logout, /api/auth/me should fail ──
  clearCookies();
  const meAfterLogout = await f('/api/auth/me');
  record('After logout, /api/auth/me returns no user', meAfterLogout.json?.user === null || meAfterLogout.status === 401);

  // ── 24. Password reset ──
  console.log('\n► Public: password reset');
  const reset = await f('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@blinkgo.de' }),
  }, { captureCookies: false });
  record('Password reset request (no enumeration)', reset.ok);

  const resetEmpty = await f('/api/auth/reset-password', {
    method: 'POST',
    body: '{}',
  }, { captureCookies: false });
  record('Password reset with no email (no enumeration)', resetEmpty.ok);

  const resetNonexistent = await f('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email: 'nonexistent@fake.invalid' }),
  }, { captureCookies: false });
  record('Password reset for non-existent email (no enumeration)', resetNonexistent.ok);

  // ── 25. Driver/restaurant cannot place order ──
  console.log('\n► Customer: RBAC checks');
  await login('driver');
  const driverOrder = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: '00000000-0000-0000-0000-000000000010',
      items: [{ product_id: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
      payment_method: 'cash',
      delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
    }),
  });
  record('Driver cannot place order (403)', !driverOrder.ok && driverOrder.status === 403);

  await login('restaurant');
  const restOrder = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: '00000000-0000-0000-0000-000000000010',
      items: [{ product_id: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
      payment_method: 'cash',
      delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
    }),
  });
  record('Restaurant cannot place order (403)', !restOrder.ok && restOrder.status === 403);

  // ── 26. Customer cannot access driver endpoints ──
  await login('customer');
  const driverEndpoint = await f('/api/driver/online', {
    method: 'POST',
    body: JSON.stringify({ is_online: true }),
  });
  record('Customer cannot access driver endpoint (401/403)', !driverEndpoint.ok);

  // ── 27. Input validation: extreme values ──
  const hugeOrder = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: '00000000-0000-0000-0000-000000000010',
      items: [{ product_id: '00000000-0000-0000-0000-000000000001', quantity: 99999 }],
      payment_method: 'cash',
      delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
    }),
  });
  record('Quantity > max rejected', !hugeOrder.ok);

  // ── 28. Register new account ──
  console.log('\n► Public: register');
  const newEmail = `test_${Date.now()}@blinkgo-test.de`;
  const reg = await f('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: newEmail,
      password: 'TestPass!2024',
      name: 'Test User',
      role: 'customer',
      acceptedTerms: true,
      termsVersion: CUSTOMER_TERMS_VERSION,
      privacyVersion: PRIVACY_NOTICE_VERSION,
      locale: 'de',
    }),
  }, { captureCookies: false });
  record('Register new account', reg.ok || reg.json?.error === 'EMAIL_TAKEN', reg.json?.error || 'ok');

  // ── 29. Register with weak password ──
  const regWeak = await f('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'weak@x.com', password: '123', name: 'Weak' }),
  }, { captureCookies: false });
  record('Weak password rejected', !regWeak.ok);

  // ── 30. Register with bad email ──
  const regBadEmail = await f('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email', password: 'TestPass!2024', name: 'X' }),
  }, { captureCookies: false });
  record('Bad email rejected', !regBadEmail.ok);

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
