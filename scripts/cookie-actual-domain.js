const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Capture document.cookie writes WITH context
  await page.evaluateOnNewDocument(() => {
    const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      get() { return originalCookie.get.call(this); },
      set(value) {
        if (value.includes('code-verifier') || value.includes('auth-token')) {
          console.log('SET: ' + value);
        }
        originalCookie.set.call(this, value);
      },
      configurable: true,
    });
  });

  await page.goto(process.env.BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Get the set-cookie via the supabase authorize URL too
  // (which is where the code-verifier should ALSO be set on supabase.co)
  const initRes = await page.evaluate(async () => {
    const r = await fetch('/api/auth/oauth?provider=google&locale=en');
    return r.json();
  });
  console.log('--- OAuth init URL:');
  console.log('   ', initRes.data.url.substring(0, 100) + '...');

  // Click Google
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Check all cookies
  const allCookies = await page.cookies();
  console.log('--- All cookies after click:');
  allCookies.forEach(c => {
    console.log(`  ${c.name} on ${c.domain} (path: ${c.path})`);
  });

  // Check the cookie-jar URL list
  console.log('--- Cookie jar URLs:');
  for (const c of allCookies) {
    console.log(`  ${c.name} -> ${c.domain}${c.path}`);
  }

  await browser.close();
})();
