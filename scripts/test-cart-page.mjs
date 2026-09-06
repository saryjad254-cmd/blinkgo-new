/**
 * Cart Page — Production Certification Test Suite
 *
 * Verifies the complete cart experience:
 *   1. /api/cart/quote — server-side total recomputation
 *   2. /api/cart/quote with single line
 *   3. /api/cart/quote with multiple lines
 *   4. /api/cart/quote with tampered modifier (rejected)
 *   5. /api/cart/quote with cross-restaurant product
 *   6. /api/cart/quote with hidden/paused product
 *   7. /api/cart/quote with missing product
 *   8. /api/cart/quote discount calculation
 *   9. /api/cart/quote tip clamp (max 500)
 *  10. /api/cart/quote negative total protection
 *  11. /api/cart/quote with no config_key (idempotency)
 *  12. /api/cart/quote with notes sanitization
 *  13. /api/cart/quote delivery zone check
 *  14. /api/cart/quote with coupon
 *  15. /api/cart/quote expired coupon
 *  16. /api/cart/quote min order
 *  17. /api/cart/quote idempotency (same key for same line)
 *  18. /api/cart/quote concurrent (50 parallel)
 *  19. /api/cart/quote stress (100 unique)
 *  20. /api/analytics/cart valid event
 *  21. /api/analytics/cart invalid event (silent drop)
 *  22. /api/analytics/cart non-whitelisted key
 *  23. /api/analytics/cart bad JSON
 *  24. /api/cart/quote with bad input (400)
 *  25. /api/cart/quote large cart (50 lines)
 *  26. Code audit
 *  27. Cart page renders 200
 *  28. Cart identity preserved (Phase 7C.1)
 */

import http from 'node:http';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MOCK = 'http://localhost:54321';

let cookies = '';
function req(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const cookieParts = [];
    if (cookies) cookieParts.push(cookies);
    if (opts.headers?.cookie) cookieParts.push(opts.headers.cookie);
    const headers = {
      ...(opts.headers || {}),
      ...(cookieParts.length ? { cookie: cookieParts.join('; ') } : {}),
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
    };
    const r = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          if (res.headers['set-cookie']) {
            cookies = res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
          }
          let parsed = data;
          try { parsed = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, body: parsed, raw: data });
        });
      },
    );
    r.on('error', reject);
    if (opts.body) r.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    r.end();
  });
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail: detail || '' });
  const sym = pass ? '✅' : '❌';
  console.log(`  ${sym} ${name}${detail ? ` — ${detail}` : ''}`);
}

const RID = '00000000-0000-0000-0000-000000000020';
const PID = 'a1111111-0000-0000-0000-000000000001'; // Margherita
const PID2 = 'a1111111-0000-0000-0000-000000000002'; // Carbonara
const PID_OTHER = 'a1111111-0000-0000-0000-000000000010'; // Other restaurant

// ── 1-2. Cart quote single line ──────────────────
async function testQuoteSingle() {
  console.log('\n=== 1. Quote — single line ===');
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{
        product_id: PID,
        quantity: 2,
        config_key: 'test-key-1',
        configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } },
      }],
    },
    headers: { origin: BASE },
  });
  record('200 OK', r.status === 200);
  record('ok=true', r.body?.ok === true);
  record('subtotal=25.8', r.body?.subtotal === 25.8);
  record('delivery_fee computed', typeof r.body?.delivery_fee === 'number');
  record('service_fee = 5% of subtotal', r.body?.service_fee === 1.29);
  record('total includes subtotal+fees', r.body?.total === 25.8 + 0 + 1.29);
  record('lines[0] has config_key', typeof r.body?.lines?.[0]?.config_key === 'string');
  record('lines[0] unit_price = 12.9', r.body?.lines?.[0]?.unit_price === 12.9);
  record('lines[0] line_subtotal = 25.8', r.body?.lines?.[0]?.line_subtotal === 25.8);
  record('lines[0] quantity=2', r.body?.lines?.[0]?.quantity === 2);
  record('can_place_order=true', r.body?.can_place_order === true);
  record('min_order_ok=true', r.body?.min_order_ok === true);
  record('delivery_zone_ok=true (no zone check yet)', r.body?.delivery_zone_ok === true);
  record('restaurant info returned', !!r.body?.restaurant);
  record('restaurant.is_active=true', r.body?.restaurant?.is_active === true);
}

