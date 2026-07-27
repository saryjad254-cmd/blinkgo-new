#!/usr/bin/env node
/**
 * Pure runtime investigation of the OAuth flow.
 * - NO code modifications
 * - Uses Puppeteer + Chromium to walk the flow as a real user
 * - Captures every redirect, every network call, every console message
 * - Captures every cookie
 * - Reads /workspace/srv.log for server-side trace markers
 *
 * Traces 13 steps and prints PASS/FAIL with full context for each.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3000';

async function main() {
  const trace = [];
  const start = Date.now();
  const stamp = () => `[${((Date.now() - start) / 1000).toFixed(2)}s]`;

  function record(step, status, info) {
    trace.push({ step, status, info, at: ((Date.now() - start) / 1000).toFixed(2) + 's' });
    console.log(`${stamp()} ${status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '🔍'} ${step}`);
    for (const [k, v] of Object.entries(info || {})) {
      console.log(`         ${k}: ${typeof v === 'object' ? JSON.stringify(v, null, 2) : v}`);
    }
  }

  // Track server-side log markers
  const srvLogSize0 = fs.statSync('/workspace/srv.log').size;

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const consoleMessages = [];
  const networkRequests = [];
  const cookies = [];

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(45000);
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': '10.42.99.99' });

    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push({ type: msg.type(), text, at: ((Date.now() - start) / 1000).toFixed(2) + 's' });
    });
    page.on('framenavigated', f => {
      if (f === page.mainFrame()) {
        networkRequests.push({ event: 'framenavigated', url: f.url(), at: ((Date.now() - start) / 1000).toFixed(2) + 's' });
      }
    });
    page.on('request', r => {
      if (r.url().includes('supabase') || r.url().includes('google') || r.url().includes('auth') || r.url().includes(BASE)) {
        networkRequests.push({ event: 'request', method: r.method(), url: r.url(), at: ((Date.now() - start) / 1000).toFixed(2) + 's' });
      }
    });
    page.on('response', r => {
      const u = r.url();
      if (u.includes('supabase') || u.includes('google') || u.includes('auth') || u.includes(BASE)) {
        networkRequests.push({ event: 'response', status: r.status(), url: u, headers: r.headers(), at: ((Date.now() - start) / 1000).toFixed(2) + 's' });
      }
    });
    page.on('requestfailed', r => {
      networkRequests.push({ event: 'requestfailed', url: r.url(), errorText: r.failure()?.errorText, at: ((Date.now() - start) / 1000).toFixed(2) + 's' });
    });

    // ============================================================
    // STEP 1: Land on /login
    // ============================================================
    console.log(`\n${stamp()} === STEP 1: Navigate to /login ===`);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const step1Url = page.url();
    const step1Cookies = await page.cookies();
    cookies.push(...step1Cookies);
    record('STEP 1: GET /login', step1Url.includes('/login') ? 'PASS' : 'FAIL', {
      currentURL: step1Url,
      cookiesAfter: step1Cookies.map(c => c.name),
    });

    // ============================================================
    // STEP 2: Click "Mit Google fortfahren" — triggers signInWithOAuth
    // ============================================================
    console.log(`\n${stamp()} === STEP 2: Click Google button → signInWithOAuth ===`);
    // Find and click the Google button
    const buttons = await page.$$('button');
    let googleButton = null;
    for (const b of buttons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && (text.includes('Google') || text.includes('google'))) {
        googleButton = b;
        break;
      }
    }

    if (!googleButton) {
      record('STEP 2: Find Google button', 'FAIL', { error: 'Google button not found' });
    } else {
      record('STEP 2: Find Google button', 'PASS', {});
      // Click — this triggers handleSocialLogin → signInWithOAuth → window.location.href = ...
      // We have to wait for navigation
      const navPromise = page.waitForNavigation({ timeout: 30000 }).catch(e => ({ _err: e.message }));
      await googleButton.click();
      // Wait for redirects to settle
      await new Promise(r => setTimeout(r, 8000));
      const afterClick = page.url();
      record('STEP 2: After Google click', afterClick.includes('google.com') || afterClick.includes('supabase.co') ? 'PASS' : 'FAIL', {
        currentURL: afterClick,
        expected: 'should be at accounts.google.com or supabase.co/auth/v1/authorize',
      });
    }

    // ============================================================
    // STEP 3: Inspect what signInWithOAuth did (console)
    // ============================================================
    console.log(`\n${stamp()} === STEP 3: signInWithOAuth trace markers ===`);
    const oauthTrace = consoleMessages.filter(m => m.text.includes('OAUTH_CANONICAL_REDIRECT') || m.text.includes('login_form_oauth'));
    record('STEP 3: Found signInWithOAuth trace', oauthTrace.length > 0 ? 'PASS' : 'FAIL', {
      traces: oauthTrace.map(t => ({ type: t.type, text: t.text })),
    });

    // ============================================================
    // STEP 4: Stop at Google consent screen (cannot solve captcha without human)
    //          But we can verify the redirect_to URL Google received.
    // ============================================================
    console.log(`\n${stamp()} === STEP 4: At Google consent screen ===`);
    const step4Url = page.url();
    const step4HasGoogle = step4Url.includes('google.com') || step4Url.includes('accounts.google');
    const step4HasSupabase = step4Url.includes('supabase.co/auth');
    const step4HasAuth = step4Url.includes('/auth/callback') || step4Url.includes('oauth');
    record('STEP 4: Landed on Google or Supabase authorize', step4HasGoogle || step4HasSupabase || step4HasAuth ? 'PASS' : 'FAIL', {
      currentURL: step4Url,
      pageTitle: await page.title().catch(() => '?'),
    });

    // ============================================================
    // SIMULATE THE CALLBACK DIRECTLY (we can't get past Google's CAPTCHA)
    // We hit /auth/callback with a fake code to see the SERVER-SIDE behavior.
    // This isolates the post-Google portion of the flow.
    // ============================================================
    console.log(`\n${stamp()} === STEP 5: Simulate /auth/callback (no real code) ===`);
    const fakeCode = 'fake_code_for_trace_' + Date.now();
    const cbUrl = `${BASE}/auth/callback?code=${fakeCode}&next=${encodeURIComponent('/search')}&lang=en`;
    const cbResponse = await page.goto(cbUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));
    const step5Url = page.url();
    const step5Status = cbResponse ? cbResponse.status() : '?';
    record('STEP 5: /auth/callback with fake code', step5Status, {
      currentURL: step5Url,
      responseStatus: step5Status,
      redirectedToLogin: step5Url.includes('/login') ? 'YES' : 'NO',
      redirectParams: step5Url.includes('?') ? step5Url.split('?')[1] : 'none',
    });

    // ============================================================
    // STEP 6: Check cookies after callback
    // ============================================================
    console.log(`\n${stamp()} === STEP 6: Cookies after callback ===`);
    const finalCookies = await page.cookies();
    cookies.length = 0;
    cookies.push(...finalCookies);
    const authCookieNames = finalCookies.map(c => c.name).filter(n =>
      n.includes('sb-') || n.includes('auth') || n.includes('session') || n.includes('token') || n.includes('pkce') || n.includes('verifier')
    );
    record('STEP 6: Inspect cookies', finalCookies.length > 0 ? 'PASS' : 'FAIL', {
      totalCookies: finalCookies.length,
      authRelatedCookies: authCookieNames,
      allCookieNames: finalCookies.map(c => c.name),
    });

    // ============================================================
    // STEP 7: Try /search with current cookies
    // ============================================================
    console.log(`\n${stamp()} === STEP 7: Navigate to /search with current cookies ===`);
    const searchResp = await page.goto(`${BASE}/search?lang=en`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const step7Url = page.url();
    record('STEP 7: GET /search', step7Url.includes('/search') ? 'PASS' : 'FAIL', {
      currentURL: step7Url,
      responseStatus: searchResp ? searchResp.status() : '?',
      redirectedToLogin: step7Url.includes('/login') ? 'YES' : 'NO',
      redirectParams: step7Url.includes('?') ? step7Url.split('?')[1] : 'none',
    });

    // ============================================================
    // STEP 8: Check server logs for the trace
    // ============================================================
    console.log(`\n${stamp()} === STEP 8: Server-side log markers ===`);
    const srvLog = fs.readFileSync('/workspace/srv.log', 'utf8').slice(srvLogSize0);
    const traceMarkers = srvLog.split('\n').filter(l =>
      l.includes('BLINKGO_AUTH_TRACE') || l.includes('OAUTH_CANONICAL_REDIRECT') || l.includes('/auth/callback')
    );
    record('STEP 8: Server log scan', traceMarkers.length > 0 ? 'PASS' : 'FAIL', {
      totalLogLines: srvLog.split('\n').length,
      traceMarkersFound: traceMarkers.length,
      sampleTraceMarkers: traceMarkers.slice(0, 10),
    });

    // ============================================================
    // STEP 9: Check console for full OAuth trace
    // ============================================================
    console.log(`\n${stamp()} === STEP 9: Browser console messages ===`);
    const allTraces = consoleMessages.filter(m => m.text.includes('BLINKGO') || m.text.includes('OAUTH') || m.text.includes('auth'));
    record('STEP 9: Console trace markers', allTraces.length > 0 ? 'PASS' : 'FAIL', {
      totalConsoleMessages: consoleMessages.length,
      authRelatedMessages: allTraces.length,
      allAuthMessages: allTraces.map(m => `[${m.type}] ${m.text}`),
    });

    // ============================================================
    // STEP 10: Dump all network requests to identify redirects
    // ============================================================
    console.log(`\n${stamp()} === STEP 10: Full network trace ===`);
    const navEvents = networkRequests.filter(r => r.event === 'framenavigated' || r.event === 'request' || r.event === 'response');
    const supabaseCalls = networkRequests.filter(r => r.url && r.url.includes('supabase'));
    const googleCalls = networkRequests.filter(r => r.url && (r.url.includes('google') || r.url.includes('accounts.google')));
    const appCalls = networkRequests.filter(r => r.url && r.url.includes(BASE));
    record('STEP 10: Network flow', 'INFO', {
      totalEvents: navEvents.length,
      supabaseCalls: supabaseCalls.length,
      googleCalls: googleCalls.length,
      appCalls: appCalls.length,
      navigationChain: networkRequests.filter(r => r.event === 'framenavigated').map(r => r.url),
      appCallChain: appCalls.map(r => `${r.event} ${r.status || ''} ${r.url}`).slice(0, 20),
    });

    // ============================================================
    // STEP 11: Check current page state
    // ============================================================
    console.log(`\n${stamp()} === STEP 11: Final page state ===`);
    const finalUrl = page.url();
    const pageContent = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.textContent || null;
      const title = document.title;
      return { h1, title };
    }).catch(() => ({}));
    record('STEP 11: Final URL & page', 'INFO', {
      currentURL: finalUrl,
      pageContent,
    });

    // ============================================================
    // STEP 12: Detect if redirected to login and WHY
    // ============================================================
    console.log(`\n${stamp()} === STEP 12: Redirect-to-login diagnosis ===`);
    if (finalUrl.includes('/login')) {
      const params = new URL(finalUrl).searchParams;
      const error = params.get('error');
      const next = params.get('next');
      const verified = params.get('verified');
      record('STEP 12: REDIRECTED TO /login', 'FAIL', {
        currentURL: finalUrl,
        errorParam: error,
        nextParam: next,
        verifiedParam: verified,
        diagnosis: error
          ? `Server explicitly returned ?error=${error}`
          : next
            ? `Server returned ?next=${next} (likely post-login redirect that was sent to /login)`
            : 'No error param — silent redirect to /login',
      });
    } else {
      record('STEP 12: Not at /login', 'INFO', {
        currentURL: finalUrl,
      });
    }

    // ============================================================
    // FINAL REPORT
    // ============================================================
    console.log(`\n${stamp()} === FINAL REPORT ===`);
    console.log(`Total trace steps: ${trace.length}`);
    console.log(`Final URL: ${page.url()}`);
    console.log(`\nServer log size delta: ${fs.statSync('/workspace/srv.log').size - srvLogSize0} bytes`);
    console.log(`\nCookies on final page:`);
    for (const c of cookies) {
      console.log(`  - ${c.name} (${c.domain}${c.path ? c.path : ''}) ${c.httpOnly ? '[HttpOnly]' : ''}`);
    }
    console.log(`\nFull console messages:`);
    for (const m of consoleMessages) {
      console.log(`  [${m.type}] (${m.at}) ${m.text.substring(0, 300)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
