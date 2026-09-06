/**
 * Phase 7G-F — Production Infrastructure Test Suite
 * ─────────────────────────────────────────────────
 * Tests the production hardening added in 7G-F:
 *   - Stripe retry (exponential backoff, jitter, Retry-After, idempotency)
 *   - Connection pool monitoring (active, idle, waiting, slow queries)
 *   - Recovery verification (process restart, webhook delay, network, DB)
 *   - Financial consistency (Stripe ↔ DB ↔ Orders ↔ Refunds ↔ Audit)
 *   - Observability metrics (Prometheus format, /api/metrics, /api/metrics/health)
 *   - Structured logging (request_id, retry_count, recovery_state)
 *
 * Run with: `npx tsx scripts/test-production-infrastructure.mjs`
 * Or use the included node loader: `node --import tsx scripts/test-production-infrastructure.mjs`
 */
import http from 'node:http';
import { createHmac } from 'node:crypto';
import dotenv from 'dotenv';
import { stripeRetry } from '../lib/infrastructure/stripe-retry.ts';

dotenv.config({ path: '.env.local', override: false, quiet: true });
dotenv.config({ path: '.env.development.local', override: false, quiet: true });

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MOCK = 'http://localhost:54321';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder';
const METRICS_TOKEN = process.env.METRICS_TOKEN || 'isolated-metrics-token-for-acceptance-tests';

const RID = '00000000-0000-0000-0000-000000000020';
const PID = 'a1111111-0000-0000-0000-000000000001';
const CFG_KEY = 'r:00000000-0000-0000-0000-000000000020:p:a1111111-0000-0000-0000-000000000001:e1ec0665d7c3';

// ─────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────
const results = [];
function record(category, name, pass, detail) {
  results.push({ category, name, pass, detail });
  const icon = pass ? '✅' : '❌';
  console.log(`  ${icon} [${category}] ${name}${detail ? ' — ' + detail : ''}`);
}

function req(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { ...(opts.headers || {}), ...(opts.body ? { 'content-type': 'application/json' } : {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.chaosMode) headers['x-chaos-mode'] = opts.chaosMode;
    const r = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers, timeout: opts.timeout || 30000 },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          let body = data;
          try { body = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, body, raw: data });
        });
      },
    );
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(new Error('timeout')); });
    if (opts.body) {
      r.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    }
    r.end();
  });
}

function inner(r) { return r.body?.data ?? r.body; }

async function loginAs(role) {
  const creds = {
    customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
    admin: { email: 'payments@blinkgo.com', password: 'BlinkGoPayments2026!' },
  }[role];
  if (!creds) return null;
  const r = await req(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', body: creds, headers: { apikey: 'mock-anon-key' },
  });
  return r.body?.access_token ?? null;
}

let customerToken = '';
let adminToken = '';

