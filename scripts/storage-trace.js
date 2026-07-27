const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Intercept all set-cookie responses
  await page.setRequestInterception(true);
  page.on('request', req => {
    req.continue();
  });
  page.on('response', async (response) => {
    const setCookies = response.headers()['set-cookie'] || response.headers()['Set-Cookie'];
    if (setCookies) {
      const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
      arr.forEach(c => {
        if (c.includes('sb-') || c.includes('code-verifier') || c.includes('auth')) {
          console.log('[RESPONSE SET-COOKIE]', response.url().substring(0, 100));
          console.log('  ', c.substring(0, 200));
        }
      });
    }
  });

  // Also check via document.cookie writes
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('cookie') || text.includes('code-verifier')) {
      console.log('[CONSOLE]', text.substring(0, 200));
    }
  });

  // Override document.cookie setter to log writes
  await page.evaluateOnNewDocument(() => {
    const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      get() {
        return originalCookie.get.call(this);
      },
      set(value) {
        if (value.includes('sb-') || value.includes('code-verifier') || value.includes('auth-token')) {
          console.log('[DOC.COOKIE SET]', value.substring(0, 200));
        }
        originalCookie.set.call(this, value);
      },
      configurable: true,
    });
  });

  await page.goto(process.env.BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  console.log('--- Clicking Google...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  console.log('--- URL:', page.url().substring(0, 100));

  // Check the storage directly
  const storageState = await page.evaluate(() => {
    return {
      cookies: document.cookie,
      localStorage: Object.keys(localStorage).map(k => ({ k, vLen: (localStorage[k] || '').length })),
    };
  });
  console.log('--- Final state:');
  console.log('   document.cookie:', storageState.cookies);
  console.log('   localStorage keys:', storageState.localStorage);

  await browser.close();
})();
