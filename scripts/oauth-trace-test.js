// Real browser OAuth trace test - simulate the full flow
// and capture every console.trace message
const puppeteer = require('puppeteer-core');

const BASE = process.env.BASE;
if (!BASE) { console.error('BASE missing'); process.exit(1); }

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Capture all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('BLINKGO_AUTH_TRACE')) {
      consoleMessages.push({ type: msg.type(), text });
      console.log(`[BROWSER] ${text.substring(0, 200)}`);
    }
  });

  // Capture all network requests to auth-related endpoints
  const authRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('auth') || url.includes('oauth') || url.includes('/search') || url.includes('/login') || url.includes('/api/')) {
      authRequests.push({ method: req.method(), url: url.substring(0, 120) });
    }
  });

  // Capture cookies as they're set
  const cookiesSet = [];
  page.on('response', async (response) => {
    const setCookies = response.headers()['set-cookie'] || response.headers()['Set-Cookie'];
    if (setCookies) {
      const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
      arr.forEach(c => {
        const name = c.split('=')[0];
        if (name.includes('sb-') || name.includes('blinkgo-') || name.includes('code-verifier')) {
          cookiesSet.push({ name, when: response.url() });
        }
      });
    }
  });

  console.log('1. Loading /login...');
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n2. Finding Google button...');
  const googleButtonFound = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return !!btns.find(b => (b.innerText || '').toLowerCase().includes('google'));
  });
  console.log('   Google button found:', googleButtonFound);

  console.log('\n3. Clicking Google button...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n4. After click, URL:', page.url());

  // Check cookies that were set
  console.log('\n5. Cookies set during OAuth init:');
  cookiesSet.forEach(c => console.log(`   - ${c.name} (at ${c.when.substring(0, 80)})`));

  // Check if we reached Supabase
  if (page.url().includes('supabase.co')) {
    console.log('\n6. Reached Supabase authorize endpoint!');

    // Now we need to follow through Google
    // But we can't do that without real credentials
    // So let's check what cookies were set by the browser-side signInWithOAuth
    const allCookies = await page.cookies();
    const codeVerifier = allCookies.find(c => c.name.includes('code-verifier'));
    if (codeVerifier) {
      console.log('   ✓ PKCE code_verifier cookie set by browser:', codeVerifier.name);
    } else {
      console.log('   ✗ NO PKCE code_verifier cookie set by browser!');
      console.log('   All cookies:', allCookies.map(c => c.name).join(', '));
    }
  }

  console.log('\n=== Final summary ===');
  console.log('Console trace messages from browser:', consoleMessages.length);
  console.log('Auth-related network requests:', authRequests.length);
  console.log('Cookies set during flow:', cookiesSet.length);

  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
