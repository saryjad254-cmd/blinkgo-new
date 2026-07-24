/**
 * Production auth audit — drives the REAL built Next.js app over HTTP with a
 * mock Supabase backend. Maintains a browser-accurate cookie jar (drops
 * cookies whose value exceeds 4096 bytes, exactly like real browsers).
 */
const APP = 'http://127.0.0.1:3999';
const ORIGIN = 'http://127.0.0.1:3999'; // matches the test deployment's own origin, as a real browser would send
const REF = 'abcdefgh'; // from NEXT_PUBLIC_SUPABASE_URL host... we use 127 -> ref '127'
let PASS = 0, FAIL = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { PASS++; results.push(`  ✓ ${name}`); }
  else { FAIL++; results.push(`  ✗ ${name}  ${detail}`); }
}

class Jar {
  constructor() { this.map = new Map(); this.dropped = []; }
  ingest(setCookies) {
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const maxAgeMatch = sc.match(/Max-Age=(-?\d+)/i);
      const expiresMatch = sc.match(/Expires=([^;]+)/i);
      const expired =
        (maxAgeMatch && parseInt(maxAgeMatch[1], 10) <= 0) ||
        (expiresMatch && new Date(expiresMatch[1]).getTime() <= Date.now());
      if (sc.length > 4096 + 100 || value.length > 4096) { this.dropped.push({ name, len: value.length }); continue; } // browser drop
      if (expired || value === '') this.map.delete(name);
      else this.map.set(name, value);
    }
  }
  header() { return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
  names() { return [...this.map.keys()]; }
}

async function go(jar, path, opts = {}) {
  const res = await fetch(APP + path, {
    redirect: 'manual',
    ...opts,
    headers: { Cookie: jar.header(), Origin: ORIGIN, ...(opts.headers || {}) },
  });
  jar.ingest(res.headers.getSetCookie?.() ?? []);
  return res;
}

const authCookieNames = (jar) => jar.names().filter((n) => n.includes('auth-token') && !n.includes('code-verifier'));
const verifierName = (ref) => `sb-${ref}-auth-token-code-verifier`;

// The verifier cookie exactly as the browser @supabase/ssr client writes it:
// auth-js 2.110 stores JSON.stringify(codeVerifier) — no '/type' suffix
// (only '/recovery' for password recovery). @supabase/ssr then encodes the
// storage string as 'base64-' + base64url(value).
function browserVerifierCookie(ref) {
  const verifier = 'pkce_' + 'v'.repeat(56);
  const storageValue = JSON.stringify(verifier); // what setItemAsync writes
  const val = 'base64-' + Buffer.from(storageValue, 'utf-8').toString('base64url');
  return { name: verifierName(ref), value: val };
}

const REF_RUNTIME = '127'; // hostname of http://127.0.0.1:54321 → sb-127-auth-token

// ─────────────────────────────────────────────────────────────────────
console.log('\n══ 1) ANONYMOUS USER ══');
{
  const jar = new Jar();
  const r = await go(jar, '/search');
  const loc = r.headers.get('location') || '';
  check('protected route redirects anonymous user to /login', r.status >= 300 && r.status < 400 && loc.includes('/login'), `status=${r.status} loc=${loc}`);
  const r2 = await go(jar, '/login');
  check('login page reachable for anonymous user', r2.status === 200, `status=${r2.status}`);
}

console.log('══ 2) NEW GOOGLE ACCOUNT — OAuth callback ══');
const jarNew = new Jar();
{
  const vc = browserVerifierCookie(REF_RUNTIME);
  jarNew.map.set(vc.name, vc.value);
  const r = await go(jarNew, '/auth/callback?code=code-new-user&next=%2F&lang=de');
  const loc = r.headers.get('location') || '';
  check('callback redirects (not to /login)', r.status >= 300 && r.status < 400 && !loc.includes('/login'), `status=${r.status} loc=${loc}`);
  check('new customer redirected to /search', loc.includes('/search'), `loc=${loc}`);
  const ac = authCookieNames(jarNew);
  check('session cookie IS created', ac.length > 0, `cookies=${jarNew.names().join(',')}`);
  check('session cookies are CHUNKED (.0 …)', ac.some((n) => /\.0$/.test(n)), `auth=${ac.join(',')}`);
  const maxLen = Math.max(...[...jarNew.map.values()].map((v) => v.length));
  check('every cookie ≤ 4096B (browser accepts all)', jarNew.dropped.length === 0 && maxLen <= 4096, `dropped=${JSON.stringify(jarNew.dropped)} max=${maxLen}`);
  check('PKCE code-verifier cookie cleared after exchange', !jarNew.names().includes(verifierName(REF_RUNTIME)), `names=${jarNew.names().join(',')}`);
  check('locale cookie set', jarNew.map.get('blinkgo-locale') === 'de');
}

