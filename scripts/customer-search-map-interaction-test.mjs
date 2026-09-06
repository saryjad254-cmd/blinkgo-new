#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the search-map test.');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
const ok = (condition, label) => {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE', colorScheme: 'dark' });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestedUrls = [];
  let readinessUnavailable = false;
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('request', (request) => requestedUrls.push(request.url()));
  page.on('response', (response) => {
    if (response.status() === 503 && response.url().includes('/api/health/ready')) readinessUnavailable = true;
  });

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async (credentials) => {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
    }
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    return response.ok;
  }, { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' });
  ok(login, 'Customer demo account signs in');

  // Discover a real catalog fixture instead of relying on a mock-only name,
  // then exercise the query-results map in both local and staging.
  const fixtureQuery = await page.evaluate(async () => {
    const response = await fetch('/api/search?sort=recommended', { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    return payload.restaurants?.[0]?.name || null;
  });
  ok(Boolean(fixtureQuery), 'Search API exposes a restaurant map fixture');
  await page.goto(`${BASE_URL}/search?q=${encodeURIComponent(fixtureQuery)}`, { waitUntil: 'domcontentloaded' });
  const mapButton = page.getByRole('button', { name: /Map|Karte|الخريطة/ });
  try {
    await mapButton.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    const buttons = await page.getByRole('button').allTextContents();
    throw new Error(`Search map toggle is unavailable at ${page.url()}; buttons=${JSON.stringify(buttons.slice(0, 20))}`);
  }
  await page.getByRole('button', { name: /Nur notwendige|Reject optional|رفض غير الضروري/ }).click({ timeout: 2_000 }).catch(() => undefined);
  await page.getByRole('tab', { name: /Restaurants|Restaurants|المطاعم/ }).click();
  await mapButton.click();
  try {
    await page.waitForURL((url) => url.searchParams.get('view') === 'map', { timeout: 5_000 });
    await page.getByTestId('search-map').waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    const matched = await mapButton.evaluateAll((buttons) => buttons.map((button) => ({
      ariaLabel: button.getAttribute('aria-label'),
      text: button.textContent,
      html: button.outerHTML.slice(0, 300),
    })));
    const tabs = await page.getByRole('tab').evaluateAll((items) => items.map((item) => ({
      ariaSelected: item.getAttribute('aria-selected'),
      text: item.textContent,
    })));
    throw new Error(`Search map view did not persist; url=${page.url()} matched=${JSON.stringify(matched)} tabs=${JSON.stringify(tabs)}`);
  }
  try {
    await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    const statusText = await page.getByRole('status').allTextContents().catch(() => []);
    const loadingVisible = await page.getByTestId('search-map-loading').isVisible().catch(() => false);
    throw new Error(`Search map did not initialize; loading=${loadingVisible} status=${JSON.stringify(statusText)} errors=${JSON.stringify(consoleErrors)}`);
  }
  await page.waitForTimeout(800);

  ok((await page.locator('.leaflet-container').count()) === 1, 'Bundled Leaflet map renders');
  ok((await page.locator('.leaflet-marker-icon').count()) >= 1, 'Search result renders at least one map marker');
  ok(!requestedUrls.some((url) => url.includes('unpkg.com')), 'Map makes no unpkg.com runtime requests');
  const unexpectedErrors = consoleErrors.filter((message) => !(
    readinessUnavailable && message.includes('status of 503')
  ));
  ok(unexpectedErrors.length === 0, `Search map has no console/page errors${unexpectedErrors[0] ? `: ${unexpectedErrors[0]}` : ''}`);
  console.log(`Customer search-map interactions: PASS (${passed}/${passed})`);
} finally {
  await browser.close();
}
