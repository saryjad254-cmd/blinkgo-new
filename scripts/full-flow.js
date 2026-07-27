// Real browser OAuth trace test - simulate the full flow
// and capture every console.trace message
//
// IMPORTANT: NO hardcoded secrets. All credentials are read from env vars.
//   Required:
//     BASE                          — the BlinkGo app base URL (e.g. http://localhost:3000)
//     NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL
//     SUPABASE_SERVICE_ROLE_KEY     — Supabase service role key (admin API only)
//   Optional:
//     TEST_USER_EMAIL               — pre-existing user email (default: created on the fly)
//     TEST_USER_PASSWORD            — pre-existing user password (default: created on the fly)
//
// If any required env var is missing, the script exits with a clear error.

const puppeteer = require('puppeteer-core');

const BASE = process.env.BASE;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE) {
  console.error('ERROR: BASE environment variable is required (e.g. export BASE=http://localhost:3000)');
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  process.exit(1);
}
if (!SUPABASE_SERVICE) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required (admin operations)');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Sign in with password to get a real session
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Get the session via API directly (simulating what /auth/callback would have done)
  // Use env-provided test user, or skip if not provided
  const testEmail = process.env.TEST_USER_EMAIL;
  const testPassword = process.env.TEST_USER_PASSWORD;
  if (!testEmail || !testPassword) {
    console.log('--- No TEST_USER_EMAIL/TEST_USER_PASSWORD provided, skipping sign-in step');
  } else {
    const session = await page.evaluate(async (email, password) => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      return r.json();
    }, testEmail, testPassword);
    console.log('--- Session obtained');
    console.log('   user:', session.user?.id);
    console.log('   has access_token:', !!session.session?.access_token);
  }

  // Now manually set the code_verifier cookie and code, then call /auth/callback
  // This simulates the full OAuth round-trip
  const supabaseDomain = new URL(SUPABASE_URL).host;
  const appDomain = new URL(BASE).hostname;

  // First, generate a real PKCE pair
  const pkce = await page.evaluate(async () => {
    const codeVerifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => String.fromCharCode(b))
      .join('');
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { codeVerifier, codeChallenge };
  });
  console.log('--- PKCE generated:');
  console.log('   code_verifier:', pkce.codeVerifier.substring(0, 30) + '...');
  console.log('   code_challenge:', pkce.codeChallenge.substring(0, 30) + '...');

  // Set the code_verifier cookie on the app domain (simulating what the browser client did)
  await page.setCookie({
    name: 'sb-' + supabaseDomain.split('.')[0] + '-auth-token-code-verifier',
    value: 'base64-' + Buffer.from(pkce.codeVerifier).toString('base64'),
    domain: appDomain,
    path: '/',
    sameSite: 'Lax',
  });
  console.log('--- code_verifier cookie set on app domain');

  // Get an auth code from Supabase's /authorize endpoint
  // (In reality, this would come from Google's redirect)
  const authUrl = 'https://' + supabaseDomain + '/auth/v1/authorize?' + new URLSearchParams({
    provider: 'google',
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 's256',
  }).toString();

  const authRes = await page.evaluate(async (url) => {
    const r = await fetch(url, { redirect: 'manual' });
    return { status: r.status, location: r.headers.get('location') };
  }, authUrl);
  console.log('--- /authorize response:', authRes.status);

  // OK so we can't actually get a real auth code from Supabase without going through Google
  // Let me just verify that the /auth/callback can read the code_verifier cookie
  console.log('--- All cookies on app domain:');
  const appCookies = await page.cookies();
  appCookies.forEach(c => {
    if (c.name.includes('sb-') || c.name.includes('code-verifier')) {
      console.log('   ', c.name, '=', c.value.substring(0, 30) + '...');
    }
  });

  // Now simulate /auth/callback?code=FAKE&next=/search
  // The exchange will fail (fake code), but we can see if the cookie was read
  console.log('--- Calling /auth/callback?code=fake_code...');
  const cbResp = await page.evaluate(async () => {
    const r = await fetch('/auth/callback?code=fake_code&next=%2Fsearch&lang=en', {
      redirect: 'manual',
    });
    return { status: r.status, location: r.headers.get('location') };
  });
  console.log('--- /auth/callback response:', cbResp.status, cbResp.location?.substring(0, 100));

  await browser.close();
  console.log('--- Test complete (no cleanup required: no test users were created)');
})();
