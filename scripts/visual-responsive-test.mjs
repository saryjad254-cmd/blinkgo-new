#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_URL = process.env.BLINKGO_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
const CAPTURE = process.env.VISUAL_CAPTURE === '1';
const ROLE_FILTER = process.env.VISUAL_ROLE || '';
const VIEWPORT_FILTER = process.env.VISUAL_VIEWPORT || '';
const LOCALE_FILTER = process.env.VISUAL_LOCALE || '';
const ROUTE_FILTER = process.env.VISUAL_ROUTE || '';
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'visual-audit');
const SCREENSHOT_DIR = join(ARTIFACT_DIR, 'screenshots');
const executableCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => existsSync(candidate));

if (!executablePath) {
  console.error('Visual audit requires Chrome or Edge. Set CHROME_PATH to a Chromium executable.');
  process.exit(1);
}

const routeGroups = {
  public: [
    '/', '/welcome', '/login', '/register', '/forgot-password', '/reset-password',
    '/auth/verify', '/auth/oauth-error', '/auth/mfa', '/auth/accept-invite', '/brand', '/coming-soon', '/help', '/help/faq',
    '/legal/agb', '/legal/cookies', '/legal/data-request', '/legal/datenschutz',
    '/legal/driver-terms', '/legal/impressum', '/legal/merchant-terms', '/legal/widerruf',
  ],
  customer: [
    '/home', '/restaurants', '/market', '/shop', '/search', '/favorites', '/cart', '/checkout', '/orders',
    '/addresses', '/notifications', '/payment-history', '/profile', '/customer/support', '/checkout/success',
    '/help/chat',
  ],
  driver: [
    '/driver', '/driver/dashboard', '/driver/documents', '/driver/earnings', '/driver/history',
    '/driver/orders', '/driver/orders/available', '/driver/payouts', '/driver/settings',
    '/driver/support', '/driver/notifications',
  ],
  restaurant: [
    '/restaurant', '/restaurant/dashboard', '/restaurant/kitchen', '/restaurant/menu',
    '/restaurant/menu/new', '/restaurant/menu/requests', '/restaurant/menu/requests/new',
    '/restaurant/orders', '/restaurant/settings', '/restaurant/support', '/restaurant/notifications',
  ],
  admin: [
    '/admin', '/admin/dashboard', '/admin/onboarding', '/admin/control-center', '/admin/orders',
    '/admin/users', '/admin/drivers', '/admin/restaurants', '/admin/products', '/admin/zones',
    '/admin/admins', '/admin/analytics', '/admin/announcements', '/admin/audit',
    '/admin/configuration', '/admin/coupons', '/admin/driver-hours', '/admin/executive',
    '/admin/expansion', '/admin/finance', '/admin/heatmap', '/admin/integrations',
    '/admin/live-ops', '/admin/loyalty', '/admin/map', '/admin/notifications',
    '/admin/operations', '/admin/promotions', '/admin/recovery-queue', '/admin/referrals',
    '/admin/refunds', '/admin/reset', '/admin/search-analytics', '/admin/support',
    '/admin/system',
  ],
};

const dynamicSources = {
  customer: [
    { source: '/restaurants', selector: 'a[href^="/restaurants/"]' },
    { source: '/orders', selector: 'a[href^="/orders/"]:not([href$="/track"])' },
    { source: '/orders', selector: 'a[href^="/orders/"][href$="/track"]' },
  ],
  driver: [
    { source: '/driver/orders', selector: 'a[href^="/driver/orders/"]' },
    { source: '/driver/history', selector: 'a[href^="/driver/orders/"]' },
  ],
  restaurant: [
    { source: '/restaurant/menu', selector: 'a[href^="/restaurant/menu/"][href$="/edit"]' },
    { source: '/restaurant/orders', selector: 'a[href^="/restaurant/orders/"]' },
  ],
  admin: [
    { source: '/admin/orders', selector: 'a[href^="/admin/orders/"]' },
  ],
};