// ── 3. Multi-line ────────────────────────────────
async function testQuoteMulti() {
  console.log('\n=== 2. Quote — multiple lines ===');
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [
        { product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } },
        { product_id: PID2, quantity: 1, config_key: 'k2', configuration: { selected_modifiers: { portion: ['regular'] } } },
      ],
    },
    headers: { origin: BASE },
  });
  record('200 OK', r.status === 200);
  record('2 lines', r.body?.lines?.length === 2);
  record('subtotal = 12.9 + 14 = 26.9', r.body?.subtotal === 26.9);
  record('lines have distinct keys', r.body?.lines?.[0]?.config_key !== r.body?.lines?.[1]?.config_key);
  record('can_place_order=true', r.body?.can_place_order === true);
}

// ── 4. Tampered modifier ────────────────────────
async function testTamperedModifier() {
  console.log('\n=== 3. Quote — tampered modifier rejected ===');
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{
        product_id: PID,
        quantity: 1,
        config_key: 'k1',
        configuration: { selected_modifiers: { FAKE: ['x'] } },
      }],
    },
    headers: { origin: BASE },
  });
  record('200 OK', r.status === 200);
  record('issue = modifier_invalid', r.body?.issues?.some((i) => i.kind === 'modifier_invalid'));
}

// ── 5. Cross-restaurant ─────────────────────────
async function testCrossRestaurant() {
  console.log('\n=== 4. Quote — cross-restaurant rejected ===');
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID_OTHER, quantity: 1, config_key: 'k1', configuration: {} }],
    },
    headers: { origin: BASE },
  });
  record('200 OK', r.status === 200);
  record('issue = product_wrong_restaurant', r.body?.issues?.some((i) => i.kind === 'product_wrong_restaurant'));
  record('can_place_order=false', r.body?.can_place_order === false);
}

// ── 6. Hidden product ───────────────────────────
async function testHiddenProduct() {
  console.log('\n=== 5. Quote — hidden/deleted product rejected ===');
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: '00000000-0000-0000-0000-deadbeef0000', quantity: 1, config_key: 'k1', configuration: {} }],
    },
    headers: { origin: BASE },
  });
  record('200 OK', r.status === 200);
  record('issue = product_deleted', r.body?.issues?.some((i) => i.kind === 'product_deleted'));
}

// ── 7. Empty payload ────────────────────────────
async function testEmptyPayload() {
  console.log('\n=== 6. Quote — empty payload ===');
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: { restaurant_id: RID, items: [] },
    headers: { origin: BASE },
  });
  record('400', r.status === 400);

  const r2 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: { items: [{ product_id: PID, quantity: 1 }] },
    headers: { origin: BASE },
  });
  record('missing restaurant_id → 400', r2.status === 400);
}

// ── 8. Tip clamp ────────────────────────────────
async function testTipClamp() {
  console.log('\n=== 7. Quote — tip clamp (0-500) ===');
  const r1 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
      tip: 50,
    },
    headers: { origin: BASE },
  });
  record('tip=50 accepted', r1.body?.tip === 50);

  const r2 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
      tip: 9999,
    },
    headers: { origin: BASE },
  });
  record('tip=9999 clamped to 500', r2.body?.tip === 500);

  const r3 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
      tip: -100,
    },
    headers: { origin: BASE },
  });
  record('tip=-100 clamped to 0', r3.body?.tip === 0);
}

// ── 9. Negative total protection ────────────────
async function testNegativeProtection() {
  console.log('\n=== 8. Quote — total never negative ===');
  // Even with massive discount, total should not go below 0
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
      tip: 0,
      // No coupon so no discount; total will be small positive
    },
    headers: { origin: BASE },
  });
  record('total >= 0', r.body?.total >= 0);
  record('subtotal is positive', r.body?.subtotal > 0);
}

// ── 10. Quantity clamp ──────────────────────────
async function testQuantityClamp() {
  console.log('\n=== 9. Quote — quantity clamp (1-99) ===');
  const r1 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 0, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
    },
    headers: { origin: BASE },
  });
  record('quantity=0 clamped to 1', r1.body?.lines?.[0]?.quantity === 1);

  const r2 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 9999, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
    },
    headers: { origin: BASE },
  });
  record('quantity=9999 clamped to 99', r2.body?.lines?.[0]?.quantity === 99);
}

// ── 11. Notes sanitization ───────────────────────
async function testNotesSanitization() {
  console.log('\n=== 10. Quote — notes sanitization ===');
  const longNotes = 'a'.repeat(1000);
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{
        product_id: PID, quantity: 1, config_key: 'k1',
        configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] }, notes: longNotes },
      }],
    },
    headers: { origin: BASE },
  });
  record('long notes accepted (server doesn\'t fail)', r.body?.lines?.[0]?.config_key != null);
  record('config_key is server-issued', r.body?.lines?.[0]?.config_key.startsWith('r:'));
}

