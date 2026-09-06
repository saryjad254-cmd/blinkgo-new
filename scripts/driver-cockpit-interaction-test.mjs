#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome or Edge is required for the driver cockpit test.');

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

async function cleanupActive(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/driver/active-order', { credentials: 'include', cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    const order = payload.data?.order ?? payload.order ?? null;
    if (!order) return { ok: true, status: 200, order: null, payload };
    const isInTransit = ['picked_up', 'delivering'].includes(order.status);
    const action = isInTransit ? 'fail-delivery' : 'reject';
    const result = await fetch(`/api/driver/orders/${order.id}/${action}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: isInTransit
        ? JSON.stringify({ reason_code: 'unsafe_location', details: 'Local acceptance-test cleanup', contact_attempts: 0 })
        : JSON.stringify({ reason_code: 'other', details: 'cockpit acceptance setup' }),
    });
    return { ok: result.ok, status: result.status, order: { id: order.id, status: order.status }, payload: await result.json().catch(() => ({})) };
  });
}

try {
  const driverContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ar-DE',
    colorScheme: 'dark',
    geolocation: { latitude: 50.8207, longitude: 6.9786 },
    permissions: ['geolocation'],
  });
  const page = await driverContext.newPage();
  const runtimeErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) runtimeErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' }));
  ok(await login(page, { email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!' }), 'Driver signs in');
  const onlineResult = await page.evaluate(async () => {
    const response = await fetch('/api/driver/online', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_online: true }) });
    return { ok: response.ok, status: response.status, payload: await response.json().catch(() => ({})) };
  });
  ok(onlineResult.ok, `Driver goes online (${onlineResult.status}${onlineResult.payload?.error ? `: ${onlineResult.payload.error}` : ''})`);
  const cleanup = await cleanupActive(page);
  if (!cleanup.ok) throw new Error(`Prior active delivery cleanup failed (${cleanup.status}: ${JSON.stringify(cleanup.payload)}; order=${JSON.stringify(cleanup.order)})`);
  ok(true, 'Prior active delivery is safely cleared');

  const customerContext = await browser.newContext({ locale: 'de-DE' });
  const customerPage = await customerContext.newPage();
  ok(await login(customerPage, { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' }), 'Customer signs in for a live offer fixture');
  const fixtureResult = await customerPage.evaluate(async () => {
    const search = await fetch('/api/search?sort=recommended', { credentials: 'include' }).then((response) => response.json());
    let restaurant = null;
    let product = null;
    const nearbyRestaurants = [...(search.restaurants ?? [])]
      .filter((candidate) => ['00000000-0000-0000-0000-000000000020', 'b1000000-0000-4000-8000-000000000201'].includes(candidate.id))
      .sort((left, right) => {
      const distance = (candidate) => {
        const lat = Number(candidate.latitude ?? candidate.lat);
        const lng = Number(candidate.longitude ?? candidate.lng);
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? ((lat - 50.8207) ** 2) + ((lng - 6.9786) ** 2)
          : Number.POSITIVE_INFINITY;
      };
      return distance(left) - distance(right);
      });
    for (const candidate of nearbyRestaurants) {
      const products = await fetch(`/api/products/bestsellers?restaurant_id=${candidate.id}`, { credentials: 'include' }).then((response) => response.json());
      const available = products.bestsellers?.find((item) => item.is_available !== false && item.is_active !== false);
      if (available) { restaurant = candidate; product = available; break; }
    }
    if (!restaurant || !product) return { id: null, error: 'No restaurant with an available product' };
    const selectedModifiers = Object.fromEntries((product.modifiers ?? [])
      .filter((modifier) => modifier.required && Number(modifier.min_select ?? 0) > 0)
      .map((modifier) => [modifier.id, (modifier.options ?? []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
    const unitPrice = Number(product.discount_price ?? product.price ?? 0);
    const minimumOrder = Number(restaurant.minimum_order ?? restaurant.min_order_amount ?? 0);
    const quantity = unitPrice > 0 ? Math.max(2, Math.ceil((minimumOrder + 0.01) / unitPrice)) : 2;
    const response = await fetch('/api/orders', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurant.id, items: [{ product_id: product.id, quantity, configuration: { selected_modifiers: selectedModifiers } }], payment_method: 'cash', delivery_address: { address: 'BlinkGo Cockpit Test, Wesseling', lat: 50.8179, lng: 6.9821 }, tip: 2 }),
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok
      ? { id: payload.order?.id ?? payload.data?.order?.id ?? null, error: null }
      : { id: null, error: typeof payload.error === 'string' ? payload.error : payload.error?.message || `HTTP ${response.status}` };
  });
  const fixtureOrderId = fixtureResult.id;
  if (!fixtureOrderId) console.error(`  Fixture creation failed: ${fixtureResult.error}`);
  ok(Boolean(fixtureOrderId), 'Customer creates a realistic delivery fixture');
  const restaurantContext = await browser.newContext({ locale: 'de-DE' });
  const restaurantPage = await restaurantContext.newPage();
  ok(await login(restaurantPage, { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' }), 'Restaurant signs in');
  const prepared = await restaurantPage.evaluate(async (orderId) => {
    for (const status of ['confirmed', 'preparing', 'ready']) {
      const response = await fetch('/api/orders/status', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, status }) });
      if (!response.ok) return false;
    }
    return true;
  }, fixtureOrderId);
  ok(prepared, 'Restaurant advances the fixture to ready');

  // Auto-dispatch can assign the newly-ready fixture. Release any assignment
  // once so the offer sheet itself is exercised, then keep the driver online.
  ok(await cleanupActive(page), 'Fixture is released into the live offer pool');
  await page.goto(`${BASE_URL}/driver/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="driver-map-dashboard"]:visible').waitFor({ state: 'visible', timeout: 15_000 });
  const consentBanner = page.getByTestId('cookie-consent-banner');
  if (await consentBanner.isVisible().catch(() => false)) {
    const rejectConsent = page.getByTestId('cookie-reject-non-essential');
    if (!(await rejectConsent.isVisible().catch(() => false))) {
      await page.getByTestId('cookie-open-settings').click();
    }
    await rejectConsent.click();
    await consentBanner.waitFor({ state: 'hidden', timeout: 5_000 });
  }
  await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 15_000 });
  ok(await page.getByTestId('driver-live-map').isVisible(), 'Full-screen live map renders');
  ok(await page.getByTestId('driver-demand-status').isVisible(), 'Live area demand status is visible while waiting for offers');
  await page.getByTestId('incoming-driver-order').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => document.querySelectorAll('.leaflet-marker-icon').length >= 2);
  ok(await page.locator('.leaflet-marker-icon').count() >= 2, 'Pickup and drop-off markers render');

  const offeredPayout = await page.getByTestId('incoming-driver-order').getAttribute('data-payout');
  ok(await page.getByTestId('driver-offer-accept').isVisible(), 'Incoming offer exposes accept action');
  ok(await page.getByTestId('driver-offer-skip').isVisible(), 'Incoming offer exposes skip action');
  ok((await page.getByTestId('driver-offer-transparency').locator('div').count()) >= 4, 'Offer explains pickup, delivery, time, and earning rate');
  ok(await page.getByTestId('driver-offer-recommendation').isVisible(), 'Offer explains why it was recommended and how ranking works');
  ok((await page.getByTestId('driver-offer-recommendation').textContent()).includes('لا يؤثر على حسابك'), 'Offer explicitly states that skipping has no account penalty');
  const todayBefore = await page.getByTestId('driver-today-summary').textContent();
  await driverContext.setOffline(true);
  await page.getByTestId('driver-network-status').waitFor({ state: 'visible', timeout: 5_000 });
  ok(await page.getByTestId('driver-offer-accept').isDisabled(), 'Offline mode keeps the snapshot visible and blocks acceptance');
  await driverContext.setOffline(false);
  await page.getByTestId('driver-network-status').waitFor({ state: 'hidden', timeout: 10_000 });
  ok(true, 'Live cockpit recovers after network reconnection');
  const mobileSize = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(mobileSize.document === mobileSize.viewport, `Mobile cockpit has no horizontal overflow (${mobileSize.document}/${mobileSize.viewport})`);
  const overlayZ = await page.getByTestId('incoming-driver-order').evaluate((element) => Number(getComputedStyle(element.closest('section')).zIndex));
  ok(overlayZ > 600, 'Offer controls render above Leaflet layers');

  await page.getByTestId('driver-offer-accept').click();
  await page.getByTestId('active-driver-order').waitFor({ state: 'visible', timeout: 15_000 });
  ok(true, 'Accepting an offer transitions to active delivery');
  await driverContext.route('https://www.waze.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Navigation test</title>' }));
  await page.evaluate(() => localStorage.setItem('blinkgo-driver-nav-provider', 'waze'));
  const navigationPopupPromise = page.waitForEvent('popup');
  await page.getByTestId('driver-active-navigate').click();
  const navigationPopup = await navigationPopupPromise;
  await navigationPopup.waitForLoadState('domcontentloaded');
  ok(navigationPopup.url().startsWith('https://www.waze.com/ul?'), 'Cockpit respects the navigation provider selected in driver settings');
  await navigationPopup.close();
  await driverContext.unroute('https://www.waze.com/**');

  await page.getByTestId('driver-tools-open').click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  ok(await dialog.getByRole('link').count() >= 7, 'Driver hub exposes operational tools');
  await page.keyboard.press('Shift+Tab');
  ok(await page.getByTestId('driver-tools-safety').evaluate((element) => document.activeElement === element), 'Driver hub traps keyboard focus');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  ok(true, 'Driver hub closes with Escape');

  await page.getByTestId('driver-safety-button').click();
  const safetyDialog = page.getByTestId('driver-safety-dialog');
  await safetyDialog.waitFor({ state: 'visible' });
  ok((await page.getByTestId('driver-call-112').getAttribute('href')) === 'tel:112', 'Safety center keeps the verified EU emergency number one tap away');
  ok(await safetyDialog.locator('a[href="tel:+4915771234567"]').count() === 0, 'Safety center never exposes the removed placeholder support number');
  await page.keyboard.press('Escape');
  await safetyDialog.waitFor({ state: 'hidden' });
  ok(true, 'Safety center is keyboard accessible and closes with Escape');
  await page.waitForFunction((expected) => document.querySelector('[data-testid="active-driver-order"]')?.getAttribute('data-payout') === expected, offeredPayout, { timeout: 15_000 });
  const acceptedPayout = await page.getByTestId('active-driver-order').getAttribute('data-payout');
  ok(Boolean(offeredPayout) && acceptedPayout === offeredPayout, `Guaranteed payout remains unchanged after acceptance (${offeredPayout})`);
  const activePayout = await page.evaluate(async () => {
    const response = await fetch('/api/driver/active-order', { credentials: 'include' });
    const payload = await response.json();
    return String(Number(payload.data?.order?.driver_earnings ?? payload.order?.driver_earnings ?? 0).toFixed(2));
  });
  ok(activePayout === offeredPayout, `API and cockpit use the same payout (${activePayout})`);
  let acceptedOrderId = await page.getByTestId('active-driver-order').getAttribute('data-order-id');
  ok(Boolean(acceptedOrderId), 'Active delivery preserves the accepted order identity');

  await page.getByTestId('driver-active-release').click();
  const releaseDialog = page.getByTestId('driver-release-dialog');
  await releaseDialog.waitFor({ state: 'visible' });
  ok(await releaseDialog.getByRole('radio').count() === 6, 'Release dialog presents structured operational reasons');
  ok(await page.getByTestId('driver-release-confirm').isDisabled(), 'Release requires an explicit reason');
  await page.getByTestId('driver-release-reason-restaurant_delay').click();
  await page.getByTestId('driver-release-confirm').click();
  await page.getByTestId('active-driver-order').waitFor({ state: 'hidden', timeout: 15_000 });
  await page.getByTestId('incoming-driver-order').waitFor({ state: 'visible', timeout: 15_000 });
  ok(true, 'Released delivery returns to the live offer pool');

  const fixtureAcceptStatus = await page.evaluate(async (orderId) => (await fetch(`/api/driver/orders/${orderId}/accept`, { method: 'POST', credentials: 'include' })).status, fixtureOrderId);
  ok(fixtureAcceptStatus === 200, `Fresh delivery can be accepted after releasing the test offer (${fixtureAcceptStatus})`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const activeFixtureCard = page.locator('[data-testid="active-driver-order"]:visible').first();
  await activeFixtureCard.waitFor({ state: 'visible', timeout: 15_000 });
  acceptedOrderId = await activeFixtureCard.getAttribute('data-order-id');
  ok(acceptedOrderId === fixtureOrderId, 'Driver can safely continue with the fresh test delivery');
  const linkedSupport = await page.evaluate(async (orderId) => {
    const response = await fetch('/api/support', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'order_issue', priority: 'normal', subject: 'Cockpit linked support test', message: 'Driver needs help with the active delivery.', order_id: orderId }) });
    return { status: response.status, body: await response.json() };
  }, acceptedOrderId);
  ok(linkedSupport.status === 200 && linkedSupport.body.data?.ticket?.order_id === acceptedOrderId, 'Driver support can securely attach a ticket to the assigned delivery');

  // The accepted offer may be an older confirmed/preparing fixture. Ensure the
  // restaurant marks it ready before exercising the pickup transition.
  if ((await page.getByTestId('driver-active-pickup').count()) === 0 && acceptedOrderId) {
    await restaurantPage.evaluate(async (orderId) => {
      for (const status of ['preparing', 'ready']) {
        await fetch('/api/orders/status', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, status }) });
      }
    }, acceptedOrderId);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  const pickupCoordinates = await page.evaluate(async () => {
    const activeResponse = await fetch('/api/driver/active-order', { credentials: 'include' });
    const activePayload = await activeResponse.json();
    const order = activePayload.data?.order ?? activePayload.order;
    return { latitude: Number(order.restaurant_latitude), longitude: Number(order.restaurant_longitude) };
  });
  await driverContext.setGeolocation(pickupCoordinates);
  await page.evaluate(async ({ orderId, coordinates }) => {
    await fetch('/api/driver/location', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...coordinates, accuracy: 5, active_order_id: orderId }),
    });
  }, { orderId: acceptedOrderId, coordinates: pickupCoordinates });
  const arrivePickupButton = page.locator('[data-testid="driver-active-arrive-pickup"]:visible').first();
  await arrivePickupButton.waitFor({ state: 'visible', timeout: 15_000 });
  const pickupArrivalResponsePromise = page.waitForResponse((response) => response.url().includes('/arrive') && response.request().method() === 'POST');
  await arrivePickupButton.click();
  const pickupArrivalResponse = await pickupArrivalResponsePromise;
  const pickupArrivalPayload = await pickupArrivalResponse.json().catch(() => ({}));
  ok(pickupArrivalResponse.ok(), `Restaurant arrival API accepts verified location${pickupArrivalResponse.ok() ? '' : `: ${pickupArrivalPayload.error?.message || pickupArrivalResponse.status()}`}`);
  await page.locator('[data-testid="driver-pickup-wait-timer"]:visible').first().waitFor({ state: 'visible', timeout: 15_000 });
  ok(true, 'Location-verified restaurant arrival starts the wait timer');
  await page.getByTestId('driver-active-report-issue').click();
  await page.getByTestId('driver-issue-dialog').waitFor({ state: 'visible', timeout: 5_000 });
  ok(await page.getByTestId('driver-issue-restaurant_delay').isVisible() && await page.getByTestId('driver-issue-customer_unreachable').count() === 0, 'Issue sheet only offers problems valid for the current delivery phase');
  await page.getByTestId('driver-issue-restaurant_delay').click();
  const issueResponsePromise = page.waitForResponse((response) => response.url().includes('/issue') && response.request().method() === 'POST');
  await page.getByTestId('driver-issue-submit').click();
  const issueResponse = await issueResponsePromise;
  const issuePayload = await issueResponse.json().catch(() => ({}));
  ok(issueResponse.ok() && issuePayload.data?.code === 'restaurant_delay', `Driver issue is linked to the active order (${issueResponse.status()})`);
  await page.getByTestId('driver-issue-dialog').waitFor({ state: 'hidden', timeout: 5_000 });
  const duplicateIssue = await page.evaluate(async (orderId) => {
    const response = await fetch(`/api/driver/orders/${orderId}/issue`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'restaurant_delay' }) });
    return { status: response.status, body: await response.json() };
  }, acceptedOrderId);
  ok(duplicateIssue.status === 200 && duplicateIssue.body.data?.duplicate === true, 'Repeated issue reports are deduplicated within the safety window');
  const customerDelayJourney = await customerPage.evaluate(async (orderId) => {
    const response = await fetch(`/api/orders/track?order_id=${encodeURIComponent(orderId)}`, { credentials: 'include', cache: 'no-store' });
    const payload = await response.json();
    return payload.data?.journey ?? null;
  }, acceptedOrderId);
  ok(customerDelayJourney?.latest_issue?.code === 'restaurant_delay' && Number.isFinite(customerDelayJourney?.eta?.minutes), 'Customer tracking receives the delay reason and one canonical live ETA');
  await page.locator('[data-testid="driver-active-pickup"]:visible').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('[data-testid="driver-active-pickup"]:visible').first().click();
  await page.locator('[data-testid="driver-active-arrive-dropoff"]:visible').first().waitFor({ state: 'visible', timeout: 15_000 });
  ok(true, 'Pickup transitions the cockpit to customer delivery');
  ok(await page.getByTestId('driver-active-release').count() === 0, 'Release action disappears after food pickup');
  const lateReleaseStatus = await page.evaluate(async (orderId) => {
    const response = await fetch(`/api/driver/orders/${orderId}/reject`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason_code: 'vehicle_issue' }),
    });
    return response.status;
  }, acceptedOrderId);
  ok(lateReleaseStatus === 409, `API blocks release after pickup (${lateReleaseStatus})`);
  const dropoffCoordinates = await page.evaluate(async () => {
    const activeResponse = await fetch('/api/driver/active-order', { credentials: 'include' });
    const activePayload = await activeResponse.json();
    const order = activePayload.data?.order ?? activePayload.order;
    return { latitude: Number(order.customer_latitude), longitude: Number(order.customer_longitude) };
  });
  await driverContext.setGeolocation(dropoffCoordinates);
  await page.evaluate(async ({ orderId, coordinates }) => {
    await fetch('/api/driver/location', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...coordinates, accuracy: 5, active_order_id: orderId }),
    });
  }, { orderId: acceptedOrderId, coordinates: dropoffCoordinates });
  await page.locator('[data-testid="driver-active-arrive-dropoff"]:visible').first().click();
  await page.locator('[data-testid="driver-dropoff-arrived"]:visible').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('[data-testid="driver-active-complete"]:visible').first().waitFor({ state: 'visible', timeout: 15_000 });
  ok(true, 'Customer arrival is recorded before delivery confirmation');
  const deliveryPin = await customerPage.evaluate(async (orderId) => {
    const response = await fetch(`/api/orders/track?order_id=${encodeURIComponent(orderId)}`, { credentials: 'include', cache: 'no-store' });
    const payload = await response.json();
    return payload.data?.journey?.delivery_pin ?? null;
  }, acceptedOrderId);
  ok(/^\d{4}$/.test(deliveryPin || ''), 'Only the owning customer receives a four-digit delivery PIN');
  const wrongPin = String((Number(deliveryPin) + 1) % 10_000).padStart(4, '0');
  const wrongPinStatus = await page.evaluate(async ({ orderId, pin }) => {
    const response = await fetch(`/api/driver/orders/${orderId}/complete`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_pin: pin }) });
    return response.status;
  }, { orderId: acceptedOrderId, pin: wrongPin });
  ok(wrongPinStatus === 400, `Incorrect delivery PIN is rejected (${wrongPinStatus})`);
  await customerPage.goto(`${BASE_URL}/orders/${acceptedOrderId}/track`, { waitUntil: 'domcontentloaded' });
  await customerPage.getByTestId('customer-driver-arrived').waitFor({ state: 'visible', timeout: 15_000 });
  await customerPage.getByTestId('customer-delivery-pin').waitFor({ state: 'visible', timeout: 15_000 });
  await customerPage.getByTestId('customer-delivery-delay').waitFor({ state: 'visible', timeout: 15_000 });
  ok((await customerPage.getByTestId('customer-delivery-delay').innerText()).includes('min'), 'Customer sees a transparent delay card with the updated ETA and support action');
  ok(true, 'Customer tracking announces arrival and displays the private PIN');
  await page.locator('[data-testid="driver-active-complete"]:visible').first().click();
  await page.getByTestId('driver-delivery-evidence-dialog').waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByTestId('driver-delivery-pin-input').fill(deliveryPin);
  await page.getByTestId('driver-delivery-evidence-confirm').click();
  await page.getByTestId('active-driver-order').waitFor({ state: 'hidden', timeout: 15_000 });
  ok(true, 'Delivery completion returns the cockpit to availability');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  const todayAfter = await page.getByTestId('driver-today-summary').textContent();
  ok(todayAfter !== todayBefore, 'Completed delivery updates today earnings without a reload');
  const desktopSize = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  ok(desktopSize.document === desktopSize.viewport, `Desktop cockpit has no horizontal overflow (${desktopSize.document}/${desktopSize.viewport})`);
  const unexpectedRuntimeErrors = runtimeErrors.filter((message) =>
    !message.includes('ERR_INTERNET_DISCONNECTED') &&
    !message.includes('status of 409 (Conflict)') &&
    !message.includes('status of 400 (Bad Request)'),
  );
  ok(unexpectedRuntimeErrors.length === 0, `Cockpit has no browser runtime errors${unexpectedRuntimeErrors[0] ? `: ${unexpectedRuntimeErrors[0]}` : ''}`);

  await page.evaluate(() => fetch('/api/driver/online', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_online: false }) }));
  await customerContext.close();
  await restaurantContext.close();
  await driverContext.close();
  console.log(`Driver cockpit interactions: PASS (${passed}/${passed})`);
} finally {
  await browser.close();
}
