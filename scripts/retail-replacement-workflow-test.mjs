#!/usr/bin/env node

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MOCK = 'http://localhost:54321';
const RID = '00000000-0000-0000-0000-000000000024';
const ORIGINAL = 'a1111111-0000-0000-0000-000000000041';
const REPLACEMENT = 'a1111111-0000-0000-0000-000000000040';
let passed = 0;
const assert = (value, message) => { if (!value) throw new Error(message); passed += 1; console.log(`  ✓ ${message}`); };

async function login(email, password) {
  const response = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: 'mock-anon-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Login failed: ${email}`);
  return payload.access_token;
}

async function api(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { Origin: BASE, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const customer = await login('demo@blinkgo.de', 'DemoCustomer!2024');
const merchant = await login('market@blinkgo.de', 'BlinkGoMarket2026!');
const created = await api('/api/orders', customer, { method: 'POST', headers: { 'Idempotency-Key': `replacement-${Date.now()}` }, body: JSON.stringify({ restaurant_id: RID, items: [{ product_id: ORIGINAL, quantity: 2, configuration: { substitution_preference: 'best_match' } }], payment_method: 'cash', delivery_address: { address: 'Kölner Straße 10, 50389 Wesseling', lat: 50.8207, lng: 6.9786 }, tip: 0 }) });
if (created.status !== 200) console.error('Order creation response:', JSON.stringify(created));
assert(created.status === 200 && created.body?.data?.order?.id, 'Customer creates a retail order with a substitution preference');
const orderId = created.body.data.order.id;
console.log(`  ↳ Live fixture order: ${orderId}`);

const orderItemsResponse = await fetch(`${MOCK}/rest/v1/order_items?order_id=eq.${orderId}&select=*`, { headers: { apikey: 'mock-service-role-key', Authorization: 'Bearer mock-service-role-key' } });
const orderItems = await orderItemsResponse.json();
assert(orderItems.length === 1 && orderItems[0].configuration?.substitution_preference === 'best_match', 'Immutable order item retains the customer preference');
const itemId = orderItems[0].id;

const proposal = await api(`/api/restaurant/orders/${orderId}/replacements`, merchant, { method: 'POST', body: JSON.stringify({ order_item_id: itemId, replacement_product_id: REPLACEMENT, replacement_quantity: 1, reason: 'Dragon Roll ist heute ausverkauft.' }) });
if (proposal.status !== 200) console.error('Proposal response:', JSON.stringify(proposal));
assert(proposal.status === 200 && proposal.body?.data?.replacement?.status === 'proposed', 'Merchant proposes an equal-or-cheaper available product');
const replacementId = proposal.body.data.replacement.id;
assert(Number(proposal.body.data.replacement.replacement_line_total) <= Number(proposal.body.data.replacement.original_line_total), 'Server never proposes a more expensive replacement');

const visible = await api(`/api/orders/${orderId}/replacements`, customer);
assert(visible.status === 200 && visible.body?.data?.replacements?.some((row) => row.id === replacementId), 'Only the owning customer can load the proposal');
if (process.env.KEEP_REPLACEMENT_OPEN === 'true') {
  console.log(`OPEN_REPLACEMENT_ORDER=${orderId}`);
  process.exit(0);
}

const accepted = await api(`/api/orders/${orderId}/replacements`, customer, { method: 'PATCH', body: JSON.stringify({ replacement_id: replacementId, action: 'accept' }) });
assert(accepted.status === 200 && accepted.body?.data?.replacement?.status === 'applied', 'Customer accepts the proposal exactly once');
const replay = await api(`/api/orders/${orderId}/replacements`, customer, { method: 'PATCH', body: JSON.stringify({ replacement_id: replacementId, action: 'accept' }) });
assert(replay.status === 409, 'A repeated decision is rejected without double adjustment');

const updatedItems = await (await fetch(`${MOCK}/rest/v1/order_items?order_id=eq.${orderId}&select=*`, { headers: { apikey: 'mock-service-role-key', Authorization: 'Bearer mock-service-role-key' } })).json();
assert(updatedItems[0].product_id === REPLACEMENT && updatedItems[0].configuration?.fulfillment_status === 'substituted', 'Accepted replacement atomically updates fulfillment data');
const adjustments = await (await fetch(`${MOCK}/rest/v1/order_financial_adjustments?order_id=eq.${orderId}&select=*`, { headers: { apikey: 'mock-service-role-key', Authorization: 'Bearer mock-service-role-key' } })).json();
assert(adjustments.length === 1 && adjustments[0].amount_cents === 3390, 'Price difference creates one auditable €33.90 customer credit');

console.log(`Retail replacement workflow: PASS (${passed}/${passed})`);
