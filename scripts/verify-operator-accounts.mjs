#!/usr/bin/env node
/**
 * BlinkGo v79.2 — Operator Account Verification
 * ───────────────────────────────────────────────
 * Diagnostic dump of the three pre-launch operator accounts:
 *   1. auth.users: id, email, email_confirmed_at, last_sign_in_at, created_at
 *   2. public.users: id, email, role, is_active, is_verified
 *   3. public.drivers (driver only): status, is_online, is_available, vehicle_type
 *   4. public.restaurants ownership (restaurant only): owner_id, name
 *   5. Live auth login test for each account (POST /api/auth/login)
 *   6. Session validation test (GET /api/auth/me with the cookie)
 *
 * Uses raw `fetch` with only the `apikey` header (the new
 * `sb_secret_*` key format breaks `Authorization: Bearer`).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.blinkgo.de';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gotrueAdmin(pathname, { method = 'GET', body, maxRetries = 6 } = {}) {
  const url = `${SUPABASE_URL}/auth/v1/admin${pathname}`;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
    if (res.ok) return json;
    const msg = json?.msg || json?.message || text || `HTTP ${res.status}`;
    if ((msg.includes('invalid JWT') || res.status >= 500) && attempt < maxRetries) {
      await sleep(Math.min(2000, attempt * 300));
      continue;
    }
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
}

async function postgrest(path, { method = 'GET', body, headers = {} } = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PostgREST ${method} ${path} → ${res.status}: ${t}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function liveLogin(email, password) {
  const res = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: APP_URL,
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  return { status: res.status, setCookie, body: json };
}

async function getMe(cookieValue) {
  const res = await fetch(`${APP_URL}/api/auth/me?_=${Date.now()}`, {
    headers: { Cookie: cookieValue, 'Cache-Control': 'no-cache' },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  return { status: res.status, body: json };
}

function extractAuthTokenCookie(setCookieHeader) {
  // Multi-cookie header can have several cookies separated by ', '
  // but each cookie has a single '=' value pair. The auth-token value
  // starts with %7B (URL-encoded {) and contains 'access_token'.
  const parts = setCookieHeader.split(/, (?=[^;]+=[^;]+;)/);
  for (const p of parts) {
    if (p.includes('-auth-token=')) {
      const v = p.split('-auth-token=')[1].split(';')[0];
      return `sb-rhdaffhlrglyknxtucux-auth-token=${v}`;
    }
  }
  return null;
}

const TARGETS = [
  {
    role: 'admin',
    uuid: '00000000-0000-0000-0000-000000000004',
    email: 'admin@blinkgo.com',
    password: 'BlinkGoAdmin2026!',
  },
  {
    role: 'driver',
    uuid: '62e81b22-06f3-4217-adad-8839c29d64ff',
    email: 'driver@blinkgo.com',
    password: 'BlinkGoDriver2026!',
  },
  {
    role: 'restaurant',
    uuid: '00000000-0000-0000-0000-000000000020',
    email: 'wesseling@blinkgo.de',
    password: 'BlinkGoWesseling2026!',
  },
];

function fmt(v) {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'boolean') return v ? 'YES' : 'NO';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

(async () => {
  console.log('=== BlinkGo v79.2 — Operator Account Verification ===');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`App URL:      ${APP_URL}`);
  console.log('');

  let allOk = true;

  for (const t of TARGETS) {
    console.log(`\n──── ${t.role.toUpperCase()} (${t.email}) ────`);

    // 1. auth.users via Admin API
    let auth = null;
    try {
      auth = await gotrueAdmin(`/users/${encodeURIComponent(t.uuid)}`);
    } catch (e) {
      console.log(`  auth.users: ERROR — ${e.message}`);
      allOk = false;
    }
    if (auth) {
      const ok = auth.email === t.email && !!auth.email_confirmed_at;
      console.log(`  auth.users:`);
      console.log(`    id:                 ${auth.id}`);
      console.log(`    email:              ${fmt(auth.email)} ${auth.email === t.email ? '✅' : '❌'}`);
      console.log(`    email_confirmed_at: ${fmt(auth.email_confirmed_at)} ${auth.email_confirmed_at ? '✅' : '❌'}`);
      console.log(`    last_sign_in_at:    ${fmt(auth.last_sign_in_at)}`);
      console.log(`    created_at:         ${fmt(auth.created_at)}`);
      console.log(`    provider:           ${fmt(auth.app_metadata?.provider)}`);
      if (!ok) allOk = false;
    }

    // 2. public.users via PostgREST
    let profile = null;
    try {
      const rows = await postgrest(`/users?id=eq.${t.uuid}&select=id,email,name,role,is_active,is_verified`);
      profile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch (e) {
      console.log(`  public.users: ERROR — ${e.message}`);
      allOk = false;
    }
    if (profile) {
      const roleOk = profile.role === t.role;
      const activeOk = profile.is_active === true;
      console.log(`  public.users:`);
      console.log(`    id:         ${profile.id}`);
      console.log(`    email:      ${fmt(profile.email)}`);
      console.log(`    role:       ${fmt(profile.role)} ${roleOk ? '✅' : '❌'}`);
      console.log(`    is_active:  ${fmt(profile.is_active)} ${activeOk ? '✅' : '❌'}`);
      console.log(`    is_verified:${fmt(profile.is_verified)}`);
      if (!roleOk || !activeOk) allOk = false;
    } else {
      console.log(`  public.users: ❌ no row at id=${t.uuid}`);
      allOk = false;
    }

    // 3. Role-specific extras
    if (t.role === 'driver') {
      let drv = null;
      try {
        const rows = await postgrest(`/drivers?id=eq.${t.uuid}&select=*`);
        drv = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      } catch (e) {
        console.log(`  public.drivers: ERROR — ${e.message}`);
      }
      if (drv) {
        console.log(`  public.drivers:`);
        console.log(`    id:           ${drv.id}`);
        console.log(`    vehicle_type: ${fmt(drv.vehicle_type)}`);
        console.log(`    status:       ${fmt(drv.status)}`);
        console.log(`    is_online:    ${fmt(drv.is_online)}`);
        console.log(`    is_available: ${fmt(drv.is_available)}`);
        console.log(`    city:         ${fmt(drv.city)}`);
      } else {
        console.log(`  public.drivers: ❌ no row at id=${t.uuid}`);
        allOk = false;
      }
    }

    if (t.role === 'restaurant') {
      let rest = null;
      try {
        const rows = await postgrest(`/restaurants?id=eq.${t.uuid}&select=id,name,owner_id,is_active`);
        rest = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      } catch (e) {
        console.log(`  public.restaurants: ERROR — ${e.message}`);
      }
      if (rest) {
        const ownerOk = rest.owner_id === t.uuid;
        console.log(`  public.restaurants (Wesseling):`);
        console.log(`    id:        ${rest.id}`);
        console.log(`    name:      ${rest.name}`);
        console.log(`    owner_id:  ${rest.owner_id} ${ownerOk ? '✅' : '❌'}`);
        console.log(`    is_active: ${rest.is_active}`);
        if (!ownerOk) allOk = false;
      } else {
        console.log(`  public.restaurants: ❌ no row at id=${t.uuid}`);
        allOk = false;
      }
    }

    // 4. Live login + /me
    try {
      const login = await liveLogin(t.email, t.password);
      const loginOk = login.status === 200 && login.body?.ok === true;
      console.log(`  live login: HTTP ${login.status} ${loginOk ? '✅' : '❌'}`);
      if (loginOk) {
        const cookie = extractAuthTokenCookie(login.setCookie);
        if (cookie) {
          const me = await getMe(cookie);
          const meId = me.body?.user?.id;
          const meOk = meId === t.uuid;
          console.log(`  /me session: HTTP ${me.status} id=${meId} ${meOk ? '✅' : '❌'}`);
          console.log(`  redirect path: ${login.body?.data?.redirect || '∅'}`);
          if (!meOk) allOk = false;
        } else {
          console.log(`  /me session: ❌ no auth cookie returned`);
          allOk = false;
        }
      } else {
        console.log(`  live login error: ${login.body?.error || login.body?.message || 'unknown'}`);
        allOk = false;
      }
    } catch (e) {
      console.log(`  live login: ERROR — ${e.message}`);
      allOk = false;
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(allOk ? '  ✅ All 3 operator accounts are correctly mapped and login works.' : '  ❌ One or more checks FAILED. See output above.');
  process.exit(allOk ? 0 : 1);
})();
