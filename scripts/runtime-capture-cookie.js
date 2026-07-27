#!/usr/bin/env node
/**
 * v78.3 — Real browser cookie capture
 * Run the actual Google OAuth flow in Chromium and capture the
 * code-verifier cookie value before the user completes Google.
 * Goal: determine what value the browser actually stored.
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');

const BASE = process.env.BASE || 'https://www.blinkgo.de';

(async () => {
  console.log('=== v78.3 Cookie Capture ===');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();

    // Capture the storage layer calls
    const storageCalls = [];
    await page.evaluateOnNewDocument(() => {
      const origSet = document.cookie.__lookupSetter__ || null;
      const origGet = document.cookie.__lookupGetter__ || null;
      // Wrap document.cookie setter
      try {
        let val = '';
        Object.defineProperty(document, 'cookie', {
          configurable: true,
          get() { return val; },
          set(v) {
            window.__lastCookieSet = v;
            val += (val ? '; ' : '') + v;
            console.log('[COOKIE_SET]', v);
          },
        });
      } catch (e) { console.log('cookie wrap err', e); }
    });

    page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('COOKIE_SET') || t.includes('BLINKGO') || t.includes('OAUTH_CANONICAL')) {
        console.log('[BROWSER]', t);
      }
    });

    // Step 1: Open the login page
    console.log(`Opening ${BASE}/login?lang=en`);
    await page.goto(`${BASE}/login?lang=en`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Find and click Google sign-in
    const buttons = await page.$$('button');
    console.log(`Found ${buttons.length} buttons`);

    // Try to find the Google sign-in button
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const btn of btns) {
        const txt = (btn.textContent || '').toLowerCase();
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (txt.includes('google') || aria.includes('google')) {
          btn.click();
          return btn.textContent || aria;
        }
      }
      return null;
    });
    console.log('Clicked button:', clicked);

    // Wait for the redirect chain (LoginForm → Supabase → Google)
    await new Promise(r => setTimeout(r, 5000));
    const finalUrl = page.url();
    console.log('Final URL:', finalUrl);

    // Step 3: Capture cookies from the BROWSER (on the current domain)
    const cookies = await page.cookies();
    console.log('\n=== Cookies on current page ===');
    for (const c of cookies) {
      console.log(`  ${c.name}=${c.value.substring(0, 50)}${c.value.length > 50 ? '...' : ''}`);
    }

    // Step 4: Decode the code-verifier cookie if present
    const codeVerifierCookie = cookies.find(c => c.name.includes('code-verifier'));
    if (codeVerifierCookie) {
      const value = codeVerifierCookie.value;
      console.log('\n=== Code Verifier Cookie ===');
      console.log(`  name: ${codeVerifierCookie.name}`);
      console.log(`  raw value: ${value}`);
      if (value.startsWith('base64-')) {
        const b64 = value.substring(7);
        const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
        const decoded = Buffer.from(padded, 'base64url').toString('utf-8');
        console.log(`  decoded base64: ${decoded}`);
        try {
          const parsed = JSON.parse(decoded);
          console.log(`  type: ${typeof parsed}`);
          if (typeof parsed === 'string') {
            console.log(`  value (string): "${parsed}"`);
            console.log(`  split('/') would work: ${typeof parsed.split === 'function'}`);
          } else {
            console.log(`  value (object): ${JSON.stringify(parsed)}`);
            console.log(`  split('/') would FAIL: ${typeof parsed.split === 'function'}`);
          }
        } catch (e) {
          console.log(`  not valid JSON: ${e.message}`);
        }
      } else {
        console.log(`  not base64-encoded`);
      }
    } else {
      console.log('\n!!! No code-verifier cookie found');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
