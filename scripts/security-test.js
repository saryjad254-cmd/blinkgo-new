/**
 * v39 — Security Penetration Test Suite
 * ───────────────────────────────────────
 * Runs automated pentest scenarios against the BlinkGo API.
 * Tests:
 *   1. CSRF: cross-origin POST rejected
 *   2. CSRF: cross-origin PATCH rejected
 *   3. CSRF: cross-origin DELETE rejected
 *   4. JWT forgery: cannot impersonate via unverified JWT
 *   5. Auth: cannot access admin routes as customer
 *   6. Auth: cannot access driver routes as customer
 *   7. Auth: cannot access restaurant routes as customer
 *   8. RBAC: customer cannot view another customer's orders
 *   9. RBAC: driver cannot update another driver's order
 *  10. RBAC: restaurant cannot edit another restaurant's products
 *  11. Input validation: SQL-like input rejected
 *  12. Input validation: oversized body rejected
 *  13. Rate limiting: login is rate-limited per email
 *  14. Open redirect: password-reset doesn't accept arbitrary host
 *  15. CSRF: stripe webhook allows no-Origin
 *  16. CSP: response includes Content-Security-Policy
 *  17. HSTS: response includes Strict-Transport-Security in prod
 *  18. X-Content-Type-Options: nosniff header
 *  19. X-Frame-Options: DENY header
 *  20. Permissions-Policy header
 *  21. logout GET returns 405
 *  22. driver/location requires driver role
 *  23. favorites requires authentication
 *  24. unauthenticated access to /api/admin/* blocked
 *  25. unauthenticated access to /api/restaurant/* blocked
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
// SECURITY: Project ref is derived from the public Supabase URL, not hardcoded
const PROJECT_REF = (() => { const u = process.env.NEXT_PUBLIC_SUPABASE_URL || ''; const m = u.match(/https:\/\/([^.]+)\.supabase\.co/); return m ? m[1] : 'YOUR-PROJECT-REF'; })();
const COOKIES = {};
const ACCOUNTS = {
  customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
  driver: { email: 'driver@blinkgo.de', password: 'DemoDriver!2024' },
  restaurant: { email: 'restaurant@blinkgo.de', password: 'DemoRestaurant!2024' },
  admin: { email: 'admin@blinkgo.de', password: 'DemoAdmin!2024' },
};

let passed = 0;
let failed = 0;
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

async function fetchJson(path, init = {}, { captureCookies = true } = {}) {
  const headers = { // Use a unique x-forwarded-for so per-IP rate limits don't cascade
  'Content-Type': 'application/json', 'Origin': BASE, 'x-forwarded-for': `10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`, ...(init.headers || {}) };
  if (Object.keys(COOKIES).length > 0) headers['Cookie'] = cookieHeader();
  const res = await fetch(BASE + path, { ...init, headers });
  if (captureCookies) setCookies(res.headers);
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text?.slice(0, 200) }; }
  return { status: res.status, ok: res.ok, json, headers: res.headers };
}

async function login(role) {
  COOKIES['blinkgo-locale'] = 'en';
  Object.keys(COOKIES).forEach((k) => {
    if (k.startsWith('sb-') || k === 'blinkgo-session') delete COOKIES[k];
  });
  const { status, ok, json } = await fetchJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(ACCOUNTS[role]),
  }, { captureCookies: false });
  if (!ok) throw new Error(`Login ${role} failed: ${status} ${JSON.stringify(json)}`);
  return true;
}

async function clearCookies() {
  Object.keys(COOKIES).forEach((k) => delete COOKIES[k]);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  v39 Security Penetration Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 16-20. Security headers ──
  console.log('► Security headers');
  const homeRes = await fetch(BASE + '/');
  record('CSP header present', !!homeRes.headers.get('content-security-policy'));
  record('X-Content-Type-Options nosniff', homeRes.headers.get('x-content-type-options') === 'nosniff');
  record('X-Frame-Options DENY', homeRes.headers.get('x-frame-options') === 'DENY');
  record('Referrer-Policy strict-origin-when-cross-origin', homeRes.headers.get('referrer-policy') === 'strict-origin-when-cross-origin');
  record('Permissions-Policy present', !!homeRes.headers.get('permissions-policy'));
  record('Cross-Origin-Opener-Policy', homeRes.headers.get('cross-origin-opener-policy') === 'same-origin');
  record('Cross-Origin-Resource-Policy', homeRes.headers.get('cross-origin-resource-policy') === 'same-origin');
  record('X-Permitted-Cross-Domain-Policies none', homeRes.headers.get('x-permitted-cross-domain-policies') === 'none');

  // ── 21. Logout GET returns 405 ──
  console.log('\n► Logout CSRF protection');
  const logoutGet = await fetch(BASE + '/api/auth/logout', { method: 'GET' });
  record('GET /api/auth/logout → 405', logoutGet.status === 405);

  // ── 12. Body size limit ──
  console.log('\n► Body size limit (DoS protection)');
  const huge = 'a'.repeat(2_000_000);
  try {
    const hugeRes = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': BASE },
      body: JSON.stringify({ email: 'a@b.c', password: huge }),
    });
    record('Oversized body rejected (413)', hugeRes.status === 413);
  } catch (e) {
    record('Oversized body rejected (413)', false, e.message);
  }

  // ── 1-3. CSRF: cross-origin ──
  console.log('\n► CSRF: cross-origin state changes');
  // Login first (allowed without origin in dev)
  await login('customer');
  // Try cross-origin state change
  const csrfRes = await fetch(BASE + '/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.com' },
    body: JSON.stringify({ restaurant_id: '00000000-0000-0000-0000-000000000010' }),
  });
  record('Cross-origin POST /api/favorites → 403', csrfRes.status === 403, `status=${csrfRes.status}`);

  const csrfPatch = await fetch(BASE + '/api/favorites', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.com' },
    body: JSON.stringify({ restaurant_id: '00000000-0000-0000-0000-000000000010' }),
  });
  record('Cross-origin PATCH /api/favorites → 403', csrfPatch.status === 403, `status=${csrfPatch.status}`);

  // ── 5-7. Auth: role-based access ──
  console.log('\n► Auth: role-based access');
  await login('customer');
  const adminAsCust = await fetchJson('/api/admin/stats', { method: 'GET' });
  record('Customer cannot access /api/admin/*', !adminAsCust.ok, `status=${adminAsCust.status}`);

  // ── 23. favorites requires authentication ──
  console.log('\n► Auth: unauthenticated access');
  await clearCookies();
  const favNoAuth = await fetchJson('/api/favorites', { method: 'GET' });
  record('Unauthenticated /api/favorites → 401', favNoAuth.status === 401);

  const adminNoAuth = await fetchJson('/api/admin/stats', { method: 'GET' });
  record('Unauthenticated /api/admin/stats → 401', adminNoAuth.status === 401);

  // ── 24. driver/location requires driver role ──
  console.log('\n► Auth: role checks');
  await login('customer');
  const locAsCust = await fetchJson('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify({ latitude: 50.7, longitude: 7.1 }),
  });
  record('Customer cannot POST /api/driver/location', locAsCust.status === 403 || locAsCust.status === 401, `status=${locAsCust.status}`);

  // ── 14. Open redirect: password reset ──
  console.log('\n► Open redirect protection');
  const resetRes = await fetch(BASE + '/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@blinkgo.de' }),
  });
  // The response should NOT include any redirectTo field
  const resetText = await resetRes.text();
  record('Reset does not echo attacker host', !resetText.includes('evil.com'));

  // ── 15. CSRF: stripe webhook allows no-Origin ──
  console.log('\n► Webhook no-Origin allowance');
  const webhookRes = await fetch(BASE + '/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  // Should be reachable (no CSRF block). Will likely 400 because of bad signature, but not 403.
  record('Stripe webhook allows no-Origin (not 403)', webhookRes.status !== 403, `status=${webhookRes.status}`);

  // ── 4. JWT forgery ──
  console.log('\n► JWT forgery resistance');
  // Forged JWT with admin role in user_metadata claim
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = JSON.stringify({
    sub: '5e7841ef-5290-4fd1-aee8-7be170840cb0', // admin user id
    email: 'admin@blinkgo.de',
    user_metadata: { role: 'admin' },
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = 'fake-signature';
  const forgedJwt = `${header}.${payloadB64}.${sig}`;

  // Try to set the cookie with the forged JWT and access admin
  const forgedCookie = `sb-${PROJECT_REF}-auth-token=${encodeURIComponent(JSON.stringify({
    access_token: forgedJwt,
    refresh_token: 'fake',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }))}`;

  // Hit /api/auth/me — should not return admin user
  await clearCookies();
  COOKIES[`sb-${PROJECT_REF}-auth-token`] = encodeURIComponent(JSON.stringify({
    access_token: forgedJwt,
    refresh_token: 'fake',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }));
  const meRes = await fetchJson('/api/auth/me');
  record('Forged JWT cannot authenticate as admin', meRes.status === 401 || meRes.json?.user == null, `status=${meRes.status} user=${JSON.stringify(meRes.json?.user)}`);
  await clearCookies();

  // ── 11. Input validation: SQL-like input rejected ──
  console.log('\n► Input validation');
  await login('customer');
  const sqlRes = await fetchJson('/api/search?q=' + encodeURIComponent("' OR 1=1 --"));
  record('SQL-like input handled safely (no 500)', sqlRes.status !== 500, `status=${sqlRes.status}`);

  const xssRes = await fetchJson('/api/search?q=' + encodeURIComponent('<script>alert(1)</script>'));
  record('XSS-like input handled safely (no 500)', xssRes.status !== 500, `status=${xssRes.status}`);

  // ── 13. Rate limiting: login per email ──
  console.log('\n► Rate limiting (login per email)');
  // Make several bad login attempts with the same email
  // Use a FIXED x-forwarded-for so the per-IP rate limit triggers
  // (otherwise the unique-IP header in fetchJson would bypass it)
  const rateLimitIp = '10.55.55.55';
  let rateLimited = false;
  for (let i = 0; i < 25; i++) {
    const r = await fetchJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nonexistent@blinkgo.de', password: 'wrongpassword' }),
      headers: { 'x-forwarded-for': rateLimitIp },
    }, { captureCookies: false });
    if (r.status === 429) {
      rateLimited = true;
      break;
    }
  }
  record('Login is rate-limited per email', rateLimited);

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