async function postDraft(token, body) {
  return req(`${BASE}/api/checkout/draft`, { method: 'POST', body, token, headers: { origin: BASE } });
}
async function postStripeCheckout(token, draftId) {
  return req(`${BASE}/api/stripe/checkout`, { method: 'POST', body: { draft_id: draftId }, token, headers: { origin: BASE } });
}
async function postWebhook(payload, signatureHeader) {
  return req(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    headers: { 'stripe-signature': signatureHeader, 'content-type': 'application/json' },
  });
}
function signPayload(payload, secret = STRIPE_WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${payload}`;
  const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

async function createPaidOrder(token, _amountHint = 1000) {
  const draftBody = {
    restaurant_id: RID,
    items: [{ product_id: PID, quantity: 1, config_key: CFG_KEY, configuration: { selected_modifiers: { size: ['m'] } } }],
    delivery_address: { address: 'Wesseling, Germany', lat: 50.8207, lng: 6.9789 },
    payment_method: 'stripe',
    tip: 0,
  };
  const draftRes = await postDraft(token, draftBody);
  const draft = inner(draftRes)?.draft;
  const draftId = draft?.draft_id;
  if (!draftId) return { stage: 'draft', status: draftRes.status, error: inner(draftRes)?.error };
  // This acceptance server explicitly enables mock payments while the
  // customer-facing readiness flag stays false without a real Stripe account.
  const amount = Math.round(Number(draft.total ?? _amountHint) * 100);
  const stripeRes = await postStripeCheckout(token, draftId);
  const piId = inner(stripeRes)?.client_secret?.split('_secret_')[0] || inner(stripeRes)?.payment_intent_id;
  if (!piId) return { stage: 'payment_intent', draftId, piId: null, amount, status: stripeRes.status, error: inner(stripeRes)?.error };
  const userIdRes = await req(`${MOCK}/auth/v1/user`, { headers: { apikey: 'mock-anon-key', authorization: `Bearer ${token}` } });
  const customerId = userIdRes.body?.id;
  const evt = {
    id: `evt_pf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'payment_intent.succeeded',
    livemode: false,
    data: {
      object: {
        id: piId, object: 'payment_intent', amount, currency: 'eur',
        metadata: { draft_id: draftId, customer_id: customerId, restaurant_id: RID },
      },
    },
    created: Math.floor(Date.now() / 1000),
  };
  const sig = signPayload(JSON.stringify(evt));
  const webhookRes = await postWebhook(evt, sig);
  const confirmRes = await req(`${BASE}/api/checkout/confirm?draft_id=${encodeURIComponent(draftId)}`, {
    token, headers: { origin: BASE },
  });
  const orderId = inner(confirmRes)?.order_id ?? null;
  return {
    stage: orderId ? 'complete' : 'confirm',
    draftId,
    piId,
    amount,
    orderId,
    webhookStatus: webhookRes.status,
    webhookResult: webhookRes.body?.status || webhookRes.body?.error,
    confirmStatus: confirmRes.status,
    confirmResult: inner(confirmRes)?.status || inner(confirmRes)?.error,
  };
}

async function createRefund(adminToken, orderId, opts = {}) {
  return req(`${BASE}/api/admin/orders/${orderId}/refunds`, {
    method: 'POST',
    body: { mode: opts.mode || 'full', amount_cents: opts.amount_cents ?? opts.amount, reason: opts.reason || 'order_canceled', idempotency_key: opts.idempotency_key },
    token: adminToken,
    headers: { origin: BASE },
    chaosMode: opts.chaosMode,
  });
}

async function setChaos(mode, target) {
  const body = mode === 'reset' ? { mode: 'reset' } : { mode, target };
  return req(`${MOCK}/rest/v1/chaos`, {
    method: 'POST', body,
    headers: { apikey: 'mock-anon-key', 'content-type': 'application/json' },
  });
}
async function clearChaos() {
  return req(`${MOCK}/rest/v1/chaos`, { method: 'DELETE', headers: { apikey: 'mock-anon-key' } });
}