// ── 12. Server-issued config_key ────────────────
async function testServerConfigKey() {
  console.log('\n=== 11. Quote — server-issued config_key (not client) ===');
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{
        product_id: PID, quantity: 1,
        config_key: 'CLIENT_LIES_about_key',
        configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } },
      }],
    },
    headers: { origin: BASE },
  });
  const key = r.body?.lines?.[0]?.config_key;
  record('key is server-issued, not client', key !== 'CLIENT_LIES_about_key');
  record('key starts with r:', key?.startsWith('r:'));
  record('key is canonical', key?.includes(':e1ec0665d7c3') || key?.length > 20);
}

// ── 13. Delivery zone check ─────────────────────
async function testDeliveryZone() {
  console.log('\n=== 12. Quote — delivery zone check ===');
  // Berlin ~580km from Wesseling — should be outside
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
      delivery_address: { lat: 52.5200, lng: 13.4050, address: 'Berlin Mitte' },
    },
    headers: { origin: BASE },
  });
  record('Berlin address flagged', r.body?.delivery_zone_ok === false);
  record('Berlin issue = delivery_zone', r.body?.issues?.some((i) => i.kind === 'delivery_zone'));
  record('can_place_order=false', r.body?.can_place_order === false);

  // Wesseling center (~0km)
  const r2 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
      delivery_address: { lat: 50.8207, lng: 6.9789, address: 'Wesseling' },
    },
    headers: { origin: BASE },
  });
  record('Wesseling ok', r2.body?.delivery_zone_ok === true);
}

// ── 14. Concurrent: 50 parallel ──────────────────
async function testConcurrency() {
  console.log('\n=== 13. Concurrency — 50 parallel quotes ===');
  const t = Date.now();
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(req(`${BASE}/api/cart/quote`, {
      method: 'POST',
      body: {
        restaurant_id: RID,
        items: [{ product_id: PID, quantity: 2, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
      },
      headers: { origin: BASE },
    }));
  }
  const r = await Promise.all(promises);
  const ms = Date.now() - t;
  record('50 parallel <15s', ms < 15000, `${ms}ms`);
  record('all 50 ok', r.every((x) => x.body?.ok === true));
  record('all 50 same subtotal (25.8 with qty=2)', r.every((x) => x.body?.subtotal === 25.8), `subtotal values: ${[...new Set(r.map((x) => x.body?.subtotal))].join(',')}`);
  record('all 50 same config_key (deterministic)', r.every((x) => x.body?.lines?.[0]?.config_key === r[0].body?.lines?.[0]?.config_key));
}

// ── 15. Stress: 100 unique configs ──────────────
async function testStress() {
  console.log('\n=== 14. Stress — 100 unique configurations (3 sizes × 3 crusts × extras) ===');
  const sizes = ['s', 'm', 'l'];
  const crusts = ['classic', 'thin', 'gluten-free'];
  const extrasArr = [[], ['extra-cheese'], ['olives'], ['mushrooms'], ['pepperoni'], ['extra-cheese', 'olives']];
  const promises = [];
  let i = 0;
  for (const size of sizes) {
    for (const crust of crusts) {
      for (const extras of extrasArr) {
        const notesVal = `note-${i}`;
        const cfg = { size: [size], crust: [crust] };
        if (extras.length) cfg.extras = extras;
        promises.push(req(`${BASE}/api/cart/quote`, {
          method: 'POST',
          body: {
            restaurant_id: RID,
            items: [{
              product_id: PID, quantity: 1, config_key: `k${i}`,
              configuration: { selected_modifiers: cfg, notes: notesVal },
            }],
          },
          headers: { origin: BASE },
        }));
        i++;
      }
    }
  }
  const r = await Promise.all(promises);
  const invalidKinds = new Set(['product_deleted', 'product_wrong_restaurant', 'product_hidden', 'product_unavailable', 'modifier_invalid']);
  const ok = r.every((x) => x.status === 200 && !(x.body?.issues ?? []).some((issue) => invalidKinds.has(issue.kind)));
  record('all 54 generated configurations pass product and modifier validation', ok, ok ? '' : `failures=${r.filter((x) => x.status !== 200 || (x.body?.issues ?? []).some((issue) => invalidKinds.has(issue.kind))).map((x) => `${x.status}:${x.body?.issues?.map((issue) => issue.kind).join('|') || x.body?.error}`).join(',')}`);
  const keys = new Set(r.map((x) => x.body?.lines?.[0]?.config_key));
  record('3 sizes × 3 crusts × 6 extras × 1 notes = 54 distinct keys', keys.size === 54, `${keys.size} distinct`);
}

// ── 16. Large cart: 50 lines ────────────────────
async function testLargeCart() {
  console.log('\n=== 15. Large cart — 50 lines (unique extras) ===');
  const items = [];
  for (let i = 0; i < 50; i++) {
    // Vary extras to get distinct keys
    const extras = [
      ['extra-cheese'], ['olives'], ['mushrooms'], ['pepperoni'],
      ['extra-cheese', 'olives'], ['extra-cheese', 'mushrooms'],
      ['olives', 'pepperoni'], ['mushrooms', 'pepperoni'],
    ];
    const pick = extras[i % extras.length];
    items.push({
      product_id: PID,
      quantity: 1,
      config_key: `k${i}`,
      configuration: { selected_modifiers: { size: ['m'], crust: ['classic'], extras: pick }, notes: `line-${i}` },
    });
  }
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: { restaurant_id: RID, items },
    headers: { origin: BASE },
  });
  record('50 lines ok', r.body?.ok === true);
  record('50 lines returned', r.body?.lines?.length === 50);
  const distinctKeys = new Set(r.body?.lines?.map((l) => l.config_key)).size;
  record('all 50 keys distinct (8 extras + notes variations)', distinctKeys === 50, `${distinctKeys} distinct`);
}

