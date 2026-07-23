const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Override document.cookie setter to log writes WITH full info
  await page.evaluateOnNewDocument(() => {
    const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      get() {
        return originalCookie.get.call(this);
      },
      set(value) {
        if (value.includes('code-verifier') || value.includes('auth-token')) {
          console.log('[COOKIE_WRITE]', value);
        }
        originalCookie.set.call(this, value);
      },
      configurable: true,
    });
  });

  await page.goto(process.env.BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Click Google
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Get cookie state immediately after click
  const cookiesAfterClick = await page.cookies();
  console.log('--- Cookies after click (before navigation):');
  cookiesAfterClick.forEach(c => {
    if (c.name.includes('sb-') || c.name.includes('code-verifier')) {
      console.log(`  ${c.name}`);
      console.log(`    domain: ${c.domain}, path: ${c.path}, secure: ${c.secure}, httpOnly: ${c.httpOnly}, sameSite: ${c.sameSite}`);
    }
  });

  // Now wait for navigation to complete
  await new Promise(r => setTimeout(r, 2000));
  console.log('--- URL:', page.url().substring(0, 80));

  // Get cookies after navigation
  const cookiesAfterNav = await page.cookies();
  console.log('--- Cookies after navigation:');
  cookiesAfterNav.forEach(c => {
    if (c.name.includes('sb-') || c.name.includes('code-verifier') || c.name.includes('GAPS')) {
      console.log(`  ${c.name} on ${c.domain}`);
    }
  });

  await browser.close();
})();
