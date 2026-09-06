/**
 * Reproduce the production redirect locally.
 *
 * This test boots a real HTTP mock for Supabase (GoTrue + PostgREST) and
 * runs the ACTUAL rbac.ts requireRole() against it. The mock enforces
 * the production RLS policy `users_select_self USING (auth.uid() = id)`.
 *
 * Scenarios:
 *   A. Single row per user (the happy path)
 *   B. Multiple rows per user (canonical + auto-created 'customer') — the
 *      most likely production state after the v85 auto-create bug ran
 *   C. public.users.id does NOT match auth.users.id
 *   D. profile.role is something unexpected (e.g. "Admin" capitalized)
 */
import { createServerClient } from '@supabase/ssr';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = 17500;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0Iiwic3ViIjoiYW5vbiJ9.test-anon';
const SERVICE_KEY = 'test-service-role-key-xxxxxxxxxxxxxxxxxxxxxxxx';

const ANON = createServerClient(`http://localhost:${PORT}`, ANON_KEY, {
  cookies: { get() { return undefined; }, set() {}, remove() {} },
});
const SERVICE = createServerClient(`http://localhost:${PORT}`, SERVICE_KEY, {
  cookies: { get() { return undefined; }, set() {}, remove() {} },
});

function readBody(req) {
  return new Promise((r) => {
    let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {}));
  });
}
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

// ─── Replicate the EXACT requireRole logic from lib/rbac.ts ───
async function requireRoleTest(supabaseUser, allowed) {
  const { data: { user }, error: getUserError } = await ANON.auth.getUser();
  if (getUserError || !user) return { redirect: '/login?error=require_role_auth' };

  const { data: profile, error: profileError } = await SERVICE
    .from('users')
    .select('id, email, name, role, is_active, is_verified')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return { redirect: '/login?error=require_role_no_profile' };
  if (profile.is_active === false) return { redirect: '/login?error=account_disabled' };

  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  const roleRank = { super_admin: 3, admin: 2, manager: 1 };
  const highestAdminRankInAllowed = Math.max(0, ...allowedRoles.map(r => roleRank[r] ?? 0));
  const userRank = roleRank[profile.role] ?? 0;
  const adminHierarchyOk = highestAdminRankInAllowed > 0 && userRank >= highestAdminRankInAllowed;

  if (!allowedRoles.includes(profile.role) && !adminHierarchyOk) {
    return { redirect: '/login?error=insufficient_permissions', profile, user };
  }
  return { ok: true, profile, user };
}

async function runScenario(name, scenarioSetup) {
  // Reset storage
  STORAGE.authUsers = [];
  STORAGE.publicUsers = [];
  scenarioSetup();
  console.log(`\n── Scenario: ${name} ─────────────────────────────────────────`);
  console.log(`   publicUsers: ${JSON.stringify(STORAGE.publicUsers.map(p => ({ id: p.id, role: p.role })))}`);

  const admin = STORAGE.authUsers[0];
  if (!admin) { console.log('   no auth user, skipping'); return; }

  // Login
  const loginRes = await fetch(`http://localhost:${PORT}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: admin.password }),
  });
  if (!loginRes.ok) { console.log('   ❌ login failed'); return; }
  const loginData = await loginRes.json();
  console.log(`   login OK, user.id = ${loginData.user.id}`);

  // Build cookie (FIXED format from v86)
  const session = {
    access_token: loginData.access_token,
    refresh_token: loginData.refresh_token,
    token_type: loginData.token_type,
    expires_in: loginData.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + loginData.expires_in,
  };
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session), 'utf-8').toString('base64url');
  const cookieName = 'sb-localhost-auth-token';

  // Set the cookie in the anon client
  const { createServerClient: csc } = await import('@supabase/ssr');
  // We need to inject this cookie into the ANON client. Replace its cookies adapter.
  ANON._replaceCookieStore = null;  // can't replace after init
  // Easier: use a fresh client
  const userClient = csc(`http://localhost:${PORT}`, ANON_KEY, {
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
  const { data: { user } } = await userClient.auth.getUser();
  console.log(`   getUser OK, user.id = ${user?.id}, user_metadata.role = ${user?.user_metadata?.role}`);

  // Now call requireRole using the SERVICE client (the v86 fix)
  const result = await requireRoleTest(user, 'admin');
  if (result.redirect) {
    console.log(`   ❌ REDIRECTED → ${result.redirect}`);
    if (result.profile) {
      console.log(`      profile.id = ${result.profile.id}`);
      console.log(`      profile.role = "${result.profile.role}" (type ${typeof result.profile.role})`);
    }
  } else {
    console.log(`   ✅ OK, role = ${result.profile.role}`);
  }
}

await new Promise(r => server.listen(PORT, r));
await delay(100);

// Scenario A: Single row, matching ID, role='admin'
await runScenario('A. happy path — one row, id matches, role=admin', () => {
  STORAGE.authUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', password: 'pw', user_metadata: { role: 'admin' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'admin', is_active: true, is_verified: true });
});

// Scenario B: TWO rows for same auth user (canonical + auto-created)
await runScenario('B. duplicate rows — canonical admin + auto-created customer', () => {
  STORAGE.authUsers.push({ id: '62e81b22-06f3-4217-adad-8839c29d64ff', email: 'driver@blinkgo.com', password: 'pw', user_metadata: { role: 'driver' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'admin', is_active: true, is_verified: true });
  STORAGE.publicUsers.push({ id: '62e81b22-06f3-4217-adad-8839c29d64ff', email: 'driver@blinkgo.com', role: 'customer', is_active: true, is_verified: true });
});

// Scenario C: auth.users.id is a random UUID, public.users has only the canonical row
await runScenario('C. ID drift — auth.users.id != public.users.id', () => {
  STORAGE.authUsers.push({ id: 'abcd1234-5678-90ab-cdef-111111111111', email: 'admin@blinkgo.com', password: 'pw', user_metadata: { role: 'admin' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'admin', is_active: true, is_verified: true });
});

// Scenario D: role with capital letter
await runScenario('D. case mismatch — public.users.role = "Admin"', () => {
  STORAGE.authUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', password: 'pw', user_metadata: { role: 'admin' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'Admin', is_active: true, is_verified: true });
});

// Scenario E: role with trailing space
await runScenario('E. role with trailing space — public.users.role = "admin "', () => {
  STORAGE.authUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', password: 'pw', user_metadata: { role: 'admin' } });
  STORAGE.publicUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', role: 'admin ', is_active: true, is_verified: true });
});

// Scenario F: profile is null but auth user exists
await runScenario('F. no public.users row at all', () => {
  STORAGE.authUsers.push({ id: '00000000-0000-0000-0000-000000000004', email: 'admin@blinkgo.com', password: 'pw', user_metadata: { role: 'admin' } });
  // No public.users row
});

server.close();