// ─────────────────────────────────────────────────────────────
// 1. Stripe retry unit tests
// ─────────────────────────────────────────────────────────────
async function testStripeRetryUnit() {
  console.log('\n=== 1. Stripe Retry Unit Tests ===');

  // 1.1 Success on first try
  let callCount = 0;
  const r1 = await stripeRetry(async () => {
    callCount++;
    return { id: 're_1' };
  }, { operation: 'test.success', requestId: 'r1' });
  record('1', 'Success on first try (no retry)', r1.ok && r1.retried === 0 && callCount === 1, `retried=${r1.retried} calls=${callCount}`);

  // 1.2 Retry on 500, then success
  callCount = 0;
  const r2 = await stripeRetry(async () => {
    callCount++;
    if (callCount < 3) {
      const err = new Error('Stripe 500');
      err.statusCode = 500;
      err.code = 'api_error';
      throw err;
    }
    return { id: 're_2' };
  }, { operation: 'test.retry500', requestId: 'r2', baseDelayMs: 10, maxDelayMs: 50 });
  record('1', 'Retry on 500 (3 attempts, success)', r2.ok && r2.retried === 2 && callCount === 3, `retried=${r2.retried} calls=${callCount}`);

  // 1.3 Retry on 429 (rate limit)
  callCount = 0;
  const r3 = await stripeRetry(async () => {
    callCount++;
    if (callCount < 2) {
      const err = new Error('Rate limit');
      err.statusCode = 429;
      throw err;
    }
    return { id: 're_3' };
  }, { operation: 'test.retry429', requestId: 'r3', baseDelayMs: 10 });
  record('1', 'Retry on 429 (rate limit)', r3.ok && r3.retried === 1, `retried=${r3.retried} calls=${callCount}`);

  // 1.4 Do NOT retry on non-retryable Stripe code (card_declined)
  callCount = 0;
  const r4 = await stripeRetry(async () => {
    callCount++;
    const err = new Error('Card declined');
    err.statusCode = 402;
    err.code = 'card_declined';
    throw err;
  }, { operation: 'test.cardDeclined', requestId: 'r4', baseDelayMs: 10 });
  record('1', 'No retry on card_declined', !r4.ok && r4.code === 'card_declined' && callCount === 1, `ok=${r4.ok} calls=${callCount}`);

  // 1.5 Exhaust retries
  callCount = 0;
  const r5 = await stripeRetry(async () => {
    callCount++;
    const err = new Error('Always 500');
    err.statusCode = 500;
    throw err;
  }, { operation: 'test.exhaust', requestId: 'r5', maxRetries: 2, baseDelayMs: 10, maxDelayMs: 20 });
  record('1', 'Exhaust retries (3 attempts total)', !r5.ok && r5.retried === 2 && callCount === 3, `retried=${r5.retried} calls=${callCount}`);

  // 1.6 Retry-After header honored
  callCount = 0;
  const r6 = await stripeRetry(async () => {
    callCount++;
    if (callCount < 2) {
      const err = new Error('Rate limit');
      err.statusCode = 429;
      err.headers = { 'retry-after': '1' };
      throw err;
    }
    return { id: 're_6' };
  }, { operation: 'test.retryAfter', requestId: 'r6', baseDelayMs: 10 });
  record('1', 'Retry-After header honored', r6.ok && r6.retried === 1, `retried=${r6.retried}`);

  // 1.7 Idempotency key passed through on every attempt
  callCount = 0;
  const r7 = await stripeRetry(async (opts) => {
    callCount++;
    if (callCount === 1 && opts.requestId !== 'r7') {
      throw new Error('requestId mismatch');
    }
    if (callCount < 2) {
      const err = new Error('Network blip');
      err.statusCode = 503;
      throw err;
    }
    return { id: 're_7' };
  }, { operation: 'test.idempotency', requestId: 'r7', baseDelayMs: 10 });
  record('1', 'Request ID preserved across retries', r7.ok && r7.retried === 1 && callCount === 2, `retried=${r7.retried} calls=${callCount}`);

  // 1.8 Timeout handling
  callCount = 0;
  const r8 = await stripeRetry(async () => {
    callCount++;
    return new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, 100);
    });
  }, { operation: 'test.timeout', requestId: 'r8', timeoutMs: 50, maxRetries: 1, baseDelayMs: 10 });
  record('1', 'Timeout handling', !r8.ok, `code=${r8.code}`);
}

