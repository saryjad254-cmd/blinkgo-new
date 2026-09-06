#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the restaurant orders test.');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
const ok = (condition, label) => {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
};

async function login(page, credentials) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  return page.evaluate(async (body) => {
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return response.ok;
  }, credentials);
}

try {
  const restaurantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-DE', colorScheme: 'dark' });
  const page = await restaurantContext.newPage();
  const runtimeErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' }));
  ok(await login(page, { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' }), 'Restaurant signs in to the order center');

  const customerContext = await browser.newContext({ locale: 'de-DE' });
  const customerPage = await customerContext.newPage();
  ok(await login(customerPage, { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' }), 'Customer signs in for an order-center fixture');
  const fixture = await customerPage.evaluate(async () => {
    const search = await fetch('/api/search?sort=recommended', { credentials: 'include' }).then((response) => response.json());
    // This journey is authenticated as the Wesseling/Trattoria merchant. A
    // recommended-search result is intentionally dynamic and may put another
    // venue first, which would create a valid order that this merchant must
    // not be allowed to see. Target the account's linked fixture explicitly.
    const linkedRestaurantIds = new Set(['00000000-0000-0000-0000-000000000020', 'b1000000-0000-4000-8000-000000000201']);
    const restaurant = search.restaurants?.find((item) => linkedRestaurantIds.has(item.id));
    if (!restaurant) return { id: null, number: null, productName: null, quantity: 0, error: 'No restaurant' };
    const products = await fetch(`/api/products/bestsellers?restaurant_id=${restaurant.id}`, { credentials: 'include' }).then((response) => response.json());
    const product = (products.bestsellers ?? products.products ?? []).find((item) => item.is_available !== false && item.is_active !== false);
    if (!product) return { id: null, number: null, productName: null, quantity: 0, error: 'No product' };
    const selectedModifiers = Object.fromEntries((product.modifiers ?? [])
      .filter((modifier) => modifier.required && Number(modifier.min_select ?? 0) > 0)
      .map((modifier) => [modifier.id, (modifier.options ?? []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
    const unitPrice = Number(product.discount_price ?? product.price ?? 0);
    const minimumOrder = Number(restaurant.minimum_order ?? restaurant.min_order_amount ?? 0);
    const quantity = unitPrice > 0 ? Math.max(2, Math.ceil((minimumOrder + 0.01) / unitPrice)) : 2;
    const response = await fetch('/api/orders', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurant_id: restaurant.id, items: [{ product_id: product.id, quantity, configuration: { selected_modifiers: selectedModifiers } }], payment_method: 'cash', delivery_address: { address: 'Order Center Test, Wesseling', lat: 50.8179, lng: 6.9821 }, delivery_instructions: 'Ring once' }) });
    const payload = await response.json().catch(() => ({}));
    const order = payload.order ?? payload.data?.order;
    return response.ok ? { id: order?.id ?? null, number: order?.order_number ?? null, productName: product.name ?? null, quantity, error: null } : { id: null, number: null, productName: null, quantity: 0, error: payload.error?.message || payload.error || `HTTP ${response.status}` };
  });
  if (!fixture.id) console.error(`  Fixture creation failed: ${fixture.error}`);
  ok(Boolean(fixture.id), 'Customer creates a real order-center fixture');
  await customerContext.close();

  await page.goto(`${BASE_URL}/restaurant/orders`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="restaurant-order-center"]:visible').first().waitFor({ state: 'visible', timeout: 15_000 });
  // The consent banner is a required legal interaction and intentionally
  // intercepts the page. Record a real non-essential-cookie decision before
  // exercising the order controls, just as a first-time merchant must.
  const consentBanner = page.getByTestId('cookie-consent-banner');
  await consentBanner.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
  if (await consentBanner.isVisible().catch(() => false)) {
    await page.getByTestId('cookie-reject-non-essential').click();
    await consentBanner.waitFor({ state: 'hidden', timeout: 5_000 });
  }
  const row = page.locator(`[data-testid="restaurant-order-row"][data-order-id="${fixture.id}"]`);
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  ok(Number(await row.getByTestId('restaurant-order-item-count').textContent()) === fixture.quantity, 'Order list exposes the authoritative item quantity');

  const search = page.getByTestId('restaurant-orders-search');
  await search.fill(fixture.number || fixture.id);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="restaurant-order-row"]').length === 1);
  ok((await page.getByTestId('restaurant-order-row').count()) === 1, 'Search finds the exact order number');
  await search.fill('no-such-blinkgo-order');
  await page.waitForTimeout(150);
  ok((await page.getByTestId('restaurant-order-row').count()) === 0, 'Search renders a real empty state');
  await search.fill('');
  const pendingFilter = page.getByTestId('restaurant-orders-filter-pending');
  await pendingFilter.click();
  // Search rendering intentionally uses useDeferredValue. Wait for both the
  // selected tab and the cleared deferred search to commit before asserting.
  await page.waitForFunction((orderId) => {
    const selected = document.querySelector('[data-testid="restaurant-orders-filter-pending"]')?.getAttribute('aria-selected') === 'true';
    const matchingOrder = document.querySelector(`[data-testid="restaurant-order-row"][data-order-id="${orderId}"]`);
    return selected && Boolean(matchingOrder);
  }, fixture.id);
  ok((await pendingFilter.getAttribute('aria-selected')) === 'true' && (await row.count()) === 1, 'Pending filter isolates new work');

  await restaurantContext.setOffline(true);
  await page.getByTestId('restaurant-orders-network').waitFor({ state: 'visible', timeout: 5_000 });
  ok(await row.getByTestId('restaurant-list-order-confirmed').isDisabled(), 'Offline order center preserves data and blocks mutations');
  await restaurantContext.setOffline(false);
  await page.waitForFunction((id) => !document.querySelector(`[data-order-id="${id}"] [data-testid="restaurant-list-order-confirmed"]`)?.hasAttribute('disabled'), fixture.id);
  ok(true, 'Order-center actions recover after reconnection');

  await row.getByTestId('restaurant-list-order-confirmed').click();
  await row.getByTestId('restaurant-list-order-preparing').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'List action accepts the order');
  await page.getByTestId('restaurant-orders-filter-all').click();
  await row.getByTestId('restaurant-order-details').click();
  await page.waitForURL(`**/restaurant/orders/${fixture.id}`, { timeout: 10_000 });
  await page.getByTestId('restaurant-order-detail').waitFor({ state: 'visible', timeout: 10_000 });
  ok((await page.getByTestId('restaurant-detail-item').count()) > 0 && (!fixture.productName || (await page.getByTestId('restaurant-detail-item').first().innerText()).includes(fixture.productName)), 'Detail page exposes the real ordered product');
  ok((await page.getByTestId('restaurant-order-back').getAttribute('href')) === '/restaurant/orders', 'Detail page has an explicit return path');

  await page.getByTestId('restaurant-detail-order-preparing').click();
  await page.getByTestId('restaurant-detail-order-ready').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Detail action starts preparation');
  await page.getByTestId('restaurant-detail-order-ready').click();
  await page.getByTestId('restaurant-detail-waiting-driver').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Detail action marks the order ready for driver pickup');

  const mobile = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(mobile.document === mobile.viewport, `Mobile order detail has no horizontal overflow (${mobile.document}/${mobile.viewport})`);
  await page.getByTestId('restaurant-order-back').click();
  await page.waitForURL('**/restaurant/orders', { timeout: 10_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);
  const desktop = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(desktop.document === desktop.viewport, `Desktop order center has no horizontal overflow (${desktop.document}/${desktop.viewport})`);
  const unexpectedErrors = runtimeErrors.filter((message) => !message.includes('ERR_INTERNET_DISCONNECTED'));
  ok(unexpectedErrors.length === 0, `Order list and detail have no unexpected browser runtime errors${unexpectedErrors[0] ? `: ${unexpectedErrors[0]}` : ''}`);

  await restaurantContext.close();
  console.log(`Restaurant orders interactions: PASS (${passed}/${passed})`);
} finally {
  await browser.close();
}
