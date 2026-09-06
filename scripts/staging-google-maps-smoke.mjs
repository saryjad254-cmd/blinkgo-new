#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const baseUrl = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync);

if (!executablePath) throw new Error('Chrome or Edge is required for the staging maps smoke test.');

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'de-DE',
  geolocation: { latitude: 50.8233, longitude: 6.9772 },
  permissions: ['geolocation'],
});
const page = await context.newPage();
const runtimeErrors = [];

page.on('pageerror', (error) => runtimeErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const loginOk = await page.evaluate(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!' }),
    });
    return response.ok;
  });
  if (!loginOk) throw new Error('Staging driver login failed');

  const activeOrderId = await page.evaluate(async () => {
    const response = await fetch('/api/driver/active-order', { credentials: 'include' });
    const result = await response.json();
    const active = result.order?.id || result.data?.order?.id || null;
    if (active) return active;
    // A clean staging run may have no delivery in flight. The order-detail
    // map uses the same production provider/loader for completed deliveries,
    // so use the driver's latest real completed order as a stable fallback.
    const completedResponse = await fetch('/api/driver/orders?status=completed&limit=1', { credentials: 'include' });
    const completedResult = await completedResponse.json();
    return completedResult.orders?.[0]?.id || completedResult.data?.orders?.[0]?.id || null;
  });
  if (!activeOrderId) throw new Error('No staging driver order is available for the map smoke test');

  await page.goto(`${baseUrl}/driver/orders/${activeOrderId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(document.querySelector('.gm-style, .leaflet-container')),
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(750);

  const state = await page.evaluate(() => ({
    googleScriptCount: document.querySelectorAll('#google-maps-script').length,
    googleMapVisible: Boolean(document.querySelector('.gm-style')),
    osmFallbackVisible: Boolean(document.querySelector('.leaflet-container')),
    legendItems: [...document.querySelectorAll('[data-testid="driver-map-legend"] [role="listitem"]')].map((item) => {
      const label = item.querySelector('span');
      return {
        text: label?.textContent?.trim() || '',
        textColor: label ? getComputedStyle(label).color : '',
        backgroundColor: getComputedStyle(item).backgroundColor,
      };
    }),
  }));

  if (state.googleScriptCount > 1) throw new Error('Google Maps was injected more than once');
  if (!state.googleMapVisible && !state.osmFallbackVisible) throw new Error('Neither Google Maps nor the OSM fallback rendered');
  if (state.legendItems.length < 2) throw new Error('The driver map legend is incomplete');
  if (state.legendItems.some((item) => !item.text || item.textColor === item.backgroundColor)) {
    throw new Error('The driver map legend contains an unreadable label');
  }
  if (runtimeErrors.length > 0) throw new Error(`Map page emitted ${runtimeErrors.length} runtime error(s)`);

  console.log(`Staging maps smoke: PASS (provider=${state.googleMapVisible ? 'google' : 'osm-fallback'}, scripts=${state.googleScriptCount}, legend=${state.legendItems.length}, runtime-errors=0)`);
} finally {
  await browser.close();
}
