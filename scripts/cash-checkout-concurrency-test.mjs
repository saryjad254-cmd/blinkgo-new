#!/usr/bin/env node

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.staging.local', override: false });

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const PROJECT_REF = 'egjehqoilbjvzgbnksds';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const RID = 'b1000000-0000-4000-8000-000000000201';
const PRODUCT = 'b1000000-0000-4000-8000-000000000401';

if (process.env.ALLOW_STAGING_MUTATIONS !== '1') throw new Error('Refusing checkout mutation without ALLOW_STAGING_MUTATIONS=1');
if (!BASE.startsWith('http://localhost:')) throw new Error('Checkout concurrency test must target localhost');
if (!supabaseUrl.includes(PROJECT_REF)) throw new Error(`Refusing to run outside staging project ${PROJECT_REF}`);
if (!publishableKey || !serviceKey) throw new Error('Staging Supabase keys are missing');

let passed = 0;
function check(value, message) {
  if (!value) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: login, error: loginError } = await authClient.auth.signInWithPassword({ email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' });
check(!loginError && login.session?.access_token, 'customer staging session is available');
const headers = { Authorization: `Bearer ${login.session.access_token}`, Origin: BASE, 'Content-Type': 'application/json' };

const catalog = await fetch(`${BASE}/api/products/bestsellers?restaurant_id=${RID}`, { headers }).then((response) => response.json());
const catalogRows = catalog?.data?.bestsellers ?? catalog?.data?.products ?? catalog.bestsellers ?? catalog.products ?? [];
const product = catalogRows.find((item) => item.id === PRODUCT);
const selectedModifiers = Object.fromEntries((product?.modifiers ?? [])
  .filter((modifier) => modifier.required && Number(modifier.min_select ?? 0) > 0)
  .map((modifier) => [modifier.id, (modifier.options ?? []).slice(0, Number(modifier.min_select)).map((option) => option.id)]));
const configuration = { selected_modifiers: selectedModifiers };

const quoteResponse = await fetch(`${BASE}/api/cart/quote`, {
  method: 'POST', headers,
  body: JSON.stringify({ restaurant_id: RID, fulfillment_type: 'pickup', items: [{ product_id: PRODUCT, quantity: 1, configuration }] }),
});
const quote = await quoteResponse.json();
if (!quoteResponse.ok || !quote.lines?.[0]?.config_key) {
  console.error('Quote setup failed:', quoteResponse.status, JSON.stringify(quote));
}
check(quoteResponse.ok && quote.lines?.[0]?.config_key, 'server quote issues a canonical cart key');

const draftResponse = await fetch(`${BASE}/api/checkout/draft`, {
  method: 'POST', headers,
  body: JSON.stringify({ restaurant_id: RID, fulfillment_type: 'pickup', items: [{ product_id: PRODUCT, quantity: 1, config_key: quote.lines[0].config_key, configuration }], payment_method: 'cash' }),
});
const draftBody = await draftResponse.json();
const draft = draftBody?.data?.draft;
check(draftResponse.ok && draft?.draft_id && draft?.signature, 'cash checkout creates a signed persistent draft');
check(draft?.can_place_order === true, `checkout fixture is orderable (${JSON.stringify(draft?.issues ?? [])})`);

async function confirmCashWithRetry() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE}/api/checkout/cash`, {
      method: 'POST', headers, body: JSON.stringify({ draft_id: draft.draft_id }),
    });
    const body = await response.json();
    if (
      response.status !== 409
      || body?.error?.code !== 'IDEMPOTENCY_IN_PROGRESS'
      || attempt === 3
    ) return { status: response.status, body };
    const retryAfter = Number(response.headers.get('Retry-After'));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 2_000)
      : 350 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('unreachable');
}

const responses = await Promise.all(Array.from({ length: 8 }, () => confirmCashWithRetry()));
const successful = responses.filter((result) => result.status >= 200 && result.status < 300 && result.body?.data?.order?.id);
const safelyLimited = responses.filter((result) => result.status === 409 || result.status === 429);
const unexpected = responses.filter((result) =>
  !(result.status >= 200 && result.status < 300 && result.body?.data?.order?.id)
  && result.status !== 409
  && result.status !== 429,
);
if (unexpected.length > 0) console.error('Unexpected concurrent checkout responses:', JSON.stringify(unexpected));
check(successful.length >= 1, 'at least one concurrent confirmation completes successfully');
check(unexpected.length === 0, 'excess concurrent confirmations either replay, report in-progress, or are throttled');
check(successful.length + safelyLimited.length === responses.length, 'all eight confirmations finish without a server error');
const orderIds = new Set(successful.map((result) => result.body.data.order.id));
check(orderIds.size === 1, 'eight concurrent confirmations resolve to exactly one order');
const orderNumbers = new Set(successful.map((result) => result.body.data.order.order_number));
check(orderNumbers.size === 1 && [...orderNumbers][0].startsWith('BLGD'), 'cash draft uses one deterministic order number');

const orderId = [...orderIds][0];
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: dbRows, error: dbError } = await service.from('orders').select('id,order_number,customer_id').eq('id', orderId);
check(!dbError && dbRows?.length === 1, 'only the canonical order exists in persistence');

const trackingResponse = await fetch(`${BASE}/api/orders/track?order_id=${encodeURIComponent(orderId)}`, { headers });
const trackingBody = await trackingResponse.json();
const tracking = trackingBody?.data;
if (!trackingResponse.ok || tracking?.order?.fulfillment_type !== 'pickup' || !/^\d{6}$/.test(tracking?.order?.pickup_code ?? '')) {
  console.error('Pickup tracking response:', trackingResponse.status, JSON.stringify(trackingBody));
}
check(trackingResponse.ok && tracking?.order?.fulfillment_type === 'pickup' && /^\d{6}$/.test(tracking.order.pickup_code ?? ''), 'pickup tracking exposes the restaurant handover code');
check(tracking?.positions?.customer === null && tracking?.positions?.driver === null, 'pickup tracking never invents a delivery destination or driver');

console.log(`Cash checkout concurrency: PASS (${passed}/${passed}) ORDER_ID=${orderId}`);