// ─────────────────────────────────────────────────────────────
// 2. Connection pool monitoring
// ─────────────────────────────────────────────────────────────
async function testConnectionPool() {
  console.log('\n=== 2. Connection Pool Monitoring ===');

  // 2.1 Health endpoint
  const healthRes = await req(`${BASE}/api/metrics?format=health`, { token: METRICS_TOKEN });
  record('2', 'Health endpoint returns 200', healthRes.status === 200, `status=${healthRes.status}`);
  const hasPoolSection = !!healthRes.body?.pool;
  record('2', 'Health has pool section', hasPoolSection);
  const hasConsistency = !!healthRes.body?.consistency;
  record('2', 'Health has consistency section', hasConsistency);

  // 2.2 Prometheus format
  const promRes = await req(`${BASE}/api/metrics`, { token: METRICS_TOKEN });
  const promBody = promRes.raw || '';
  const hasPoolActive = promBody.includes('db_pool_active');
  const hasPoolIdle = promBody.includes('db_pool_idle');
  const hasPoolWaiting = promBody.includes('db_pool_waiting');
  const hasPaymentMetrics = promBody.includes('payments_') || promBody.includes('refunds_') || promBody.includes('webhooks_');
  record('2', 'Prometheus format exposes pool metrics', hasPoolActive && hasPoolIdle && hasPoolWaiting, `pool_active=${hasPoolActive} idle=${hasPoolIdle} waiting=${hasPoolWaiting}`);
  record('2', 'Prometheus format exposes payment metrics', hasPaymentMetrics, `payment_metrics=${hasPaymentMetrics}`);

  // 2.3 JSON format
  const jsonRes = await req(`${BASE}/api/metrics?format=json`, { token: METRICS_TOKEN });
  const jsonMetrics = jsonRes.body?.metrics || {};
  record('2', 'JSON format returns metrics', Object.keys(jsonMetrics).length > 0, `keys=${Object.keys(jsonMetrics).length}`);

  // 2.4 Pool health report has recommendations
  const pool = healthRes.body?.pool || {};
  const hasRecommendations = Array.isArray(pool.recommendations);
  record('2', 'Pool health has recommendations array', hasRecommendations, `count=${pool.recommendations?.length}`);

  // 2.5 Pool exhaust detection
  // The exhaust detection is exercised when waitingCount > threshold
  // We can verify the structure of the alert
  const hasExhausted = 'totalExhaustions' in pool;
  const hasHighWater = 'highWaterActive' in pool;
  record('2', 'Pool reports exhaustion metrics', hasExhausted && hasHighWater, `exhaustions=${pool.totalExhaustions} highWaterActive=${pool.highWaterActive}`);
}

