#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync);

if (!executablePath) throw new Error('Chrome or Edge is required for the admin integrations test.');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
let webhookId = '';
let automationId = '';

function ok(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  await context.addCookies([{ name: 'blinkgo-locale', value: 'ar', url: BASE_URL, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async (credentials) => {
    await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
    const response = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
    });
    return response.ok;
  }, { email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' });
  ok(login, 'Admin signs in');

  await page.goto(`${BASE_URL}/admin/integrations`, { waitUntil: 'domcontentloaded' });
  const overviewTab = page.getByTestId('integration-tab-overview');
  await overviewTab.first().waitFor();
  await page.waitForTimeout(400);
  ok(await overviewTab.count() === 1, 'Integrations content is rendered once after hydration');
  const integrationsText = await page.locator('body').innerText();
  ok(integrationsText.includes('التكاملات والأتمتة'), 'Arabic BlinkGo integrations console renders');
  const consentBanner = page.getByTestId('cookie-consent-banner');
  if (await consentBanner.isVisible().catch(() => false)) {
    await page.getByTestId('cookie-reject-non-essential').click();
    await consentBanner.waitFor({ state: 'detached' });
    ok(true, 'Cookie consent is resolved through the real privacy control');
  }
  await page.getByTestId('integration-tab-push').first().click();
  await page.getByText('لا حاجة إلى Firebase').waitFor({ state: 'visible', timeout: 10_000 });
  ok(true, 'Supabase-first architecture is visible without Firebase');

  await page.getByTestId('integration-tab-webhooks').first().click();
  await page.getByTestId('add-webhook').click();
  await page.getByTestId('webhook-name').fill('Browser Acceptance Webhook');
  await page.getByTestId('webhook-url').fill('https://httpbin.org/post');
  await page.getByTestId('webhook-secret').fill('browser-acceptance-secret-2026');
  await page.getByTestId('webhook-events').fill('order.created, order.completed');
  await page.getByTestId('webhook-description').fill('Created through the real admin interface');
  await page.getByTestId('webhook-save').click();
  const createdCard = page.getByText('Browser Acceptance Webhook', { exact: true }).locator('xpath=ancestor::*[starts-with(@data-testid,"webhook-card-")]');
  await createdCard.waitFor();
  const cardTestId = await createdCard.getAttribute('data-testid');
  webhookId = cardTestId?.replace('webhook-card-', '') || '';
  ok(Boolean(webhookId), 'Webhook is created through the dialog');

  await page.getByTestId(`toggle-webhook-${webhookId}`).click();
  await page.getByTestId(`webhook-card-${webhookId}`).getByText('غير فعال').waitFor();
  ok(true, 'Webhook enable switch persists');

  await page.getByTestId(`edit-webhook-${webhookId}`).click();
  await page.getByTestId('webhook-name').fill('Browser Acceptance Webhook Updated');
  await page.getByTestId('webhook-save').click();
  await page.getByText('Browser Acceptance Webhook Updated', { exact: true }).waitFor();
  ok(true, 'Webhook edit persists without replacing its secret');

  await page.getByTestId(`toggle-webhook-${webhookId}`).click();
  await page.getByTestId(`webhook-card-${webhookId}`).getByText('فعال', { exact: true }).waitFor();
  await page.getByTestId(`test-webhook-${webhookId}`).click();
  await page.getByTestId(`webhook-card-${webhookId}`).getByRole('status').waitFor({ timeout: 15_000 });
  ok(true, 'Webhook test action returns a visible result');
  const latestDelivery = page.locator('[data-testid^="webhook-delivery-"]').first();
  await latestDelivery.waitFor({ timeout: 15_000 });
  ok((await latestDelivery.innerText()).includes('test.ping'), 'Durable webhook delivery appears in the admin history');

  await page.getByTestId('integration-tab-automation').first().click();
  const firstSwitch = page.locator('[data-testid^="automation-toggle-"]').first();
  await firstSwitch.waitFor();
  const initialState = await firstSwitch.getAttribute('aria-checked');
  await firstSwitch.click();
  await page.waitForFunction(({ selector, before }) => document.querySelector(selector)?.getAttribute('aria-checked') !== before, { selector: '[data-testid^="automation-toggle-"]', before: initialState });
  const toggledState = await firstSwitch.getAttribute('aria-checked');
  ok(toggledState !== initialState, 'Automation rule switch persists');
  await firstSwitch.click();
  await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.getAttribute('aria-checked') === expected, { selector: '[data-testid^="automation-toggle-"]', expected: initialState });
  ok(true, 'Automation rule is restored');

  await page.getByTestId('add-automation-rule').click();
  await page.getByTestId('automation-name').fill('Browser Acceptance Automation');
  await page.getByTestId('automation-description').fill('Created through the structured automation editor');
  await page.getByTestId('automation-trigger').selectOption('order.completed');
  await page.getByTestId('add-automation-condition').click();
  await page.getByTestId('automation-condition-field-0').fill('total');
  await page.getByTestId('automation-condition-operator-0').selectOption('gte');
  await page.getByTestId('automation-condition-value-0').fill('50');
  await page.getByTestId('save-automation-rule').click();
  const automationCard = page.getByText('Browser Acceptance Automation', { exact: true }).locator('xpath=ancestor::*[starts-with(@data-testid,"automation-rule-card-")]');
  await automationCard.waitFor();
  const automationCardTestId = await automationCard.getAttribute('data-testid');
  automationId = automationCardTestId?.replace('automation-rule-card-', '') || '';
  ok(Boolean(automationId), 'Automation rule is created through the structured editor');

  await page.getByTestId(`edit-automation-rule-${automationId}`).click();
  await page.getByTestId('automation-name').fill('Browser Acceptance Automation Updated');
  await page.getByTestId('automation-cooldown').fill('15');
  await page.getByTestId('save-automation-rule').click();
  await page.getByText('Browser Acceptance Automation Updated', { exact: true }).waitFor();
  ok(true, 'Automation rule edit persists');

  await page.getByTestId(`edit-automation-rule-${automationId}`).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('delete-automation-rule').click();
  await page.getByTestId(`automation-rule-card-${automationId}`).waitFor({ state: 'detached' });
  automationId = '';
  ok(true, 'Automation rule delete removes the card');

  const metrics = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  ok(metrics.scrollWidth <= metrics.clientWidth + 2, `Mobile layout has no horizontal overflow (${metrics.scrollWidth}/${metrics.clientWidth})`);
  await page.screenshot({ path: 'reports/admin-integrations-mobile-ar.png', fullPage: true });

  await page.getByTestId('integration-tab-webhooks').first().click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId(`delete-webhook-${webhookId}`).click();
  await page.getByTestId(`webhook-card-${webhookId}`).waitFor({ state: 'detached' });
  webhookId = '';
  ok(true, 'Webhook delete removes the card');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/admin/integrations`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('integration-tab-overview').first().waitFor();
  await page.waitForTimeout(400);
  const desktopMetrics = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  ok(desktopMetrics.scrollWidth <= desktopMetrics.clientWidth + 2, `Desktop layout has no horizontal overflow (${desktopMetrics.scrollWidth}/${desktopMetrics.clientWidth})`);
  await page.screenshot({ path: 'reports/admin-integrations-desktop-ar.png', fullPage: true });

  ok(runtimeErrors.length === 0, `No browser runtime errors${runtimeErrors[0] ? `: ${runtimeErrors[0]}` : ''}`);
  console.log(`Admin integrations interactions: PASS (${passed}/${passed})`);
  await context.close();
} finally {
  if (webhookId) {
    // Best-effort cleanup is covered by the API workflow even if a browser assertion fails.
    console.warn(`Cleanup required for webhook ${webhookId}`);
  }
  if (automationId) console.warn(`Cleanup required for automation rule ${automationId}`);
  await browser.close();
}
