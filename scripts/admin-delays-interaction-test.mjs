#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the admin delays test.');
const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
function ok(condition, label) { if (!condition) throw new Error(label); passed += 1; console.log(`  ✓ ${label}`); }

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
  await context.addCookies([{ name: 'blinkgo-locale', value: 'en', url: BASE_URL, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async (credentials) => {
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    return response.ok;
  }, { email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' });
  ok(login, 'Admin signs in');

  // URL locale has the highest application precedence and makes this
  // localization assertion deterministic even if a prior browser cookie is
  // restored by the global language provider during sign-in.
  await page.goto(`${BASE_URL}/admin/delays?lang=en`, { waitUntil: 'domcontentloaded' });
  const delaysPage = page.locator('[data-testid="admin-delays-page"]:visible').first();
  await delaysPage.waitFor({ timeout: 15_000 });
  const policy = delaysPage.getByTestId('admin-delay-policy');
  await policy.waitFor({ timeout: 15_000 });
  const delayPageText = await delaysPage.innerText();
  ok(delayPageText.includes('Delays & goodwill review'), 'Localized delay operations page renders');
  ok(delayPageText.includes('Money is never issued automatically.'), 'Policy clearly prevents automatic payouts');
  ok(await delaysPage.getByTestId('admin-delay-incidents').count() + await delaysPage.getByTestId('admin-delays-empty').count() === 1, 'Incident list has a complete data or empty state');

  const policyInputs = policy.getByRole('spinbutton');
  const originalReviewAfter = await policyInputs.nth(0).inputValue();
  await policyInputs.nth(0).fill('21');
  await policy.getByTestId('admin-delay-policy-save').click();
  await page.getByRole('status').filter({ hasText: 'Policy saved' }).waitFor({ timeout: 10_000 });
  const saved = await page.evaluate(async () => (await (await fetch('/api/admin/delays', { credentials: 'include', cache: 'no-store' })).json()).data?.policy);
  ok(saved?.reviewAfterMinutes === 21, 'Policy edit persists through the protected admin API');
  await policyInputs.nth(0).fill(originalReviewAfter);
  await policy.getByTestId('admin-delay-policy-save').click();
  await page.getByRole('status').filter({ hasText: 'Policy saved' }).waitFor({ timeout: 10_000 });
  ok(true, 'Test restores the original delay policy');

  await page.getByRole('button', { name: 'Open menu' }).click();
  ok(await page.getByRole('link', { name: 'Delays' }).isVisible(), 'Mobile admin navigation exposes the delay center');
  await page.getByRole('button', { name: 'Close menu' }).click();

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await customerPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await customerPage.evaluate(async (credentials) => { await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) }); }, { email: 'customer@blinkgo.com', password: 'BlinkGo2026!' });
  const forbidden = await customerPage.evaluate(async () => (await fetch('/api/admin/delays', { credentials: 'include' })).status);
  ok([401, 403].includes(forbidden), `Customer cannot access delay operations (${forbidden})`);
  await customerContext.close();

  const unexpected = runtimeErrors.filter((message) => !message.includes('status of 401') && !message.includes('status of 403'));
  ok(unexpected.length === 0, `Delay center has no browser runtime errors${unexpected[0] ? `: ${unexpected[0]}` : ''}`);
  await context.close();
  console.log(`Admin delays interactions: PASS (${passed}/${passed})`);
} finally { await browser.close(); }
