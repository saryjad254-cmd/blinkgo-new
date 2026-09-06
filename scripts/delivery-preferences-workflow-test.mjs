#!/usr/bin/env node

import fs from 'node:fs';

const BASE = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const MOCK = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const RESTAURANT_ID = '00000000-0000-0000-0000-000000000020';
const PRODUCT_ID = 'a1111111-0000-0000-0000-000000000001';
let passed = 0;

await fetch(`${BASE}/api/dev/test/reset`, { method: 'POST' });

function check(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function session(email, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const body = await response.clone().json().catch(() => ({}));
  check(response.ok && cookie, `${email} signs in`, response.ok ? '' : `${response.status} ${JSON.stringify(body)}`);
  return async (path, init = {}) => {
    const result = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    return { status: result.status, ok: result.ok, body: await result.json().catch(() => ({})) };
  };
}

const customer = await session('demo@blinkgo.de', 'DemoCustomer!2024');
const configuration = { selected_modifiers: { size: ['s'], crust: ['classic'] } };
const cartValidation = await fetch(`${BASE}/api/cart/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ restaurant_id: RESTAURANT_ID, items: [{ product_id: PRODUCT_ID, quantity: 2, ...configuration }] }),
}).then((response) => response.json());
check(cartValidation.ok && cartValidation.lines?.[0]?.config_key, 'Server derives the canonical cart configuration');
const items = [{
  product_id: PRODUCT_ID,
  quantity: 2,
  config_key: cartValidation.lines[0].config_key,
  configuration,
}];
const deliveryAddress = {
  address: 'Flach-Fengler-Straße 120, 50389 Wesseling',
  lat: 50.8275,
  lng: 6.9742,
  delivery_preferences: {
    handoff: 'leave_at_door',
    recipient_name: '<b>Max Mustermann</b>',
    bell_name: 'Muster<script>alert(1)</script>mann',
    floor: '3. OG',
    instructions: 'Bitte links abstellen <img src=x onerror=alert(1)> javascript:alert(2)',
  },
};

const draft = await customer('/api/checkout/draft', {
  method: 'POST',
  body: JSON.stringify({ restaurant_id: RESTAURANT_ID, fulfillment_type: 'delivery', payment_method: 'cash', items, delivery_address: deliveryAddress }),
});
if (!draft.ok) console.error('DRAFT_DEBUG', JSON.stringify(draft));
const sanitized = draft.body?.data?.draft?.delivery_address?.delivery_preferences;
check(draft.ok && sanitized?.handoff === 'leave_at_door', 'Signed checkout draft preserves structured handoff choice');
check(sanitized?.recipient_name === 'Max Mustermann' && !JSON.stringify(sanitized).match(/<|javascript:|onerror/i), 'Draft strips executable HTML from courier notes');

const placed = await customer('/api/orders', {
  method: 'POST',
  headers: { 'Idempotency-Key': `delivery-preferences-${Date.now()}` },
  body: JSON.stringify({ restaurant_id: RESTAURANT_ID, fulfillment_type: 'delivery', payment_method: 'cash', items, delivery_address: draft.body.data.draft.delivery_address }),
});
if (!placed.ok) console.error('ORDER_DEBUG', JSON.stringify(placed));
const orderId = placed.body?.data?.order?.id;
check(placed.ok && orderId, 'Customer places an order carrying private courier preferences');

const publicOrder = await fetch(`${MOCK}/rest/v1/orders?id=eq.${orderId}&select=id,delivery_address`, { headers: { Accept: 'application/vnd.pgrst.object+json' } }).then((r) => r.json());
check(!publicOrder.delivery_address?.delivery_preferences, 'General order address does not retain private courier preferences');
const privateRow = await fetch(`${MOCK}/rest/v1/order_delivery_preferences?order_id=eq.${orderId}&select=*`, { headers: { Accept: 'application/vnd.pgrst.object+json' } }).then((r) => r.json());
check(privateRow.preferences?.bell_name === 'Mustermann' && privateRow.preferences?.floor === '3. OG', 'Private store keeps only sanitized structured data');

const migration = fs.readFileSync(new URL('../supabase/migrations/20260814011358_private_delivery_preferences.sql', import.meta.url), 'utf8');
check(/revoke all on public\.order_delivery_preferences from public, anon, authenticated/i.test(migration), 'Migration revokes browser roles from private courier data');
check(/after insert on public\.orders/i.test(migration) && /delivery_address - 'delivery_preferences'/i.test(migration), 'Database trigger atomically captures and strips private data');

const admin = await session('admin@blinkgo.com', 'BlinkGoAdmin2026!');
const confirmed = await admin('/api/orders/status', { method: 'PATCH', body: JSON.stringify({ order_id: orderId, status: 'confirmed' }) });
check(confirmed.ok, 'Admin confirms the test order for dispatch');

const driver = await session('driver@blinkgo.com', 'BlinkGoDriver2026!');
const online = await driver('/api/driver/online', { method: 'POST', body: JSON.stringify({ is_online: true }) });
check(online.ok, 'Verified driver goes online');
await driver('/api/driver/location', { method: 'POST', body: JSON.stringify({ latitude: 50.823, longitude: 6.984, accuracy: 8 }) });
const accepted = await driver(`/api/driver/orders/${orderId}/accept`, { method: 'POST' });
if (!accepted.ok) console.error('ACCEPT_DEBUG', JSON.stringify(accepted));
check(accepted.ok && accepted.body?.data?.order?.delivery_preferences?.recipient_name === 'Max Mustermann', 'Assigned driver receives the private handoff data after acceptance');

const availableSource = [
  'app/driver/orders/available/page.tsx',
  'app/api/driver/orders/route.ts',
].map((file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
check(!availableSource.includes('order_delivery_preferences'), 'Pre-accept offer queries never join private delivery preferences');

console.log(`Delivery preferences workflow: PASS (${passed}/${passed}) ORDER_ID=${orderId}`);
