#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MOCK = 'http://localhost:54321';
const RID = '00000000-0000-0000-0000-000000000022';
const PRODUCT = 'a1111111-0000-0000-0000-000000000020';
let passed = 0;
const assert = (value, message) => { if (!value) throw new Error(message); passed++; console.log(`  ✓ ${message}`); };

async function login(email, password) {
  const response = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: 'mock-anon-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await response.json(); if (!response.ok) throw new Error(`Login failed: ${email}`); return body.access_token;
}
async function request(url, token) { return fetch(url, { headers: { Authorization: `Bearer ${token}`, Origin: BASE } }); }

const customer = await login('demo@blinkgo.de', 'DemoCustomer!2024');
const merchant = await login('wesseling@blinkgo.de', 'BlinkGoWesseling2026!');
const otherCustomer = await login('demo2@blinkgo.de', 'DemoCustomer!2024');
const catalog = await fetch(`${BASE}/api/products/bestsellers?restaurant_id=${RID}`, { headers: { Authorization: `Bearer ${customer}`, Origin: BASE } }).then((response) => response.json());
const product = (catalog.bestsellers ?? catalog.products ?? []).find((item) => item.id === PRODUCT);
const selectedModifiers = Object.fromEntries((product?.modifiers ?? [])
  .filter((modifier) => modifier.required && Number(modifier.min_select ?? 0) > 0)
  .map((modifier) => [modifier.id, (modifier.options ?? []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
const created = await fetch(`${BASE}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${customer}`, Origin: BASE, 'Content-Type': 'application/json', 'Idempotency-Key': `financial-doc-${Date.now()}` }, body: JSON.stringify({ restaurant_id: RID, items: [{ product_id: PRODUCT, quantity: 2, configuration: { selected_modifiers: selectedModifiers } }], payment_method: 'cash', delivery_address: { address: 'Rechnungstest 10, 50389 Wesseling', lat: 50.82, lng: 6.98 } }) });
const createdBody = await created.json();
const orderId = createdBody?.data?.order?.id;
if (!created.ok) console.error('Fixture creation failed:', created.status, JSON.stringify(createdBody));
assert(created.ok && orderId, 'Customer creates the authoritative order fixture');
await fetch(`${MOCK}/rest/v1/orders?id=eq.${orderId}`, { method: 'PATCH', headers: { apikey: 'mock-service-role-key', Authorization: 'Bearer mock-service-role-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'delivered', delivered_at: new Date().toISOString(), payment_status: 'paid' }) });

const receipt = await request(`${BASE}/api/orders/${orderId}/receipt`, customer);
const receiptBytes = new Uint8Array(await receipt.arrayBuffer());
assert(receipt.status === 200 && receipt.headers.get('content-type') === 'application/pdf' && receiptBytes.length > 1000, 'Owning customer downloads a real PDF receipt');
const receiptPdf = await PDFDocument.load(receiptBytes);
assert(receiptPdf.getPageCount() >= 1 && receipt.headers.get('content-disposition')?.includes('BG-BELEG-'), 'Receipt is parseable and has a numbered download filename');
const repeated = await request(`${BASE}/api/orders/${orderId}/receipt`, customer);
assert(repeated.status === 200 && repeated.headers.get('content-disposition') === receipt.headers.get('content-disposition'), 'Repeated download returns the same immutable numbered document');
const forbiddenCustomer = await request(`${BASE}/api/orders/${orderId}/receipt`, otherCustomer);
assert(forbiddenCustomer.status === 404, 'A different customer cannot download the receipt');
const forbiddenMerchantReceipt = await request(`${BASE}/api/orders/${orderId}/receipt`, merchant);
assert(forbiddenMerchantReceipt.status === 401, 'Merchant cannot use the customer receipt endpoint');

const statement = await request(`${BASE}/api/restaurant/orders/${orderId}/statement`, merchant);
const statementBytes = new Uint8Array(await statement.arrayBuffer());
if (!statement.ok) console.error('Statement failed:', statement.status, new TextDecoder().decode(statementBytes));
assert(statement.status === 200 && statement.headers.get('content-type') === 'application/pdf' && statement.headers.get('content-disposition')?.includes('BG-TRANS-'), 'Owning merchant downloads a numbered PDF transaction statement');
const statementPdf = await PDFDocument.load(statementBytes);
assert(statementPdf.getPageCount() >= 1, 'Merchant statement is a structurally valid PDF');
const forbiddenCustomerStatement = await request(`${BASE}/api/restaurant/orders/${orderId}/statement`, customer);
assert(forbiddenCustomerStatement.status === 401, 'Customer cannot use the merchant statement endpoint');

const records = await (await fetch(`${MOCK}/rest/v1/financial_documents?order_id=eq.${orderId}&select=*`, { headers: { apikey: 'mock-service-role-key', Authorization: 'Bearer mock-service-role-key' } })).json();
assert(records.length === 2 && records.every((row) => /^[a-f0-9]{64}$/.test(row.snapshot_sha256)), 'Database keeps two immutable SHA-256 snapshots');
const mutation = await fetch(`${MOCK}/rest/v1/financial_documents?order_id=eq.${orderId}`, { method: 'PATCH', headers: { apikey: 'mock-service-role-key', Authorization: 'Bearer mock-service-role-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: {} }) });
assert(mutation.status === 405, 'Issued financial snapshots reject mutation');

const out = path.join('output', 'pdf'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'blinkgo-sample-order-receipt.pdf'), receiptBytes);
fs.writeFileSync(path.join(out, 'blinkgo-sample-merchant-statement.pdf'), statementBytes);
console.log(`Financial document workflow: PASS (${passed}/${passed})`);
