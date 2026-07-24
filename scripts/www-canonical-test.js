const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
console.log('Testing with BASE:', BASE);
console.log('Testing with NEXT_PUBLIC_APP_URL:', APP_URL);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  const trace = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('OAUTH_CANONICAL_REDIRECT') || text.includes('BLINKGO_AUTH_TRACE')) {
      trace.push(text);
      console.log('[BROWSER]', text.substring(0, 250));
    }
  });

  // Load /login
  console.log('1. Loading /login...');
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Click Google
  console.log('2. Clicking Google...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  console.log('3. Final URL:', page.url().substring(0, 120));

  await browser.close();
  console.log('\n=== Trace summary ===');
  console.log('  Trace messages:', trace.length);
})();
