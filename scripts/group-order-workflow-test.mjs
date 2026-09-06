#!/usr/bin/env node

const BASE = process.env.BASE_URL || process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const RESTAURANT_ID = '00000000-0000-0000-0000-000000000020';
const PRODUCT_A = 'a1111111-0000-0000-0000-000000000001';
const PRODUCT_B = 'a1111111-0000-0000-0000-000000000002';
let passed = 0;
const check = (condition, label) => { if (!condition) throw new Error(label); passed += 1; console.log(`  ✓ ${label}`); };

async function session(email) {
  let cookie = '';
  const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'DemoCustomer!2024' }) });
  cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  check(response.ok && cookie, `${email} signs in`);
  return async (path, init = {}) => {
    const result = await fetch(`${BASE}${path}`, { ...init, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    return { status: result.status, ok: result.ok, body: await result.json().catch(() => ({})) };
  };
}

const host = await session('demo@blinkgo.de');
const guest = await session('demo2@blinkgo.de');
const created = await host('/api/group-orders', { method: 'POST', body: JSON.stringify({ restaurant_id: RESTAURANT_ID }) });
const groupId = created.body?.data?.group?.id;
const token = created.body?.data?.invite_token;
check(created.status === 201 && groupId && token?.length >= 20, 'Host creates an expiring group with a secret invite');

const joined = await guest('/api/group-orders/join', { method: 'POST', body: JSON.stringify({ token, display_name: 'Guest Two' }) });
check(joined.ok && joined.body?.data?.group_id === groupId, 'Second customer joins through the invite');

const invalidConfiguration = await host(`/api/group-orders/${groupId}/items`, {
  method: 'POST',
  body: JSON.stringify({ product_id: PRODUCT_A, quantity: 1, configuration: {} }),
});
check(invalidConfiguration.status === 400, 'Server rejects a product that is missing required choices');

const [hostAdd, guestAdd] = await Promise.all([
  host(`/api/group-orders/${groupId}/items`, { method: 'POST', body: JSON.stringify({ product_id: PRODUCT_A, quantity: 2, configuration: { selected_modifiers: { size: ['s'], crust: ['classic'] } } }) }),
  guest(`/api/group-orders/${groupId}/items`, { method: 'POST', body: JSON.stringify({ product_id: PRODUCT_B, quantity: 1, configuration: { selected_modifiers: { portion: ['regular'] } } }) }),
]);
check(hostAdd.ok && guestAdd.ok, 'Concurrent participants add independent lines');

const state = await host(`/api/group-orders/${groupId}`);
const own = state.body?.data?.items?.find((item) => item.product_id === PRODUCT_A);
const other = state.body?.data?.items?.find((item) => item.product_id === PRODUCT_B);
check(state.body?.data?.participants?.length === 2 && own && other, 'Host sees both participants and authoritative lines');

const theft = await guest(`/api/group-orders/${groupId}/items`, { method: 'PATCH', body: JSON.stringify({ item_id: own.id, quantity: 9 }) });
check(theft.status === 404, 'Participant cannot modify another participant line');

const guestLock = await guest(`/api/group-orders/${groupId}/lock`, { method: 'POST' });
check(guestLock.status === 404, 'Only the host can lock the group');
const locked = await host(`/api/group-orders/${groupId}/lock`, { method: 'POST' });
check(locked.ok && locked.body?.data?.group?.status === 'locked', 'Host atomically locks the group');
const lateAdd = await guest(`/api/group-orders/${groupId}/items`, { method: 'POST', body: JSON.stringify({ product_id: PRODUCT_A, quantity: 1, configuration: { selected_modifiers: { size: ['s'], crust: ['classic'] } } }) });
check(lateAdd.status === 409, 'Locked group rejects late additions');

const tamperedDraft = await host('/api/checkout/draft', { method: 'POST', body: JSON.stringify({
  restaurant_id: RESTAURANT_ID, fulfillment_type: 'pickup', payment_method: 'cash', group_order_id: groupId,
  items: [{ product_id: PRODUCT_A, quantity: 2, config_key: own.config_key, configuration: { selected_modifiers: { size: ['s'], crust: ['classic'] } } }],
}) });
check(tamperedDraft.status === 400, 'Checkout rejects a cart that no longer matches the locked group');

const completeItems = [
  { product_id: PRODUCT_A, quantity: 2, config_key: own.config_key, configuration: own.configuration },
  { product_id: PRODUCT_B, quantity: 1, config_key: other.config_key, configuration: other.configuration },
];
const validationProbeResponse = await fetch(`${BASE}/api/cart/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurant_id: RESTAURANT_ID, items: completeItems.map((item) => ({ product_id: item.product_id, quantity: item.quantity, ...item.configuration })) }) });
const validationProbe = await validationProbeResponse.json();
if (validationProbe.lines?.some((line) => ![own.config_key, other.config_key].includes(line.config_key))) console.error('GROUP_KEY_DEBUG', JSON.stringify({ stored: [own.config_key, other.config_key], recalculated: validationProbe.lines?.map((line) => line.config_key) }));
const draft = await host('/api/checkout/draft', { method: 'POST', body: JSON.stringify({ restaurant_id: RESTAURANT_ID, fulfillment_type: 'pickup', payment_method: 'cash', group_order_id: groupId, items: completeItems }) });
if (!draft.ok || draft.body?.data?.draft?.group_order_id !== groupId) console.error('GROUP_DRAFT_DEBUG', JSON.stringify(draft));
check(draft.ok && draft.body?.data?.draft?.group_order_id === groupId, 'Signed checkout draft preserves verified group provenance');

const placed = await host('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': `group-${groupId}` }, body: JSON.stringify({ restaurant_id: RESTAURANT_ID, fulfillment_type: 'pickup', payment_method: 'cash', group_order_id: groupId, items: completeItems }) });
if (!placed.ok) console.error('GROUP_ORDER_PLACE_DEBUG', JSON.stringify(placed));
const completedOrderId = placed.body?.data?.order?.id;
check(placed.ok && completedOrderId, 'Host places the final server-priced order');
const guestCompletedView = await guest(`/api/group-orders/${groupId}`);
check(guestCompletedView.body?.data?.group?.status === 'completed' && guestCompletedView.body?.data?.group?.completed_order_id === completedOrderId, 'Every participant sees the completed order reference');

console.log(`Group order workflow: PASS (${passed}/${passed}) GROUP_ID=${groupId}`);
