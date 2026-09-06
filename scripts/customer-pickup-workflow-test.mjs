#!/usr/bin/env node

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MOCK = 'http://localhost:54321';
const RID = '00000000-0000-0000-0000-000000000020';
const PRODUCT = 'a1111111-0000-0000-0000-000000000001';
let passed = 0;
const assert = (value, message) => { if (!value) throw new Error(message); passed++; console.log(`  ✓ ${message}`); };

async function login(email, password) {
  const response = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: 'mock-anon-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await response.json(); if (!response.ok) throw new Error(`Login failed: ${email}`); return body.access_token;
}
const customer = await login('demo@blinkgo.de', 'DemoCustomer!2024');
const driver = await login('driver@blinkgo.com', 'BlinkGoDriver2026!');
const headers = { Authorization: `Bearer ${customer}`, Origin: BASE, 'Content-Type': 'application/json' };
const catalog = await fetch(`${BASE}/api/products/bestsellers?restaurant_id=${RID}`, { headers }).then((response) => response.json());
const product = (catalog.bestsellers ?? catalog.products ?? []).find((item) => item.id === PRODUCT);
const selectedModifiers = Object.fromEntries((product?.modifiers ?? [])
  .filter((modifier) => modifier.required && Number(modifier.min_select ?? 0) > 0)
  .map((modifier) => [modifier.id, (modifier.options ?? []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
const configuration = { selected_modifiers: selectedModifiers };

const quoteResponse = await fetch(`${BASE}/api/cart/quote`, { method: 'POST', headers, body: JSON.stringify({ restaurant_id: RID, fulfillment_type: 'pickup', items: [{ product_id: PRODUCT, quantity: 2, configuration }] }) });
const quote = await quoteResponse.json();
assert(quoteResponse.ok && quote.fulfillment_type === 'pickup', 'Pickup quote works without a delivery address');
assert(quote.delivery_fee === 0 && quote.delivery_zone_ok === true, 'Pickup quote has zero delivery fee and bypasses delivery-zone validation');

const draftResponse = await fetch(`${BASE}/api/checkout/draft`, { method: 'POST', headers, body: JSON.stringify({ restaurant_id: RID, fulfillment_type: 'pickup', items: [{ product_id: PRODUCT, quantity: 2, config_key: quote.lines[0].config_key, configuration }], payment_method: 'cash' }) });
const draftBody = await draftResponse.json();
const draft = draftBody?.data?.draft;
assert(draftResponse.ok && draft?.fulfillment_type === 'pickup' && draft.delivery_address === null, 'Signed checkout draft preserves pickup with no address');
assert(draft.delivery_fee === 0 && draft.total > 0, 'Server-authoritative pickup draft removes delivery fee');

const createdResponse = await fetch(`${BASE}/api/orders`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': `pickup-${Date.now()}` }, body: JSON.stringify({ restaurant_id: RID, fulfillment_type: 'pickup', items: [{ product_id: PRODUCT, quantity: 2, configuration }], payment_method: 'cash' }) });
const createdBody = await createdResponse.json();
const orderId = createdBody?.data?.order?.id;
if (!createdResponse.ok) console.error('Pickup order creation failed:', createdResponse.status, JSON.stringify(createdBody));
assert(createdResponse.ok && orderId && createdBody.data.order.fulfillment_type === 'pickup', 'Customer creates a real pickup order without an address');

const rows = await (await fetch(`${MOCK}/rest/v1/orders?id=eq.${orderId}&select=*`, { headers: { apikey: 'mock-service-role-key', Authorization: 'Bearer mock-service-role-key' } })).json();
const order = rows[0];
assert(order.fulfillment_type === 'pickup' && order.delivery_address === null && order.driver_id === null, 'Database keeps pickup addressless and unassigned');
assert(/^\d{6}$/.test(order.pickup_code) && Number(order.delivery_fee) === 0, 'Database issues a six-digit handover code and enforces zero fee');

await fetch(`${MOCK}/rest/v1/orders?id=eq.${orderId}`, { method: 'PATCH', headers: { apikey: 'mock-service-role-key', Authorization: 'Bearer mock-service-role-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }) });
const driverResponse = await fetch(`${BASE}/api/driver/orders?status=available`, { headers: { Authorization: `Bearer ${driver}`, Origin: BASE } });
const driverBody = await driverResponse.json();
if (!driverResponse.ok) console.error('Driver queue request failed:', driverResponse.status, JSON.stringify(driverBody));
const available = driverBody?.data?.orders ?? driverBody?.orders ?? [];
assert(driverResponse.ok && !available.some((candidate) => candidate.id === orderId), 'Pickup order never appears in the driver offer queue');

const invalidDelivery = await fetch(`${BASE}/api/orders`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': `delivery-missing-${Date.now()}` }, body: JSON.stringify({ restaurant_id: RID, fulfillment_type: 'delivery', items: [{ product_id: PRODUCT, quantity: 1 }], payment_method: 'cash' }) });
assert(invalidDelivery.status === 400, 'Delivery mode still requires an address');
console.log(`Customer pickup workflow: PASS (${passed}/${passed}) ORDER_ID=${orderId}`);
