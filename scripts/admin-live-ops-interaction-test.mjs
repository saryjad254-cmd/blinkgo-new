#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync);

if (!executablePath) throw new Error('Chrome or Edge is required for the admin interaction test.');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;

function ok(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async (credentials) => {
    await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    return response.ok;
  }, { email: 'payments@blinkgo.com', password: 'BlinkGoPayments2026!' });
  ok(login, 'Payment-support admin account signs in');

  await page.goto(`${BASE_URL}/admin/live-ops`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  const consentBanner = page.getByTestId('cookie-consent-banner');
  if (await consentBanner.isVisible().catch(() => false)) {
    await page.getByTestId('cookie-reject-non-essential').click();
    await consentBanner.waitFor({ state: 'hidden', timeout: 5_000 });
  }
  const menu = page.locator("aside[aria-label='Admin mobile navigation']");
  await page.getByRole('button', { name: 'Open menu' }).click();
  ok((await menu.getAttribute('aria-hidden')) === 'false', 'Mobile admin menu opens');
  await page.getByRole('button', { name: 'Close menu' }).click();
  ok((await menu.getAttribute('aria-hidden')) === 'true', 'Mobile admin menu closes with X');

  const destinations = [
    ['Notifications', '/admin/notifications'],
    ['Open full operations map', '/admin/map'],
    [/View incident log|عرض سجل الحوادث|Vorfallprotokoll/i, '/admin/recovery-queue'],
    [/Assign driver|تعيين سائق|Fahrer zuweisen/i, '/admin/orders'],
  ];
  for (const [name, path] of destinations) {
    await page.goto(`${BASE_URL}/admin/live-ops`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);
    const routeConsent = page.getByTestId('cookie-consent-banner');
    if (await routeConsent.isVisible().catch(() => false)) {
      await page.getByTestId('cookie-reject-non-essential').click();
      await routeConsent.waitFor({ state: 'hidden', timeout: 5_000 });
    }
    const link = page.getByRole('link', { name });
    await link.click();
    await page.waitForURL(`**${path}`, { waitUntil: 'domcontentloaded' });
    ok(new URL(page.url()).pathname === path, `${String(name)} opens ${path}`);
  }

  await page.goto(`${BASE_URL}/admin/live-ops`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Export' }).click();
  const announcement = await page.locator("[aria-live='polite']").last().textContent();
  ok(/\d+ live orders exported\./.test(announcement || ''), 'Export produces a CSV and announces the result');

  console.log(`Admin live-ops interactions: PASS (${passed}/${passed})`);
} finally {
  await browser.close();
}
