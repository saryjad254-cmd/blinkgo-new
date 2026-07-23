#!/usr/bin/env node
/**
 * AGGRESSIVE runtime probe — finds why the Google button isn't firing OAuth.
 */
const puppeteer = require('puppeteer-core');

const BASE = process.env.BASE || 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': '10.42.99.101' });

  // Capture EVERYTHING
  const allConsole = [];
  const allErrors = [];
  const allRequests = [];

  page.on('console', m => allConsole.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => allErrors.push(e.message));
  page.on('requestfailed', r => allErrors.push(`REQ FAIL: ${r.url()} - ${r.failure()?.errorText}`));
  page.on('request', r => {
    const u = r.url();
    if (u.includes('supabase') || u.includes('google') || u.includes('auth')) {
      allRequests.push(`> ${r.method()} ${u}`);
    }
  });
  page.on('response', r => {
    const u = r.url();
    if (u.includes('supabase') || u.includes('google') || u.includes('auth')) {
      allRequests.push(`< ${r.status()} ${u}`);
    }
  });

  console.log('=== Loading /login ===');
  await page.goto(`${BASE}/login?lang=en`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log(`\nURL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);

  // Dump all buttons and their accessible info
  console.log('\n=== All buttons on /login ===');
  const buttonInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map((b, i) => ({
      index: i,
      type: b.type,
      text: b.textContent?.substring(0, 80),
      ariaLabel: b.getAttribute('aria-label'),
      ariaBusy: b.getAttribute('aria-busy'),
      disabled: b.disabled,
      visible: b.offsetParent !== null,
      classes: b.className.substring(0, 100),
    }));
  });
  for (const b of buttonInfo) {
    console.log(`  [${b.index}] type=${b.type} disabled=${b.disabled} visible=${b.visible} text="${b.text?.trim()}" aria-busy=${b.ariaBusy}`);
  }

  // Get the Google button by text content
  console.log('\n=== Clicking Google button via direct DOM eval ===');

  // First check: does Supabase client even exist?
  const preCheck = await page.evaluate(() => {
    // Look for any global Supabase references
    const allKeys = Object.keys(window).filter(k =>
      k.toLowerCase().includes('supa') || k === '__NEXT_DATA__' || k === 'next'
    );
    return {
      globalKeys: allKeys,
      hasNextRouter: typeof window.next !== 'undefined',
      localStorage: Object.keys(localStorage),
      sessionStorage: Object.keys(sessionStorage),
      cookies: document.cookie,
    };
  });
  console.log('  Pre-click state:', JSON.stringify(preCheck, null, 2));

  // Click the Google button
  console.log('\n=== Clicking Google button ===');
  const clickResult = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const googleBtn = btns.find(b => b.textContent?.includes('Google') || b.textContent?.includes('google'));
    if (!googleBtn) return { error: 'No Google button found' };
    googleBtn.click();
    return {
      clicked: true,
      text: googleBtn.textContent?.substring(0, 50),
    };
  });
  console.log('  Click result:', clickResult);

  // Wait and watch
  console.log('\n=== Watching for 10s ===');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const u = page.url();
    if (u !== `${BASE}/login` && u !== `${BASE}/login?lang=en`) {
      console.log(`  [${i+1}s] URL changed: ${u}`);
    } else {
      console.log(`  [${i+1}s] still on /login`);
    }
  }

  console.log(`\n=== Final URL: ${page.url()} ===`);
  console.log(`\n=== All console (${allConsole.length} messages) ===`);
  for (const m of allConsole) console.log(`  ${m}`);

  console.log(`\n=== All errors (${allErrors.length}) ===`);
  for (const e of allErrors) console.log(`  ${e}`);

  console.log(`\n=== All auth-related requests (${allRequests.length}) ===`);
  for (const r of allRequests) console.log(`  ${r}`);

  await browser.close();
})();