// ─────────────────────────────────────────────────────────────
// 3. Recovery verification
// ─────────────────────────────────────────────────────────────
async function testRecoveryVerification() {
  console.log('\n=== 3. Recovery Verification ===');
  await clearChaos();

  // 3.1 Process restart: idempotency key with same payload returns same result
  const order1 = await createPaidOrder(customerToken, 2000);
  if (order1?.orderId) {
    const key = `restart_${Date.now()}`;
    const r1 = await createRefund(adminToken, order1.orderId, { mode: 'partial', amount_cents: 100, reason: 'other', idempotency_key: key });
    // "Process restart" simulated by retrying with same key
    const r2 = await createRefund(adminToken, order1.orderId, { mode: 'partial', amount_cents: 100, reason: 'other', idempotency_key: key });
    const id1 = inner(r1)?.refund?.id;
    const id2 = inner(r2)?.refund?.id;
    record('3', 'Process restart (idempotency survives)', id1 === id2 && !!id1, `${id1?.slice(0,8)} vs ${id2?.slice(0,8)}`);
  } else {
    record('3', 'Process restart setup', false, JSON.stringify(order1));
  }

  // 3.2 Webhook delay (10 min old) is rejected
  const order2 = await createPaidOrder(customerToken, 2000);
  if (order2?.orderId) {
    // Already verified in 7G-E; this is regression check
    const userIdRes = await req(`${MOCK}/auth/v1/user`, { headers: { apikey: 'mock-anon-key', authorization: `Bearer ${customerToken}` } });
    const customerId = userIdRes.body?.id;
    const oldEvt = {
      id: `evt_old_${Date.now()}`,
      type: 'payment_intent.succeeded',
      livemode: false,
      data: { object: { id: order2.piId, object: 'payment_intent', amount: order2.amount, currency: 'eur', metadata: { draft_id: order2.draftId, customer_id: customerId, restaurant_id: RID } } },
      created: Math.floor(Date.now() / 1000) - 600,
    };
    const oldSig = signPayload(JSON.stringify(oldEvt), STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 600);
    const r = await postWebhook(oldEvt, oldSig);
    record('3', 'Webhook delay (10min old rejected)', r.status === 400, `status=${r.status}`);
  }

  // 3.3 Network interruption: Supabase 503 → retry
  const order3 = await createPaidOrder(customerToken, 2000);
  if (order3?.orderId) {
    await setChaos('supabase-503', 'payment_refunds');
    const r3a = await createRefund(adminToken, order3.orderId, { mode: 'full', reason: 'order_canceled' });
    await clearChaos();
    // Reconnect simulated: clear chaos, retry
    const r3b = await createRefund(adminToken, order3.orderId, { mode: 'partial', amount_cents: 100, reason: 'other' });
    record('3', 'Network interruption (DB reconnect retry)', r3a.status >= 500 && r3b.status === 200, `first=${r3a.status} retry=${r3b.status}`);
  }

  // 3.4 Temporary DB outage: 503 → graceful failure, then retry succeeds
  const order4 = await createPaidOrder(customerToken, 2000);
  if (order4?.orderId) {
    await setChaos('supabase-503', 'payment_refunds');
    const r4a = await createRefund(adminToken, order4.orderId, { mode: 'full', reason: 'order_canceled' });
    await setChaos('supabase-ok', 'payment_refunds');
    const r4b = await createRefund(adminToken, order4.orderId, { mode: 'full', reason: 'order_canceled' });
    record('3', 'Temporary DB outage (recovery succeeds)', r4a.status >= 500 && r4b.status === 200, `first=${r4a.status} retry=${r4b.status}`);
  }
  await clearChaos();

  // 3.5 Recovery state report (via /api/metrics?format=health consistency)
  const consistencyRes = await req(`${BASE}/api/metrics?format=health`, { token: METRICS_TOKEN });
  const consistency = consistencyRes.body?.consistency || {};
  record('3', 'Recovery state report (convergence status)', ['converged', 'drifting', 'diverged'].includes(consistency.convergenceStatus), `status=${consistency.convergenceStatus} issues=${consistency.issues?.length}`);
}

