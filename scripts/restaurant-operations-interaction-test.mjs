#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the restaurant operations test.');

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
  ok(await login(page, { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' }), 'Restaurant signs in');
  const driverContext = await browser.newContext();
  const driverPage = await driverContext.newPage();
  ok(await login(driverPage, { email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!' }), 'Driver signs in for fixture isolation');
  const driverOffline = await driverPage.evaluate(async () => {
    const response = await fetch('/api/driver/online', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_online: false }) });
    return response.ok;
  });
  ok(driverOffline, 'Driver is offline while restaurant processes the fixture');
  await driverContext.close();
  await page.goto(`${BASE_URL}/restaurant/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="restaurant-operations-dashboard"]:visible').waitFor({ state: 'visible', timeout: 15_000 });
  const revenueBefore = await page.getByTestId('restaurant-kpi-today-revenue').locator('p').nth(1).textContent();
  ok(Boolean(revenueBefore), 'Delivered-only revenue KPI renders');

  const customerContext = await browser.newContext({ locale: 'de-DE' });
  const customerPage = await customerContext.newPage();
  ok(await login(customerPage, { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' }), 'Customer signs in for a live restaurant fixture');
  const fixture = await customerPage.evaluate(async () => {
    const search = await fetch('/api/search?sort=recommended', { credentials: 'include' }).then((response) => response.json());
    const linkedRestaurantIds = new Set(['00000000-0000-0000-0000-000000000020', 'b1000000-0000-4000-8000-000000000201']);
    const restaurant = search.restaurants?.find((candidate) => linkedRestaurantIds.has(candidate.id));
    if (!restaurant) return { id: null, error: 'No restaurant' };
    const products = await fetch(`/api/products/bestsellers?restaurant_id=${restaurant.id}`, { credentials: 'include' }).then((response) => response.json());
    const listedProduct = (products.bestsellers ?? products.products ?? []).find((item) => item.is_available !== false && item.is_active !== false);
    if (!listedProduct) return { id: null, error: 'No product' };
    // Bestseller cards are intentionally slim and may omit required modifier
    // groups. Build the fixture from the canonical product-detail contract so
    // the order is valid even when a product requires a choice.
    const detailPayload = await fetch(`/api/products/${listedProduct.id}`, { credentials: 'include' }).then((response) => response.json());
    const product = detailPayload.product ?? listedProduct;
    const selectedModifiers = Object.fromEntries((product.modifiers ?? [])
      .filter((modifier) => modifier.required && Number(modifier.min_select ?? 0) > 0)
      .map((modifier) => [modifier.id, (modifier.options ?? []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
    const unitPrice = Number(product.discount_price ?? product.price ?? 0);
    const minimumOrder = Number(restaurant.minimum_order ?? restaurant.min_order_amount ?? 0);
    const quantity = unitPrice > 0 ? Math.max(2, Math.ceil((minimumOrder + 0.01) / unitPrice)) : 2;
    const response = await fetch('/api/orders', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurant.id, items: [{ product_id: product.id, quantity, configuration: { selected_modifiers: selectedModifiers } }], payment_method: 'cash', delivery_address: { address: 'Restaurant Operations Test, Wesseling', lat: 50.8179, lng: 6.9821 } }),
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok ? { id: payload.order?.id ?? payload.data?.order?.id ?? null, error: null } : { id: null, error: payload.error?.message || payload.error || `HTTP ${response.status}` };
  });
  if (!fixture.id) console.error(`  Fixture creation failed: ${fixture.error}`);
  ok(Boolean(fixture.id), 'Customer creates a real pending order');
  await customerContext.close();

  await page.reload({ waitUntil: 'domcontentloaded' });
  const order = page.locator(`[data-testid="restaurant-live-order"][data-order-id="${fixture.id}"]:visible`);
  await order.waitFor({ state: 'visible', timeout: 15_000 });
  ok((await order.locator('li').count()) > 0, 'Order card exposes the products the kitchen must prepare');
  const revenuePending = await page.getByTestId('restaurant-kpi-today-revenue').locator('p').nth(1).textContent();
  ok(revenuePending === revenueBefore, 'Pending order does not inflate recognized revenue');

  await restaurantContext.setOffline(true);
  await page.getByTestId('restaurant-network-status').waitFor({ state: 'visible', timeout: 5_000 });
  ok(await order.getByTestId('restaurant-order-confirmed').isDisabled(), 'Offline mode blocks order mutations while preserving the order');
  await restaurantContext.setOffline(false);
  await page.getByTestId('restaurant-network-status').waitFor({ state: 'hidden', timeout: 10_000 });
  ok(true, 'Restaurant operations recover after reconnection');

  await order.getByTestId('restaurant-order-confirmed').click();
  await order.getByTestId('restaurant-order-preparing').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Accept moves the order to confirmed');
  await order.getByTestId('restaurant-order-preparing').click();
  await order.getByTestId('restaurant-order-ready').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Start preparation moves the order to kitchen work');
  await order.getByTestId('restaurant-order-ready').click();
  await order.getByTestId('restaurant-order-waiting-driver').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Mark ready transitions to driver pickup waiting state');

  const revenueReady = await page.getByTestId('restaurant-kpi-today-revenue').locator('p').nth(1).textContent();
  ok(revenueReady === revenueBefore, 'Ready order still does not inflate delivered revenue');

  const existingBusyStop = page.locator('[data-testid="restaurant-busy-stop"]:visible');
  if (await existingBusyStop.count()) {
    await existingBusyStop.click();
    await page.locator('[data-testid="restaurant-busy-start"]:visible').waitFor({ state: 'visible', timeout: 10_000 });
  }
  await page.locator('[data-testid="restaurant-busy-15"]:visible').click();
  await page.locator('[data-testid="restaurant-busy-start"]:visible').click();
  await page.locator('[data-testid="restaurant-busy-stop"]:visible').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Restaurant enables a time-bounded busy mode');
  await page.locator('[data-testid="restaurant-busy-stop"]:visible').click();
  await page.locator('[data-testid="restaurant-busy-start"]:visible').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Restaurant returns to normal capacity');

  const openToggle = page.getByTestId('restaurant-open-toggle');
  await openToggle.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="restaurant-open-toggle"]')?.getAttribute('aria-pressed') === 'false');
  ok(true, 'Restaurant pauses new order intake');
  await openToggle.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="restaurant-open-toggle"]')?.getAttribute('aria-pressed') === 'true');
  ok(true, 'Restaurant resumes new order intake');

  const mobile = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(mobile.document === mobile.viewport, `Mobile restaurant operations have no horizontal overflow (${mobile.document}/${mobile.viewport})`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  const desktop = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(desktop.document === desktop.viewport, `Desktop restaurant operations have no horizontal overflow (${desktop.document}/${desktop.viewport})`);
  const unexpectedErrors = runtimeErrors.filter((message) => !message.includes('ERR_INTERNET_DISCONNECTED'));
  ok(unexpectedErrors.length === 0, `Restaurant operations have no unexpected browser runtime errors${unexpectedErrors[0] ? `: ${unexpectedErrors[0]}` : ''}`);

  await restaurantContext.close();
  console.log(`Restaurant operations interactions: PASS (${passed}/${passed})`);
} finally {
  await browser.close();
}