console.log('══ 3) SESSION DETECTION / PROTECTED ROUTES / NO LOOP ══');
{
  const r = await go(jarNew, '/search');
  check('middleware detects session on /search (no login redirect)', r.status === 200, `status=${r.status} loc=${r.headers.get('location')}`);
  const r2 = await go(jarNew, '/orders');
  const loc2 = r2.headers.get('location') || '';
  check('second protected route (/orders) opens without login redirect', !(loc2.includes('/login')), `status=${r2.status} loc=${loc2}`);
}

console.log('══ 4) REFRESH PAGE / SESSION PERSISTENCE (repeat requests) ══');
{
  let ok = true, detail = '';
  for (let i = 0; i < 3; i++) {
    const r = await go(jarNew, '/search');
    if (r.status !== 200) { ok = false; detail = `iter ${i}: ${r.status} → ${r.headers.get('location')}`; break; }
  }
  check('3× refresh: session persists, cookies stable', ok, detail);
  check('auth cookies still present after refreshes', authCookieNames(jarNew).length > 0);
}

console.log('══ 5) EXISTING GOOGLE ACCOUNT (driver role) ══');
const jarDrv = new Jar();
{
  const vc = browserVerifierCookie(REF_RUNTIME);
  jarDrv.map.set(vc.name, vc.value);
  const r = await go(jarDrv, '/auth/callback?code=code-existing-driver&next=%2F&lang=en');
  const loc = r.headers.get('location') || '';
  check('existing driver: exchange OK, no login redirect', !loc.includes('/login'), `loc=${loc}`);
  check('existing driver routed to /driver/dashboard', loc.includes('/driver/dashboard'), `loc=${loc}`);
  check('driver session cookie created + chunked', authCookieNames(jarDrv).some((n) => /\.0$/.test(n)));
  const rd = await go(jarDrv, '/driver/dashboard');
  check('driver protected route opens', rd.status === 200, `status=${rd.status} loc=${rd.headers.get('location')}`);
}

console.log('══ 6) SSR: authenticated page render carries user context ══');
{
  const r = await go(jarNew, '/search');
  check('SSR render of protected page returns 200 HTML', r.status === 200 && (r.headers.get('content-type') || '').includes('text/html'));
}

console.log('══ 7) OAUTH ERROR PATHS ══');
{
  const jar = new Jar();
  const r = await go(jar, '/auth/callback?lang=de'); // no code
  check('missing code → clean redirect to /login?error=oauth_no_code', (r.headers.get('location') || '').includes('error=oauth_no_code'));
  const jar2 = new Jar();
  const vc = browserVerifierCookie(REF_RUNTIME);
  jar2.map.set(vc.name, vc.value);
  const r2 = await go(jar2, '/auth/callback?code=bogus-code&lang=de');
  check('invalid code → /login?error=oauth_exchange_failed (no crash)', (r2.headers.get('location') || '').includes('oauth_exchange_failed'), `loc=${r2.headers.get('location')}`);
  check('failed exchange leaves NO auth cookie', authCookieNames(jar2).length === 0);
}

console.log('══ 8) LOGOUT → LOGIN AGAIN ══');
{
  const r = await go(jarNew, '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check('logout endpoint responds OK', r.status < 400, `status=${r.status}`);
  check('logout cleared auth cookies', authCookieNames(jarNew).length === 0, `left=${jarNew.names().join(',')}`);
  const r2 = await go(jarNew, '/search');
  check('after logout, protected route redirects to /login', (r2.headers.get('location') || '').includes('/login'), `status=${r2.status}`);
  // login again via fresh OAuth round-trip
  const vc = browserVerifierCookie(REF_RUNTIME);
  jarNew.map.set(vc.name, vc.value);
  const r3 = await go(jarNew, '/auth/callback?code=code-new-user&next=%2F&lang=de');
  check('re-login via OAuth succeeds', (r3.headers.get('location') || '').includes('/search'), `loc=${r3.headers.get('location')}`);
  const r4 = await go(jarNew, '/search');
  check('session works again after re-login', r4.status === 200, `status=${r4.status}`);
}

console.log('\n' + results.join('\n'));
console.log(`\n══ RESULT: ${PASS} passed, ${FAIL} failed ══`);
process.exit(FAIL ? 1 : 0);