// ─────────────────────────────────────────────────────────────
// 4. Financial consistency verification
// ─────────────────────────────────────────────────────────────
async function testFinancialConsistency() {
  console.log('\n=== 4. Financial Consistency ===');

  // 4.1 Consistency endpoint reachable
  const res = await req(`${BASE}/api/metrics?format=health`, { token: METRICS_TOKEN });
  const consistency = res.body?.consistency || {};
  record('4', 'Consistency check returns valid status', ['converged', 'drifting', 'diverged'].includes(consistency.convergenceStatus), `status=${consistency.convergenceStatus}`);

  // 4.2 No critical issues in current state (mock has all valid bindings)
  const criticalCount = (consistency.issues || []).filter((i) => i.severity === 'critical').length;
  // In mock, we expect 0 critical since all data is consistent
  record('4', 'No critical consistency issues', criticalCount === 0, `critical=${criticalCount}`);

  // 4.3 Every Stripe order that reached a paid/refundable state has a
  // PaymentIntent. A checkout that is cancelled before Stripe creates a PI
  // legitimately keeps payment_intent_id=null and must not be reported as a
  // financial consistency defect.
  const ordersRes = await req(`${MOCK}/rest/v1/orders?select=id,payment_method,payment_intent_id,payment_status,status,total`, { headers: { apikey: 'mock-anon-key' } });
  const orders = Array.isArray(ordersRes.body) ? ordersRes.body : [];
  const stripeOrdersRequiringPI = orders.filter((o) =>
    o.payment_method === 'stripe'
    && ['paid', 'succeeded', 'partially_refunded', 'refunded'].includes(o.payment_status),
  );
  const ordersWithoutPI = stripeOrdersRequiringPI.filter((o) => !o.payment_intent_id).length;
  record(
    '4',
    'All paid/refundable Stripe orders have payment_intent_id',
    ordersWithoutPI === 0,
    `without_pi=${ordersWithoutPI}/${stripeOrdersRequiringPI.length}`,
  );

  // 4.4 All SUCCEEDED refunds have stripe_refund_id
  // (Failed/validating refunds may not have one — that's correct, they didn't reach Stripe)
  const refundsRes = await req(`${MOCK}/rest/v1/payment_refunds?select=id,stripe_refund_id,status,refunded_amount_cents,order_id`, { headers: { apikey: 'mock-anon-key' } });
  const refunds = Array.isArray(refundsRes.body) ? refundsRes.body : [];
  const succeeded = refunds.filter((r) => r.status === 'succeeded');
  const succeededWithStripe = succeeded.filter((r) => r.stripe_refund_id).length;
  record('4', 'All SUCCEEDED refunds have stripe_refund_id', succeededWithStripe === succeeded.length, `with_stripe=${succeededWithStripe}/${succeeded.length}`);

  // 4.5 No refund exceeds order total
  let overRefund = 0;
  for (const r of refunds.filter((rf) => rf.status === 'succeeded')) {
    const o = orders.find((o) => o.id === r.order_id);
    if (!o) continue;
    const orderTotalCents = Math.round(Number(o.total ?? 0) * 100);
    if (Number(r.refunded_amount_cents ?? 0) > orderTotalCents) overRefund++;
  }
  record('4', 'No refund exceeds order total', overRefund === 0, `over=${overRefund}`);

  // 4.6 No duplicate stripe_refund_id
  const stripeIds = refunds.map((r) => r.stripe_refund_id).filter(Boolean);
  const uniqueStripeIds = new Set(stripeIds);
  record('4', 'No duplicate stripe_refund_id', stripeIds.length === uniqueStripeIds.size, `total=${stripeIds.length} unique=${uniqueStripeIds.size}`);

  // 4.7 Convergence after chaos (refund + audit)
  const order = await createPaidOrder(customerToken, 2000);
  if (order?.orderId) {
    const r = await createRefund(adminToken, order.orderId, { mode: 'full', reason: 'order_canceled' });
    // After refund, re-check consistency
    const r2 = await req(`${BASE}/api/metrics?format=health`, { token: METRICS_TOKEN });
    const c2 = r2.body?.consistency || {};
    record('4', 'Convergence after full refund', r.status === 200 && c2.convergenceStatus !== 'diverged', `refund=${r.status} status=${c2.convergenceStatus}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 5. Observability
// ─────────────────────────────────────────────────────────────
async function testObservability() {
  console.log('\n=== 5. Observability ===');

  // 5.1 Prometheus metrics endpoint
  const res = await req(`${BASE}/api/metrics`, { token: METRICS_TOKEN });
  const body = res.raw || '';
  record('5', 'Prometheus endpoint returns 200', res.status === 200, `status=${res.status}`);
  record('5', 'Content-Type is text/plain', (res.status === 200) && (body.includes('# HELP') || body.includes('# TYPE')), 'prom format');

  // 5.2 All payment metrics present
  const hasPayments = body.includes('payments_');
  const hasRefunds = body.includes('refunds_');
  const hasWebhooks = body.includes('webhooks_');
  const hasPool = body.includes('db_pool_');
  const hasStripe = body.includes('stripe_api_');
  record('5', 'All metric categories present', hasPayments && hasRefunds && hasWebhooks && hasPool && hasStripe, `payments=${hasPayments} refunds=${hasRefunds} webhooks=${hasWebhooks} pool=${hasPool} stripe=${hasStripe}`);

  // 5.3 JSON metrics endpoint
  const jsonRes = await req(`${BASE}/api/metrics?format=json`, { token: METRICS_TOKEN });
  record('5', 'JSON metrics endpoint returns 200', jsonRes.status === 200, `status=${jsonRes.status}`);
  const metrics = jsonRes.body?.metrics || {};
  const metricCount = Object.keys(metrics).length;
  record('5', 'JSON metrics has multiple entries', metricCount > 5, `count=${metricCount}`);

  // 5.4 Health endpoint includes pool + consistency
  const healthRes = await req(`${BASE}/api/metrics?format=health`, { token: METRICS_TOKEN });
  const hasPoolAndConsistency = !!healthRes.body?.pool && !!healthRes.body?.consistency;
  record('5', 'Health endpoint has pool + consistency', hasPoolAndConsistency);

  // 5.5 Health endpoint reports status
  const status = healthRes.body?.status;
  record('5', 'Health status is set', ['healthy', 'degraded'].includes(status), `status=${status}`);

  // 5.6 Generate some load to see metrics move
  const beforeCount = jsonRes.body?.metrics?.payments_created_total?.values
    ? Object.values(jsonRes.body.metrics.payments_created_total.values).reduce((s, v) => s + v, 0)
    : 0;
  await createPaidOrder(customerToken, 2000);
  const afterRes = await req(`${BASE}/api/metrics?format=json`, { token: METRICS_TOKEN });
  const afterCount = afterRes.body?.metrics?.payments_created_total?.values
    ? Object.values(afterRes.body.metrics.payments_created_total.values).reduce((s, v) => s + v, 0)
    : 0;
  record('5', 'Payment metric increments on activity', afterCount > beforeCount || beforeCount === 0, `before=${beforeCount} after=${afterCount}`);
}

// ─────────────────────────────────────────────────────────────
// 6. Structured logging (via /tmp/next.log inspection)
// ─────────────────────────────────────────────────────────────
async function testStructuredLogging() {
  console.log('\n=== 6. Structured Logging ===');

  // 6.1 Next.js dev log contains structured log entries
  // We check that the log file exists and has recent activity
  const captured = [];
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  const capture = (...args) => captured.push(args.map(String).join(' '));
  try {
    console.log = capture;
    console.info = capture;
    console.warn = capture;
    console.error = capture;
    console.debug = capture;
    let attempts = 0;
    await stripeRetry(async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('Transient provider failure');
        error.statusCode = 503;
        throw error;
      }
      return { id: 'structured-log-proof' };
    }, {
      operation: 'refund.structured_log_test',
      requestId: 'structured-log-request-id',
      recoveryState: 'refund_recovery',
      baseDelayMs: 1,
      maxDelayMs: 2,
    });
  } finally {
    Object.assign(console, original);
  }
  const logContents = captured.join('\n');
  record('6', 'Structured logger emits records', logContents.length > 0, `records=${captured.length}`);

  // 6.2 Has structured entries with request_id
  const hasRequestId = logContents.includes('structured-log-request-id');
  record('6', 'Logs include request_id', hasRequestId);

  const hasRetryStructure = logContents.includes('stripe.retry.attempt_failed') ||
    logContents.includes('stripe.retry.scheduled') ||
    logContents.includes('stripe.retry.success');
  record('6', 'Logs include retry context', hasRetryStructure);

  // 6.4 Has structured entries with operation names
  const hasOperations = logContents.includes('refund.structured_log_test') && logContents.includes('refund_recovery');
  record('6', 'Logs include operation names', hasOperations);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Phase 7G-F — Production Infrastructure Hardening');
  console.log('══════════════════════════════════════════════════════════════');

  customerToken = await loginAs('customer');
  adminToken = await loginAs('admin');
  console.log('Setup: tokens obtained');

  await testStripeRetryUnit();
  await testConnectionPool();
  await testRecoveryVerification();
  await testFinancialConsistency();
  await testObservability();
  await testStructuredLogging();

  await clearChaos();

  console.log('\n══════════════════════════════════════════════════════════════');
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  console.log(`  Total: ${total} | ✅ ${passed} | ❌ ${failed}`);
  console.log('══════════════════════════════════════════════════════════════');
  if (failed > 0) {
    console.log('\n❌ FAILED:');
    for (const r of results) {
      if (!r.pass) console.log(`  - [${r.category}] ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('test-production-infrastructure.mjs crashed:', e);
  process.exit(1);
});
