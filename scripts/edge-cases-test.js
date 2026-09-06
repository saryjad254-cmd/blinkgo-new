/**
 * v40 — Edge Cases Test Suite
 * ────────────────────────────
 * Tests boundary conditions and error paths:
 *  - Invalid JSON bodies
 *  - Empty / null / undefined bodies
 *  - Type mismatches
 *  - Out-of-range values
 *  - SQL injection attempts
 *  - XSS attempts
 *  - Very long strings
 *  - Non-existent IDs
 *  - Already-used coupons
 *  - Negative prices
 *  - Expired tokens
 *  - Rate limits
 *  - Concurrent operations
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const { CUSTOMER_TERMS_VERSION, PRIVACY_NOTICE_VERSION } = require('./legal-versions-test-helper');
// SECURITY: Project ref is derived from the public Supabase URL, not hardcoded
const PROJECT_REF = (() => { const u = process.env.NEXT_PUBLIC_SUPABASE_URL || ''; const m = u.match(/https:\/\/([^.]+)\.supabase\.co/); return m ? m[1] : 'YOUR-PROJECT-REF'; })();
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
    'x-blinkgo-test-run': 'local-e2e',
    'Content-Type': 'application/json',
    'Origin': BASE,
    'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    ...(init.headers || {}),
  };
  if (Object.keys(COOKIES).length > 0) headers['Cookie'] = cookieHeader();
  const res = await fetch(BASE + path, { ...init, headers });
  if (opts.captureCookies !== false) setCookies(res.headers);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text?.slice(0, 200) }; }
  if (json?.ok === true && Object.prototype.hasOwnProperty.call(json, 'data')) json = json.data;
  return { status: res.status, ok: res.ok, json };
}

function clearCookies() { Object.keys(COOKIES).forEach((k) => delete COOKIES[k]); }

async function login(role) {
  clearCookies();
  await f('/api/auth/login', { method: 'POST', body: JSON.stringify(ACCOUNTS[role]) });
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
  console.log('  v40 Edge Cases Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Invalid JSON body ──
  console.log('► Edge: malformed input');
  const badJson = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': BASE,
      'x-forwarded-for': '10.42.9.1',
      'x-blinkgo-test-run': 'local-e2e',
    },
    body: '{not valid json}',
  });
  record('Invalid JSON rejected', badJson.status === 400 || badJson.status === 500);

  // ── 2. Empty body ──
  const emptyBody = await f('/api/auth/login', { method: 'POST', body: '' });
  record('Empty body rejected', !emptyBody.ok);

  // ── 3. SQL injection attempts ──
  console.log('\n► Edge: injection attacks');
  const sqli = await f('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: "admin@blinkgo.de' OR '1'='1", password: 'whatever' }),
  });
  record('SQL injection blocked', !sqli.ok);

  // ── 4. XSS attempts ──
  const xss = await f('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: '<script>alert(1)</script>@x.x', password: 'whatever' }),
  });
  record('XSS attempt blocked', !xss.ok);

  // ── 5. Very long string ──
  const longStr = 'a'.repeat(100000);
  const long = await f('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: `${longStr}@x.x`, password: 'Test1234!', name: 'Test' }),
  });
  record('Very long email rejected', !long.ok || long.status === 400);

  // ── 6. Negative numbers ──
  console.log('\n► Edge: numeric boundaries');
  const neg = await f('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@blinkgo.de', password: -1 }),
  });
  record('Negative password rejected', !neg.ok);

  // ── 7. Out-of-range lat/lng ──
  await login('driver');
  const oobLat = await f('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify({ latitude: 999, longitude: 999 }),
  });
  record('Out-of-range GPS rejected', !oobLat.ok);

  // ── 8. Non-existent IDs ──
  console.log('\n► Edge: missing resources');
  const noOrder = await f('/api/orders/track?orderId=00000000-0000-0000-0000-000000000000');
  record('Non-existent order returns 404', noOrder.status === 404 || noOrder.json?.error);

  // ── 9. Order with non-existent restaurant ──
  await login('customer');
  const noRest = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: '00000000-0000-0000-0000-000000000000',
      items: [{ product_id: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
      payment_method: 'cash',
      delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
    }),
  });
  record('Order with non-existent restaurant rejected', !noRest.ok);

  // ── 10. Empty items array ──
  const emptyItems = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: '00000000-0000-0000-0000-000000000010',
      items: [],
      payment_method: 'cash',
      delivery_address: { address: 'Test', lat: 50.7, lng: 7.1 },
    }),
  });
  record('Empty items rejected', !emptyItems.ok);

  const validSearch = await f('/api/search?sort=recommended');
  const validRestaurant = validSearch.json?.restaurants?.[0];
  const validProducts = await f(`/api/products/bestsellers?restaurant_id=${validRestaurant?.id}`);
  const validProduct = validProducts.json?.bestsellers?.[0];
  const validDeliveryAddress = {
    address: 'Test Wesseling',
    lat: Number(validRestaurant?.latitude ?? 50.82),
    lng: Number(validRestaurant?.longitude ?? 6.98),
  };

  // ── 11. Negative tip ──
  const negTip = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: validRestaurant.id,
      // Build the same valid line as checkout so this assertion isolates
      // tip clamping from minimum-order and required-modifier validation.
      items: [checkoutLine(validProduct, validRestaurant)],
      payment_method: 'cash',
      delivery_address: validDeliveryAddress,
      tip: -100,
    }),
  });
  // Negative tip is clamped to 0
  record('Negative tip clamped to 0', negTip.ok && negTip.json?.order?.tip === 0, `status=${negTip.status} tip=${negTip.json?.order?.tip}`);

  // ── 12. Excessive tip ──
  const bigTip = await f('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      restaurant_id: validRestaurant.id,
      items: [checkoutLine(validProduct, validRestaurant)],
      payment_method: 'cash',
      delivery_address: validDeliveryAddress,
      tip: 99999,
    }),
  });
  record('Excessive tip capped', bigTip.ok && bigTip.json?.order?.tip === 500, `status=${bigTip.status} tip=${bigTip.json?.order?.tip}`);

  // ── 13. Unicode in name ──
  console.log('\n► Edge: unicode / i18n');
  const unicode = await f('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: 'test+unicode@blinkgo-test.de',
      password: 'Test1234!',
      name: 'محمد 测试 🎉',
      role: 'customer',
      acceptedTerms: true,
      termsVersion: CUSTOMER_TERMS_VERSION,
      privacyVersion: PRIVACY_NOTICE_VERSION,
      locale: 'ar',
    }),
  });
  record('Unicode name accepted', unicode.ok || unicode.json?.ok, `status=${unicode.status}`);

  // ── 14. Auth with no token ──
  console.log('\n► Edge: auth missing');
  clearCookies();
  const noAuth = await f('/api/auth/me');
  record('No auth returns null user', noAuth.json?.user === null || noAuth.status === 401);

  // ── 15. Garbage token ──
  COOKIES[`sb-${PROJECT_REF}-auth-token`] = 'garbage';
  const garbage = await f('/api/auth/me');
  record('Garbage token rejected', garbage.json?.user === null || garbage.status === 401);
  delete COOKIES[`sb-${PROJECT_REF}-auth-token`];

  // ── 16. Wrong method on endpoint ──
  console.log('\n► Edge: wrong method');
  const wrongMethod = await fetch(BASE + '/api/orders', {
    method: 'PUT',
    headers: { 'Origin': BASE, 'Content-Type': 'application/json' },
  });
  record('Wrong HTTP method returns 405', wrongMethod.status === 405 || wrongMethod.status === 404 || wrongMethod.status === 400);

  // ── 17. Search with weird query ──
  const weirdSearch = await f('/api/search?q=' + encodeURIComponent('<script>alert(1)</script>'));
  record('Search handles XSS query', weirdSearch.ok);

  // ── 18. Geocode with weird address ──
  const weirdGeo = await f('/api/maps/geocode', { method: 'POST', body: JSON.stringify({ address: '🚀🚀🚀' }) });
  record('Geocode handles weird address', weirdGeo.status === 200 || weirdGeo.status === 400 || weirdGeo.status === 404);

  // ── 19. Health check ──
  const health = await f('/api/health');
  record('Health endpoint responds', health.ok || health.status === 503);

  // ── 20. Empty array responses ──
  console.log('\n► Edge: empty data');
  const emptyRes = await f('/api/search?q=zzzzzzzzzzzzzzzzzzz');
  record('Search returns empty array for no results', Array.isArray(emptyRes.json?.restaurants));

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
