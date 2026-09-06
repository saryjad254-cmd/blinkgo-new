#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const baseUrl = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Chrome or Edge is required');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async () => {
    await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' }) });
    return response.ok;
  });
  check(login, 'admin login');

  const overlap = await page.evaluate(async () => {
    const response = await fetch('/api/admin/zones', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Overlap must fail', center_lat: 50.8203, center_lng: 6.9785, radius_km: 1, delivery_fee: 3, min_order_amount: 10, priority: 5, is_active: true }) });
    return { status: response.status, body: await response.json() };
  });
  check(overlap.status === 409 && /overlap/i.test(overlap.body.error), 'active overlap rejected');

  const invalidPolygon = await page.evaluate(async () => {
    const response = await fetch('/api/admin/zones', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Invalid polygon', center_lat: 51.2, center_lng: 7.5, radius_km: 1, delivery_fee: 3, min_order_amount: 10, priority: 5, polygon: [[51.19,7.49],[51.21,7.51],[51.19,7.51],[51.21,7.49]], is_active: true }) });
    return response.status;
  });
  check(invalidPolygon === 400, 'self-intersecting polygon rejected');

  const invalidSurge = await page.evaluate(async () => {
    const responses = await Promise.all([
      fetch('/api/admin/zones', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Unbounded surge', center_lat: 52.4, center_lng: 8.7, radius_km: 1, delivery_fee: 3, min_order_amount: 10, priority: 5, surge_multiplier: 2.5, surge_days: [1], surge_start_local: '12:00', surge_end_local: '13:00', is_active: false }) }),
      fetch('/api/admin/zones', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Incomplete surge', center_lat: 52.5, center_lng: 8.8, radius_km: 1, delivery_fee: 3, min_order_amount: 10, priority: 5, surge_multiplier: 1.2, is_active: false }) }),
    ]);
    return responses.map((response) => response.status);
  });
  check(invalidSurge.every((status) => status === 400), 'unbounded or incomplete surge policy rejected');

  const created = await page.evaluate(async () => {
    const response = await fetch('/api/admin/zones', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Pricing QA ${Date.now()}`, center_lat: 51.3, center_lng: 7.5, radius_km: 1, delivery_fee: 7.77, min_order_amount: 25, priority: 90, is_active: true, surge_multiplier: 1.5, surge_days: [0,1,2,3,4,5,6], surge_start_local: '00:00', surge_end_local: '23:59', surge_timezone: 'Europe/Berlin' }) });
    return { status: response.status, body: await response.json() };
  });
  check(created.status === 201 && created.body.zone?.id, 'non-overlapping rule created');

  const zoneId = created.body.zone.id;
  const resolved = await page.evaluate(async () => {
    const response = await fetch('/api/zone/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: 51.3, lng: 7.5 }) });
    return { status: response.status, body: await response.json() };
  });
  check(resolved.status === 200 && resolved.body.result?.ok === true, 'configured rule resolves');
  check(resolved.body.result.ruleId === zoneId, 'exact persisted rule id returned');
  check(Number(resolved.body.result.zone.delivery_fee) === 7.77, 'persisted delivery fee returned');
  check(Number(resolved.body.result.zone.min_order_amount) === 25, 'persisted minimum returned');
  check(Number(resolved.body.result.ruleVersion) === 1, 'rule version returned');
  check(resolved.body.result.pricing?.surgeActive === true, 'scheduled surge is active');
  check(Number(resolved.body.result.pricing?.baseFee) === 7.77, 'base fee remains explicit');
  check(Number(resolved.body.result.pricing?.deliveryFee) === 11.66, 'bounded multiplier is applied with cent rounding');
  check(Number(resolved.body.result.pricing?.surgeAmount) === 3.89, 'surge adjustment is explicit');

  const quote = await page.evaluate(async () => {
    const response = await fetch('/api/cart/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurant_id: '00000000-0000-0000-0000-000000000021', fulfillment_type: 'delivery', items: [{ product_id: 'a1111111-0000-0000-0000-000000000010', quantity: 3 }], delivery_address: { address: 'Pricing QA', lat: 51.3, lng: 7.5 } }) });
    return { status: response.status, body: await response.json() };
  });
  check(quote.status === 200 && Number(quote.body.delivery_fee) === 11.66, 'cart quote applies the persisted surge fee');
  check(Number(quote.body.delivery_fee_base) === 7.77 && Number(quote.body.delivery_fee_surge) === 3.89 && quote.body.delivery_fee_surge_active === true, 'cart quote exposes a transparent base and surge breakdown');
  check(quote.body.delivery_zone_rule_id === zoneId && Number(quote.body.delivery_zone_rule_version) === 1, 'cart quote identifies the exact pricing rule snapshot');

  const [cart, draft] = await Promise.all([readFile('app/api/cart/quote/route.ts', 'utf8'), readFile('app/api/checkout/draft/route.ts', 'utf8')]);
  check([cart, draft].every((source) => source.includes('resolveConfiguredDeliveryZone') && source.includes('delivery_zone_rule_version') && source.includes('delivery_fee_surge')), 'cart and signed draft consume and record the same rule and surge breakdown');

  const disabled = await page.evaluate(async (id) => {
    const response = await fetch(`/api/admin/zones/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) });
    return response.ok;
  }, zoneId);
  check(disabled, 'test rule safely deactivated');
  await context.close();
} finally {
  await browser.close();
}

console.log(`Delivery-zone pricing: ${passed}/${passed} checks passed.`);
