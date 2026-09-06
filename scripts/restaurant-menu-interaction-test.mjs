#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the restaurant menu test.');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
function ok(condition, label) { if (!condition) throw new Error(label); passed += 1; console.log(`  ✓ ${label}`); }

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-DE', colorScheme: 'dark' });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' }));
  const signedIn = await page.evaluate(async () => (await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' }) })).ok);
  ok(signedIn, 'Restaurant signs in');

  await page.goto(`${BASE_URL}/restaurant/menu`, { waitUntil: 'domcontentloaded' });
  const menu = page.locator('main [data-testid="restaurant-menu-center"]:visible');
  await menu.waitFor({ state: 'visible', timeout: 15_000 });
  const cookieReject = page.getByTestId('cookie-reject-non-essential');
  if (await cookieReject.isVisible().catch(() => false)) await cookieReject.click();
  ok(true, 'Menu operations center renders');
  let size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(size.document === size.viewport, `Mobile menu has no horizontal overflow (${size.document}/${size.viewport})`);

  await menu.getByTestId('restaurant-menu-filter-toggle').click();
  ok(await menu.getByTestId('restaurant-menu-category-filter').isVisible(), 'Filters open from the toolbar');
  const initialProductCount = await menu.getByTestId('restaurant-menu-product').count();
  const editHref = await menu.locator('a[href^="/restaurant/menu/"][href$="/edit"]').first().getAttribute('href');
  ok(Boolean(editHref), 'Menu exposes an edit path for an owned product');
  const searchableName = (await menu.getByTestId('restaurant-menu-product').first().getByRole('heading', { level: 2 }).textContent())?.trim() || '';
  await menu.getByTestId('restaurant-menu-search').fill(searchableName);
  await page.waitForTimeout(200);
  const searchResultCount = await menu.getByTestId('restaurant-menu-product').count();
  ok(searchResultCount >= 1 && searchResultCount <= initialProductCount, 'Search isolates the requested product');

  await menu.getByTestId('restaurant-menu-search').fill('');
  let toggle = menu.locator('[data-testid="restaurant-menu-availability-toggle"]:not([disabled])').first();
  await toggle.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="restaurant-menu-availability-toggle"]')].find((element) => element.getClientRects().length > 0)?.getAttribute('aria-pressed') === 'false');
  ok(true, 'Availability can be paused');
  toggle = menu.locator('[data-testid="restaurant-menu-availability-toggle"]:not([disabled])').first();
  await toggle.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="restaurant-menu-availability-toggle"]')].find((element) => element.getClientRects().length > 0)?.getAttribute('aria-pressed') === 'true');
  ok(true, 'Availability can be restored');

  await context.setOffline(true);
  await menu.getByTestId('restaurant-menu-offline').waitFor({ state: 'visible', timeout: 5_000 });
  ok(await menu.getByTestId('restaurant-menu-availability-toggle').first().isDisabled(), 'Offline mode preserves data and blocks mutations');
  await context.setOffline(false);

  await page.goto(`${BASE_URL}${editHref}`, { waitUntil: 'domcontentloaded' });
  const editForm = page.locator('main [data-testid="restaurant-product-form"]:visible');
  await editForm.waitFor({ state: 'visible', timeout: 10_000 });
  ok(await editForm.getByTestId('restaurant-product-save').isEnabled(), 'Operational edit form is ready');
  await editForm.getByTestId('restaurant-product-price').fill('10');
  await editForm.getByTestId('restaurant-product-discount').fill('11');
  await editForm.getByTestId('restaurant-product-save').click();
  ok((await page.locator('[role="alert"]').allTextContents()).some((text) => text.includes('أقل')), 'Invalid sale price is rejected before saving');

  await page.goto(`${BASE_URL}/restaurant/menu/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/restaurant/menu/requests/new');
  const requestForm = page.locator('main [data-testid="restaurant-request-form"]:visible');
  await requestForm.waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Legacy add path redirects to the governed request flow');
  await context.setOffline(true);
  await page.waitForTimeout(100);
  ok(await requestForm.getByTestId('restaurant-request-submit').isDisabled(), 'Offline request form blocks submission');
  await context.setOffline(false);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/restaurant/menu/requests`, { waitUntil: 'domcontentloaded' });
  const requestsCenter = page.locator('main [data-testid="restaurant-product-requests"]:visible');
  await requestsCenter.waitFor({ state: 'visible', timeout: 10_000 });
  size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(size.document === size.viewport, `Desktop requests page has no horizontal overflow (${size.document}/${size.viewport})`);
  ok((await requestsCenter.getByTestId('restaurant-request-new').getAttribute('href')) === '/restaurant/menu/requests/new', 'Requests center exposes a clear add action');

  const unexpected = runtimeErrors.filter((message) => !message.includes('ERR_INTERNET_DISCONNECTED'));
  ok(unexpected.length === 0, `Menu flow has no browser runtime errors${unexpected[0] ? `: ${unexpected[0]}` : ''}`);
  console.log(`Restaurant menu interactions: PASS (${passed}/${passed})`);
} finally {
  await browser.close();
}
