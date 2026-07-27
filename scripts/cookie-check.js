const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Track all cookies across all domains
  page.on('response', async (response) => {
    const setCookies = response.headers()['set-cookie'] || response.headers()['Set-Cookie'];
    if (setCookies) {
      const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
      arr.forEach(c => {
        const name = c.split('=')[0];
        if (name.includes('sb-') || name.includes('code-verifier') || name.includes('auth-token')) {
          console.log(`[SET] ${name} @ ${response.url().substring(0, 80)}`);
        }
      });
    }
  });

  // Load /login first
  await page.goto(process.env.BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('--- All cookies on blinkgo.de after /login:');
  const c1 = await page.cookies();
  c1.forEach(c => console.log(`  ${c.name} on ${c.domain}`));

  // Click Google
  console.log('--- Clicking Google...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Now we should be on Supabase
  console.log('--- URL after click:', page.url().substring(0, 100));

  // Check cookies on supabase.co domain
  const allCookies = await page.cookies();
  console.log('--- All cookies after signInWithOAuth:');
  allCookies.forEach(c => console.log(`  ${c.name} on ${c.domain} (path: ${c.path})`));

  // Specifically check for code-verifier
  const codeVerifier = allCookies.find(c => c.name.includes('code-verifier'));
  if (codeVerifier) {
    console.log('--- ✓ FOUND code-verifier:', codeVerifier.name, 'on', codeVerifier.domain);
  } else {
    console.log('--- ✗ NO code-verifier cookie anywhere');
  }

  await browser.close();
})();
