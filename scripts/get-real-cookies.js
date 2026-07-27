const puppeteer = require('puppeteer-core');

const BASE = 'https://molecules-contracts-magnet-jeff.trycloudflare.com';
const TEST_EMAIL = `oauth-real-test-${Date.now()}@blinkgo-test.de`;
const TEST_PASSWORD = 'TestPassword!2024';
const SUPABASE_URL = 'https://rhdaffhlrglyknxtucux.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

(async () => {
  // 1. Create a real user
  console.log('1. Creating user...');
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'OAuth Real Test', role_attempt: 'admin' },
    }),
  });
  const userData = await createRes.json();
  console.log('   User created:', userData.id);

  // 2. Open real browser and go to /login
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();

  // Intercept responses to /api/auth/login to capture cookies
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  console.log('2. On /login page');

  // Fill in the email/password form
  await new Promise(r => setTimeout(r, 2000));
  const emailInput = await page.$('input[type="email"]');
  const passwordInput = await page.$('input[type="password"]');
  if (emailInput && passwordInput) {
    await emailInput.type(TEST_EMAIL);
    await passwordInput.type(TEST_PASSWORD);
    console.log('3. Filled in credentials');

    // Find the submit button
    const submitBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[type="submit"], button'));
      const btn = btns.find(b => b.innerText?.toLowerCase().includes('anmelden') || b.innerText?.toLowerCase().includes('login') || b.innerText?.toLowerCase().includes('sign'));
      if (btn) {
        btn.click();
        return btn.innerText;
      }
      return null;
    });
    console.log('4. Clicked submit:', submitBtn);

    // Wait for response
    await new Promise(r => setTimeout(r, 5000));
  } else {
    console.log('   Form not found, trying /api/auth/login directly');
  }

  // 3. Get the cookies
  const cookies = await page.cookies();
  console.log('\n5. Cookies set after login:');
  cookies.forEach(c => {
    console.log(`   [${c.domain}] ${c.name} = ${c.value.substring(0, 60)}${c.value.length > 60 ? '...' : ''}`);
  });

  // 4. Try to access /search
  console.log('\n6. Trying /search...');
  const searchResp = await page.goto(BASE + '/search', { waitUntil: 'networkidle0' });
  console.log('   status:', searchResp.status());
  console.log('   final URL:', page.url());

  if (!page.url().includes('/login')) {
    console.log('   ✓ Session recognized, can access /search');

    // 5. Refresh
    await page.reload({ waitUntil: 'networkidle0' });
    console.log('7. After refresh:', page.url());

    // 6. Open new browser instance with same cookies
    await browser.close();
    const browser2 = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page2 = await browser2.newPage();
    await page2.setCookie(...cookies);
    await page2.goto(BASE + '/search', { waitUntil: 'networkidle0' });
    console.log('8. After browser restart:', page2.url());

    await browser2.close();
  }

  // 7. Cleanup
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userData.id}`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });
  console.log('9. User deleted');
})();
