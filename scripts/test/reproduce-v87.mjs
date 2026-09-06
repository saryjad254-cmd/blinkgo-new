/**
 * Reproduce the production redirect with the v87 fix.
 *
 * The v87 architectural fix: read the role from the JWT's user_metadata
 * (set by the Admin API at user creation) FIRST, then fall back to the
 * public.users DB query (for OAuth users).
 */
import { createServerClient } from '@supabase/ssr';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 17502;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0Iiwic3ViIjoiYW5vbiJ9.test-anon';
const SERVICE_KEY = 'test-service-role-key-xxxxxxxxxxxxxxxxxxxxxxxx';

function readBody(req) { return new Promise((r) => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); }); }
function send(res, s, b) { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); }
function decodeJwt(t) { return JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()); }
function encodeJwt(p) { return 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(p), 'utf-8').toString('base64url') + '.sig'; }

const STORAGE = { authUsers: [], publicUsers: [] };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const isService = req.headers['apikey'] === SERVICE_KEY;
  const token = (req.headers['authorization'] || '').replace(/^Bearer /, '');
  const idFilter = url.searchParams.get('id');

  if (path === '/auth/v1/token' && req.method === 'POST') {
    const body = await readBody(req);
    const u = STORAGE.authUsers.find(x => x.email === body.email);
    if (!u || u.password !== body.password) return send(res, 400, { error: 'invalid_grant' });
    const user_metadata = u.user_metadata || {};
    const app_metadata = u.app_metadata || {};
    const jwt = encodeJwt({ sub: u.id, email: u.email, role: 'authenticated', user_metadata, app_metadata });
    return send(res, 200, { access_token: jwt, token_type: 'bearer', expires_in: 3600, refresh_token: 'rt', user: u });
  }
  if (path === '/auth/v1/user' && req.method === 'GET') {
    try {
      const payload = decodeJwt(token);
      const u = STORAGE.authUsers.find(x => x.id === payload.sub);
      if (!u) return send(res, 404, {});
      return send(res, 200, { id: u.id, email: u.email, user_metadata: u.user_metadata, app_metadata: u.app_metadata });
    } catch { return send(res, 401, {}); }
  }
  if (path === '/rest/v1/users' && req.method === 'GET') {
    let data = STORAGE.publicUsers;
    if (!isService) {
      try { const sub = decodeJwt(token).sub; data = data.filter(r => r.id === sub); } catch { data = []; }
    }
    if (idFilter && idFilter.startsWith('eq.')) {
      data = data.filter(r => r.id === idFilter.substring(3));
    }
    const wantSingle = (req.headers['accept'] || '').includes('application/vnd.pgrst.object+json');
    if (wantSingle) {
      if (data.length === 0) return send(res, 200, null);
      if (data.length > 1) return send(res, 406, { message: 'multiple' });
      return send(res, 200, data[0]);
    }
    return send(res, 200, data);
  }
  send(res, 404, {});
});

// v87 requireRole: read role from JWT first, fall back to public.users
async function requireRoleV87(userClient, serviceClient, allowed) {
  const { data: { user }, error: getUserError } = await userClient.auth.getUser();
  if (getUserError || !user) return { redirect: '/login?error=require_role_auth' };

  // Read role from JWT first
  const jwtUserRole = typeof user.user_metadata?.role === 'string'
    ? user.user_metadata.role : null;
  const jwtAppRole = typeof user.app_metadata?.role === 'string'
    ? user.app_metadata.role : null;
  let role = jwtUserRole ?? jwtAppRole;
  let roleSource = jwtUserRole ? 'jwt-user_metadata' : (jwtAppRole ? 'jwt-app_metadata' : null);
  let profile = null;

  // Fall back to public.users only if role is NOT in JWT
  if (!role) {
    const { data: p } = await serviceClient
      .from('users')
      .select('id, email, name, role, is_active, is_verified')
      .eq('id', user.id)
      .maybeSingle();
    profile = p;
    role = p?.role ?? null;
    roleSource = 'public_users';
  }

  if (!role) return { redirect: '/login?error=require_role_no_profile' };

  // Build authed user
  let authed;
  if (profile) {
    authed = { id: profile.id, email: profile.email, role: profile.role, name: profile.name, isActive: profile.is_active !== false, isVerified: profile.is_verified === true };
  } else {
    // Role came from JWT, need display fields
    const { data: p } = await serviceClient
      .from('users')
      .select('id, email, name, role, is_active, is_verified')
      .eq('id', user.id)
      .maybeSingle();
    authed = {
      id: p?.id ?? user.id,
      email: p?.email ?? user.email ?? null,
      role,
      name: p?.name ?? null,
      isActive: p?.is_active !== false,
      isVerified: p?.is_verified === true,
    };
  }

  // Role check
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  const roleRank = { super_admin: 3, admin: 2, manager: 1 };
  const highestAdminRankInAllowed = Math.max(0, ...allowedRoles.map(r => roleRank[r] ?? 0));
  const userRank = roleRank[authed.role] ?? 0;
  const adminHierarchyOk = highestAdminRankInAllowed > 0 && userRank >= highestAdminRankInAllowed;

  if (!allowedRoles.includes(authed.role) && !adminHierarchyOk) {
    return { redirect: '/login?error=insufficient_permissions', role, roleSource };
  }
  return { ok: true, role, roleSource };
}

