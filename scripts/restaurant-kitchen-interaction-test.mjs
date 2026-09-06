#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the kitchen interaction test.');

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
  ok(await login(page, { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' }), 'Restaurant signs in to the kitchen display');

  const customerContext = await browser.newContext({ locale: 'de-DE' });
  const customerPage = await customerContext.newPage();
  ok(await login(customerPage, { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' }), 'Customer signs in for a kitchen fixture');
  const fixture = await customerPage.evaluate(async () => {
    const search = await fetch('/api/search?sort=recommended', { credentials: 'include' }).then((response) => response.json());
    const linkedRestaurantIds = new Set(['00000000-0000-0000-0000-000000000020', 'b1000000-0000-4000-8000-000000000201']);
    const restaurant = search.restaurants?.find((item) => linkedRestaurantIds.has(item.id));
    if (!restaurant) return { id: null, error: 'No restaurant' };
    const products = await fetch(`/api/products/bestsellers?restaurant_id=${restaurant.id}`, { credentials: 'include' }).then((response) => response.json());
    const product = (products.bestsellers ?? products.products ?? []).find((item) => item.is_available !== false && item.is_active !== false);
    if (!product) return { id: null, error: 'No product' };
    const selectedModifiers = Object.fromEntries((product.modifiers ?? [])
      .filter((modifier) => modifier.required && Number(modifier.min_select ?? 0) > 0)
      .map((modifier) => [modifier.id, (modifier.options ?? []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
    const unitPrice = Number(product.discount_price ?? product.price ?? 0);
    const minimumOrder = Number(restaurant.minimum_order ?? restaurant.min_order_amount ?? 0);
    const quantity = unitPrice > 0 ? Math.max(2, Math.ceil((minimumOrder + 0.01) / unitPrice)) : 2;
    const response = await fetch('/api/orders', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurant.id, items: [{ product_id: product.id, quantity, configuration: { selected_modifiers: selectedModifiers } }], payment_method: 'cash', delivery_address: { address: 'Kitchen Display Test, Wesseling', lat: 50.8179, lng: 6.9821 }, delivery_instructions: 'No cutlery' }),
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok ? { id: payload.order?.id ?? payload.data?.order?.id ?? null, productName: product.name ?? null, error: null } : { id: null, productName: null, error: payload.error?.message || payload.error || `HTTP ${response.status}` };
  });
  if (!fixture.id) console.error(`  Fixture creation failed: ${fixture.error}`);
  ok(Boolean(fixture.id), 'Customer creates a real pending kitchen order');
  await page.goto(`${BASE_URL}/restaurant/kitchen`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="restaurant-kitchen-display"]:visible').waitFor({ state: 'visible', timeout: 15_000 });
  ok(true, 'Kitchen display renders');
  const order = page.locator(`[data-testid="kitchen-order-card"][data-order-id="${fixture.id}"]`);
  await order.waitFor({ state: 'visible', timeout: 15_000 });
  ok((await order.locator('li').count()) > 0 && (!fixture.productName || (await order.innerText()).includes(fixture.productName)), 'Kitchen ticket reads real order_items data');
  ok(await order.getByTestId('kitchen-prep-estimate').isVisible(), 'Pending order requires a pickup-ready estimate');
  ok((await order.getByRole('link').count()) > 0 && (await order.getByRole('button', { name: /طباعة|Print|drucken/i }).count()) > 0, 'Kitchen ticket exposes details and print controls');

  const soundToggle = page.getByTestId('kitchen-sound-toggle');
  const soundBefore = await soundToggle.getAttribute('aria-pressed');
  await soundToggle.click();
  ok((await soundToggle.getAttribute('aria-pressed')) !== soundBefore, 'Order sound can be toggled');

  await restaurantContext.setOffline(true);
  await page.getByTestId('kitchen-network-status').waitFor({ state: 'visible', timeout: 5_000 });
  ok(await order.getByTestId('kitchen-order-confirmed').isDisabled(), 'Offline mode preserves the ticket and blocks mutations');
  await restaurantContext.setOffline(false);
  await page.waitForFunction(() => !document.querySelector('[data-testid="kitchen-order-confirmed"]')?.hasAttribute('disabled'));
  ok(true, 'Kitchen actions recover after reconnection');

  await order.getByTestId('kitchen-prep-estimate').getByRole('button', { name: '15', exact: true }).click();
  const acceptResponsePromise = page.waitForResponse((response) => response.url().includes('/api/orders/status') && response.request().method() === 'PATCH');
  await order.getByTestId('kitchen-order-confirmed').click();
  const acceptResponse = await acceptResponsePromise;
  const acceptPayload = await acceptResponse.json().catch(() => ({}));
  ok(acceptResponse.ok() && acceptPayload.data?.preparation_plan?.estimatedPrepMinutes === 15, 'Accept API persists the selected 15-minute preparation promise');
  await order.getByTestId('kitchen-order-preparing').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Accept moves the order into the accepted queue');
  const preparation = await customerPage.evaluate(async (orderId) => {
    const response = await fetch(`/api/orders/track?order_id=${encodeURIComponent(orderId)}`, { credentials: 'include', cache: 'no-store' });
    const payload = await response.json();
    return payload.data?.journey?.preparation ?? null;
  }, fixture.id);
  ok(preparation?.estimated_prep_minutes === 15 && preparation?.estimated_ready_at, 'Customer tracking receives the restaurant pickup-ready promise');
  await order.getByTestId('kitchen-prep-sla').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Kitchen SLA timer uses the promised ready time');
  await order.getByTestId('kitchen-order-preparing').click();
  await order.getByTestId('kitchen-order-ready').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Start preparation moves the order into production');
  await order.getByTestId('kitchen-order-ready').click();
  await order.getByTestId('kitchen-waiting-driver').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Mark ready exposes the driver-pickup state');

  await page.getByTestId('kitchen-tab-ready').click();
  ok((await page.getByTestId('kitchen-tab-ready').getAttribute('aria-selected')) === 'true', 'Mobile stage tabs filter the kitchen board');
  const mobile = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(mobile.document === mobile.viewport, `Mobile kitchen has no horizontal overflow (${mobile.document}/${mobile.viewport})`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const desktop = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(desktop.document === desktop.viewport, `Desktop kitchen has no horizontal overflow (${desktop.document}/${desktop.viewport})`);
  ok((await page.getByTestId('kitchen-fullscreen').count()) === 1 && (await page.getByTestId('kitchen-print-all').count()) === 1, 'Kitchen-wide fullscreen and print actions render');
  const unexpectedErrors = runtimeErrors.filter((message) => !message.includes('ERR_INTERNET_DISCONNECTED'));
  ok(unexpectedErrors.length === 0, `Kitchen has no unexpected browser runtime errors${unexpectedErrors[0] ? `: ${unexpectedErrors[0]}` : ''}`);

  await customerContext.close();
  await restaurantContext.close();
  console.log(`Restaurant kitchen interactions: PASS (${passed}/${passed})`);
} finally {
  await browser.close();
}
