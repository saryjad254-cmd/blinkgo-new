#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the portal-notification test.');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
const ok = (condition, label) => {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const cases = [
  { role: 'driver', email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!', start: '/driver/dashboard', target: '/driver/notifications' },
  { role: 'restaurant', email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!', start: '/restaurant/dashboard', target: '/restaurant/notifications' },
];

try {
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE', colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' }));
    const signedIn = await page.evaluate(async (credentials) => {
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      return response.ok;
    }, { email: testCase.email, password: testCase.password });
    ok(signedIn, `${testCase.role} signs in`);

    await page.goto(`${BASE_URL}${testCase.start}`, { waitUntil: 'domcontentloaded' });
    const bell = page.locator(`a[href="${testCase.target}"]:visible`).first();
    await bell.waitFor({ state: 'visible' });
    ok((await bell.getAttribute('aria-label'))?.length > 0, `${testCase.role} notification bell has an accessible name`);
    await bell.click();
    await page.waitForURL(`**${testCase.target}`);
    ok(new URL(page.url()).pathname === testCase.target, `${testCase.role} bell opens its role notification center`);
    const heading = page.getByRole('heading', { level: 1 }).last();
    await heading.waitFor({ state: 'visible', timeout: 10_000 });
    ok(await heading.isVisible(), `${testCase.role} notification page renders`);
    ok(errors.length === 0, `${testCase.role} notification flow has no console/page errors${errors[0] ? `: ${errors[0]}` : ''}`);
    await context.close();
  }

  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE', colorScheme: 'dark' });
  const customerPage = await customerContext.newPage();
  await customerPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const customerSignedIn = await customerPage.evaluate(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' }),
    });
    return response.ok;
  });
  ok(customerSignedIn, 'customer signs in');
  await customerPage.goto(`${BASE_URL}/payment-history`, { waitUntil: 'domcontentloaded' });
  const customerBell = customerPage.getByRole('button', { name: /Benachrichtigungen|Notifications|الإشعارات/i }).first();
  await customerBell.waitFor({ state: 'visible', timeout: 10_000 });
  await customerBell.click();
  ok((await customerBell.getAttribute('aria-expanded')) === 'true', 'customer notification dropdown exposes its open state');
  const dialog = customerPage.getByRole('dialog', { name: /Benachrichtigungen|Notifications|الإشعارات/i });
  await dialog.waitFor({ state: 'visible' });
  ok(await dialog.isVisible(), 'customer notification dropdown renders as an accessible dialog');
  await customerPage.locator('body').press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  ok((await customerBell.getAttribute('aria-expanded')) === 'false', 'Escape closes the customer notification dropdown');
  await customerContext.close();
  console.log(`Portal notification interactions: PASS (${passed}/${passed})`);
} finally {
  await browser.close();
}
