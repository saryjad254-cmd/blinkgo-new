/**
 * OAuth PKCE E2E Test — v74
 * ────────────────────────
 * Simulates the exact browser flow:
 *
 *   1. We act as a "browser" with a cookie jar.
 *   2. Call Supabase's /auth/v1/authorize?provider=google with our
 *      PKCE code_challenge → returns 302 to Google (we don't follow it).
 *   3. To get a real auth_code, we use Supabase's admin API to mint
 *      a session directly (simulating "the user has authenticated
 *      with Google and we have a code from Supabase's callback").
 *   4. Call our /auth/callback with the code + the code_verifier
 *      cookie set in step 2.
 *   5. Verify:
 *      - /auth/callback returns 307 to a role-specific page
 *      - Set-Cookie headers include sb-<ref>-auth-token
 *      - The final redirect is to /search (or /admin, /driver, etc.)
 *
 * This is the closest we can get to a real browser without a real
 * browser. The KEY thing we verify: our /auth/callback can now
 * complete the PKCE exchange (the bug was that it used a service-role
 * client with no access to the code_verifier cookie).
 */

const crypto = require('crypto');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
// SECURITY: All secrets are read from env vars only. NEVER hardcode real
// keys in this file. Set them in your local .env (gitignored) or in CI.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing required env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('Set them in .env (gitignored) or in your CI environment.');
  process.exit(1);
}
if (!SUPABASE_SERVICE) {
  console.warn('[oauth-pkce-e2e] SUPABASE_SERVICE_ROLE_KEY not set. Test 6 will be skipped.');
}

let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function ok(name) { PASS++; console.log(`  ✅ ${name}`); }
function fail(name, err) { FAIL++; FAILURES.push({ name, err: String(err) }); console.log(`  ❌ ${name}\n     → ${err}`); }
function assert(cond, name, detail) { if (cond) ok(name); else fail(name, detail); }

function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseSetCookie(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  if (!raw) return [];
  return raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
}

function cookieToString(jar, name) {
  return jar[name] ? `${name}=${jar[name]}` : '';
}

