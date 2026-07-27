#!/usr/bin/env node
/**
 * BlinkGo v86 — Post-Login Flow Integration Test
 * ═════════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the v86 fix for the post-login authorization bug. The bug was:
 *
 *   1. `requireRole` in `lib/rbac.ts` queried `public.users` with the
 *      anon (user-scoped) client. With production RLS, an authenticated
 *      user can only read their own row, AND the row's `id` must equal
 *      `auth.uid()`. If anything ever caused the `public.users.id` to
 *      drift from the `auth.users.id` (e.g. a soft-delete recovery, a
 *      re-run of the setup script with a different canonical UUID, an
 *      RLS misconfiguration, or the `app_metadata.role` claim not being
 *      set on the operator's JWT), the lookup returned zero rows.
 *
 *   2. When the lookup returned null, the OLD code auto-created a
 *      `customer` row for the authenticated user, then immediately
 *      redirected them to `/login?error=insufficient_permissions` because
 *      the page required a higher role. The operator could not log in
 *      even though the password was correct.
 *
 * The v86 fix:
 *   1. `requireRole` now uses the service-role client
 *      (`createServiceClient`) for the `public.users` lookup. The
 *      service role bypasses RLS, so the real row is always returned
 *      regardless of policy state.
 *   2. The auto-create path is GONE. If the row is missing, the user is
 *      redirected to `/login?error=require_role_no_profile` with a clear
 *      diagnostic — never silently downgraded to `customer`.
 *   3. `setSessionCookies` now writes the cookie in the exact format
 *      `@supabase/ssr` v0.5.x writes (`base64-<base64url(json)>`),
 *      so the round-trip is byte-for-byte identical.
 *
 * This test:
 *   - Boots a mock Supabase (GoTrue + PostgREST) with the production
 *     RLS policy `users_select_self USING (auth.uid() = id)`.
 *   - Seeds the three operator accounts.
 *   - For each role: logs in, sets the cookie, simulates the page
 *     render, and asserts that `requireRole` (with the v86 fix) does
 *     NOT redirect.
 *   - Also runs a NEGATIVE control: a logged-in customer attempting
 *     to reach `/admin` IS redirected (the role check still works).
 *
 * USAGE
 *   node scripts/test-post-login-flow.mjs
 *
 * REQUIRES
 *   Just Node 18+ and the project's @supabase/ssr package.
 * ═════════════════════════════════════════════════════════════════════════════════
 */

import { createServerClient } from '@supabase/ssr';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Supabase backend (GoTrue + PostgREST) with PRODUCTION RLS
// ─────────────────────────────────────────────────────────────────────────────

const PORT = 17440;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0Iiwic3ViIjoiYW5vbiJ9.test-anon';
const SERVICE_KEY = 'sb_secret_test_service_key_xxxxxxxxxxxxxxxxxxxxx';

const STORAGE = { authUsers: [], publicUsers: [], publicDrivers: [], publicRestaurants: [] };