const viewports = [
  { name: 'mobile', width: 390, height: 844, hasTouch: true, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, hasTouch: false, isMobile: false },
].filter((viewport) => !VIEWPORT_FILTER || viewport.name === VIEWPORT_FILTER);
const locales = ['de', 'ar', 'en'].filter((locale) => !LOCALE_FILTER || locale === LOCALE_FILTER);
const testAccounts = {
  customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
  driver: { email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!' },
  restaurant: { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' },
  admin: { email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' },
};
const results = [];
const warnings = [];

function safeName(pathname) {
  return pathname === '/' ? 'root' : pathname.replace(/^\//, '').replace(/[^a-zA-Z0-9_-]+/g, '__');
}

async function authenticate(page, role) {
  if (role === 'public') {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    return;
  }
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const account = testAccounts[role];
  const login = await page.evaluate(async (credentials) => {
    await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }, account);
  if (!login.ok) throw new Error(`Demo login failed for ${role}: ${login.status} ${login.body.slice(0, 160)}`);
}

async function setLocale(context, page, locale) {
  await context.addCookies([{
    name: 'blinkgo-locale', value: locale, url: BASE_URL, sameSite: 'Lax',
  }]);
  await page.evaluate((nextLocale) => {
    localStorage.setItem('blinkgo-locale', nextLocale);
    document.cookie = `blinkgo-locale=${nextLocale};path=/;max-age=31536000;SameSite=Lax`;
  }, locale);
}

async function discoverDynamicRoutes(page, role) {
  const found = [];
  for (const item of dynamicSources[role] || []) {
    await page.goto(`${BASE_URL}${item.source}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
    const href = await page.locator(item.selector).first().getAttribute('href').catch(() => null);
    if (href && !found.includes(href)) found.push(href);
    else if (role !== 'driver') warnings.push(`${role}: no dynamic route found from ${item.source} using ${item.selector}`);
  }
  if (role === 'driver' && !found.some((route) => route.startsWith('/driver/orders/'))) {
    const driverOrderId = await page.evaluate(async () => {
      const response = await fetch('/api/driver/history', { credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      return payload?.data?.orders?.[0]?.id || payload?.orders?.[0]?.id || null;
    }).catch(() => null);
    if (driverOrderId) found.push(`/driver/orders/${driverOrderId}`);
    else warnings.push('driver: no order detail route was available from list pages or the history API');
  }
  return found;
}

async function waitForNavigationToSettle(page, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let lastUrl = page.url();
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    const currentUrl = page.url();
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      stableSince = Date.now();
      continue;
    }
    const ready = await page.evaluate(() => document.readyState).catch(() => 'loading');
    if (ready !== 'loading' && Date.now() - stableSince >= 750) return;
  }
  throw new Error(`Navigation did not settle at ${page.url()}`);
}

async function gotoSettled(page, url) {
  let response = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!String(error?.message || error).includes('interrupted by another navigation')) throw error;
      await waitForNavigationToSettle(page).catch(() => undefined);
    }
  }
  if (lastError) throw lastError;
  await waitForNavigationToSettle(page);
  return response;
}

async function inspectPage(page, expectedLocale, isMobile) {
  return page.evaluate(({ locale, mobile }) => {
    const root = document.documentElement;
    const bodyText = document.body?.innerText || '';
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const brokenImages = [...document.images]
      .filter((img) => visible(img) && img.complete && img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src || img.alt || 'unknown')
      .slice(0, 10);
    const compactTouchTargets = mobile
      ? [...document.querySelectorAll('button,[role="button"],select,a[href]')]
          .filter((element) => {
            if (!visible(element) || element.hasAttribute('disabled') || element.dataset.compact !== undefined) return false;
            const text = (element.textContent || '').trim();
            const label = element.getAttribute('aria-label') || element.getAttribute('title') || '';
            const iconOnly = element.matches('button,[role="button"],select') || (!text && Boolean(label));
            if (!iconOnly) return false;
            const rect = element.getBoundingClientRect();
            return rect.width < 42 || rect.height < 42;
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return `${element.tagName.toLowerCase()}[${element.getAttribute('aria-label') || (element.textContent || '').trim().slice(0, 30) || 'unnamed'}] ${Math.round(rect.width)}x${Math.round(rect.height)}`;
          })
          .slice(0, 20)
      : [];
    const fatalText = ['Application error', 'Internal Server Error', 'This page could not be found']
      .filter((needle) => bodyText.includes(needle));
    const overflowingElements = root.scrollWidth > root.clientWidth + 2
      ? [...document.querySelectorAll('body *')]
          .filter((element) => {
            if (!visible(element)) return false;
            const rect = element.getBoundingClientRect();
            return rect.right > root.clientWidth + 2 || rect.left < -2;
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const identity = element.id ? `#${element.id}` : [...element.classList].slice(0, 3).map((name) => `.${name}`).join('');
            return `${element.tagName.toLowerCase()}${identity} [${Math.round(rect.left)},${Math.round(rect.right)}]`;
          })
          .slice(0, 20)
      : [];
    const expectedDir = locale === 'ar' ? 'rtl' : 'ltr';
    return {
      title: document.title,
      lang: root.lang,
      dir: root.dir || getComputedStyle(root).direction,
      expectedDir,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflow: root.scrollWidth > root.clientWidth + 2,
      overflowingElements,
      brokenImages,
      compactTouchTargets,
      fatalText,
      hasMain: Boolean(document.querySelector('main,[role="main"]')),
      loginRedirect: location.pathname === '/login' && new URLSearchParams(location.search).has('redirect'),
      permissionRedirect: location.pathname === '/login' && new URLSearchParams(location.search).get('error') === 'insufficient_permissions',
    };
  }, { locale: expectedLocale, mobile: isMobile });
}

if (existsSync(ARTIFACT_DIR)) rmSync(ARTIFACT_DIR, { recursive: true, force: true });
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const viewport of viewports) {
    for (const role of Object.keys(routeGroups).filter((candidate) => !ROLE_FILTER || candidate === ROLE_FILTER)) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.hasTouch,
        isMobile: viewport.isMobile,
        colorScheme: 'dark',
        locale: 'de-DE',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      let pageConsoleErrors = [];
      let pageHttpErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') pageConsoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageConsoleErrors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400) pageHttpErrors.push({ status: response.status(), url: response.url() });
      });

      try {
        await authenticate(page, role);
        await setLocale(context, page, 'de');
        const dynamicRoutes = ROUTE_FILTER ? [] : await discoverDynamicRoutes(page, role);
        // An explicit route may be dynamic (for example /orders/:id/track), so
        // test it directly instead of requiring it to exist in the static list.
        const routes = ROUTE_FILTER
          ? [ROUTE_FILTER]
          : [...routeGroups[role], ...dynamicRoutes];

        for (const locale of locales) {
          await setLocale(context, page, locale);
          for (const route of routes) {
            pageConsoleErrors = [];
            pageHttpErrors = [];
            const started = Date.now();
            let record;
            try {
              const response = await gotoSettled(page, `${BASE_URL}${route}`);
              const metrics = await inspectPage(page, locale, viewport.isMobile);
              const localMockWarnings = pageConsoleErrors.filter((value) => {
                if (/WebSocket connection to 'ws:\/\/(localhost|127\.0\.0\.1):54321\/realtime\/v1/.test(value)) return true;
                if (value.includes('Failed to load resource') && value.includes('404')) {
                  return pageHttpErrors.some((item) => item.status === 404 && /^http:\/\/(localhost|127\.0\.0\.1):54321\//.test(item.url));
                }
                return false;
              });
              const unexpectedConsoleErrors = pageConsoleErrors.filter((value) => !localMockWarnings.includes(value));
              const errors = [
                ...(response && response.status() >= 500 ? [`HTTP ${response.status()}`] : []),
                ...(metrics.overflow ? [`horizontal overflow ${metrics.scrollWidth}/${metrics.clientWidth}: ${metrics.overflowingElements.join(', ')}`] : []),
                ...(metrics.dir !== metrics.expectedDir ? [`direction ${metrics.dir}, expected ${metrics.expectedDir}`] : []),
                ...metrics.brokenImages.map((value) => `broken image: ${value}`),
                ...metrics.compactTouchTargets.map((value) => `small touch target: ${value}`),
                ...metrics.fatalText.map((value) => `fatal UI: ${value}`),
                ...(metrics.loginRedirect && role !== 'public' ? ['unexpected login redirect'] : []),
                ...(metrics.permissionRedirect ? ['insufficient-permissions redirect'] : []),
                ...unexpectedConsoleErrors.map((value) => `console: ${value}`),
              ];
              record = { role, viewport: viewport.name, locale, route, url: page.url(), durationMs: Date.now() - started, ...metrics, localMockWarnings, httpErrors: pageHttpErrors, errors };
              const shouldCapture = CAPTURE || errors.length > 0;
              if (shouldCapture) {
                const path = join(SCREENSHOT_DIR, `${viewport.name}-${locale}-${role}-${safeName(route)}.jpg`);
                await page.screenshot({ path, type: 'jpeg', quality: 70, fullPage: true });
                record.screenshot = path.slice(ROOT.length + 1).replaceAll('\\', '/');
              }
            } catch (error) {
              record = { role, viewport: viewport.name, locale, route, url: page.url(), durationMs: Date.now() - started, errors: [`navigation: ${error.message}`] };
            }
            results.push(record);
            const marker = record.errors.length ? 'FAIL' : 'PASS';
            console.log(`${marker} ${viewport.name.padEnd(7)} ${locale} ${role.padEnd(10)} ${route}`);
            if (record.errors.length) console.log(`     ${record.errors.join(' | ')}`);
          }
        }
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => result.errors.length > 0);
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  executablePath,
  captureAllScreenshots: CAPTURE,
  summary: {
    visits: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    routes: new Set(results.map((result) => result.route)).size,
    roles: new Set(results.map((result) => result.role)).size,
    viewports: viewports.map(({ name, width, height }) => ({ name, width, height })),
    locales,
  },
  warnings,
  failures,
  results,
};
writeFileSync(join(ARTIFACT_DIR, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nVisual audit: ${report.summary.passed}/${report.summary.visits} visits passed across ${report.summary.routes} routes.`);
console.log(`Report: ${join(ARTIFACT_DIR, 'latest.json')}`);
if (warnings.length) console.log(`Dynamic-route warnings: ${warnings.length}`);
if (failures.length) process.exitCode = 1;
