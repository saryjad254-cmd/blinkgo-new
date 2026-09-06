#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const baseUrl = process.env.BLINKGO_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
const executablePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Chrome or Edge is required');

const cases = [
  { role: 'admin portal shell', route: '/admin/onboarding', sidebar: '#portal-sidebar', email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' },
  { role: 'admin layout', route: '/admin/integrations', sidebar: '#admin-sidebar', email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' },
];

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
try {
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    const login = await page.evaluate(async (credentials) => {
      await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      return { ok: response.ok, status: response.status };
    }, { email: testCase.email, password: testCase.password });
    assert.equal(login.ok, true, `${testCase.role} login failed (${login.status})`);
    await page.goto(`${baseUrl}${testCase.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.waitForSelector(testCase.sidebar, { state: 'attached' });
    // Next.js dev streaming can briefly retain the previous route tree while
    // the hydrated portal shell replaces it. Exercise the settled interactive
    // shell, not that transient duplicate DOM.
    await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 1, testCase.sidebar);
    await page.waitForFunction((selector) => document.querySelector(selector)?.inert === true, testCase.sidebar);

    const hiddenState = await page.locator(testCase.sidebar).evaluate((node) => ({ inert: node.inert, hidden: node.getAttribute('aria-hidden') }));
    assert.deepEqual(hiddenState, { inert: true, hidden: 'true' });

    const open = page.getByRole('button', { name: /Menü öffnen|Open menu|فتح القائمة/ });
    await open.focus();
    await open.press('Enter');
    await page.waitForFunction((selector) => document.querySelector(selector)?.inert === false, testCase.sidebar);
    assert.equal(await page.locator(testCase.sidebar).getAttribute('aria-modal'), 'true');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    assert.match(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || ''), /Menü schließen|Close menu|إغلاق القائمة/);

    for (let step = 0; step < 24; step += 1) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate((selector) => document.querySelector(selector)?.contains(document.activeElement), testCase.sidebar), true, `${testCase.role} focus escaped drawer`);

    await page.keyboard.press('Escape');
    await page.waitForFunction((selector) => document.querySelector(selector)?.inert === true, testCase.sidebar);
    await page.waitForFunction((selector) => document.activeElement?.getAttribute('aria-controls') === selector.slice(1), testCase.sidebar);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.equal(await open.getAttribute('aria-expanded'), 'false');
    passed += 7;
    console.log(`PASS ${testCase.role} mobile portal drawer: inert, focus entry/trap/restore, Escape and scroll lock`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`Portal keyboard accessibility: ${passed}/${passed} checks passed.`);