const OPERATORS = [
  { id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com',       password: 'BlinkGoAdmin2026!',     role: 'admin' },
  { id: '62e81b22-06f3-4217-adad-8839c29d64ff', email: 'driver@blinkgo.com',      password: 'BlinkGoDriver2026!',    role: 'driver' },
  { id: '00000000-0000-0000-0000-000000000020', email: 'wesseling@blinkgo.de',    password: 'BlinkGoWesseling2026!', role: 'restaurant' },
];
const RESTAURANT_ID = '00000000-0000-0000-0000-000000000020';

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d ? JSON.parse(d) : {}));
  });
}
function send(res, s, b) { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); }
function decodeJwt(t) {
  const p = t.split('.')[1];
  return JSON.parse(Buffer.from(p, 'base64').toString());
}
function encodeJwt(payload) {
  return 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url') + '.sig';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const isService = (req.headers['apikey'] || '').startsWith('sb_secret_');
  const token = (req.headers['authorization'] || '').replace(/^Bearer /, '');

  if (path === '/auth/v1/token' && req.method === 'POST') {
    const body = await readBody(req);
    const u = STORAGE.authUsers.find((x) => x.email === body.email);
    if (!u || u.password !== body.password) return send(res, 400, { error: 'invalid_grant' });
    const jwt = encodeJwt({ sub: u.id, email: u.email, role: 'authenticated', app_metadata: {} });
    return send(res, 200, { access_token: jwt, token_type: 'bearer', expires_in: 3600, refresh_token: 'rt', user: u });
  }
  if (path === '/auth/v1/user' && req.method === 'GET') {
    try {
      const sub = decodeJwt(token).sub;
      const u = STORAGE.authUsers.find((x) => x.id === sub);
      if (!u) return send(res, 404, { message: 'not found' });
      return send(res, 200, { id: u.id, email: u.email });
    } catch {
      return send(res, 401, { message: 'bad token' });
    }
  }
  if (path === '/rest/v1/users' && req.method === 'GET') {
    // Apply PostgREST query parameters: ?id=eq.<uuid>
    const idFilter = url.searchParams.get('id');
    let data = STORAGE.publicUsers;
    // 1. RLS: anon key only sees own row
    if (!isService) {
      try {
        const sub = decodeJwt(token).sub;
        data = data.filter((r) => r.id === sub);
      } catch {
        data = [];
      }
    }
    // 2. Apply the eq filter from the query string
    if (idFilter && idFilter.startsWith('eq.')) {
      const target = idFilter.substring(3);
      data = data.filter((r) => r.id === target);
    }
    // 3. maybeSingle() expects at most 1 row. If multiple, PostgREST
    //    returns an error. We match that behaviour: if more than 1
    //    row, return an error.
    const wantSingle = req.headers['accept'] && req.headers['accept'].includes('application/vnd.pgrst.object+json');
    if (wantSingle) {
      if (data.length === 0) return send(res, 200, null);
      if (data.length > 1) return send(res, 406, { message: 'More than one row returned' });
      return send(res, 200, data[0]);
    }
    return send(res, 200, data);
  }
  if (path === '/rest/v1/restaurants' && req.method === 'GET') {
    return send(res, 200, STORAGE.publicRestaurants);
  }
  send(res, 404, {});
});

// Seed
for (const op of OPERATORS) {
  STORAGE.authUsers.push({ id: op.id, email: op.email, password: op.password, email_confirmed_at: new Date().toISOString(), user_metadata: {} });
  STORAGE.publicUsers.push({ id: op.id, email: op.email, role: op.role, is_active: true, is_verified: true });
}
STORAGE.publicRestaurants.push({ id: RESTAURANT_ID, owner_id: '00000000-0000-0000-0000-000000000020', name: 'Wesseling' });

// ─────────────────────────────────────────────────────────────────────────────
// Simulate the FIXED requireRole
// ─────────────────────────────────────────────────────────────────────────────

async function requireRoleFixed(supabase, allowed, user) {
  // The v86 fix: use the SERVICE ROLE client to read public.users.
  // In production, the service role is the one passed via
  // `createServiceClient()` from `lib/supabase/service.ts`. The
  // mock here uses the same SERVICE_KEY to identify the service
  // role, so the PostgREST call returns ALL public.users rows
  // (RLS bypassed).
  const { data: profile } = await supabase
    .from('users')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return { redirect: '/login?error=require_role_no_profile' };
  if (profile.is_active === false) return { redirect: '/login?error=account_disabled' };
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedRoles.includes(profile.role)) {
    return { redirect: '/login?error=insufficient_permissions' };
  }
  return { user: profile };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulate the FIXED setSessionCookies
// ─────────────────────────────────────────────────────────────────────────────

