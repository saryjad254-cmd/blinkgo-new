#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const baseUrl = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Chrome or Edge is required');

let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed += 1; };
const [toolsRoute, assignRoute, orderOps, restaurantOps, orderUi] = await Promise.all([
  readFile('app/api/admin/operations/tools/route.ts', 'utf8'),
  readFile('app/api/admin/orders/[id]/assign/route.ts', 'utf8'),
  readFile('lib/services/order-operations.ts', 'utf8'),
  readFile('lib/services/restaurant-operations.ts', 'utf8'),
  readFile('components/admin/AdminOrderDetailClient.tsx', 'utf8'),
]);

check(toolsRoute.includes("reason.length < 5") && toolsRoute.includes('reassignOrderToDriver(orderId, driverId, auth.user.id, reason)'), 'operations route requires and propagates a reason');
check(toolsRoute.includes('emergencyCancelOrder(orderId, auth.user.id, reason)'), 'emergency cancellation has no silent default reason');
check(toolsRoute.includes('setRestaurantPaused(restaurantId, paused, auth.user.id, reason)'), 'restaurant overrides propagate the reason');
check(assignRoute.includes('reason.length < 5') && assignRoute.includes("reason },"), 'direct assignment validates and audits the reason');
check(orderOps.includes('reason: normalizedReason'), 'reassignment audit stores the normalized reason');
check(restaurantOps.includes('reason: normalizedReason'), 'restaurant audit stores the normalized reason');
check(orderUi.includes('admin-order-assignment-reason') && orderUi.includes('assignmentReason.trim().length < 5'), 'admin order UI requires a meaningful reason');

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const loggedIn = await page.evaluate(async () => {
    await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' }) });
    return response.ok;
  });
  check(loggedIn, 'admin session created');

  const statuses = await page.evaluate(async () => {
    const bodies = [
      { action: 'reassign_order', orderId: '00000000-0000-0000-0000-000000000001', driverId: '00000000-0000-0000-0000-000000000002' },
      { action: 'emergency_cancel', orderId: '00000000-0000-0000-0000-000000000001' },
      { action: 'pause_restaurant', restaurantId: '00000000-0000-0000-0000-000000000003' },
    ];
    return Promise.all(bodies.map(async (body) => (await fetch('/api/admin/operations/tools', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status));
  });
  check(statuses.every((status) => status === 400), 'all privileged overrides reject missing reasons before mutation');
  await context.close();
} finally {
  await browser.close();
}

console.log(`Admin override governance: ${passed}/${passed} checks passed.`);