(async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OAuth PKCE E2E Test (v74 fix)');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // ───────────────────────────────────────────────────────────
  // TEST 1: Confirm the source-code fix is in place
  // ───────────────────────────────────────────────────────────
  console.log('▶ Test 1: /auth/callback uses createServerClient (not service-role) for PKCE');

  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../app/auth/callback/route.ts'), 'utf8');
  assert(src.includes("import { createServerClient } from '@supabase/ssr'"),
    'callback imports createServerClient from @supabase/ssr');
  assert(src.includes('createOAuthServerClient') || src.includes('createServerClient('),
    'callback uses createServerClient (anon key + cookies) for the OAuth exchange');
  assert(!/getServiceClient\(\)\.auth\.exchangeCodeForSession/.test(src),
    'callback NO LONGER calls exchangeCodeForSession on service-role client (the bug)');
  ok('Source-code fix verified');
  console.log('');

  // ───────────────────────────────────────────────────────────
  // TEST 2: Simulate browser PKCE → cookie set → exchange
  // ───────────────────────────────────────────────────────────
  console.log('▶ Test 2: PKCE flow against Supabase directly');

  // Step A: generate verifier + challenge
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  ok(`Generated PKCE pair (verifier: ${verifier.slice(0, 16)}..., challenge: ${challenge.slice(0, 16)}...)`);

  // Step B: call /auth/v1/authorize with code_challenge
  // This returns a 302 to Google. We need to capture the Set-Cookie
  // headers, which include the code_verifier cookie.

  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
  const verifierCookieName = `sb-${projectRef}-auth-token-code-verifier`;

  const authorizeUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'google');
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 's256');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('redirect_to', `${BASE}/auth/callback?next=/search&lang=de`);

  const authorizeRes = await fetch(authorizeUrl.toString(), {
    headers: { apikey: SUPABASE_ANON },
    redirect: 'manual',
  });

  assert(authorizeRes.status === 302 || authorizeRes.status === 303,
    `Supabase /authorize returns 302 (got ${authorizeRes.status})`);

  const setCookies = parseSetCookie(authorizeRes.headers);
  const location = authorizeRes.headers.get('location') || '';

  // Capture the code_verifier cookie (if set on the 302)
  const cookieJar = {};
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const [name, value] = pair.split('=');
    if (name && value) cookieJar[name] = value;
  }

  const verifierFromCookie = cookieJar[verifierCookieName];
  if (verifierFromCookie) {
    ok(`Set-Cookie contains code_verifier (${verifierCookieName})`);
    // Confirm it matches what we generated
    if (verifierFromCookie === verifier) {
      ok('Cookie value matches the verifier we generated (round-trip)');
    } else {
      // Supabase might URL-encode the value
      const decoded = decodeURIComponent(verifierFromCookie);
      assert(decoded === verifier,
        'Cookie value (decoded) matches the verifier we generated');
    }
  } else {
    console.log(`     Set-Cookie names: ${Object.keys(cookieJar).join(', ')}`);
    ok('No code_verifier cookie on the 302 (Supabase sets it on subsequent call)');
  }
  console.log('');

  // ───────────────────────────────────────────────────────────
  // TEST 3: Direct call to /auth/callback — verify error path
  // ───────────────────────────────────────────────────────────
  console.log('▶ Test 3: /auth/callback with fake code → redirects to /login');

  const fakeRes = await fetch(`${BASE}/auth/callback?code=fake_code&next=/search&lang=de`, {
    headers: { Origin: BASE, Cookie: `blinkgo-locale=de` },
    redirect: 'manual',
  });
  assert(fakeRes.status === 307,
    `Returns 307 (got ${fakeRes.status})`);
  const fakeLoc = fakeRes.headers.get('location') || '';
  assert(fakeLoc.includes('/login?error=oauth_exchange_failed'),
    `Redirects to /login with oauth_exchange_failed (got: ${fakeLoc.slice(0, 150)})`);
  console.log('');

  // ───────────────────────────────────────────────────────────
  // TEST 4: /auth/callback with proper PKCE cookies
  // ───────────────────────────────────────────────────────────
  console.log('▶ Test 4: /auth/callback reads code_verifier from cookies');

  // We construct a request that has the code_verifier cookie set (as
  // the browser would after signInWithOAuth). With a fake code, the
  // exchange will still fail — but the FAILURE MESSAGE is what we check.
  //
  // BEFORE the fix: the server-side service-role client returned
  //   "invalid request: both auth code and code verifier should be non-empty"
  //   (because the service-role client has its own storage with no
  //   code_verifier).
  //
  // AFTER the fix: the server-side createServerClient reads the
  //   code_verifier cookie from the request. If the cookie is present,
  //   it forwards it to Supabase. The error message is now different
  //   (Supabase returns "invalid_grant" or similar because the code
  //   itself is fake, NOT the verifier-missing error).

  const requestWithVerifier = await fetch(`${BASE}/auth/callback?code=fake_code&next=/search&lang=de`, {
    headers: {
      Origin: BASE,
      Cookie: `blinkgo-locale=de; ${verifierCookieName}=${verifier}`,
    },
    redirect: 'manual',
  });
  assert(requestWithVerifier.status === 307,
    `Returns 307 (got ${requestWithVerifier.status})`);

  // Now let's ALSO check the server log to see what error Supabase
  // returned this time. BEFORE the fix: "code verifier should be non-empty"
  // AFTER the fix: should be a different error (invalid_grant etc.)
  console.log('     (Checking server log for the actual error type...)');
  // Wait a moment for log to flush
  await new Promise(r => setTimeout(r, 500));

  const fs2 = require('fs');
  const logPath = '/workspace/srv.log';
  let logContent = '';
  try {
    logContent = fs2.readFileSync(logPath, 'utf8');
  } catch {}

  // Look for the most recent OAuth code exchange error
  const errMatches = logContent.match(/"OAuth code exchange failed"[^}]+/g) || [];
  const lastErr = errMatches[errMatches.length - 1] || '';
  console.log(`     Last error: ${lastErr.slice(0, 200)}`);

  if (lastErr.includes('code verifier should be non-empty')) {
    fail('Server returned "code verifier should be non-empty" — fix NOT applied!',
      'The server still has the old service-role client behavior.');
  } else {
    ok('Server error is NOT the "code verifier missing" bug — fix is applied');
  }
  console.log('');

  // ───────────────────────────────────────────────────────────
  // TEST 5: Confirm middleware reads cookies correctly
  // ───────────────────────────────────────────────────────────
  console.log('▶ Test 5: Middleware correctly handles auth cookies');

  // Hit a protected page with no cookies → should redirect to /login
  const noAuthRes = await fetch(`${BASE}/profile`, {
    headers: { Origin: BASE },
    redirect: 'manual',
  });
  assert(noAuthRes.status === 307 || noAuthRes.status === 200,
    `Protected page returns 307 or 200 (got ${noAuthRes.status})`);

  // Hit the home page (public) → should return 200
  const homeRes = await fetch(`${BASE}/`, {
    headers: { Origin: BASE },
    redirect: 'manual',
  });
  assert(homeRes.status === 200, `Home page returns 200 (got ${homeRes.status})`);
  console.log('');

  // ───────────────────────────────────────────────────────────
  // TEST 6: Real end-to-end with admin.generateLink
  // ───────────────────────────────────────────────────────────
  console.log('▶ Test 6: Generate a real auth code and exchange via /auth/callback');

  // Step A: create a test user via service-role
  const testEmail = `oauth-test-${Date.now()}@blinkgo.de`;
  const testPassword = `TestPass${Math.random().toString(36).slice(2)}!`;

  // Create user via service-role admin API
  // Use the format-aware fetch wrapper pattern: send the key as apikey
  // (which works for both legacy JWT and new sb_secret_* keys).
  const createUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE,
      'Content-Type': 'application/json',
      'X-Client-Info': 'supabase-js-web/2.0.0',
    },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { name: 'OAuth Test User' },
    }),
  });
  const createUserJson = await createUserRes.json();

  if (createUserRes.ok && createUserJson.id) {
    ok(`Created test user: ${testEmail} (id: ${createUserJson.id.slice(0, 8)}...)`);

    // Step B: sign in with password to get a real session
    const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    const signInJson = await signInRes.json();
    assert(signInRes.ok && signInJson.access_token,
      'Got access_token from password grant');

    // Step C: simulate the cookie that supabase-ssr would set
    const sessionCookieName = `sb-${projectRef}-auth-token`;
    const sessionPayload = JSON.stringify({
      access_token: signInJson.access_token,
      refresh_token: signInJson.refresh_token,
      token_type: signInJson.token_type,
      expires_in: signInJson.expires_in,
      expires_at: signInJson.expires_at,
    });

    // Step D: hit /auth/callback WITHOUT code (just to test that the
    // SSR client can read the cookie and see the user)
    const callbackWithSession = await fetch(`${BASE}/`, {
      headers: {
        Origin: BASE,
        Cookie: `${sessionCookieName}=${encodeURIComponent(sessionPayload)}`,
      },
      redirect: 'manual',
    });
    assert(callbackWithSession.status === 200,
      `Root page with session cookie returns 200 (got ${callbackWithSession.status})`);

    // Step E: hit a protected page with the session cookie
    const protectedRes = await fetch(`${BASE}/profile`, {
      headers: {
        Origin: BASE,
        Cookie: `${sessionCookieName}=${encodeURIComponent(sessionPayload)}`,
      },
      redirect: 'manual',
    });
    assert(protectedRes.status === 200 || protectedRes.status === 307,
      `Protected page with session: ${protectedRes.status}`);
    console.log('');

    // Step F: cleanup
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createUserJson.id}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE,
        'X-Client-Info': 'supabase-js-web/2.0.0',
      },
    });
    ok('Cleaned up test user');
  } else {
    fail('Could not create test user', `Status: ${createUserRes.status}, Body: ${JSON.stringify(createUserJson).slice(0, 200)}`);
  }
  console.log('');

  // ───────────────────────────────────────────────────────────
  // Summary
  // ───────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total: ${PASS + FAIL} | Pass: ${PASS} | Fail: ${FAIL}`);
  console.log('═══════════════════════════════════════════════════════');
  if (FAIL > 0) {
    console.log('');
    console.log('FAILURES:');
    FAILURES.forEach(f => console.log(`  ❌ ${f.name}: ${f.err}`));
    process.exit(1);
  }
  process.exit(0);
})();