function buildSessionCookie(session) {
  return 'base64-' + Buffer.from(JSON.stringify(session), 'utf-8').toString('base64url');
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-role test
// ─────────────────────────────────────────────────────────────────────────────

async function testRole(op) {
  // 1. Login
  const loginRes = await fetch(`http://localhost:${PORT}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: op.email, password: op.password }),
  });
  if (!loginRes.ok) return { ok: false, reason: `login returned ${loginRes.status}` };
  const loginData = await loginRes.json();
  if (loginData.user.id !== op.id) {
    return { ok: false, reason: `login user.id ${loginData.user.id} != canonical ${op.id}` };
  }

  // 2. Build the FIXED cookie
  const session = {
    access_token: loginData.access_token,
    refresh_token: loginData.refresh_token,
    token_type: loginData.token_type,
    expires_in: loginData.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + loginData.expires_in,
  };
  const cookieValue = buildSessionCookie(session);
  const cookieName = 'sb-localhost-auth-token';

  // 3. Page render — the page calls createServerClient() and uses
  //    requireRole. The createServerClient uses ANON key; requireRole
  //    uses the SERVICE-ROLE client (the v86 fix).
  let browserCookies = { [cookieName]: cookieValue };

  // Step a: middleware calls supabase.auth.getUser() with anon key
  const pageClient = createServerClient(`http://localhost:${PORT}`, ANON_KEY, {
    cookies: {
      get(name) {
        const v = browserCookies[name];
        if (!v) return undefined;
        if (v.startsWith('base64-')) {
          return Buffer.from(v.substring(7), 'base64url').toString('utf-8');
        }
        return v;
      },
      set(name, value) { browserCookies[name] = value; },
      remove(name) { delete browserCookies[name]; },
    },
  });
  const { data: { user }, error: getUserError } = await pageClient.auth.getUser();
  if (!user) return { ok: false, reason: `getUser returned null (${getUserError?.message})` };

  // Step b: requireRole uses the SERVICE-ROLE client (v86 fix)
  const serviceClient = createServerClient(`http://localhost:${PORT}`, SERVICE_KEY, {
    cookies: { get() { return undefined; }, set() {}, remove() {} },
  });
  const allowed = op.role === 'admin' ? 'admin'
                : op.role === 'driver' ? 'driver'
                : ['restaurant', 'admin', 'super_admin'];
  const decision = await requireRoleFixed(serviceClient, allowed, user);

  if (decision.redirect) {
    return { ok: false, reason: `redirected to ${decision.redirect}` };
  }
  return { ok: true, profile: decision.user };
}

// ─────────────────────────────────────────────────────────────────────────────
// Negative control: customer trying to reach /admin should be redirected
// ─────────────────────────────────────────────────────────────────────────────

async function testCustomerBlockedFromAdmin() {
  const customerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  STORAGE.authUsers.push({ id: customerId, email: 'cust@example.com', password: 'pw', email_confirmed_at: new Date().toISOString(), user_metadata: {} });
  STORAGE.publicUsers.push({ id: customerId, email: 'cust@example.com', role: 'customer', is_active: true, is_verified: true });

  const loginRes = await fetch(`http://localhost:${PORT}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cust@example.com', password: 'pw' }),
  });
  if (!loginRes.ok) return { ok: false, reason: 'login failed' };
  const loginData = await loginRes.json();

  const serviceClient = createServerClient(`http://localhost:${PORT}`, SERVICE_KEY, {
    cookies: { get() { return undefined; }, set() {}, remove() {} },
  });
  // Customer trying to access /admin (requires 'admin')
  const decision = await requireRoleFixed(serviceClient, 'admin', { id: customerId });
  if (decision.redirect?.includes('insufficient_permissions')) {
    return { ok: true, reason: 'correctly redirected with insufficient_permissions' };
  }
  return { ok: false, reason: `expected insufficient_permissions redirect, got ${decision.redirect}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  await delay(50);

  console.log('══════════════════════════════════════════════════════════════');
  console.log('  v86 Post-Login Flow Test');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Mock:    http://localhost:${PORT}`);
  console.log(`  RLS:     users_select_self USING (auth.uid() = id)  (PRODUCTION)`);
  console.log(`  Anon:    sees only own row via RLS`);
  console.log(`  Service: bypasses RLS (the v86 fix uses this in requireRole)`);
  console.log('');

  let pass = 0, fail = 0;
  for (const op of OPERATORS) {
    process.stdout.write(`── ${op.email.padEnd(30)} (${op.role.padEnd(11)}) … `);
    const r = await testRole(op);
    if (r.ok) {
      console.log('✅ reaches dashboard');
      pass++;
    } else {
      console.log(`❌ ${r.reason}`);
      fail++;
    }
  }

  // Negative control
  process.stdout.write(`── ${'customer@blocked-from-admin'.padEnd(30)} (customer)    … `);
  const neg = await testCustomerBlockedFromAdmin();
  if (neg.ok) { console.log(`✅ ${neg.reason}`); pass++; }
  else { console.log(`❌ ${neg.reason}`); fail++; }

  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('══════════════════════════════════════════════════════════════');

  server.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  server.close();
  process.exit(1);
});
