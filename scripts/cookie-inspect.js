const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Track all set-cookie responses
  page.on('response', async (response) => {
    const headers = response.headers();
    const setCookie = headers['set-cookie'];
    if (setCookie) {
      const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
      arr.forEach(c => {
        if (c.includes('sb-') || c.includes('code-verifier') || c.includes('auth')) {
          console.log('[SET-COOKIE-RESPONSE]', c.substring(0, 300));
        }
      });
    }
  });

  await page.goto(process.env.BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Click Google
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) btn.click();
  });

  // Don't wait too long, capture cookies IMMEDIATELY after click
  await new Promise(r => setTimeout(r, 500));

  // Cookies immediately
  const c1 = await page.cookies();
  console.log('--- Cookies 500ms after click:');
  c1.forEach(c => console.log(`  ${c.name} on ${c.domain}`));

  await new Promise(r => setTimeout(r, 1500));

  // Cookies 2s after click
  const c2 = await page.cookies();
  console.log('--- Cookies 2s after click:');
  c2.forEach(c => console.log(`  ${c.name} on ${c.domain}`));

  console.log('--- URL:', page.url().substring(0, 80));

  await browser.close();
})();
