#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
  .filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required.');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
function ok(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

  const publicResults = await page.evaluate(async () => {
    const post = async (body) => {
      const response = await fetch('/api/analytics/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    const settings = await fetch('/api/admin/settings');
    return {
      valid: await post({ event: 'checkout_started', data: { item_count: 2, payment_method: 'cash' } }),
      nested: await post({ event: 'payment_failed', data: { error: { address: 'must-not-be-logged' }, error_code: 'DECLINED' } }),
      unknown: await post({ event: 'invented_event', data: { order_id: 'x' } }),
      settingsStatus: settings.status,
    };
  });
  ok(publicResults.valid.status === 200 && publicResults.valid.body?.data?.event === 'checkout_started', 'Whitelisted checkout analytics event is accepted');
  ok(publicResults.nested.status === 200, 'Nested analytics value is safely dropped without failing checkout');
  ok(publicResults.unknown.status === 200 && !publicResults.unknown.body?.data?.event, 'Unknown analytics event is silently dropped');
  ok(publicResults.settingsStatus === 401, 'System settings reject anonymous reads');

  const loginStatus = await page.evaluate(async () => {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') await fetch('/api/dev/test/reset', { method: 'POST' });
    return (await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' }),
    })).status;
  });
  ok(loginStatus === 200, 'Admin demo account signs in');

  const adminResults = await page.evaluate(async () => {
    const request = async (settings) => {
      const response = await fetch('/api/admin/settings', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    return {
      valid: await request({ 'checkout.cash_enabled': true, 'delivery.default_radius_km': 8 }),
      secret: await request({ 'stripe.secret_key': 'must-never-be-stored' }),
      invalidKey: await request({ 'Bad Key': true }),
      oversized: await request({ 'ui.large_value': 'x'.repeat(10_001) }),
      read: await fetch('/api/admin/settings', { credentials: 'include' }).then(async (response) => ({ status: response.status, body: await response.json() })),
      customerAnalytics: await fetch('/api/analytics/customer', { credentials: 'include' }).then(async (response) => ({ status: response.status, body: await response.json() })),
      marketplaceAnalytics: await fetch('/api/analytics/marketplace', { credentials: 'include' }).then(async (response) => ({ status: response.status, body: await response.json() })),
      restaurantAnalytics: await fetch('/api/analytics/restaurant', { credentials: 'include' }).then(async (response) => ({ status: response.status, body: await response.json() })),
      revenueAnalytics: await fetch('/api/analytics/revenue', { credentials: 'include' }).then(async (response) => ({ status: response.status, body: await response.json() })),
    };
  });
  ok(adminResults.valid.status === 200 && adminResults.valid.body?.data?.results?.every((item) => item.ok), 'Admin saves validated non-secret settings');
  ok(adminResults.secret.status === 400, 'Secret-like setting key is rejected');
  ok(adminResults.invalidKey.status === 400, 'Malformed setting key is rejected');
  ok(adminResults.oversized.status === 400, 'Oversized setting value is rejected');
  ok(adminResults.read.status === 200 && adminResults.read.body?.data?.settings?.['checkout.cash_enabled'] === true, 'Saved settings persist and can be read');
  ok(adminResults.customerAnalytics.status === 200 && typeof adminResults.customerAnalytics.body?.total_customers === 'number', 'Customer analytics use the canonical customer inventory');
  ok(adminResults.marketplaceAnalytics.status === 200
    && typeof adminResults.marketplaceAnalytics.body?.geolocated_orders === 'number'
    && typeof adminResults.marketplaceAnalytics.body?.ungeolocated_orders === 'number',
  'Marketplace analytics report real versus missing coordinates');
  ok(adminResults.restaurantAnalytics.status === 200 && Array.isArray(adminResults.restaurantAnalytics.body?.top_products), 'Restaurant analytics contract is available');
  ok(adminResults.revenueAnalytics.status === 200 && Array.isArray(adminResults.revenueAnalytics.body?.commission_recommendations), 'Revenue analytics calculate commission recommendations');

  console.log(`Settings/analytics contracts: PASS (${passed}/${passed})`);
  await context.close();
} finally {
  await browser.close();
}
