const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('OAUTH_CANONICAL_REDIRECT') || text.includes('BLINKGO_AUTH_TRACE')) {
      console.log('[CONSOLE]', msg.type(), text.substring(0, 350));
    }
  });
  page.on('pageerror', err => console.log('[PAGEERROR]', err.message));

  // Load the tunnel's /login (since tunnel is the only way to reach the server)
  await page.goto(process.env.BASE + '/login', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  // Click Google
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Final URL:', page.url().substring(0, 120));
  await browser.close();
})();