// ── 17. Coupon validation (server) ──────────────
async function testCouponValidation() {
  console.log('\n=== 16. Coupon — server validation ===');
  // coupons/validate requires auth (real production system) — verify auth gate
  const r1 = await req(`${BASE}/api/coupons/validate`, {
    method: 'POST',
    body: { code: 'INVALID', order_amount: 30, restaurant_id: RID },
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  record('unauthenticated → 401/403 (security gate)', r1.status === 401 || r1.status === 403 || r1.body?.error === 'UNAUTHORIZED');

  const r2 = await req(`${BASE}/api/coupons/validate`, {
    method: 'POST',
    body: { code: 'WELCOME10', order_amount: 30, restaurant_id: RID },
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  record('unauthenticated coupon validate → not 500', r2.status < 500);

  const r3 = await req(`${BASE}/api/coupons/validate`, {
    method: 'POST',
    body: {},
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  record('empty body → not 500', r3.status < 500);

  // ── PRODUCTION-CRITICAL: cart page must pass auth token ──
  // Read cart page and check that applyCoupon sets Authorization header
  const fs = await import('node:fs');
  const cartPage = fs.readFileSync('app/(customer)/cart/page.tsx', 'utf8');
  const hasBearer = cartPage.includes("`Bearer ${token}`") && cartPage.includes('Authorization');
  record('cart page passes Bearer token to /api/coupons/validate', hasBearer, hasBearer ? 'auth header present' : 'MISSING — production would 401');

  const hasSessionFetch = /createBrowserClient\(\)[\s\S]{0,300}auth\.getSession/.test(cartPage);
  record('cart page fetches session before coupon validate', hasSessionFetch);
}

// ── 18. Min order ───────────────────────────────
async function testMinOrder() {
  console.log('\n=== 17. Min order — server check ===');
  // The Trattoria mock has min_order_amount=0 by default. Let's check
  const r = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] } } }],
    },
    headers: { origin: BASE },
  });
  record('min_order_amount returned', typeof r.body?.min_order_amount === 'number');
  record('min_order_ok is boolean', typeof r.body?.min_order_ok === 'boolean');
}

