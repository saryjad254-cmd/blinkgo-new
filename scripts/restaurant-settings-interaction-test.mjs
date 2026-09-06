#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the restaurant settings test.');
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

  await page.goto(`${BASE_URL}/restaurant/settings`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const state = { id: crypto.randomUUID(), version: '2026-08-11', categories: { strictly_necessary: true, preferences: false, analytics: false, marketing: false }, updatedAt: new Date().toISOString() };
    document.cookie = `blinkgo-consent=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=15552000; SameSite=Lax`;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const center = page.locator('main [data-testid="restaurant-settings-center"]:visible');
  await center.waitFor({ state: 'visible', timeout: 15_000 });
  ok(true, 'Settings control center renders');
  let size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(size.document === size.viewport, `Mobile settings have no horizontal overflow (${size.document}/${size.viewport})`);
  const authoritativeMinimum = await page.evaluate(async () => {
    const dashboard = await fetch('/api/restaurant/dashboard', { credentials: 'include', cache: 'no-store' }).then((response) => response.json());
    const restaurantId = dashboard?.stats?.restaurantId ?? dashboard?.data?.stats?.restaurantId;
    if (!restaurantId) return null;
    const details = await fetch(`/api/restaurants/${restaurantId}`, { credentials: 'include', cache: 'no-store' }).then((response) => response.json());
    return details?.restaurant?.minimum_order ?? details?.data?.restaurant?.minimum_order ?? null;
  });
  ok(Number(await center.getByTestId('restaurant-settings-min-order').inputValue()) === Number(authoritativeMinimum), 'Commercial settings load the authoritative minimum order');

  await center.getByTestId('restaurant-settings-save').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="restaurant-settings-save"]')].some((element) => element.getClientRects().length > 0 && !element.hasAttribute('disabled')), null, { timeout: 10_000 });
  const profileAlerts = await center.locator('[role="alert"]').allTextContents();
  ok(profileAlerts.length === 0, `Restaurant profile saves through the server action${profileAlerts[0] ? `: ${profileAlerts[0]}` : ''}`);

  const hours = center.getByTestId('restaurant-working-hours');
  ok((await hours.getByTestId('restaurant-hours-row').count()) === 7, 'Seven-day schedule is complete');
  const mondayRow = hours.getByTestId('restaurant-hours-row').first();
  const monday = mondayRow.getByTestId('restaurant-hours-open');
  await mondayRow.locator('label').first().click();
  ok(await hours.getByTestId('restaurant-hours-save').isEnabled(), 'Schedule detects unsaved changes');
  await hours.getByTestId('restaurant-hours-save').click();
  await page.waitForFunction(async () => {
    const payload = await fetch('/api/restaurant/working-hours', { credentials: 'include', cache: 'no-store' }).then((response) => response.json());
    const schedule = payload?.data?.hours ?? payload?.hours ?? {};
    return !schedule.mon;
  }, null, { timeout: 10_000 });
  const closedPayload = await page.evaluate(async () => { const response = await fetch('/api/restaurant/working-hours', { credentials: 'include' }); return response.json(); });
  const closedSchedule = closedPayload?.data?.hours ?? closedPayload?.hours ?? {};
  ok(!closedSchedule.mon, 'Closed Monday persists in the canonical schedule');
  await mondayRow.locator('label').first().click();
  await hours.getByTestId('restaurant-hours-save').click();
  await page.waitForFunction(async () => {
    const payload = await fetch('/api/restaurant/working-hours', { credentials: 'include', cache: 'no-store' }).then((response) => response.json());
    const schedule = payload?.data?.hours ?? payload?.hours ?? {};
    return Boolean(schedule.mon?.open && schedule.mon?.close);
  }, null, { timeout: 10_000 });
  const restoredPayload = await page.evaluate(async () => { const response = await fetch('/api/restaurant/working-hours', { credentials: 'include' }); return response.json(); });
  const restoredSchedule = restoredPayload?.data?.hours ?? restoredPayload?.hours ?? {};
  ok(Boolean(restoredSchedule.mon?.open && restoredSchedule.mon?.close), 'Monday schedule can be restored');

  const specialHours = center.getByTestId('restaurant-special-hours');
  ok(await specialHours.isVisible(), 'Special and holiday hours are available in merchant settings');
  const serviceDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await specialHours.getByTestId('special-hours-date').fill(serviceDate);
  await specialHours.getByTestId('special-hours-save').click();
  const savedSpecialHourRow = specialHours.locator(`[data-testid="special-hours-row"][data-service-date="${serviceDate}"]`);
  await savedSpecialHourRow.waitFor({ state: 'visible', timeout: 10_000 });
  const specialPayload = await page.evaluate(async () => { const response = await fetch('/api/restaurant/special-hours', { credentials: 'include' }); return response.json(); });
  const savedSpecialHours = specialPayload?.data?.special_hours ?? specialPayload?.special_hours ?? [];
  const savedSpecialHour = savedSpecialHours.find((item) => item.service_date === serviceDate);
  ok(savedSpecialHour?.is_closed === true, 'A full-day holiday closure persists through the API');
  const deleteButton = savedSpecialHourRow.getByRole('button');
  await deleteButton.click();
  await savedSpecialHourRow.waitFor({ state: 'detached', timeout: 10_000 });
  ok(true, 'Merchant can remove a future special-hours override');

  const expectedValidationLogStart = runtimeErrors.length;
  const invalid = await page.evaluate(async () => { const response = await fetch('/api/restaurant/working-hours', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours: { mon: { open: '99:00', close: '22:00' } } }) }); return response.status; });
  ok(invalid === 400, 'Invalid time input is rejected by the API');
  runtimeErrors.splice(expectedValidationLogStart);

  await context.setOffline(true);
  await center.getByTestId('restaurant-settings-offline').waitFor({ state: 'visible', timeout: 5_000 });
  ok(await center.getByTestId('restaurant-settings-save').isDisabled() && await hours.getByTestId('restaurant-hours-save').isDisabled() && await specialHours.getByTestId('special-hours-save').isDisabled(), 'Offline mode blocks profile and schedule mutations');
  await context.setOffline(false);

  await page.goto(`${BASE_URL}/restaurant/notifications`, { waitUntil: 'domcontentloaded' });
  await page.locator('main [data-testid="restaurant-notifications-center"]:visible').waitFor({ state: 'visible', timeout: 10_000 });
  ok(await page.locator('main [data-testid="notifications-list-center"]:visible').isVisible(), 'Restaurant notification center loads');

  await page.goto(`${BASE_URL}/restaurant/support`, { waitUntil: 'domcontentloaded' });
  const support = page.locator('main [data-testid="restaurant-support-center"]:visible');
  await support.waitFor({ state: 'visible', timeout: 10_000 });
  await support.getByRole('button', { name: 'طلب جديد', exact: true }).click();
  ok(await support.getByTestId('support-new-request').isVisible(), 'Restaurant can open a new support request');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/restaurant/settings`, { waitUntil: 'domcontentloaded' });
  size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(size.document === size.viewport, `Desktop settings have no horizontal overflow (${size.document}/${size.viewport})`);
  const unexpected = runtimeErrors.filter((message) => !message.includes('ERR_INTERNET_DISCONNECTED'));
  ok(unexpected.length === 0, `Settings flow has no browser runtime errors${unexpected[0] ? `: ${unexpected[0]}` : ''}`);
  console.log(`Restaurant settings interactions: PASS (${passed}/${passed})`);
} finally { await browser.close(); }
