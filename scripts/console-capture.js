const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('console', msg => {
    console.log('[CONSOLE]', msg.type(), msg.text().substring(0, 200));
  });
  page.on('pageerror', err => console.log('[PAGEERROR]', err.message));
  page.on('requestfailed', req => console.log('[REQFAIL]', req.url(), req.failure()?.errorText));

  await page.goto(process.env.BASE + '/login', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  // Find the Google button
  const buttons = await page.$$eval('button', els => els.map(e => ({
    text: (e.innerText || '').trim(),
    type: e.type,
    disabled: e.disabled,
  })));
  console.log('Buttons:', JSON.stringify(buttons.filter(b => b.text.toLowerCase().includes('google') || b.text.toLowerCase().includes('continue')), null, 2));

  // Click Google
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').toLowerCase().includes('google'));
    if (btn) {
      console.log('Clicking:', btn.innerText);
      btn.click();
    } else {
      console.log('No Google button found');
    }
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Final URL:', page.url());
  await browser.close();
})();