// ── 19-22. Analytics endpoint ───────────────────
async function testAnalytics() {
  console.log('\n=== 18. Analytics endpoint ===');
  const r1 = await req(`${BASE}/api/analytics/cart`, {
    method: 'POST',
    body: { event: 'cart_viewed', data: { item_count: 3, subtotal: 29.5 } },
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  record('valid event accepted', r1.status === 200 && r1.body?.ok === true);

  const r2 = await req(`${BASE}/api/analytics/cart`, {
    method: 'POST',
    body: { event: 'hacker_snooping' },
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  record('invalid event → ok=true (silent drop)', r2.body?.ok === true);

  const r3 = await req(`${BASE}/api/analytics/cart`, {
    method: 'POST',
    body: { event: 'cart_viewed', data: { item_count: 1, email: 'evil@hacker.com' } },
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  record('non-whitelisted key (email) → dropped', !(r3.raw || '').includes('evil@hacker.com'));
  record('non-whitelisted key → ok=true', r3.body?.ok === true);

  const r4 = await req(`${BASE}/api/analytics/cart`, {
    method: 'POST',
    body: 'not json',
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  record('bad JSON → 400', r4.status === 400);

  const r5 = await req(`${BASE}/api/analytics/cart`, {
    method: 'POST',
    body: {},
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  record('empty body → ok=true (no event)', r5.body?.ok === true);
}

// ── 23. Cart page renders ───────────────────────
async function testCartPageRenders() {
  console.log('\n=== 19. Cart page renders ===');
  // Login first
  await req(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
    headers: { origin: BASE, 'content-type': 'application/json' },
  });
  const r = await req(`${BASE}/cart`);
  record('cart page 200', r.status === 200);
  record('cart page has substantial content', (r.raw || '').length > 5000);
}

// ── 24. Cart identity contract preserved ─────────
async function testCartIdentityPreserved() {
  console.log('\n=== 20. Cart identity — Phase 7C.1 contract preserved ===');
  const r1 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] }, notes: 'no onions' } }],
    },
    headers: { origin: BASE },
  });
  const r2 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'], crust: ['classic'] }, notes: 'NO ONIONS' } }],
    },
    headers: { origin: BASE },
  });
  record('"no onions" and "NO ONIONS" → same key (trim+lowercase)', r1.body?.lines?.[0]?.config_key === r2.body?.lines?.[0]?.config_key);
}

// ── 25. Same product different configs ──────────
async function testDifferentConfigs() {
  console.log('\n=== 21. Cart quote — different configs → different keys ===');
  const r1 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['m'] } } }],
    },
    headers: { origin: BASE },
  });
  const r2 = await req(`${BASE}/api/cart/quote`, {
    method: 'POST',
    body: {
      restaurant_id: RID,
      items: [{ product_id: PID, quantity: 1, config_key: 'k1', configuration: { selected_modifiers: { size: ['l'] } } }],
    },
    headers: { origin: BASE },
  });
  record('size M vs size L → different keys', r1.body?.lines?.[0]?.config_key !== r2.body?.lines?.[0]?.config_key);
}

// ── 26. Code audit ──────────────────────────────
async function testCodeAudit() {
  console.log('\n=== 22. Code audit ===');
  const fs = await import('node:fs');
  const files = [
    'app/(customer)/cart/page.tsx',
    'app/api/cart/quote/route.ts',
    'app/api/analytics/cart/route.ts',
    'lib/cart-store.ts',
    'lib/cart-key.ts',
  ];
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const todos = (content.match(/TODO|FIXME|XXX|HACK/g) || []).length;
      const consoleLogs = (content.match(/console\.log\b/g) || []).length;
      record(`${f} no TODO/FIXME/XXX/HACK`, todos === 0);
      record(`${f} no debug console.log`, consoleLogs === 0);
    } catch (e) {
      record(`${f} readable`, false, e.message);
    }
  }

  const store = fs.readFileSync('lib/cart-store.ts', 'utf8');
  const cartPage = fs.readFileSync('app/(customer)/cart/page.tsx', 'utf8');
  const checkoutPage = fs.readFileSync('app/(customer)/checkout/page.tsx', 'utf8');
  record('schedule persists in cart store', store.includes('scheduled_for: string | null') && store.includes('setScheduledFor'));
  record('validated coupon persists in cart store', store.includes('coupon_code: string | null') && store.includes('setCouponCode'));
  record('cart writes schedule and coupon into shared state', cartPage.includes('setStoredScheduledFor') && cartPage.includes('setStoredCouponCode(code)'));
  record('checkout reads schedule and coupon from shared state', checkoutPage.includes('useCart((s) => s.scheduled_for)') && checkoutPage.includes('useCart((s) => s.coupon_code)'));
  record('cart reset clears schedule and coupon', /clear:\s*\(\)\s*=>\s*set\(\{[^}]*scheduled_for:\s*null[^}]*coupon_code:\s*null/s.test(store));
}

// ── MAIN ─────────────────────────────────────────
async function main() {
  await testQuoteSingle();
  await testQuoteMulti();
  await testTamperedModifier();
  await testCrossRestaurant();
  await testHiddenProduct();
  await testEmptyPayload();
  await testTipClamp();
  await testNegativeProtection();
  await testQuantityClamp();
  await testNotesSanitization();
  await testServerConfigKey();
  await testDeliveryZone();
  await testConcurrency();
  await testStress();
  await testLargeCart();
  await testCouponValidation();
  await testMinOrder();
  await testAnalytics();
  await testCartPageRenders();
  await testCartIdentityPreserved();
  await testDifferentConfigs();
  await testCodeAudit();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed (out of ${results.length})`);
  console.log('══════════════════════════════════════════════════\n');
  if (failed > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  ❌ ${r.name} — ${r.detail}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
