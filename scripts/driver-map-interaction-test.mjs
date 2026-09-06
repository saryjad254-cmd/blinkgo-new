#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the driver-map test.');

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
  const customerContext = await browser.newContext({ locale: 'de-DE' });
  const customerPage = await customerContext.newPage();
  await customerPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await customerPage.evaluate(() => fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' }));
  ok(await login(customerPage, { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' }), 'Customer signs in for driver-map fixture');

  const orderId = await customerPage.evaluate(async () => {
    const search = await fetch('/api/search?sort=recommended', { credentials: 'include' }).then((response) => response.json());
    const linkedRestaurantIds = new Set(['00000000-0000-0000-0000-000000000020', 'b1000000-0000-4000-8000-000000000201']);
    const restaurant = search.restaurants?.find((candidate) => linkedRestaurantIds.has(candidate.id));
    if (!restaurant) throw new Error('No restaurant is available for a driver-map fixture');
    const products = await fetch(`/api/products/bestsellers?restaurant_id=${restaurant.id}`, { credentials: 'include' }).then((response) => response.json());
    const product = (products.bestsellers ?? products.products ?? []).find((candidate) => candidate.is_available !== false && candidate.is_active !== false);
    if (!product) throw new Error('No product is available for a driver-map fixture');
    const selectedModifiers = Object.fromEntries((product.modifiers ?? [])
      .filter((modifier) => modifier.required && Number(modifier.min_select ?? 0) > 0)
      .map((modifier) => [modifier.id, (modifier.options ?? []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
    const unitPrice = Number(product.discount_price ?? product.price ?? 0);
    const minimumOrder = Number(restaurant.minimum_order ?? restaurant.min_order_amount ?? 0);
    const quantity = unitPrice > 0 ? Math.max(2, Math.ceil((minimumOrder + 0.01) / unitPrice)) : 2;
    const response = await fetch('/api/orders', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurant.id,
        items: [{ product_id: product.id, quantity, configuration: { selected_modifiers: selectedModifiers } }],
        payment_method: 'cash',
        delivery_address: { address: 'Driver map test, Wesseling', lat: 50.8233, lng: 6.9772 },
        tip: 2,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Driver-map fixture order failed');
    return result.order?.id || result.data?.order?.id;
  });
  ok(Boolean(orderId), 'Customer creates a real order for the map');
  await customerContext.close();

  const restaurantContext = await browser.newContext({ locale: 'de-DE' });
  const restaurantPage = await restaurantContext.newPage();
  ok(await login(restaurantPage, { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' }), 'Restaurant account signs in');
  const orderReady = await restaurantPage.evaluate(async (id) => {
    for (const status of ['confirmed', 'preparing', 'ready']) {
      const response = await fetch('/api/orders/status', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: id, status }) });
      if (!response.ok) return false;
    }
    return true;
  }, orderId);
  ok(orderReady, 'Restaurant prepares the fixture order for dispatch');
  await restaurantContext.close();

  const driverContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'de-DE', colorScheme: 'dark',
    geolocation: { latitude: 50.8233, longitude: 6.9772 }, permissions: ['geolocation'],
  });
  const driverPage = await driverContext.newPage();
  const consoleErrors = [];
  const requestedUrls = [];
  driverPage.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  driverPage.on('pageerror', (error) => consoleErrors.push(error.message));
  driverPage.on('request', (request) => requestedUrls.push(request.url()));
  ok(await login(driverPage, { email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!' }), 'Driver demo account signs in');

  const activeOrderId = await driverPage.evaluate(async (fixtureOrderId) => {
    await fetch('/api/driver/online', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_online: true }) });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const active = await fetch('/api/driver/active-order', { credentials: 'include' }).then((response) => response.json());
      const id = active.order?.id || active.data?.order?.id;
      if (id) return id;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const accepted = await fetch(`/api/driver/orders/${fixtureOrderId}/accept`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!accepted.ok) return null;
    const payload = await accepted.json().catch(() => ({}));
    return payload.data?.order?.id || payload.order?.id || fixtureOrderId;
  }, orderId);
  ok(Boolean(activeOrderId), 'Order is assigned to the driver');

  await driverPage.goto(`${BASE_URL}/driver/orders/${activeOrderId}`, { waitUntil: 'domcontentloaded' });
  const visibleMap = driverPage.locator('[data-testid="driver-order-map"]:visible');
  const visibleLegend = driverPage.locator('[data-testid="driver-map-legend"]:visible');
  await visibleMap.waitFor({ state: 'visible', timeout: 30_000 });
  await visibleLegend.waitFor({ state: 'visible', timeout: 30_000 });
  await driverPage.waitForTimeout(900);
  ok((await visibleMap.count()) === 1, 'Exactly one visible driver delivery map renders with Google Maps or the bundled fallback');
  ok((await visibleLegend.getByRole('listitem').count()) >= 2, 'Driver map renders destination points');
  ok(!requestedUrls.some((url) => url.includes('unpkg.com') || url.includes('leaflet-runtime-is-bundled')), 'Driver map makes no legacy runtime requests');
  ok(consoleErrors.length === 0, `Driver map has no console/page errors${consoleErrors[0] ? `: ${consoleErrors[0]}` : ''}`);
  console.log(`Driver map interactions: PASS (${passed}/${passed})`);
  await driverContext.close();
} finally {
  await browser.close();
}
