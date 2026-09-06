#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const executablePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find(existsSync);

if (!executablePath) throw new Error('Chrome or Edge is required for the maps/notifications contract test.');

const browser = await chromium.launch({ executablePath, headless: true });
let passed = 0;
function ok(condition, label) {
  if (!condition) throw new Error(label);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

try {
  const anonymous = await browser.newContext();
  const anonymousPage = await anonymous.newPage();
  const anonymousPreferences = await anonymousPage.request.get(`${BASE_URL}/api/notifications/preferences`);
  ok(anonymousPreferences.status() === 401, 'Notification preferences reject anonymous access');
  const anonymousLegacyGeocode = await anonymousPage.request.post(`${BASE_URL}/api/geocode`, { data: { address: 'Wesseling' } });
  ok(anonymousLegacyGeocode.status() === 401, 'Legacy geocoding rejects anonymous access');
  const invalidEta = await anonymousPage.request.get(`${BASE_URL}/api/eta?from=95,7&to=50,7`);
  ok(invalidEta.status() === 400, 'ETA rejects out-of-range coordinates');
  const normalizedEta = await anonymousPage.request.get(`${BASE_URL}/api/eta?from=50.82,6.97&to=50.81,7.01&profile=teleport`);
  const normalizedEtaBody = await normalizedEta.json();
  ok(normalizedEta.status() === 200 && normalizedEtaBody?.data?.profile === 'driving', 'ETA normalizes unsupported travel modes');
  await anonymous.close();

  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const loginStatus = await page.evaluate(async () => {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      await fetch('/api/dev/test/reset', { method: 'POST', credentials: 'include' });
    }
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' }),
    });
    return response.status;
  });
  ok(loginStatus === 200, 'Customer demo account signs in');

  const result = await page.evaluate(async () => {
    const request = async (path, init) => {
      const response = await fetch(path, { credentials: 'include', ...init });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    const headers = { 'Content-Type': 'application/json' };
    return {
      initialPreferences: await request('/api/notifications/preferences'),
      validPreferences: await request('/api/notifications/preferences', {
        method: 'POST', headers,
        body: JSON.stringify({ quiet_hours_enabled: true, quiet_hours_start: '22:15', quiet_hours_end: '07:30', promotions: false }),
      }),
      persistedPreferences: await request('/api/notifications/preferences'),
      invalidTime: await request('/api/notifications/preferences', {
        method: 'POST', headers, body: JSON.stringify({ quiet_hours_start: '29:99' }),
      }),
      emptyUpdate: await request('/api/notifications/preferences', {
        method: 'POST', headers, body: JSON.stringify({ unsupported: true }),
      }),
      missingMapQuery: await request('/api/maps/geocode'),
      oversizedMapQuery: await request(`/api/maps/geocode?q=${'x'.repeat(301)}`),
      invalidReverseCoordinates: await request('/api/maps/geocode', {
        method: 'POST', headers, body: JSON.stringify({ action: 'reverse', lat: 95, lng: 181 }),
      }),
      invalidDirectionsCoordinates: await request('/api/maps/geocode', {
        method: 'POST', headers, body: JSON.stringify({ action: 'directions', origin: { lat: 'nope', lng: 7 }, destination: { lat: 50, lng: 7 } }),
      }),
      oversizedAutocomplete: await request('/api/maps/geocode', {
        method: 'POST', headers, body: JSON.stringify({ action: 'autocomplete', input: 'x'.repeat(201) }),
      }),
      malformedLegacyGeocode: await request('/api/geocode', {
        method: 'POST', headers, body: JSON.stringify({ address: 'x' }),
      }),
    };
  });

  ok(result.initialPreferences.status === 200, 'Default notification preferences load');
  ok(result.validPreferences.status === 200, 'Valid quiet hours and channel preferences save');
  ok(result.persistedPreferences.status === 200
    && result.persistedPreferences.body?.data?.preferences?.quiet_hours_start === '22:15'
    && result.persistedPreferences.body?.data?.preferences?.promotions === false,
  'Notification preferences persist and return canonical values');
  ok(result.invalidTime.status === 400, 'Malformed quiet-hours time is rejected');
  ok(result.emptyUpdate.status === 400, 'Empty or unsupported preference update is rejected');
  ok(result.missingMapQuery.status === 400, 'Forward geocoding requires a query');
  ok(result.oversizedMapQuery.status === 400, 'Oversized geocoding query is rejected');
  ok(result.invalidReverseCoordinates.status === 400, 'Out-of-range reverse-geocoding coordinates are rejected');
  ok(result.invalidDirectionsCoordinates.status === 400, 'Malformed directions coordinates are rejected');
  ok(result.oversizedAutocomplete.status === 400, 'Oversized autocomplete input is rejected');
  ok(result.malformedLegacyGeocode.status === 400, 'Legacy geocoding validates the address before provider access');

  console.log(`Maps/notifications contracts: PASS (${passed}/${passed})`);
  await context.close();
} finally {
  await browser.close();
}