async function runScenario(name, scenarioSetup, allowed) {
  STORAGE.authUsers = [];
  STORAGE.publicUsers = [];
  scenarioSetup();
  console.log(`\n── ${name} ─────────────────────────────────────────────────`);
  console.log(`   publicUsers: ${JSON.stringify(STORAGE.publicUsers.map(p => ({ id: p.id, role: p.role })))}`);

  const admin = STORAGE.authUsers[0];
  if (!admin) { console.log('   no auth user'); return; }

  const loginRes = await fetch(`http://localhost:${PORT}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: admin.password }),
  });
  if (!loginRes.ok) { console.log('   ❌ login failed'); return; }
  const loginData = await loginRes.json();
  const session = {
    access_token: loginData.access_token, refresh_token: loginData.refresh_token,
    token_type: loginData.token_type, expires_in: loginData.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + loginData.expires_in,
  };
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session), 'utf-8').toString('base64url');
  const cookieName = 'sb-localhost-auth-token';
  const userClient = createServerClient(`http://localhost:${PORT}`, ANON_KEY, {
    cookies: {
      get(name) {
        if (name === cookieName) {
          return cookieValue.startsWith('base64-')
            ? Buffer.from(cookieValue.substring(7), 'base64url').toString('utf-8')
            : cookieValue;
        }
        return undefined;
      },
      set() {}, remove() {},
    },
  });
  const serviceClient = createServerClient(`http://localhost:${PORT}`, SERVICE_KEY, {
    cookies: { get() { return undefined; }, set() {}, remove() {} },
  });

  const result = await requireRoleV87(userClient, serviceClient, allowed);
  if (result.redirect) {
    console.log(`   ❌ REDIRECTED → ${result.redirect}`);
  } else {
    console.log(`   ✅ OK, role="${result.role}" source=${result.roleSource}`);
  }
}

await new Promise(r => server.listen(PORT, r));
await delay(100);

// ===== Tests that should now PASS with the v87 fix =====

// A. Happy path (this worked before too)
await runScenario('A. happy path — single row, role=admin', () => {
  STORAGE.authUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', password: 'pw', user_metadata: { role: 'admin' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'admin', is_active: true, is_verified: true });
}, 'admin');

// B. The PRODUCTION BUG: duplicate rows (canonical + auto-created)
await runScenario('B. PRODUCTION BUG — duplicate rows, auto-created customer masks canonical admin', () => {
  STORAGE.authUsers.push({ id: '62e81b22-06f3-4217-adad-8839c29d64ff', email: 'driver@blinkgo.com', password: 'pw', user_metadata: { role: 'driver' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'admin', is_active: true, is_verified: true });
  STORAGE.publicUsers.push({ id: '62e81b22-06f3-4217-adad-8839c29d64ff', email: 'driver@blinkgo.com', role: 'customer', is_active: true, is_verified: true });
}, 'driver');

// C. ID drift (auth.users.id != public.users.id for any row)
await runScenario('C. ID drift — auth.users.id has no matching public.users row', () => {
  STORAGE.authUsers.push({ id: 'abcd1234-5678-90ab-cdef-111111111111', email: 'admin@blinkgo.com', password: 'pw', user_metadata: { role: 'admin' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'admin', is_active: true, is_verified: true });
}, 'admin');

// D. Case mismatch in public.users
await runScenario('D. case mismatch in public.users — role = "Admin" with capital A', () => {
  STORAGE.authUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', password: 'pw', user_metadata: { role: 'admin' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'Admin', is_active: true, is_verified: true });
}, 'admin');

// E. Restaurant user
await runScenario('E. restaurant — wesseling@blinkgo.de', () => {
  STORAGE.authUsers.push({ id: '00000000-0000-0000-0000-000000000020', email: 'wesseling@blinkgo.de', password: 'pw', user_metadata: { role: 'restaurant' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000020', email: 'wesseling@blinkgo.de', role: 'restaurant', is_active: true, is_verified: true });
}, ['restaurant', 'admin', 'super_admin']);

// F. OAuth user (role NOT in JWT, only in public.users)
await runScenario('F. OAuth user — role only in public.users, NOT in JWT', () => {
  STORAGE.authUsers.push({ id: 'oauth-uuid-aaaa-bbbb-cccc', email: 'oauth@example.com', password: 'pw', user_metadata: {} });
  STORAGE.publicUsers.push({ id: 'oauth-uuid-aaaa-bbbb-cccc', email: 'oauth@example.com', role: 'admin', is_active: true, is_verified: true });
}, 'admin');

// G. Negative: customer trying to reach /admin (should redirect)
await runScenario('G. customer trying to reach /admin (should redirect)', () => {
  STORAGE.authUsers.push({ id: 'cust-uuid-xxxx-yyyy-zzzz', email: 'cust@example.com', password: 'pw', user_metadata: { role: 'customer' } });
  STORAGE.publicUsers.push({ id: 'cust-uuid-xxxx-yyyy-zzzz', email: 'cust@example.com', role: 'customer', is_active: true, is_verified: true });
}, 'admin');

server.close();
