#!/usr/bin/env node

import fs from 'node:fs';

const BASE = process.env.BLINKGO_BASE_URL || 'http://localhost:3000';
const RESTAURANT_ID = '00000000-0000-0000-0000-000000000020';
const PRODUCT_ID = 'a1111111-0000-0000-0000-000000000001';
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let passed = 0;

function check(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function login(email, password) {
  const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (!response.ok || !cookie) console.error('SUPPORT_LOGIN_DEBUG', email, response.status, await response.clone().text());
  check(response.ok && cookie, `${email} signs in`);
  return async (path, init = {}) => {
    const response = await fetch(`${BASE}${path}`, { ...init, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
}

// The local acceptance harness shares an in-memory auth bucket across suites.
// Reset it once before this three-role journey so unrelated earlier tests do
// not consume the support workflow's login allowance.
const resetResponse = await fetch(`${BASE}/api/dev/test/reset`, { method: 'POST' });
check(resetResponse.ok, 'Local acceptance state resets before the support workflow');

const customer = await login('demo@blinkgo.de', 'DemoCustomer!2024');
const otherCustomer = await login('demo2@blinkgo.de', 'DemoCustomer!2024');
const admin = await login('admin@blinkgo.com', 'BlinkGoAdmin2026!');

const configuration = { selected_modifiers: { size: ['s'], crust: ['classic'] } };
const validationResponse = await fetch(`${BASE}/api/cart/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurant_id: RESTAURANT_ID, items: [{ product_id: PRODUCT_ID, quantity: 2, ...configuration }] }) });
const validation = await validationResponse.json();
check(validationResponse.ok && validation.lines?.[0]?.config_key, 'Server validates an order line for the support fixture');
const orderResponse = await customer('/api/orders', {
  method: 'POST',
  headers: { 'Idempotency-Key': `support-resolution-${Date.now()}` },
  body: JSON.stringify({
    restaurant_id: RESTAURANT_ID,
    fulfillment_type: 'delivery',
    payment_method: 'cash',
    items: [{ product_id: PRODUCT_ID, quantity: 2, configuration, config_key: validation.lines[0].config_key }],
    delivery_address: { address: 'Flach-Fengler-Straße 120, 50389 Wesseling', lat: 50.8275, lng: 6.9742 },
  }),
});
const orderId = orderResponse.body?.data?.order?.id;
if (!orderResponse.ok || !orderId) console.error('SUPPORT_ORDER_DEBUG', JSON.stringify(orderResponse));
check(orderResponse.ok && orderId, 'Customer owns a related order');

const missingOrder = await customer('/api/support', { method: 'POST', body: JSON.stringify({ issue_type: 'damaged_item', subject: 'Damaged soup', message: 'Container leaked.' }) });
check(missingOrder.status === 400, 'Order-bound issue rejects a missing order reference');
const forgedMime = await customer('/api/support', { method: 'POST', body: JSON.stringify({ issue_type: 'damaged_item', subject: 'Damaged soup', message: 'Container leaked.', order_id: orderId, attachment: { name: 'proof.png', data_url: 'data:image/png;base64,Zm9v' } }) });
check(forgedMime.status === 400, 'Server rejects forged attachment content');

const created = await customer('/api/support', { method: 'POST', body: JSON.stringify({ issue_type: 'damaged_item', priority: 'urgent', subject: 'Damaged soup container', message: 'The lid opened during delivery and the bag is wet.', order_id: orderId, attachment: { name: 'damaged-order.png', data_url: PNG_1X1 } }) });
if (!created.ok) console.error('CREATE_TICKET_DEBUG', JSON.stringify(created));
const ticket = created.body?.data?.ticket;
const attachment = created.body?.data?.attachment;
check(created.ok && /^BG-[A-F0-9]{10}$/.test(ticket?.reference_code ?? ''), 'Ticket receives a durable human reference');
check(ticket.priority === 'high' && ticket.next_action === 'refund_review', 'Server derives priority and next action from issue type');
check(new Date(ticket.sla_due_at).getTime() - new Date(ticket.created_at).getTime() === 120 * 60_000, 'Damaged-item SLA is exactly two hours');
check(attachment?.id && !('storage_path' in attachment) && !('sha256' in attachment), 'Attachment response exposes no private storage path or hash');

const denied = await otherCustomer(`/api/support?id=${ticket.id}`);
check(denied.status === 403 || denied.status === 404, 'Another customer cannot read the ticket');
const signed = await customer(`/api/support/attachments/${attachment.id}`);
check(signed.ok && signed.body?.data?.attachment?.url_expires_in_seconds === 60, 'Owner receives a 60-second signed attachment URL');
const signedUrl = signed.body.data.attachment.url;
const imageResponse = await fetch(signedUrl);
check(imageResponse.ok && (await imageResponse.arrayBuffer()).byteLength > 0, 'Signed URL serves the private image');

const adminDetail = await admin(`/api/support?id=${ticket.id}`);
check(adminDetail.ok && adminDetail.body?.data?.attachments?.length === 1, 'Support staff sees ticket context and attachment metadata');
const internal = await admin(`/api/support?id=${ticket.id}`, { method: 'POST', body: JSON.stringify({ message: 'Merchant evidence review started.', is_internal: true }) });
check(internal.ok, 'Staff can add an internal note');
const customerAfterInternal = await customer(`/api/support?id=${ticket.id}`);
check(customerAfterInternal.ok && customerAfterInternal.body?.data?.replies?.length === 0, 'Internal note stays hidden from customer');
check(customerAfterInternal.body.data.ticket.status === 'waiting_user' && customerAfterInternal.body.data.ticket.first_response_at, 'First staff response updates customer-visible status and response time');

const customerReply = await customer(`/api/support?id=${ticket.id}`, { method: 'POST', body: JSON.stringify({ message: 'I can provide the bag and receipt if needed.' }) });
check(customerReply.ok, 'Customer can reply to an active case');
const afterReply = await customer(`/api/support?id=${ticket.id}`);
check(afterReply.body?.data?.ticket?.status === 'in_progress' && afterReply.body?.data?.ticket?.next_action === 'waiting_support', 'Customer reply returns ownership to support');

const noSummary = await admin(`/api/support?id=${ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
check(noSummary.status === 400, 'Resolution requires a summary');
const resolved = await admin(`/api/support?id=${ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved', resolution_summary: 'Full item refund approved; finance queue reference RF-DEMO-1.' }) });
check(resolved.ok && resolved.body?.data?.ticket?.status === 'resolved' && resolved.body?.data?.ticket?.next_action === 'resolved', 'Staff resolves ticket with a durable outcome');
const finalCustomer = await customer(`/api/support?id=${ticket.id}`);
check(finalCustomer.body?.data?.ticket?.resolution_summary?.includes('Full item refund'), 'Customer sees the final resolution');
const lateReply = await customer(`/api/support?id=${ticket.id}`, { method: 'POST', body: JSON.stringify({ message: 'Trying to reopen implicitly.' }) });
check(lateReply.status === 400, 'Resolved ticket cannot be mutated by a late reply');

const migration = fs.readFileSync(new URL('../supabase/migrations/20260814023554_support_resolution_contract.sql', import.meta.url), 'utf8');
check(/REVOKE ALL ON public\.support_ticket_attachments FROM public, anon, authenticated/i.test(migration), 'Attachment metadata is denied to browser roles');
check(/file_size_limit[\s\S]*5242880/i.test(migration) && /interval '180 days'/i.test(migration), 'Private bucket and retention limits are explicit');
const retention = fs.readFileSync(new URL('../app/api/cron/support-attachment-retention/route.ts', import.meta.url), 'utf8');
check(/if \(!expected \|\| !provided\) return false/.test(retention), 'Retention job fails closed without CRON_SECRET');

console.log(`Support resolution workflow: PASS (${passed}/${passed}) TICKET=${ticket.reference_code} ID=${ticket.id}`);
