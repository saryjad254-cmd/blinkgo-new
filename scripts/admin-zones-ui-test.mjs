#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Chrome or Edge is required');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addCookies([{ name: 'blinkgo-consent', value: encodeURIComponent(JSON.stringify({ id: 'automated-ui-test', version: '2026-08-11', categories: { strictly_necessary: true, preferences: false, analytics: false, marketing: false }, updatedAt: new Date().toISOString() })), url: baseUrl }]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const loggedIn = await page.evaluate(async () => {
    await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
    const response = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' }),
    });
    return response.ok;
  });
  check(loggedIn, 'admin session created');

  await page.goto(`${baseUrl}/admin/zones`, { waitUntil: 'networkidle' });
  check(page.url().includes('/admin/zones'), 'zones page is directly accessible');
  check(await page.getByLabel('Latitude').isVisible(), 'coverage latitude control is visible');
  check(await page.getByLabel('Longitude').isVisible(), 'coverage longitude control is visible');

  await page.getByLabel('Latitude').fill('50.82');
  await page.getByLabel('Longitude').fill('6.98');
  await page.getByLabel('Longitude').press('Tab');
  await page.keyboard.press('Enter');
  const status = page.getByRole('status').last();
  await status.waitFor({ state: 'visible' });
  check((await status.textContent())?.trim().length > 5, 'coverage result is announced');

  const createButton = page.getByTestId('create-zone');
  await createButton.click();
  const dialog = page.locator('[role="dialog"][aria-labelledby="zone-dialog-title"]');
  check(await dialog.isVisible(), 'create-zone dialog opens');
  const inputTypes = await dialog.locator('input').evaluateAll((inputs) => inputs.map((input) => input.type));
  check(inputTypes.filter((type) => type === 'datetime-local').length === 2, `effective date controls are present (${inputTypes.join(', ')})`);
  await dialog.getByTestId('zone-surge_multiplier').fill('1.25');
  check(await dialog.locator('input[type="time"]').count() === 2, 'surge window controls appear above 1.00x');
  check(await dialog.locator('button[aria-pressed]').count() === 7, 'all seven surge weekdays are selectable');
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/admin-zones-surge-dialog.png' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  check(!(await dialog.isVisible()), 'Escape closes the dialog');

  await page.screenshot({ path: 'artifacts/admin-zones-live.png', fullPage: true });
  await context.close();
} finally {
  await browser.close();
}

console.log(`Admin zones UI: ${passed}/${passed} checks passed.`);
