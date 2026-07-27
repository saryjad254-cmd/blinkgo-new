#!/usr/bin/env node
/**
 * Test magic-link flow on the SAME /auth/callback route to validate
 * the post-exchange redirect logic works (different code path than OAuth).
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3000';
const TEST_EMAIL = 'demo@blinkgo.de';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': '10.42.99.103' });

  const log = [];
  const consoleAll = [];
  page.on('console', m => consoleAll.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleAll.push(`[PAGE_ERROR] ${e.message}`));

  console.log('=== STEP A: Load /login and request magic link ===');
  await page.goto(`${BASE}/login?lang=en`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // Click "Magic link" tab
  const magicTabClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tab = btns.find(b => b.textContent?.trim() === 'Magic Link' || b.textContent?.includes('Magic link'));
    if (tab) { tab.click(); return true; }
    return false;
  });
  console.log(`  Magic-link tab clicked: ${magicTabClicked}`);

  // Fill email
  await page.evaluate((email) => {
    const input = document.querySelector('input[type="email"]');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, email);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, TEST_EMAIL);
  await new Promise(r => setTimeout(r, 500));

  // Click "Magic Link senden"
  const sent = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent?.includes('Magic Link senden') || b.textContent?.includes('send Magic Link'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log(`  Send magic link clicked: ${sent}`);
  await new Promise(r => setTimeout(r, 3000));

  // Check the UI
  const ui = await page.evaluate(() => ({
    body: document.body.innerText.substring(0, 500),
  }));
  console.log(`  UI after send: ${ui.body.replace(/\n/g, ' | ').substring(0, 200)}`);

  console.log('\n=== Console messages ===');
  for (const m of consoleAll) console.log(`  ${m}`);

  await browser.close();
})();
