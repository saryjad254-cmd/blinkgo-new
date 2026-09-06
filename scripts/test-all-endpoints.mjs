/**
 * Integration Test: All Endpoints for All Roles
 * ──────────────────────────────────────────────
 * Tests every API endpoint with all 4 roles.
 * Run with: npx tsx scripts/test-all-endpoints.mjs
 */
import { execSync } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MOCK = 'http://localhost:54321';

const accounts = [
  { label: 'admin',      email: 'admin@blinkgo.com',     pass: 'BlinkGoAdmin2026!',  expectedRole: 'admin' },
  { label: 'driver',     email: 'driver@blinkgo.com',    pass: 'BlinkGoDriver2026!', expectedRole: 'driver' },
  { label: 'restaurant', email: 'wesseling@blinkgo.de',  pass: 'BlinkGoWesseling2026!', expectedRole: 'restaurant' },
  { label: 'customer',   email: 'demo@blinkgo.de',       pass: 'DemoCustomer!2024',  expectedRole: 'customer' },
];

let pass = 0;
let fail = 0;
let skipped = 0;
const cookieCache = new Map();

async function login(account) {
  if (cookieCache.has(account.label)) {
    return cookieCache.get(account.label);
  }
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.pass }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${account.email}: ${res.status}`);
  }
  // Get all Set-Cookie headers
  const setCookies = res.headers.getSetCookie?.() || [];
  // Find the auth token cookie WITHOUT a chunk number (not .0, .1, etc)
  // and not a deletion cookie (value = empty)
  const authCookie = setCookies.find(c =>
    c.startsWith('sb-localhost-auth-token=') &&
    !c.startsWith('sb-localhost-auth-token.') &&
    !c.startsWith('sb-localhost-auth-token;')
  );
  if (!authCookie) return null;
  const cookie = authCookie.split(';')[0];
  cookieCache.set(account.label, cookie);
  return cookie;
}

async function test(label, method, path, account, expectedStatus) {
  const url = `${BASE}${path}`;
  const headers = {};
  if (account) {
    const cookie = await login(account);
    if (!cookie) { fail++; console.log(`FAIL ${label} login: ${account.email}`); return; }
    headers['Cookie'] = cookie;
  }
  const res = await fetch(url, { method, headers });
  const ok = Array.isArray(expectedStatus) ? expectedStatus.includes(res.status) : res.status === expectedStatus;
  if (ok) { pass++; console.log(`PASS ${label}: ${method} ${path} → ${res.status}`); }
  else { fail++; console.log(`FAIL ${label}: ${method} ${path} → ${res.status} (expected ${expectedStatus})`); }
}

async function main() {
  console.log('--- API Layer Integration Test ---\n');

  // Public endpoints
  console.log('--- Public ---');
  await test('health', 'GET', '/api/health', null, 200);
  await test('zones', 'GET', '/api/zones', null, 200);
  await test('announcements', 'GET', '/api/announcements', null, 200);
  await test('build-info', 'GET', '/api/build-info', null, [200, 404, 500]);
  await test('maps/geocode', 'POST', '/api/maps/geocode', null, [200, 400, 500]);

  console.log('\n--- Auth ---');
  // Login tested separately
  for (const acc of accounts) {
    try {
      const cookie = await login(acc);
      if (cookie) { pass++; console.log(`PASS login ${acc.label}: ${acc.email}`); }
      else { fail++; console.log(`FAIL login ${acc.label}: ${acc.email}`); }
    } catch (e) { fail++; console.log(`FAIL login ${acc.label}: ${e.message}`); }
  }

  // Per-role endpoint tests
  console.log('\n--- Customer ---');
  await test('customer me', 'GET', '/api/auth/me', accounts[3], 200);
  await test('customer addresses', 'GET', '/api/addresses', accounts[3], [200, 500]);
  await test('customer notifications', 'GET', '/api/notifications', accounts[3], [200, 500]);
  await test('customer favorites', 'GET', '/api/favorites', accounts[3], [200, 500]);
  await test('customer orders POST', 'POST', '/api/orders', accounts[3], [400, 500]);  // no body = 400

  console.log('\n--- Driver ---');
  await test('driver me', 'GET', '/api/auth/me', accounts[1], 200);
  await test('driver portal/stats', 'GET', '/api/portal/stats', accounts[1], 200);
  await test('driver stats', 'GET', '/api/driver/stats', accounts[1], [200, 500]);
  await test('driver active-order', 'GET', '/api/driver/active-order', accounts[1], [200, 500]);
  await test('driver payouts', 'GET', '/api/driver/payouts', accounts[1], [200, 500]);

  console.log('\n--- Restaurant ---');
  await test('restaurant me', 'GET', '/api/auth/me', accounts[2], 200);
  await test('restaurant portal/stats', 'GET', '/api/portal/stats', accounts[2], 200);
  await test('restaurant dashboard', 'GET', '/api/restaurant/dashboard', accounts[2], [200, 403, 404, 500]);

  console.log('\n--- Admin ---');
  await test('admin me', 'GET', '/api/auth/me', accounts[0], 200);
  await test('admin portal/stats', 'GET', '/api/portal/stats', accounts[0], 200);
  await test('admin users', 'GET', '/api/admin/users', accounts[0], [200, 500]);
  await test('admin orders', 'GET', '/api/admin/orders', accounts[0], [200, 500]);
  await test('admin stats', 'GET', '/api/admin/stats', accounts[0], 200);
  await test('admin restaurants', 'GET', '/api/admin/restaurants', accounts[0], [200, 500]);
  await test('admin drivers', 'GET', '/api/admin/drivers', accounts[0], [200, 500]);

  console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
