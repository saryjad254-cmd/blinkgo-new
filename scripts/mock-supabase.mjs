#!/usr/bin/env node
/**
 * Mock Supabase Server
 * ────────────────────
 * A minimal HTTP server that mimics the Supabase REST + GoTrue endpoints
 * that the BlinkGo auth flow actually uses. This lets the dev server boot
 * and the login form succeed end-to-end without a real Supabase project.
 *
 * The mock is intentionally narrow: it only implements the routes the
 * login flow exercises. Anything else returns 404 so the developer sees
 * the gap rather than getting silently fake data.
 *
 * Run: node scripts/mock-supabase.mjs
 *     (defaults to PORT=54321 — matches Supabase's default local port)
 *
 * Demo accounts (predefined so the operator can test immediately):
 *   demo@blinkgo.de     / DemoCustomer!2024        → role=customer
 *   admin@blinkgo.com   / BlinkGoAdmin2026!         → role=admin
 *   driver@blinkgo.com  / BlinkGoDriver2026!        → role=driver
 *   wesseling@blinkgo.de/ BlinkGoWesseling2026!     → role=restaurant
 */

import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.MOCK_SUPABASE_PORT || '54321', 10);

// ── Demo accounts (mirrors scripts/setup-operator-accounts.mjs) ──
const ACCOUNTS = {
  'demo@blinkgo.de': {
    id: '11111111-1111-1111-1111-111111111001',
    email: 'demo@blinkgo.de',
    password: 'DemoCustomer!2024',
    role: 'customer',
    name: 'Demo Customer',
    is_active: true,
    is_verified: true,
  },
  'demo2@blinkgo.de': {
    id: '11111111-1111-1111-1111-111111111002',
    email: 'demo2@blinkgo.de',
    password: 'DemoCustomer!2024',
    role: 'customer',
    name: 'Demo Customer Two',
    is_active: true,
    is_verified: true,
  },
  'admin@blinkgo.com': {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'admin@blinkgo.com',
    password: 'BlinkGoAdmin2026!',
    role: 'admin',
    name: 'BlinkGo Admin',
    is_active: true,
    is_verified: true,
  },
  'payments@blinkgo.com': {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'payments@blinkgo.com',
    password: 'BlinkGoPayments2026!',
    role: 'admin',
    permissions: ['payment_support'],
    name: 'BlinkGo Payment Support',
    is_active: true,
    is_verified: true,
  },
  'driver@blinkgo.com': {
    id: '62e81b22-06f3-4217-adad-8839c29d64ff',
    email: 'driver@blinkgo.com',
    password: 'BlinkGoDriver2026!',
    role: 'driver',
    name: 'BlinkGo Driver',
    is_active: true,
    is_verified: true,
    metadata: {
      is_online: false,
      working_hours: Array.from({ length: 7 }, (_, day) => ({
        day_of_week: day,
        start_time: '00:00',
        end_time: '23:59',
        is_enabled: true,
      })),
    },
  },
  'wesseling@blinkgo.de': {
    id: '00000000-0000-0000-0000-000000000020',
    type: 'restaurant',
    restaurant_id: '00000000-0000-0000-0000-000000000020',
    email: 'wesseling@blinkgo.de',
    password: 'BlinkGoWesseling2026!',
    role: 'restaurant',
    name: 'Wesseling Restaurant',
    is_active: true,
    is_verified: true,
  },
  'market@blinkgo.de': {
    id: '00000000-0000-0000-0000-000000000024',
    email: 'market@blinkgo.de',
    password: 'BlinkGoMarket2026!',
    role: 'restaurant',
    name: 'BlinkMart Operator',
    is_active: true,
    is_verified: true,
  },
};

// Active sessions: token -> { userId, refreshToken, expiresAt }
const sessions = new Map();

// Newly-registered users (mock-only — survives process lifetime)
const registeredUsers = new Map(); // email -> { id, email, password, role, name, is_active, is_verified }

// Mock tables (in-memory)
const otpStore = new Map(); // otp_id -> { email, user_id, code_hash, purpose, expires_at, used_at, created_at }
const resetTokens = new Map(); // token_id -> { email, code_hash, expires_at, used_at, created_at }
const magicLinkTokens = new Map(); // token_id -> { email, user_id, token_hash, expires_at, used_at, created_at, redirect_to }
const legalAcceptanceStore = new Map(); // id -> immutable signup legal acceptance evidence

// In-memory store for orders
const ordersStore = new Map(); // id -> order object
const orderItemsStore = new Map(); // id -> order_item object
const supportTicketsStore = new Map(); // id -> support ticket
const supportTicketRepliesStore = new Map(); // id -> support reply
const supportTicketAttachmentsStore = new Map(); // id -> private attachment metadata
const driverStatusStore = new Map(); // driver_id -> live status
const DEMO_DRIVER_ID = ACCOUNTS['driver@blinkgo.com'].id;
const DEMO_DRIVER_DOCUMENT_TYPES = [
  'id_proof',
  'license',
  'insurance',
  'vehicle_registration',
  'employment_contract',
  'health_insurance',
  'tax_id_confirmation',
  'social_insurance_number_proof',
  'payout_account_verification',
];
const driverDocumentsStore = new Map(DEMO_DRIVER_DOCUMENT_TYPES.map((documentType, index) => {
  const id = `72000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  return [id, {
    id,
    driver_id: DEMO_DRIVER_ID,
    document_type: documentType,
    document_url: `mock-private://driver-documents/${DEMO_DRIVER_ID}/${documentType}.pdf`,
    document_number: null,
    expires_at: null,
    status: 'approved',
    rejection_reason: null,
    uploaded_at: '2026-08-01T09:00:00.000Z',
    reviewed_at: '2026-08-01T10:00:00.000Z',
    reviewed_by: ACCOUNTS['admin@blinkgo.com'].id,
    submission_kind: 'file',
  }];
}));
const driverWorkingHoursStore = new Map(Array.from({ length: 7 }, (_, day) => {
  const id = `69000000-0000-4000-8000-${String(day + 1).padStart(12, '0')}`;
  return [id, {
    id,
    driver_id: DEMO_DRIVER_ID,
    day_of_week: day,
    start_time: '00:00',
    end_time: '23:59',
    is_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }];
}));
const trackingEventsStore = new Map(); // id -> tracking event
const productRequestsStore = new Map(); // id -> product approval request (test infrastructure only)
const restaurantVerificationsStore = new Map(); // id -> merchant verification submission
const restaurantSpecialHoursStore = new Map(); // id -> date-specific venue hours
const orderItemReplacementsStore = new Map(); // id -> customer-approved retail replacement workflow
const orderFinancialAdjustmentsStore = new Map(); // id -> substitution price reconciliation
const groupOrdersStore = new Map(); // id -> collaborative order session
const groupOrderParticipantsStore = new Map(); // id -> group member
const groupOrderItemsStore = new Map(); // id -> participant-owned line
const orderDeliveryPreferencesStore = new Map(); // order id -> private courier handoff data
const orderDeliveryProofsStore = new Map(); // order id -> private proof metadata
const orderFailedDeliveriesStore = new Map(); // order id -> failed-delivery outcome
const privateStorageObjects = new Map(); // bucket/path -> Buffer
const auditLogStore = new Map(); // id -> application audit event
const financialDocumentsStore = new Map(); // id -> immutable receipt / statement snapshot
let financialDocumentSequence = 1;
const notificationsStore = new Map(); // id -> durable notification
const notificationPreferencesStore = new Map(); // user id -> notification preferences
const consentRecordsStore = new Map(); // id -> append-only privacy consent proof
const dataSubjectRequestsStore = new Map(); // id -> privacy rights request
const systemAnnouncementsStore = new Map(); // id -> admin announcement
const pushSubscriptionsStore = new Map(); // id -> web push subscription
const notificationDeliveryLogStore = new Map(); // id -> web push delivery attempt
const configStore = new Map(); // key -> administrator-controlled JSON configuration
const systemSettingsStore = new Map(); // key -> validated application setting
const webhooksStore = new Map(); // id -> outbound webhook configuration
const webhookDeliveriesStore = new Map(); // id -> durable webhook delivery/retry record
const automationRulesStore = new Map([
  ['68000000-0000-4000-8000-000000000001', { id: '68000000-0000-4000-8000-000000000001', name: 'Auto-pause restaurant with low SLA', description: 'Pause a restaurant when SLA compliance stays below 50 percent.', enabled: true, trigger: 'restaurant.sla_check', conditions: [{ field: 'sla_compliance', operator: 'lt', value: 0.5 }], actions: [{ type: 'pause_restaurant', params: { reason: 'SLA compliance dropped below 50%' } }], max_executions_per_hour: 1, cooldown_minutes: 60, created_at: '2026-01-01T00:00:00.000Z' }],
  ['68000000-0000-4000-8000-000000000002', { id: '68000000-0000-4000-8000-000000000002', name: 'Alert on driver shortage', description: 'Notify administrators when fewer than two drivers are active.', enabled: true, trigger: 'metric.threshold', conditions: [{ field: 'active_drivers', operator: 'lt', value: 2 }], actions: [{ type: 'notify_admins', params: { title: 'Driver shortage', body: 'Active drivers < 2', severity: 'high' } }], max_executions_per_hour: 4, cooldown_minutes: 15, created_at: '2026-01-01T00:00:00.000Z' }],
  ['68000000-0000-4000-8000-000000000003', { id: '68000000-0000-4000-8000-000000000003', name: 'Detect unusual cancellation spike', description: 'Create an alert when cancellation volume spikes.', enabled: true, trigger: 'order.cancelled', conditions: [{ field: 'reason', operator: 'neq', value: 'customer_request' }], actions: [{ type: 'create_alert', params: { severity: 'high', message: 'Cancellation spike detected', source: 'orders' } }], max_executions_per_hour: 2, cooldown_minutes: 30, created_at: '2026-01-01T00:00:00.000Z' }],
  ['68000000-0000-4000-8000-000000000004', { id: '68000000-0000-4000-8000-000000000004', name: 'Critical incident escalation', description: 'Escalate high-value payment failures to operations.', enabled: true, trigger: 'order.created', conditions: [{ field: 'payment_status', operator: 'eq', value: 'failed' }], actions: [{ type: 'escalate', params: { to: 'oncall', reason: 'Critical payment failure' } }], max_executions_per_hour: 10, cooldown_minutes: 5, created_at: '2026-01-01T00:00:00.000Z' }],
  ['68000000-0000-4000-8000-000000000005', { id: '68000000-0000-4000-8000-000000000005', name: 'Daily operational report', description: 'Run the daily operations report workflow.', enabled: true, trigger: 'schedule', conditions: [], actions: [{ type: 'log', params: { message: 'Daily report generation triggered', level: 'info' } }], max_executions_per_hour: 1, cooldown_minutes: 60, created_at: '2026-01-01T00:00:00.000Z' }],
]);
const automationExecutionsStore = new Map();
const adminNotificationsStore = new Map();
const couponsStore = new Map(); // id -> coupon managed by administrators
const promotionsStore = new Map(); // id -> promotion managed by administrators

// In-memory store for Order Drafts (Phase 7F)
// Maps draft_id -> { id, customer_id, restaurant_id, draft, signature, expires_at, used, used_at, created_at }
// NOTE: This is a MOCK. In production, this is a Postgres table
// (see deploy/supabase/61-order-drafts.sql). The mock is a faithful
// in-memory simulation that supports the same CRUD operations.
const orderDraftsStore = new Map(); // draft_id -> draft record

// ============================================================================
// Phase 7G-A: Payment Audit & Recovery stores
// ============================================================================
// These stores back the production migrations 62-payment-audit.sql and
// 63-orders-payment-unique.sql. The mock faithfully simulates Postgres
// constraints: UNIQUE, INSERT-only rules, FK relationships.

// payment_audit_log — immutable, INSERT-only audit trail
// Records every state transition: intent_created, intent_succeeded, draft_burned,
// order_created, payment_received_draft_expired, error, etc.
const paymentAuditLogStore = []; // append-only array; entries are NEVER removed

// stripe_webhook_events — dedup by PRIMARY KEY (event_id)
// First-INSERT wins; subsequent INSERTs with same event_id return 409.
const stripeWebhookEventsStore = new Map(); // event_id -> record

// manual_recovery_queue — for CHANGE #1 (expired draft + successful payment)
// No order is created. Customer Support reviews and decides action.
const manualRecoveryQueueStore = new Map(); // id -> recovery record

// Phase 7G-B: payment_intent_history — append-only log of every Stripe event per PI
const paymentIntentHistoryStore = new Map(); // key: "<payment_intent_id>|<event_id>" -> record

// Phase 7G-B: payment_reconciliation_queue — for stuck states
const paymentReconciliationQueueStore = new Map(); // id -> record

// Phase 7G-C: payment_security_events — append-only audit (DB rules block UPDATE/DELETE)
const paymentSecurityEventsStore = []; // append-only array; entries NEVER removed

// Phase 7G-C: payment_rate_limit_buckets — persistent token buckets
const rateLimitBucketsStore = new Map(); // bucket_key -> { tokens, last_refill_at, ... }

// Phase 7G-C: admin_action_log — immutable admin action history
const adminActionLogStore = []; // append-only

// Phase 7G-C: payment_binding — strict PI ↔ draft ↔ customer binding
const paymentBindingStore = new Map(); // payment_intent_id -> binding record

// ============================================================================
// Phase 7G-D: Refunds, Partial Refunds & Payment Operations
// ============================================================================
// Mirrors migration 66-refunds.sql. Production-grade invariants enforced:
//   - stripe_refund_id UNIQUE (DB-level dedup vs Stripe)
//   - idempotency_key UNIQUE (DB-level dedup for client retries)
//   - status transitions validated
//   - refund_audit_log append-only (DB rules block UPDATE/DELETE)
//   - RLS lockdown: anon/authenticated have NO access (mock enforces this)
// ============================================================================

// payment_refunds — one row per refund operation
// Mirrors production columns: id, stripe_refund_id (UNIQUE), payment_intent_id,
// order_id, customer_id, requested_by, requested_amount_cents, refunded_amount_cents,
// currency, reason, internal_note, status, failure_reason, idempotency_key (UNIQUE),
// stripe_event_id, metadata, created_at, updated_at, completed_at
const paymentRefundsStore = new Map(); // id -> record

// refund_audit_log — append-only
const refundAuditLogStore = []; // append-only array; entries NEVER removed

// refund_operation_locks — per-order advisory lock
const refundOperationLocksStore = new Map(); // order_id -> lock

// PaymentIntents cache (for mock — in production, this is Stripe)
// In the mock, we simulate Stripe's idempotent PaymentIntent creation.
const paymentIntentsStore = new Map(); // payment_intent_id -> PaymentIntent record

// Used to enforce UNIQUE payment_intent_id on orders (mirroring migration 63).
const orderPaymentIntents = new Set(); // set of payment_intent_ids used by orders

// Phase 7G-E: Chaos injection state
// Used by test-chaos-payments.mjs to inject failures.
// Each chaos mode can be set/cleared via /chaos endpoint.
const chaosState = {
  // 503 on /rest/v1/payment_refunds (Supabase disconnect simulation)
  payment_refunds_503: false,
  // 503 on /rest/v1/refund_audit_log
  refund_audit_log_503: false,
  // 500 on /rest/v1/orders POST (Supabase transaction failure)
  orders_post_500: false,
  // Force Stripe to time out (callable from /rest/v1/chaos/stripe-timeout)
  stripe_timeout: false,
  // Force Stripe to return 500
  stripe_500: false,
  // Drop the connection (simulate network failure)
  drop_connection: false,
  // Slow down by N ms (simulate latency)
  slow_ms: 0,
};

// ============================================================================
// Phase 7G-A: Mock Stripe simulator (separate from mock-supabase)
// In production this is Stripe; in mock mode we simulate via a parallel table
// at /rest/v1/stripe_payment_intents so the route's behavior is identical.

// Singleton loyalty config (canonical earn/redeem rates)
const loyaltyConfigStore = new Map();
loyaltyConfigStore.set('singleton', {
  id: 'singleton',
  enabled: true,
  earn_rate_eur_per_point: 1,
  redeem_rate_points_per_eur: 100,
  min_redeem_points: 100,
  program_name: 'BlinkGo Rewards',
  terms_url: '/legal/loyalty',
});

// Persistent search analytics — survives server restart
// Schema mirrors production Postgres table:
//   search_analytics_events(id, type, query, result_id, result_type, result_count,
//                            filter_cuisine, filter_sort, session_id, created_at)
//   search_analytics_aggregates(query, event_type, count, last_seen, updated_at)
// Persistence: file-backed JSON store at /tmp/blinkgo-search-analytics.json
// In production, this would be a Postgres table; the API code is unchanged.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const ANALYTICS_STORE_PATH = '/tmp/blinkgo-search-analytics.json';

function loadAnalyticsStore() {
  if (existsSync(ANALYTICS_STORE_PATH)) {
    try {
      const data = JSON.parse(readFileSync(ANALYTICS_STORE_PATH, 'utf8'));
      return {
        events: Array.isArray(data.events) ? data.events : [],
        aggregates: new Map(Array.isArray(data.aggregates) ? data.aggregates : []),
        counter: Number.isInteger(data.counter) ? data.counter : 0,
      };
    } catch (e) {
      // fall through to empty
    }
  }
  return { events: [], aggregates: new Map(), counter: 0 };
}

function persistAnalyticsStore(events, aggregates, counter) {
  try {
    const data = {
      events: events.slice(-50000), // cap at 50K
      aggregates: Array.from(aggregates.entries()),
      counter,
    };
    writeFileSync(ANALYTICS_STORE_PATH, JSON.stringify(data));
  } catch (e) {
    // best-effort
  }
}

let { events: searchAnalyticsEvents, aggregates: searchAnalyticsAggregates, counter: searchAnalyticsEventCounter } = loadAnalyticsStore();
const MAX_SEARCH_ANALYTICS_EVENTS = 50000;

function trackSearchAnalyticsEvent(event) {
  const id = `evt_${Date.now()}_${++searchAnalyticsEventCounter}`;
  const created_at = new Date().toISOString();
  searchAnalyticsEvents.push({
    id,
    type: event.type,
    query: (event.query || '').toLowerCase().trim(),
    result_id: event.result_id || event.resultId || null,
    result_type: event.result_type || event.resultType || null,
    result_count: event.result_count ?? event.resultCount ?? null,
    filter_cuisine: event.filter_cuisine || event.filterCuisine || null,
    filter_sort: event.filter_sort || event.filterSort || null,
    session_id: event.session_id || event.sessionId || 'unknown',
    created_at,
  });
  // Trim old events
  if (searchAnalyticsEvents.length > MAX_SEARCH_ANALYTICS_EVENTS) {
    searchAnalyticsEvents.splice(0, searchAnalyticsEvents.length - MAX_SEARCH_ANALYTICS_EVENTS);
  }
  // Update aggregates
  const aggregateValue = (event.type === 'search_to_restaurant' || event.type === 'search_to_product')
    ? (event.result_id || event.resultId || event.query || '')
    : (event.query || '');
  const key = `${event.type}::${String(aggregateValue).toLowerCase().trim()}`;
  const existing = searchAnalyticsAggregates.get(key) || { count: 0, last_seen: created_at };
  existing.count++;
  existing.last_seen = created_at;
  searchAnalyticsAggregates.set(key, existing);
  // Persist to disk
  persistAnalyticsStore(searchAnalyticsEvents, searchAnalyticsAggregates, searchAnalyticsEventCounter);
}

function handleInsertSearchAnalytics(req, res) {
  return readBody(req).then((body) => {
    const events = Array.isArray(body) ? body : [body];
    for (const event of events) {
      if (event && event.type && event.query) {
        trackSearchAnalyticsEvent(event);
      }
    }
    return json(res, 201, { ok: true, count: events.length });
  });
}

function handleGetSearchAnalytics(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const type = url.searchParams.get('type') || 'popular-queries';

  // Use the analytics event type filter to read from the appropriate data
  // The API queries `/rest/v1/search_analytics_aggregates?event_type=eq.<type>`
  // so we need to support that filter.
  const eventType = url.searchParams.get('event_type');
  if (eventType) {
    const prefix = eventType.replace(/^eq\./, '').replace(/^"/, '').replace(/"$/, '') + '::';
    const items = Array.from(searchAnalyticsAggregates.entries())
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => {
        const query = k.replace(prefix, '');
        return {
          event_type: prefix.replace(/::$/, ''),
          query,
          count: v.count,
          last_seen: v.last_seen,
          updated_at: v.last_seen,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    return json(res, 200, items);
  }

  if (type === 'popular-queries') {
    const queries = Array.from(searchAnalyticsAggregates.entries())
      .filter(([k]) => k.startsWith('search_submitted::'))
      .map(([k, v]) => ({ query: k.replace('search_submitted::', ''), count: v.count, last_seen: v.last_seen }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    return json(res, 200, { queries });
  } else if (type === 'popular-restaurants') {
    const restaurants = Array.from(searchAnalyticsAggregates.entries())
      .filter(([k]) => k.startsWith('search_to_restaurant::'))
      .map(([k, v]) => ({ id: k.replace('search_to_restaurant::', ''), count: v.count, last_seen: v.last_seen }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    return json(res, 200, { restaurants });
  } else if (type === 'popular-products') {
    const products = Array.from(searchAnalyticsAggregates.entries())
      .filter(([k]) => k.startsWith('search_to_product::'))
      .map(([k, v]) => ({ id: k.replace('search_to_product::', ''), count: v.count, last_seen: v.last_seen }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    return json(res, 200, { products });
  } else if (type === 'zero-result-queries') {
    const queries = Array.from(searchAnalyticsAggregates.entries())
      .filter(([k]) => k.startsWith('search_zero_result::'))
      .map(([k, v]) => ({ query: k.replace('search_zero_result::', ''), count: v.count, last_seen: v.last_seen }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    return json(res, 200, { queries });
  } else if (type === 'stats') {
    // Read events table for stats
    const eventTypes = searchAnalyticsEvents.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {});
    return json(res, 200, eventTypes);
  }
  return badRequest(res, 'unknown_type');
}

function handleInsertOrder(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = records.map((r) => {
      const o = {
        id: r.id || randomUUID(),
        order_number: r.order_number || `BG-${Math.floor(Math.random() * 900000 + 100000)}`,
        customer_id: r.customer_id,
        restaurant_id: r.restaurant_id,
        status: r.status || 'pending',
        subtotal: r.subtotal || r.total || 0,
        total: r.total || 0,
        delivery_fee: r.delivery_fee || 0,
        tip: r.tip || 0,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString(),
        ...r,
      };
      ordersStore.set(o.id, o);
      return o;
    });
    return json(res, 201, inserted);
  }).catch((e) => badRequest(res, e.message));
}

function handleInsertOrderItems(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = records.map((r) => {
      const item = {
        id: r.id || randomUUID(),
        order_id: r.order_id,
        product_id: r.product_id,
        product_name: r.product_name || '',
        quantity: r.quantity || 1,
        price: r.price || 0,
        ...r,
      };
      orderItemsStore.set(item.id, item);
      return item;
    });
    return json(res, 201, inserted);
  }).catch((e) => badRequest(res, e.message));
}

// Patch orders GET to include joined data
function handleGetOrders(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const customerIdFilter = url.searchParams.get('customer_id');
  const restaurantIdFilter = url.searchParams.get('restaurant_id');
  const driverIdFilter = url.searchParams.get('driver_id');
  const paymentIntentFilter = url.searchParams.get('payment_intent_id');
  const idFilter = url.searchParams.get('id');
  let all = applyPostgrestFilters(Array.from(ordersStore.values()), req);
  // Filter by customer_id eq.XXX
  if (customerIdFilter) {
    const m = customerIdFilter.match(/^eq\.(.+)$/);
    if (m) all = all.filter((o) => o.customer_id === m[1]);
  }
  if (restaurantIdFilter) {
    const m = restaurantIdFilter.match(/^eq\.(.+)$/);
    if (m) all = all.filter((o) => o.restaurant_id === m[1]);
  }
  if (driverIdFilter) {
    const m = driverIdFilter.match(/^eq\.(.+)$/);
    if (m) all = all.filter((o) => o.driver_id === m[1]);
  }
  // Filter by payment_intent_id eq.XXX
  if (paymentIntentFilter) {
    const m = paymentIntentFilter.match(/^eq\.(.+)$/);
    if (m) all = all.filter((o) => o.payment_intent_id === m[1]);
  }
  // Filter by id eq.XXX (or in.XXX,YYY,ZZZ)
  if (idFilter) {
    if (idFilter.startsWith('in.')) {
      const ids = idFilter.slice(3).split(',');
      all = all.filter((o) => ids.includes(o.id));
    } else {
      const m = idFilter.match(/^eq\.(.+)$/);
      if (m) all = all.filter((o) => o.id === m[1]);
    }
  }
  // Sort by created_at desc
  all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  // Include restaurant and items
  const enriched = all.map((o) => {
    const items = Array.from(orderItemsStore.values()).filter((i) => i.order_id === o.id);
    const restaurant = SEED_RESTAURANTS.find((r) => r.id === o.restaurant_id);
    return {
      ...o,
      restaurants: restaurant ? {
        id: restaurant.id,
        name: restaurant.name,
        address: restaurant.address ?? null,
        phone: restaurant.phone ?? null,
        latitude: restaurant.latitude ?? restaurant.lat ?? null,
        longitude: restaurant.longitude ?? restaurant.lng ?? null,
        cover_url: restaurant.cover_image_url,
        type: restaurant.cuisines?.[0],
      } : null,
      // PostgREST exposes this alias for ownership queries such as
      // `restaurant:restaurants!orders_restaurant_id_fkey(owner_id)`.
      // Keeping it separate from the richer `restaurants` embed mirrors the
      // real Supabase response used by assertCanReadOrder().
      restaurant: restaurant ? { owner_id: restaurant.owner_id ?? null } : null,
      customer: Object.values(ACCOUNTS).find((account) => account.id === o.customer_id) ?? null,
      driver: Object.values(ACCOUNTS).find((account) => account.id === o.driver_id) ?? null,
      items,
    };
  });
  // PostgREST returns a plain object for `.single()` queries. The Supabase
  // client communicates that via the vendor object media type; mirroring it
  // here keeps local development behavior aligned with production.
  if ((req.headers.accept || '').includes('application/vnd.pgrst.object+json')) {
    if (enriched.length !== 1) {
      return json(res, 406, {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
        details: `The result contains ${enriched.length} rows`,
      });
    }
    return json(res, 200, enriched[0]);
  }
  return json(res, 200, enriched);
}

function handleUpdateOrders(req, res) {
  return readBody(req).then((body) => {
    const rows = applyPostgrestFilters(Array.from(ordersStore.values()), req);
    const updated = rows.map((row) => {
      const next = { ...row, ...body, updated_at: body.updated_at || new Date().toISOString() };
      ordersStore.set(row.id, next);
      return next;
    });
    if ((req.headers.accept || '').includes('application/vnd.pgrst.object+json')) {
      return postgrestResult(req, res, updated);
    }
    const prefer = String(req.headers.prefer || '');
    return prefer.includes('return=representation') ? json(res, 200, updated) : json(res, 204, null);
  }).catch((error) => badRequest(res, error.message));
}

function handleGetLoyaltyConfig(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const idFilter = url.searchParams.get('id');
  if (idFilter) {
    const m = idFilter.match(/^eq\.(.+)$/);
    if (m) {
      const row = loyaltyConfigStore.get(m[1]);
      return row ? json(res, 200, [row]) : json(res, 200, []);
    }
  }
  return json(res, 200, Array.from(loyaltyConfigStore.values()));
}


const SEED_RESTAURANTS = [
  {
    id: '00000000-0000-0000-0000-000000000020',
    type: 'restaurant',
    owner_id: '00000000-0000-0000-0000-000000000020',
    name: 'Trattoria Bellissimo',
    address: 'Flach-Fengler-Straße 120, 50389 Wesseling',
    phone: '+49 2236 555 020',
    description: 'Authentische italienische Küche — Holzofenpizza, frische Pasta, sonnengereifte Tomaten.',
    cuisines: ['Italian', 'Pizza', 'Pasta', 'Italienisch', 'إيطالي'],
    rating: 4.7, total_reviews: 342,
    delivery_time_min: 25, delivery_fee: 0, minimum_order: 15,
    is_active: true,
    cover_image_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200',
    logo_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
    lat: 50.9375, lng: 6.9603, // Cologne city center
    delivery_radius_km: 8,
    is_busy: false,
    is_paused: false,
    is_hidden: false,
    opening_hours: {
      mon: { open: '11:00', close: '23:00' },
      tue: { open: '11:00', close: '23:00' },
      wed: { open: '11:00', close: '23:00' },
      thu: { open: '11:00', close: '23:00' },
      fri: { open: '11:00', close: '00:00' },
      sat: { open: '12:00', close: '00:00' },
      sun: { open: '12:00', close: '22:00' },
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000021',
    type: 'restaurant',
    name: 'Burger Haus 24',
    description: 'Hand-pressed smash-burger, dicke Fries, echter Geschmack.',
    cuisines: ['American', 'Burger', 'Amerikanisch', 'أمريكي'],
    rating: 4.5, total_reviews: 218,
    delivery_time_min: 20, delivery_fee: 2.99, minimum_order: 12,
    is_active: true,
    cover_image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200',
    logo_url: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=200',
    lat: 50.9410, lng: 6.9580,
    delivery_radius_km: 6,
    is_busy: false,
    is_paused: false,
    is_hidden: false,
    opening_hours: {
      mon: { open: '11:00', close: '23:00' },
      tue: { open: '11:00', close: '23:00' },
      wed: { open: '11:00', close: '23:00' },
      thu: { open: '11:00', close: '00:00' },
      fri: { open: '11:00', close: '02:00' },
      sat: { open: '12:00', close: '02:00' },
      sun: { open: '12:00', close: '23:00' },
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000022',
    type: 'restaurant',
    owner_id: '00000000-0000-0000-0000-000000000020',
    name: 'Sakura Sushi',
    description: 'Frische Sushi-Rollen, Sashimi und warme Bowls vom Meisterkoch.',
    address: 'Bonner Straße 18, 50389 Wesseling',
    phone: '+49 2236 555 018',
    cuisines: ['Japanese', 'Sushi', 'Japanisch', 'ياباني'],
    rating: 4.8, total_reviews: 456, review_count: 456,
    delivery_time_min: 30, delivery_fee: 0, minimum_order: 20,
    is_active: true,
    is_verified: true,
    cover_image_url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=1200',
    logo_url: 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=200',
    lat: 50.9320, lng: 6.9650,
    delivery_radius_km: 10,
    is_busy: true, // currently busy
    is_paused: false,
    is_hidden: false,
    opening_hours: {
      mon: { open: '12:00', close: '22:30' },
      tue: { open: '12:00', close: '22:30' },
      wed: { open: '12:00', close: '22:30' },
      thu: { open: '12:00', close: '23:00' },
      fri: { open: '12:00', close: '23:30' },
      sat: { open: '13:00', close: '23:30' },
      sun: { open: '13:00', close: '22:00' },
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000023',
    type: 'restaurant',
    name: 'Café Sonnenschein',
    description: 'Frühstück, Kaffee, hausgemachte Kuchen — den ganzen Tag.',
    cuisines: ['Café', 'Breakfast', 'Desserts', 'Frühstück', 'فطور'],
    rating: 4.6, total_reviews: 187,
    delivery_time_min: 15, delivery_fee: 1.50, minimum_order: 8,
    is_active: true,
    cover_image_url: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=1200',
    logo_url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=200',
    lat: 50.9380, lng: 6.9550,
    delivery_radius_km: 5,
    is_busy: false,
    is_paused: false,
    is_hidden: false,
    opening_hours: {
      mon: { open: '08:00', close: '20:00' },
      tue: { open: '08:00', close: '20:00' },
      wed: { open: '08:00', close: '20:00' },
      thu: { open: '08:00', close: '20:00' },
      fri: { open: '08:00', close: '22:00' },
      sat: { open: '09:00', close: '22:00' },
      sun: { open: '09:00', close: '20:00' },
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000024',
    type: 'market',
    owner_id: '00000000-0000-0000-0000-000000000024',
    name: 'BlinkMart Wesseling',
    description: 'Lebensmittel, Haushalt, Pflege und ausgewählte Alltagsprodukte.',
    address: 'Flach-Fengler-Straße 48, 50389 Wesseling',
    phone: '+49 2236 555 024',
    cuisines: ['Market', 'Groceries', 'Household'],
    cuisine: ['Market', 'Groceries', 'Household'],
    rating: 4.8,
    total_reviews: 214,
    review_count: 214,
    delivery_time_min: 18,
    delivery_fee: 1.99,
    minimum_order: 12,
    min_order_amount: 12,
    is_active: true,
    is_verified: true,
    cover_image_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200',
    logo_url: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=200',
    lat: 50.8207,
    lng: 6.9786,
    latitude: 50.8207,
    longitude: 6.9786,
    delivery_radius_km: 12,
    is_busy: false,
    is_paused: false,
    is_hidden: false,
    opening_hours: {
      mon: { open: '08:00', close: '21:00' }, tue: { open: '08:00', close: '21:00' },
      wed: { open: '08:00', close: '21:00' }, thu: { open: '08:00', close: '21:00' },
      fri: { open: '08:00', close: '21:00' }, sat: { open: '08:00', close: '21:00' },
      sun: { open: '10:00', close: '18:00' },
    },
  },
];

const SEED_PRODUCTS = [
  // Bellissimo
  { id: 'a1111111-0000-0000-0000-000000000001', name: 'Margherita Pizza', description: 'San-Marzano-Tomaten, fior di latte, frisches Basilikum.', price: 12.50, discount_price: 9.90, category: 'Pizza', is_featured: true, is_vegetarian: true, is_available: true, prep_time_min: 15, calories: 720, allergens: ['gluten', 'dairy'], restaurant_id: '00000000-0000-0000-0000-000000000020', image_urls: ['https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600'], rating: 4.8, sold_count: 234, modifiers: [
    { id: 'size', name: 'Size', type: 'radio', required: true, min_select: 1, max_select: 1, options: [
      { id: 's', name: 'Small (26cm)', price_delta: 0 },
      { id: 'm', name: 'Medium (32cm)', price_delta: 3.0 },
      { id: 'l', name: 'Large (40cm)', price_delta: 6.0 },
    ]},
    { id: 'extras', name: 'Extras', type: 'checkbox', required: false, min_select: 0, max_select: 5, options: [
      { id: 'extra-cheese', name: 'Extra cheese', price_delta: 1.5 },
      { id: 'olives', name: 'Olives', price_delta: 1.0 },
      { id: 'mushrooms', name: 'Mushrooms', price_delta: 1.5 },
      { id: 'pepperoni', name: 'Pepperoni', price_delta: 2.0 },
    ]},
    { id: 'crust', name: 'Crust', type: 'radio', required: true, min_select: 1, max_select: 1, options: [
      { id: 'classic', name: 'Classic', price_delta: 0 },
      { id: 'thin', name: 'Thin crust', price_delta: 0 },
      { id: 'gluten-free', name: 'Gluten-free', price_delta: 2.5 },
    ]},
  ]},
  { id: 'a1111111-0000-0000-0000-000000000002', name: 'Spaghetti Carbonara', description: 'Hausgemachte Pasta, Guanciale, Pecorino Romano, schwarzer Pfeffer.', price: 14.00, category: 'Pasta', is_featured: true, is_available: true, prep_time_min: 18, calories: 680, allergens: ['gluten', 'dairy', 'egg'], restaurant_id: '00000000-0000-0000-0000-000000000020', image_urls: ['https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600'], rating: 4.7, sold_count: 189, modifiers: [
    { id: 'portion', name: 'Portion', type: 'radio', required: true, min_select: 1, max_select: 1, options: [
      { id: 'small', name: 'Small', price_delta: -2.0 },
      { id: 'regular', name: 'Regular', price_delta: 0 },
      { id: 'family', name: 'Family (4 people)', price_delta: 12.0 },
    ]},
    { id: 'add-truffle', name: 'Add truffle', type: 'radio', required: false, min_select: 0, max_select: 1, options: [
      { id: 'none', name: 'No truffle', price_delta: 0 },
      { id: 'truffle', name: 'Black truffle', price_delta: 4.0 },
    ]},
  ]},
  { id: 'a1111111-0000-0000-0000-000000000003', name: 'Tiramisu', description: 'Hausgemachtes Dessert mit Mascarpone, Espresso, Kakao.', price: 7.50, category: 'Desserts', is_vegetarian: true, is_available: true, prep_time_min: 5, calories: 380, allergens: ['dairy', 'egg', 'gluten'], restaurant_id: '00000000-0000-0000-0000-000000000020', image_urls: ['https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600'], rating: 4.9, sold_count: 312 },
  { id: 'a1111111-0000-0000-0000-000000000004', name: 'Caprese Salat', description: 'Büffelmozzarella, Strauchtomaten, frisches Basilikum, Olivenöl.', price: 9.00, category: 'Salate', is_vegetarian: true, is_gluten_free: true, is_available: true, prep_time_min: 8, calories: 320, allergens: ['dairy'], restaurant_id: '00000000-0000-0000-0000-000000000020', image_urls: ['https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?w=600'], rating: 4.5, sold_count: 98 },
  { id: 'a1111111-0000-0000-0000-000000000005', name: 'Tartufo Pizza', description: 'Trüffelcreme, Pilze, Mozzarella, Rucola.', price: 16.50, discount_price: 13.50, category: 'Pizza', is_vegetarian: true, is_available: true, prep_time_min: 18, calories: 850, allergens: ['gluten', 'dairy'], restaurant_id: '00000000-0000-0000-0000-000000000020', image_urls: ['https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600'], rating: 4.8, sold_count: 156, modifiers: [
    { id: 'size', name: 'Size', type: 'radio', required: true, min_select: 1, max_select: 1, options: [
      { id: 'm', name: 'Medium (32cm)', price_delta: 0 },
      { id: 'l', name: 'Large (40cm)', price_delta: 4.0 },
    ]},
  ]},
  // Burger Haus
  { id: 'a1111111-0000-0000-0000-000000000010', name: 'Classic Smash Burger', description: 'Double smash patty, amerikanischer Käse, Ketchup, Senf, Pickles.', price: 11.90, category: 'Burger', is_featured: true, is_available: true, prep_time_min: 12, calories: 620, allergens: ['gluten', 'dairy'], restaurant_id: '00000000-0000-0000-0000-000000000021', image_urls: ['https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600'], rating: 4.6, sold_count: 278, modifiers: [
    { id: 'patty', name: 'Patty cooking', type: 'radio', required: true, min_select: 1, max_select: 1, options: [
      { id: 'medium', name: 'Medium', price_delta: 0 },
      { id: 'well', name: 'Well done', price_delta: 0 },
      { id: 'rare', name: 'Rare', price_delta: 0 },
    ]},
    { id: 'sides', name: 'Side', type: 'radio', required: false, min_select: 0, max_select: 1, options: [
      { id: 'none', name: 'No side', price_delta: 0 },
      { id: 'fries', name: 'Fries', price_delta: 0 },
      { id: 'sweet-fries', name: 'Sweet potato fries', price_delta: 1.5 },
    ]},
    { id: 'extras', name: 'Add extras', type: 'checkbox', required: false, min_select: 0, max_select: 4, options: [
      { id: 'bacon', name: 'Bacon', price_delta: 2.0 },
      { id: 'cheese', name: 'Extra cheese', price_delta: 1.5 },
      { id: 'jalapenos', name: 'Jalapeños', price_delta: 0.5 },
      { id: 'avocado', name: 'Avocado', price_delta: 2.0 },
    ]},
  ]},
  { id: 'a1111111-0000-0000-0000-000000000011', name: 'BBQ Bacon Burger', description: 'Smashed beef, crispy bacon, cheddar, BBQ-Sauce, Krautsalat.', price: 13.90, discount_price: 11.90, category: 'Burger', is_featured: true, is_available: true, prep_time_min: 14, calories: 780, allergens: ['gluten', 'dairy'], restaurant_id: '00000000-0000-0000-0000-000000000021', image_urls: ['https://images.unsplash.com/photo-1550317138-10000687a72b?w=600'], rating: 4.7, sold_count: 195, modifiers: [
    { id: 'patty', name: 'Patty cooking', type: 'radio', required: true, min_select: 1, max_select: 1, options: [
      { id: 'medium', name: 'Medium', price_delta: 0 },
      { id: 'well', name: 'Well done', price_delta: 0 },
    ]},
  ]},
  { id: 'a1111111-0000-0000-0000-000000000012', name: 'Truffle Fries', description: 'Knusprige Pommes mit Trüffelöl und Parmesan.', price: 6.50, category: 'Sides', is_vegetarian: true, is_available: true, prep_time_min: 8, calories: 420, allergens: ['dairy'], restaurant_id: '00000000-0000-0000-0000-000000000021', image_urls: ['https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600'], rating: 4.5, sold_count: 142, modifiers: [
    { id: 'size', name: 'Size', type: 'radio', required: true, min_select: 1, max_select: 1, options: [
      { id: 'small', name: 'Small', price_delta: 0 },
      { id: 'large', name: 'Large', price_delta: 2.5 },
    ]},
  ]},
  // Sakura
  { id: 'a1111111-0000-0000-0000-000000000020', name: 'Dragon Roll', description: 'Aal, Avocado, Gurke, Sesam, Sojasauce.', price: 18.50, category: 'Sushi', is_featured: true, is_available: true, prep_time_min: 20, calories: 480, allergens: ['fish', 'soy', 'sesame'], restaurant_id: '00000000-0000-0000-0000-000000000022', image_urls: ['https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600'], rating: 4.9, sold_count: 267, modifiers: [
    { id: 'pieces', name: 'Pieces', type: 'radio', required: true, min_select: 1, max_select: 1, options: [
      { id: '8', name: '8 pieces', price_delta: 0 },
      { id: '12', name: '12 pieces', price_delta: 4.0 },
      { id: '16', name: '16 pieces', price_delta: 7.5 },
    ]},
    { id: 'extra-sauce', name: 'Extra sauce', type: 'checkbox', required: false, min_select: 0, max_select: 3, options: [
      { id: 'soy', name: 'Soy sauce', price_delta: 0 },
      { id: 'spicy-mayo', name: 'Spicy mayo', price_delta: 0.5 },
      { id: 'teriyaki', name: 'Teriyaki', price_delta: 0.5 },
    ]},
  ]},
  { id: 'a1111111-0000-0000-0000-000000000021', name: 'Salmon Nigiri Set', description: '6 Stück: Wildlachs-Nigiri, eingelegter Ingwer, Wasabi.', price: 16.00, category: 'Sushi', is_featured: true, is_available: true, prep_time_min: 15, calories: 380, allergens: ['fish', 'soy'], restaurant_id: '00000000-0000-0000-0000-000000000022', image_urls: ['https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=600'], rating: 4.8, sold_count: 198 },
  // Café
  { id: 'a1111111-0000-0000-0000-000000000030', name: 'Avocado Toast', description: 'Geröstetes Sauerteigbrot, Avocado, Chili, Limette, pochiertes Ei.', price: 9.50, category: 'Breakfast', is_featured: true, is_vegetarian: true, is_available: true, prep_time_min: 10, calories: 410, allergens: ['gluten', 'egg'], restaurant_id: '00000000-0000-0000-0000-000000000023', image_urls: ['https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600'], rating: 4.6, sold_count: 167 },
  { id: 'a1111111-0000-0000-0000-000000000031', name: 'Pancakes Stack', description: 'Fluffige Buttermilch-Pancakes, Ahornsirup, frische Beeren.', price: 8.90, category: 'Breakfast', is_vegetarian: true, is_available: true, prep_time_min: 12, calories: 520, allergens: ['gluten', 'dairy', 'egg'], restaurant_id: '00000000-0000-0000-0000-000000000023', image_urls: ['https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600'], rating: 4.7, sold_count: 134 },
  // BlinkMart retail catalog (local demo inventory; production reads Supabase)
  { id: 'a1111111-0000-0000-0000-000000000040', name: 'Bio Obstkorb', description: 'Saisonales Bio-Obst, sorgfältig zusammengestellt.', price: 18.90, discount_price: 15.90, category: 'Lebensmittel', is_featured: true, is_available: true, prep_time_min: 6, restaurant_id: '00000000-0000-0000-0000-000000000024', image_urls: ['https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600'], rating: 4.8, sold_count: 182 },
  { id: 'a1111111-0000-0000-0000-000000000041', name: 'Haushalts-Set', description: 'Praktisches Set für Küche und Haushalt.', price: 24.90, category: 'Haushalt', is_featured: true, is_available: true, prep_time_min: 5, restaurant_id: '00000000-0000-0000-0000-000000000024', image_urls: ['https://images.unsplash.com/photo-1581783898377-1c85bf937427?w=600'], rating: 4.7, sold_count: 126 },
  { id: 'a1111111-0000-0000-0000-000000000042', name: 'USB-C Schnellladegerät', description: 'Kompaktes 30-Watt-Ladegerät mit USB-C-Anschluss.', price: 19.90, discount_price: 14.90, category: 'Elektronik', is_featured: true, is_available: true, prep_time_min: 4, restaurant_id: '00000000-0000-0000-0000-000000000024', image_urls: ['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600'], rating: 4.6, sold_count: 238 },
  { id: 'a1111111-0000-0000-0000-000000000043', name: 'Kabellose Kopfhörer', description: 'Leichte Bluetooth-Kopfhörer mit Ladebox.', price: 39.90, category: 'Elektronik', is_available: true, prep_time_min: 4, restaurant_id: '00000000-0000-0000-0000-000000000024', image_urls: ['https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=600'], rating: 4.5, sold_count: 96 },
  { id: 'a1111111-0000-0000-0000-000000000044', name: 'Pflege-Set Sensitive', description: 'Sanfte Pflegeprodukte für den täglichen Gebrauch.', price: 21.50, category: 'Pflege', is_available: true, prep_time_min: 5, restaurant_id: '00000000-0000-0000-0000-000000000024', image_urls: ['https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600'], rating: 4.7, sold_count: 83 },
  { id: 'a1111111-0000-0000-0000-000000000045', name: 'Vorratsdosen 6er Set', description: 'Stapelbare, BPA-freie Dosen für trockene Lebensmittel.', price: 27.90, category: 'Wohnen', is_available: true, prep_time_min: 5, restaurant_id: '00000000-0000-0000-0000-000000000024', image_urls: ['https://images.unsplash.com/photo-1584302179602-e4c3d3fd629d?w=600'], rating: 4.6, sold_count: 74 },
];

// ── Token helpers ──
// We craft a minimal JWT-shaped string (not actually signed — the
// BlinkGo code only uses it as an opaque bearer; the cookie layer
// decodes but does NOT cryptographically verify it).
function authAppMetadata(account) {
  return {
    provider: 'email',
    providers: ['email'],
    app_role: account?.role ?? 'customer',
    permissions: account?.permissions ?? [],
  };
}

function makeAccessToken(userId) {
  const account = [...Object.values(ACCOUNTS), ...registeredUsers.values()].find((candidate) => candidate.id === userId);
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: account?.email,
    app_metadata: authAppMetadata(account),
    user_metadata: {
      name: account?.name,
    },
  })).toString('base64url');
  return `${header}.${payload}.mock-signature`;
}

function makeRefreshToken() {
  return randomUUID().replace(/-/g, '');
}

function userIdFromBearer(authHeader) {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  const token = m[1];
  const session = sessions.get(token);
  return session?.userId || null;
}

// ── Route handlers ──

async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve({});
      }
    });
  });
}

async function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  });
  res.end(JSON.stringify(body));
}

function notFound(res, msg = 'Not Found') {
  return json(res, 404, { msg, code: 'not_found' });
}

function badRequest(res, msg, code = 'bad_request') {
  return json(res, 400, { msg, code });
}

// POST /auth/v1/token?grant_type=password
async function handlePasswordGrant(req, res) {
  const body = await readBody(req);
  const { email, password } = body;

  if (!email || !password) {
    return badRequest(res, 'Missing email or password', 'invalid_request');
  }

  const normalizedEmail = email.toLowerCase();
  const account = ACCOUNTS[normalizedEmail] ?? registeredUsers.get(normalizedEmail);
  if (!account || account.password !== password) {
    return json(res, 400, {
      msg: 'Invalid login credentials',
      code: 'invalid_grant',
      error: 'invalid_grant',
      error_description: 'Invalid login credentials',
    });
  }

  const accessToken = makeAccessToken(account.id);
  const refreshToken = makeRefreshToken();
  const expiresIn = 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  sessions.set(accessToken, {
    userId: account.id,
    refreshToken,
    expiresAt: expiresAt * 1000,
  });

  return json(res, 200, {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: expiresAt,
    user: {
      id: account.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: account.email,
      email_confirmed_at: '2025-01-01T00:00:00.000Z',
      phone: '',
      confirmed_at: '2025-01-01T00:00:00.000Z',
      last_sign_in_at: new Date().toISOString(),
      app_metadata: authAppMetadata(account),
      user_metadata: { name: account.name },
      identities: [],
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: new Date().toISOString(),
    },
  });
}

// GET /auth/v1/user
function handleGetUser(req, res) {
  const userId = userIdFromBearer(req.headers.authorization);
  if (!userId) {
    return json(res, 401, { msg: 'invalid_token', code: 'bad_jwt' });
  }
  const account = [...Object.values(ACCOUNTS), ...registeredUsers.values()].find((a) => a.id === userId);
  if (!account) return notFound(res, 'User not found');
  return json(res, 200, {
    id: account.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: account.email,
    email_confirmed_at: '2025-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2025-01-01T00:00:00.000Z',
    last_sign_in_at: new Date().toISOString(),
    app_metadata: authAppMetadata(account),
    user_metadata: { name: account.name },
    identities: [],
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  });
}

// POST /auth/v1/logout
function handleLogout(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const m = authHeader.match(/^Bearer\s+(.+)$/);
    if (m) sessions.delete(m[1]);
  }
  return json(res, 204, {});
}

// Mirror GoTrue's acknowledgement when an existing user requests a magic
// link or verification email. The local mock never mints or exposes a usable
// token here; it only models the provider boundary used by application tests.
async function handleOtpRequest(req, res) {
  const body = await readBody(req);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return badRequest(res, 'Missing email', 'invalid_request');

  const account = ACCOUNTS[email] ?? registeredUsers.get(email);
  if (!account && body?.create_user === false) {
    // Preserve the enumeration-safe response used by hosted GoTrue.
    return json(res, 200, {});
  }
  return json(res, 200, {});
}

// POST /auth/v1/token?grant_type=refresh_token
async function handleRefreshToken(req, res) {
  const body = await readBody(req);
  const { refresh_token } = body;
  if (!refresh_token) return badRequest(res, 'Missing refresh_token');

  // Find the session that issued this refresh token
  for (const [accessToken, session] of sessions.entries()) {
    if (session.refreshToken === refresh_token) {
      const account = [...Object.values(ACCOUNTS), ...registeredUsers.values()].find((a) => a.id === session.userId);
      if (!account) return notFound(res, 'User not found');
      const newAccess = makeAccessToken(account.id);
      const newRefresh = makeRefreshToken();
      sessions.delete(accessToken);
      sessions.set(newAccess, {
        userId: account.id,
        refreshToken: newRefresh,
        expiresAt: (Math.floor(Date.now() / 1000) + 3600) * 1000,
      });
      return json(res, 200, {
        access_token: newAccess,
        refresh_token: newRefresh,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: account.id,
          email: account.email,
          app_metadata: authAppMetadata(account),
          user_metadata: { name: account.name },
        },
      });
    }
  }
  return json(res, 400, { msg: 'Invalid refresh token', code: 'invalid_grant' });
}

// GET /rest/v1/users?id=eq.<uuid>  or  ?email=eq.<email>
async function handleGetUserProfile(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const idFilter = url.searchParams.get('id');
  const emailFilter = url.searchParams.get('email');

  // .single() in supabase-js sets Accept: application/vnd.pgrst.object+json
  const accept = req.headers.accept || '';
  const isSingle = accept.includes('application/vnd.pgrst.object+json');

  // Supabase uses the `id=eq.<uuid>` syntax for equality
  const eqMatch = (filter) => {
    if (!filter) return null;
    const m = filter.match(/^eq\.(.+)$/);
    return m ? m[1] : filter;
  };

  const idValue = eqMatch(idFilter);
  const emailValue = eqMatch(emailFilter);

  const allAccounts = [...Object.values(ACCOUNTS), ...registeredUsers.values()];
  const toRow = (account) => ({
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    restaurant_id: account.restaurant_id ?? null,
    is_active: account.is_active,
    is_verified: account.is_verified,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  });

  let result = null;
  for (const account of allAccounts) {
    if (idValue && account.id === idValue) { result = account; break; }
    if (emailValue && account.email.toLowerCase() === emailValue.toLowerCase()) { result = account; break; }
  }

  const row = result ? toRow(result) : null;

  if (!idValue && !emailValue && !isSingle) {
    let rows = applyPostgrestFilters(allAccounts.map(toRow), req);
    const range = String(req.headers.range || '').match(/^(\d+)-(\d+)$/);
    if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
    return postgrestResult(req, res, rows);
  }

  if (isSingle) {
    if (!row) {
      // PostgREST returns 406 + "No rows found" when .single() finds 0
      res.writeHead(406, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'No rows found', code: 'PGRST116' }));
    }
    return json(res, 200, row);
  }

  return json(res, 200, row ? [row] : []);
}

// POST /rest/v1/users  (insert new profile)
async function handleInsertUser(req, res) {
  const body = await readBody(req);
  // body is an array when using .insert([{...}]) or single object
  const records = Array.isArray(body) ? body : [body];
  const inserted = records.map((r) => {
    // Find the existing account by id, otherwise create
    let account = null;
    for (const a of [...Object.values(ACCOUNTS), ...registeredUsers.values()]) {
      if (a.id === r.id) { account = a; break; }
    }
    if (!account) {
      account = {
        id: r.id,
        email: r.email,
        name: r.name || '',
        role: r.role || 'customer',
        is_active: r.is_active !== false,
        is_verified: r.is_verified === true,
        password: null,
      };
      if (r.email) registeredUsers.set(r.email.toLowerCase(), account);
    } else {
      // Update fields
      if (r.email) account.email = r.email.toLowerCase();
      if (r.name) account.name = r.name;
      if (r.role) account.role = r.role;
      if (typeof r.is_active === 'boolean') account.is_active = r.is_active;
      if (typeof r.is_verified === 'boolean') account.is_verified = r.is_verified;
    }
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      is_active: account.is_active,
      is_verified: account.is_verified,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: new Date().toISOString(),
    };
  });
  return postgrestResult(req, res, inserted, 201);
}

// PATCH /rest/v1/users?id=eq.<uuid>
async function handleUpdateUser(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const idFilter = url.searchParams.get('id');
  const eqMatch = (filter) => {
    if (!filter) return null;
    const m = filter.match(/^eq\.(.+)$/);
    return m ? m[1] : filter;
  };
  const idValue = eqMatch(idFilter);
  const inMatch = idFilter?.match(/^in\.\((.*)\)$/);
  const requestedIds = inMatch
    ? new Set(inMatch[1].split(',').map((id) => decodeURIComponent(id.replace(/^"|"$/g, ''))))
    : idValue ? new Set([idValue]) : null;
  if (!requestedIds) return badRequest(res, 'Missing id filter');
  const body = await readBody(req);
  const updated = [];
  for (const a of [...Object.values(ACCOUNTS), ...registeredUsers.values()]) {
    if (requestedIds.has(a.id)) {
      if (body.name) a.name = body.name;
      if (body.role) a.role = body.role;
      if (typeof body.is_active === 'boolean') a.is_active = body.is_active;
      if (typeof body.is_verified === 'boolean') a.is_verified = body.is_verified;
      updated.push({
        id: a.id, email: a.email, name: a.name, role: a.role,
        is_active: a.is_active, is_verified: a.is_verified,
        created_at: '2025-01-01T00:00:00.000Z', updated_at: new Date().toISOString(),
      });
    }
  }
  return postgrestResult(req, res, updated);
}

const deliveryZones = [
  {
    id: '00000000-0000-0000-0000-000000000701',
    name: 'Wesseling Zentrum',
    description: 'Kerngebiet Wesseling mit Standardlieferung',
    polygon: [], center_lat: 50.8203, center_lng: 6.9785, radius_km: 5,
    delivery_fee: 2.99, min_order_amount: 10, priority: 20, is_active: true,
    created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000702',
    name: 'Brühl Süd',
    description: 'Erweiterungsgebiet südlich von Wesseling',
    polygon: [], center_lat: 50.8057, center_lng: 6.8879, radius_km: 4.5,
    delivery_fee: 4.49, min_order_amount: 15, priority: 10, is_active: false,
    created_at: '2025-01-02T00:00:00.000Z', updated_at: '2025-01-02T00:00:00.000Z',
  },
];

// /rest/v1/delivery_zones?... — local acceptance fixture with CRUD parity.
async function handleZones(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET') {
    let rows = [...deliveryZones];
    const active = url.searchParams.get('is_active');
    if (active === 'eq.true') rows = rows.filter((zone) => zone.is_active);
    if (active === 'eq.false') rows = rows.filter((zone) => !zone.is_active);
    const idFilter = url.searchParams.get('id');
    if (idFilter?.startsWith('eq.')) rows = rows.filter((zone) => zone.id === idFilter.slice(3));
    return json(res, 200, rows);
  }
  if (req.method === 'POST') {
    const incoming = await readBody(req);
    const body = Array.isArray(incoming) ? (incoming[0] || {}) : incoming;
    const zone = { ...body, id: `00000000-0000-0000-0000-${String(703 + deliveryZones.length).padStart(12, '0')}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    deliveryZones.push(zone);
    return postgrestResult(req, res, [zone], 201);
  }
  if (req.method === 'PATCH') {
    const idFilter = url.searchParams.get('id');
    const id = idFilter?.startsWith('eq.') ? idFilter.slice(3) : null;
    const body = await readBody(req);
    const index = deliveryZones.findIndex((zone) => zone.id === id);
    if (index === -1) return postgrestResult(req, res, []);
    deliveryZones[index] = { ...deliveryZones[index], ...body, updated_at: new Date().toISOString() };
    return postgrestResult(req, res, [deliveryZones[index]]);
  }
  return json(res, 405, { message: 'Method not allowed' });
}

// ─────────────────────────────────────────────────────────────────
// PostgREST filter helper
// Format: ?col=op.value  (e.g. ?name=ilike.%pizza%)
// Plus: ?or=(a.op.v,b.op.v), ?and=(a.op.v,b.op.v)
// Plus: order, limit, offset, range
// ─────────────────────────────────────────────────────────────────
function applyPostgrestFilters(rows, req) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const params = url.searchParams;

  const KNOWN_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'like', 'ilike', 'contains', 'cs', 'cd'];

  // Parse a single filter expression like "name.ilike.%pizza%"
  // (used for "or" / "and" sub-filters)
  function parseFilterExpr(expr) {
    // expr looks like "col.op.value" — find the FIRST dot for the operator
    const dot1 = expr.indexOf('.');
    if (dot1 === -1) return null;
    const col = expr.slice(0, dot1);
    const rest = expr.slice(dot1 + 1);
    const dot2 = rest.indexOf('.');
    if (dot2 === -1) return null;
    const op = rest.slice(0, dot2);
    const value = rest.slice(dot2 + 1);
    if (!KNOWN_OPS.includes(op)) return null;
    return { col, op, value };
  }

  // Build flat filter list
  const filters = [];
  for (const [key, value] of params.entries()) {
    if (['or', 'and', 'order', 'limit', 'offset', 'range', 'select'].includes(key)) continue;
    // key = "col", value = "op.actual_value"
    // URLSearchParams already decodes %xx sequences, so spaces become ' '.
    const dotIdx = value.indexOf('.');
    if (dotIdx === -1) continue;
    const op = value.slice(0, dotIdx);
    const actualValue = value.slice(dotIdx + 1);
    if (!KNOWN_OPS.includes(op)) continue;
    filters.push({ col: key, op, value: actualValue });
  }

  // OR group from ?or=(...)
  const orExpr = params.get('or');
  let orFilters = [];
  if (orExpr) {
    const inner = orExpr.replace(/^\((.*)\)$/, '$1');
    for (const part of inner.split(',')) {
      // Decode any URL-encoded characters in the value (e.g. %7B → {, %7D → })
      const decoded = part.trim().replace(/%([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
      const f = parseFilterExpr(decoded);
      if (f) orFilters.push(f);
    }
  }

  function matchesOne(row, col, op, value) {
    // Resolve nested columns like "restaurants.is_active"
    let actual = row;
    for (const part of col.split('.')) {
      if (actual == null) return false;
      actual = actual[part];
    }

    const compare = (left, right) => {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
      }

      const leftDate = typeof left === 'string' ? Date.parse(left) : NaN;
      const rightDate = typeof right === 'string' ? Date.parse(right) : NaN;
      if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
        return leftDate - rightDate;
      }

      return String(left).localeCompare(String(right));
    };

    switch (op) {
      case 'eq':
        if (value === 'null') return actual == null;
        if (typeof actual === 'boolean') return actual === (value === 'true');
        return String(actual) === value;
      case 'neq':
        if (value === 'null') return actual != null;
        if (typeof actual === 'boolean') return actual !== (value === 'true');
        return String(actual) !== value;
      case 'gt':
        return compare(actual, value) > 0;
      case 'gte':
        return compare(actual, value) >= 0;
      case 'lt':
        return compare(actual, value) < 0;
      case 'lte':
        return compare(actual, value) <= 0;
      case 'in':
        return value.split(',').map((v) => v.replace(/[()]/g, '')).includes(String(actual));
      case 'is':
        if (value === 'null') return actual == null;
        if (value === 'true') return actual === true;
        if (value === 'false') return actual === false;
        return false;
      case 'like':
      case 'ilike': {
        // value is %pattern% — convert to regex
        const re = new RegExp(
          '^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$',
          op === 'ilike' ? 'i' : ''
        );
        if (actual == null) return false;
        if (Array.isArray(actual)) return actual.some((v) => re.test(String(v)));
        return re.test(String(actual));
      }
      case 'contains':
      case 'cs': {
        if (Array.isArray(actual)) {
          // value may be {Italian,Pizza} or Italian or "Italian"
          // Case-insensitive substring match for the array elements
          const cleanValue = String(value).replace(/[{}"]/g, '').toLowerCase();
          return actual.some((v) => String(v).toLowerCase().includes(cleanValue));
        }
        return String(actual || '').toLowerCase().includes(String(value).replace(/[{}"]/g, '').toLowerCase());
      }
      case 'cd': {
        if (actual == null) return false;
        return String(actual).includes(String(value));
      }
      default:
        return true;
    }
  }

  let filtered = rows.filter((row) => {
    // AND filters: all must match
    for (const f of filters) {
      if (!matchesOne(row, f.col, f.op, f.value)) return false;
    }
    // OR group: at least one must match (if any)
    if (orFilters.length > 0) {
      const anyMatch = orFilters.some((f) => matchesOne(row, f.col, f.op, f.value));
      if (!anyMatch) return false;
    }
    return true;
  });

  // Order
  const order = params.get('order');
  if (order) {
    const specs = order.split(',').map((s) => s.trim());
    filtered = [...filtered].sort((a, b) => {
      for (const spec of specs) {
        const desc = spec.endsWith('.desc');
        const col = desc ? spec.slice(0, -5) : spec.endsWith('.asc') ? spec.slice(0, -4) : spec;
        const av = a[col];
        const bv = b[col];
        if (av === bv) continue;
        const cmp = av == null ? 1 : bv == null ? -1 : av < bv ? -1 : 1;
        return desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  // Range / limit / offset
  const range = params.get('range');
  if (range) {
    const m = range.match(/^(\d+)-(\d+)$/);
    if (m) {
      const lo = parseInt(m[1]);
      const hi = parseInt(m[2]);
      filtered = filtered.slice(lo, hi + 1);
    }
  } else {
    const limit = params.get('limit');
    const offset = params.get('offset');
    if (limit !== null || offset !== null) {
      const lo = offset !== null ? parseInt(offset) : 0;
      const hi = limit !== null ? lo + parseInt(limit) : undefined;
      filtered = filtered.slice(lo, hi);
    }
  }

  return filtered;
}

// PATCH /rest/v1/products?id=eq.<id>  — update products (test-only)
// This is needed for chaos tests that simulate state changes mid-checkout.
function handlePatchProducts(req, res) {
  return readBody(req).then((body) => {
    const idMatch = req.url.match(/[?&]id=eq\.([^&]+)/);
    if (!idMatch) return json(res, 400, { message: 'Missing id filter' });
    const id = decodeURIComponent(idMatch[1]);
    const idx = SEED_PRODUCTS.findIndex((p) => p.id === id);
    if (idx < 0) return json(res, 404, { message: 'Product not found' });
    const updated = { ...SEED_PRODUCTS[idx], ...body };
    SEED_PRODUCTS[idx] = updated;
    return json(res, 200, [updated]);
  });
}

// GET /rest/v1/products?...
function handleGetProducts(req, res) {
  const marketProductIds = new Set([
    'a1111111-0000-0000-0000-000000000040',
    'a1111111-0000-0000-0000-000000000044',
  ]);
  const retailMerchantId = '00000000-0000-0000-0000-000000000024';
  // Normalize: ensure every product has BOTH is_active AND is_available
  // (different parts of the codebase use different column names)
  const normalized = SEED_PRODUCTS.map((p) => ({
    ...p,
    is_active: p.is_active ?? p.is_available ?? true,
    is_available: p.is_available ?? p.is_active ?? true,
    approval_status: p.approval_status ?? 'approved',
    archived_at: p.archived_at ?? null,
    product_kind: p.product_kind ?? (p.restaurant_id === retailMerchantId ? (marketProductIds.has(p.id) && p.id.endsWith('40') ? 'prepacked_food' : 'non_food') : 'prepared_food'),
    storefront_vertical: p.storefront_vertical ?? (p.restaurant_id === retailMerchantId ? (marketProductIds.has(p.id) ? 'market' : 'shop') : 'restaurant'),
    legal_name: p.legal_name ?? p.name,
    allergens: p.allergens ?? [],
    additives: p.additives ?? [],
    allergen_information_reviewed: p.allergen_information_reviewed ?? true,
    nutrition: p.nutrition ?? {},
    legal_information_complete: p.legal_information_complete ?? true,
  }));
  return postgrestResult(req, res, applyPostgrestFilters(normalized, req));
}

function handleGetProductRequests(req, res) {
  return postgrestResult(req, res, applyPostgrestFilters(Array.from(productRequestsStore.values()), req));
}

function handleInsertProductRequests(req, res) {
  return readBody(req).then((body) => {
    const now = new Date().toISOString();
    const rows = (Array.isArray(body) ? body : [body]).map((row) => {
      const duplicate = Array.from(productRequestsStore.values()).some((item) => item.restaurant_id === row.restaurant_id && item.status === 'pending' && item.name.toLowerCase() === String(row.name).toLowerCase());
      if (duplicate) throw Object.assign(new Error('duplicate pending request'), { code: '23505' });
      const record = { id: row.id || randomUUID(), status: 'pending', rejection_reason: null, resulting_product_id: null, reviewed_by: null, reviewed_at: null, created_at: now, updated_at: now, ...row };
      productRequestsStore.set(record.id, record); return record;
    });
    return postgrestResult(req, res, rows, 201);
  }).catch((error) => json(res, error.code === '23505' ? 409 : 400, { code: error.code, message: error.message }));
}

function handlePatchProductRequests(req, res) {
  return readBody(req).then((body) => {
    const rows = applyPostgrestFilters(Array.from(productRequestsStore.values()), req).map((row) => {
      const updated = { ...row, ...body, updated_at: body.updated_at || new Date().toISOString() };
      productRequestsStore.set(row.id, updated); return updated;
    });
    return postgrestResult(req, res, rows);
  });
}

function handleInsertProducts(req, res) {
  return readBody(req).then((body) => {
    const rows = (Array.isArray(body) ? body : [body]).map((row) => ({
      id: row.id || randomUUID(),
      is_available: row.is_available ?? true,
      is_active: row.is_active ?? row.is_available ?? true,
      is_featured: row.is_featured ?? false,
      sold_count: row.sold_count ?? 0,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
      ...row,
    }));
    SEED_PRODUCTS.push(...rows);
    return postgrestResult(req, res, rows, 201);
  });
}

function handleDeleteProducts(req, res) {
  const idMatch = req.url.match(/[?&]id=eq\.([^&]+)/);
  if (!idMatch) return json(res, 400, { message: 'Missing id filter' });
  const id = decodeURIComponent(idMatch[1]);
  const index = SEED_PRODUCTS.findIndex((product) => product.id === id);
  if (index < 0) return json(res, 404, { message: 'Product not found' });
  const [deleted] = SEED_PRODUCTS.splice(index, 1);
  return postgrestResult(req, res, [deleted]);
}

function insertStoredRows(req, res, store, body, defaults = {}) {
  const rows = (Array.isArray(body) ? body : [body]).map((row) => ({
    id: row.id || randomUUID(),
    created_at: row.created_at || new Date().toISOString(),
    ...defaults,
    ...row,
  }));
  for (const row of rows) store.set(row.id, row);
  return postgrestResult(req, res, rows, 201);
}

function patchStoredRows(req, res, store, patch) {
  const matched = applyPostgrestFilters(Array.from(store.values()), req);
  const rows = matched.map((row) => ({ ...row, ...patch, updated_at: new Date().toISOString() }));
  for (const row of rows) store.set(row.id, row);
  return postgrestResult(req, res, rows);
}

function deleteStoredRows(req, res, store) {
  const matched = applyPostgrestFilters(Array.from(store.values()), req);
  for (const row of matched) store.delete(row.id);
  return postgrestResult(req, res, matched);
}

function handleStoredTable(req, res, store, defaults = {}) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(store.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => insertStoredRows(req, res, store, body, defaults));
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => patchStoredRows(req, res, store, body));
  }
  if (req.method === 'DELETE') return deleteStoredRows(req, res, store);
  return json(res, 405, { message: 'Method not allowed' });
}

function handleNotificationPreferences(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(notificationPreferencesStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => {
      const inputRows = Array.isArray(body) ? body : [body];
      const rows = inputRows.map((row) => {
        if (!row?.user_id) throw Object.assign(new Error('user_id is required'), { code: '23502' });
        const current = notificationPreferencesStore.get(row.user_id) || {};
        const saved = {
          ...current,
          ...row,
          id: current.id || row.id || randomUUID(),
          user_id: row.user_id,
          created_at: current.created_at || row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString(),
        };
        notificationPreferencesStore.set(saved.user_id, saved);
        return saved;
      });
      return postgrestResult(req, res, rows, 201);
    }).catch((error) => json(res, 400, { code: error.code || 'PGRST102', message: error.message }));
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => {
      const rows = applyPostgrestFilters(Array.from(notificationPreferencesStore.values()), req)
        .map((row) => ({ ...row, ...body, updated_at: new Date().toISOString() }));
      for (const row of rows) notificationPreferencesStore.set(row.user_id, row);
      return postgrestResult(req, res, rows);
    });
  }
  if (req.method === 'DELETE') {
    const rows = applyPostgrestFilters(Array.from(notificationPreferencesStore.values()), req);
    for (const row of rows) notificationPreferencesStore.delete(row.user_id);
    return postgrestResult(req, res, rows);
  }
  return json(res, 405, { message: 'Method not allowed' });
}

function handleOrderDeliveryPreferences(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(orderDeliveryPreferencesStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => {
      const rows = (Array.isArray(body) ? body : [body]).map((row) => {
        const current = orderDeliveryPreferencesStore.get(row.order_id) || {};
        const saved = {
          ...current,
          ...row,
          order_id: row.order_id,
          created_at: current.created_at || row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString(),
        };
        orderDeliveryPreferencesStore.set(saved.order_id, saved);
        return saved;
      });
      return postgrestResult(req, res, rows, 201);
    });
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => {
      const matched = applyPostgrestFilters(Array.from(orderDeliveryPreferencesStore.values()), req);
      const rows = matched.map((row) => ({ ...row, ...body, updated_at: new Date().toISOString() }));
      for (const row of rows) orderDeliveryPreferencesStore.set(row.order_id, row);
      return postgrestResult(req, res, rows);
    });
  }
  return json(res, 405, { message: 'Method not allowed' });
}

function handleConfig(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(configStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => {
      const rows = (Array.isArray(body) ? body : [body]).map((row) => {
        if (!row?.key) throw Object.assign(new Error('Config key is required'), { code: '23502' });
        const current = configStore.get(row.key) || {};
        const saved = { ...current, ...row, updated_at: row.updated_at || new Date().toISOString() };
        configStore.set(saved.key, saved);
        return saved;
      });
      return postgrestResult(req, res, rows, 201);
    }).catch((error) => json(res, 400, { code: error.code || 'PGRST102', message: error.message }));
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => {
      const rows = applyPostgrestFilters(Array.from(configStore.values()), req).map((row) => ({
        ...row,
        ...body,
        updated_at: body.updated_at || new Date().toISOString(),
      }));
      for (const row of rows) configStore.set(row.key, row);
      return postgrestResult(req, res, rows);
    });
  }
  if (req.method === 'DELETE') {
    const rows = applyPostgrestFilters(Array.from(configStore.values()), req);
    for (const row of rows) configStore.delete(row.key);
    return postgrestResult(req, res, rows);
  }
  return json(res, 405, { message: 'Method not allowed' });
}

function handleSystemSettings(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(systemSettingsStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => {
      const rows = (Array.isArray(body) ? body : [body]).map((row) => {
        if (!row?.key) throw Object.assign(new Error('Setting key is required'), { code: '23502' });
        const current = systemSettingsStore.get(row.key) || {};
        const saved = {
          ...current,
          ...row,
          key: row.key,
          created_at: current.created_at || row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString(),
        };
        systemSettingsStore.set(saved.key, saved);
        return saved;
      });
      return postgrestResult(req, res, rows, 201);
    }).catch((error) => json(res, 400, { code: error.code || 'PGRST102', message: error.message }));
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => {
      const rows = applyPostgrestFilters(Array.from(systemSettingsStore.values()), req)
        .map((row) => ({ ...row, ...body, updated_at: new Date().toISOString() }));
      for (const row of rows) systemSettingsStore.set(row.key, row);
      return postgrestResult(req, res, rows);
    });
  }
  return json(res, 405, { message: 'Method not allowed' });
}

function handleNotifications(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(notificationsStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => insertStoredRows(req, res, notificationsStore, body, { read_at: null }));
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => patchStoredRows(req, res, notificationsStore, body));
  }
  if (req.method === 'DELETE') return deleteStoredRows(req, res, notificationsStore);
  return json(res, 405, { message: 'Method not allowed' });
}

function handleAnnouncements(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(systemAnnouncementsStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => insertStoredRows(req, res, systemAnnouncementsStore, body, { is_active: true }));
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => patchStoredRows(req, res, systemAnnouncementsStore, body));
  }
  if (req.method === 'DELETE') return deleteStoredRows(req, res, systemAnnouncementsStore);
  return json(res, 405, { message: 'Method not allowed' });
}

function handlePushSubscriptions(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(pushSubscriptionsStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => {
      const input = Array.isArray(body) ? body : [body];
      const rows = input.map((row) => {
        const existing = Array.from(pushSubscriptionsStore.values()).find((item) => item.endpoint === row.endpoint);
        const record = {
          id: existing?.id || row.id || randomUUID(),
          created_at: existing?.created_at || row.created_at || new Date().toISOString(),
          ...existing,
          ...row,
        };
        pushSubscriptionsStore.set(record.id, record);
        return record;
      });
      return postgrestResult(req, res, rows, 201);
    });
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => patchStoredRows(req, res, pushSubscriptionsStore, body));
  }
  if (req.method === 'DELETE') return deleteStoredRows(req, res, pushSubscriptionsStore);
  return json(res, 405, { message: 'Method not allowed' });
}

function handleNotificationDeliveryLog(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(notificationDeliveryLogStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => insertStoredRows(req, res, notificationDeliveryLogStore, body));
  }
  return json(res, 405, { message: 'Method not allowed' });
}

// GET /rest/v1/restaurants?...
function handleGetRestaurants(req, res) {
  const normalized = SEED_RESTAURANTS.map((restaurant) => ({
    ...restaurant,
    type: restaurant.type ?? 'restaurant',
    cuisine: restaurant.cuisine ?? restaurant.cuisines ?? [],
    cuisines: restaurant.cuisines ?? restaurant.cuisine ?? [],
    cover_url: restaurant.cover_url ?? restaurant.cover_image_url ?? null,
    min_order_amount: restaurant.min_order_amount ?? restaurant.minimum_order ?? 0,
    review_count: restaurant.review_count ?? restaurant.total_reviews ?? 0,
    latitude: restaurant.latitude ?? restaurant.lat ?? null,
    longitude: restaurant.longitude ?? restaurant.lng ?? null,
  }));
  const rows = applyPostgrestFilters(normalized, req);
  if ((req.headers.accept || '').includes('application/vnd.pgrst.object+json')) {
    if (rows.length !== 1) {
      return json(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
    }
    return json(res, 200, rows[0]);
  }
  return json(res, 200, rows);
}

function handleGetOrderItems(req, res) {
  return json(res, 200, applyPostgrestFilters(Array.from(orderItemsStore.values()), req));
}

function handleGetDriverStatus(req, res) {
  return postgrestResult(req, res, applyPostgrestFilters(Array.from(driverStatusStore.values()), req));
}

function handleUpsertDriverStatus(req, res) {
  return readBody(req).then((body) => {
    const rows = (Array.isArray(body) ? body : [body]).map((row) => {
      const current = driverStatusStore.get(row.driver_id) ?? {};
      const next = { ...current, ...row, updated_at: row.updated_at || new Date().toISOString() };
      driverStatusStore.set(row.driver_id, next);
      return next;
    });
    return json(res, 201, rows);
  }).catch((error) => badRequest(res, error.message));
}

function handleUpdateDriverStatus(req, res) {
  return readBody(req).then((body) => {
    const rows = applyPostgrestFilters(Array.from(driverStatusStore.values()), req).map((row) => {
      const next = { ...row, ...body, updated_at: body.updated_at || new Date().toISOString() };
      driverStatusStore.set(row.driver_id, next);
      return next;
    });
    return json(res, 200, rows);
  }).catch((error) => badRequest(res, error.message));
}

function handleDriverDocuments(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(driverDocumentsStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => {
      const rows = (Array.isArray(body) ? body : [body]).map((row) => {
        const id = row.id || randomUUID();
        const document = {
          id,
          status: 'pending',
          uploaded_at: new Date().toISOString(),
          reviewed_at: null,
          rejection_reason: null,
          submission_kind: 'file',
          ...row,
        };
        driverDocumentsStore.set(id, document);
        return document;
      });
      return postgrestResult(req, res, rows, 201);
    }).catch((error) => badRequest(res, error.message));
  }
  if (req.method === 'PATCH') {
    return readBody(req).then((body) => {
      const rows = applyPostgrestFilters(Array.from(driverDocumentsStore.values()), req).map((row) => {
        const next = { ...row, ...body };
        driverDocumentsStore.set(row.id, next);
        return next;
      });
      return postgrestResult(req, res, rows);
    }).catch((error) => badRequest(res, error.message));
  }
  if (req.method === 'DELETE') {
    const rows = applyPostgrestFilters(Array.from(driverDocumentsStore.values()), req);
    rows.forEach((row) => driverDocumentsStore.delete(row.id));
    return postgrestResult(req, res, rows);
  }
  return json(res, 405, { message: 'Method not allowed' });
}

function handleConsentRecords(req, res) {
  if (req.method === 'GET') {
    return postgrestResult(req, res, applyPostgrestFilters(Array.from(consentRecordsStore.values()), req));
  }
  if (req.method === 'POST') {
    return readBody(req).then((body) => {
      const rows = (Array.isArray(body) ? body : [body]).map((row) => {
        if (!row.id || consentRecordsStore.has(row.id)) throw new Error('Duplicate or missing consent id');
        const record = { ...row, created_at: row.created_at || new Date().toISOString() };
        consentRecordsStore.set(record.id, record);
        return record;
      });
      return postgrestResult(req, res, rows, 201);
    }).catch((error) => badRequest(res, error.message));
  }
  return json(res, 405, { message: 'Consent records are append-only' });
}

const driverProfilesStore = new Map();
function handleGetDrivers(req, res) {
  const rows = [...Object.values(ACCOUNTS), ...registeredUsers.values()].filter((account) => account.role === 'driver').map((account) => {
    const status = driverStatusStore.get(account.id) ?? {};
    const profile = driverProfilesStore.get(account.id) ?? {};
    return {
      id: account.id,
      user_id: account.id,
      is_online: Boolean(status.is_online ?? account.metadata?.is_online),
      is_available: !status.is_on_delivery,
      vehicle_type: profile.vehicle_type ?? 'bicycle',
      vehicle_plate: profile.vehicle_plate ?? null,
      city: profile.city ?? null,
      is_approved: profile.is_approved ?? true,
      status: profile.status ?? 'active',
      rating: 4.9,
      total_deliveries: 0,
      total_earnings_cents: 0,
      working_hours_today: 0,
      current_lat: status.latitude ?? null,
      current_lng: status.longitude ?? null,
    };
  });
  return postgrestResult(req, res, applyPostgrestFilters(rows, req));
}

function handleUpsertDrivers(req, res) {
  return readBody(req).then((body) => {
    const rows = (Array.isArray(body) ? body : [body]).map((row) => {
      const id = row.id || row.user_id || randomUUID();
      const next = { id, user_id: row.user_id || id, rating: 5, total_deliveries: 0, is_online: false, is_available: true, ...driverProfilesStore.get(id), ...row };
      driverProfilesStore.set(id, next);
      return next;
    });
    return postgrestResult(req, res, rows, 201);
  });
}

function handleUpdateDrivers(req, res) {
  return readBody(req).then((body) => {
    const idMatch = req.url.match(/[?&]id=eq\.([^&]+)/);
    if (!idMatch) return json(res, 400, { message: 'Missing id filter' });
    const id = decodeURIComponent(idMatch[1]);
    const account = [...Object.values(ACCOUNTS), ...registeredUsers.values()].find((entry) => entry.id === id);
    if (!account) return json(res, 404, { message: 'Driver not found' });
    const current = driverProfilesStore.get(id) ?? { id, user_id: id, rating: 5, total_deliveries: 0, is_online: false, is_available: true };
    const next = { ...current, ...body, id, user_id: current.user_id || id };
    driverProfilesStore.set(id, next);
    return postgrestResult(req, res, [next]);
  }).catch((error) => badRequest(res, error.message));
}

function handleGetTrackingEvents(req, res) {
  return json(res, 200, applyPostgrestFilters(Array.from(trackingEventsStore.values()), req));
}

function handleInsertTrackingEvent(req, res) {
  return readBody(req).then((body) => {
    const rows = (Array.isArray(body) ? body : [body]).map((row) => {
      const event = { id: row.id || randomUUID(), created_at: row.created_at || new Date().toISOString(), ...row };
      trackingEventsStore.set(event.id, event);
      return event;
    });
    return json(res, 201, rows);
  }).catch((error) => badRequest(res, error.message));
}

function postgrestResult(req, res, rows, status = 200) {
  if ((req.headers.accept || '').includes('application/vnd.pgrst.object+json')) {
    if (rows.length !== 1) {
      return json(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
    }
    return json(res, status, rows[0]);
  }
  return json(res, status, rows);
}

function handleGetSupportTickets(req, res) {
  const rows = applyPostgrestFilters(Array.from(supportTicketsStore.values()), req);
  return postgrestResult(req, res, rows);
}

function handleInsertSupportTicket(req, res) {
  return readBody(req).then((body) => {
    const now = new Date().toISOString();
    const records = (Array.isArray(body) ? body : [body]).map((row) => ({
      id: row.id || randomUUID(),
      status: 'open',
      priority: 'normal',
      assigned_to: null,
      resolution: null,
      resolved_at: null,
      created_at: now,
      updated_at: now,
      ...row,
    }));
    for (const record of records) supportTicketsStore.set(record.id, record);
    return postgrestResult(req, res, records, 201);
  });
}

function handleUpdateSupportTickets(req, res) {
  return readBody(req).then((patch) => {
    const matched = applyPostgrestFilters(Array.from(supportTicketsStore.values()), req);
    const updated = matched.map((row) => ({ ...row, ...patch, updated_at: patch.updated_at || new Date().toISOString() }));
    for (const row of updated) supportTicketsStore.set(row.id, row);
    return postgrestResult(req, res, updated);
  });
}

function handleDeleteSupportRows(req, res, store) {
  const matched = applyPostgrestFilters(Array.from(store.values()), req);
  for (const row of matched) store.delete(row.id);
  return postgrestResult(req, res, matched);
}

function handleGetSupportReplies(req, res) {
  const rows = applyPostgrestFilters(Array.from(supportTicketRepliesStore.values()), req);
  return postgrestResult(req, res, rows);
}

function handleInsertSupportReply(req, res) {
  return readBody(req).then((body) => {
    const records = (Array.isArray(body) ? body : [body]).map((row) => ({
      id: row.id || randomUUID(),
      is_internal: false,
      created_at: new Date().toISOString(),
      ...row,
    }));
    for (const record of records) supportTicketRepliesStore.set(record.id, record);
    return postgrestResult(req, res, records, 201);
  });
}

// PATCH /rest/v1/restaurants?id=eq.<id>  — update restaurants (test-only)
// This is needed for chaos tests that simulate state changes mid-checkout.
// In production, restaurants are mutated via the restaurant portal.
function handlePatchRestaurants(req, res) {
  return readBody(req).then((body) => {
    const idMatch = req.url.match(/[?&]id=eq\.([^&]+)/);
    if (!idMatch) return json(res, 400, { message: 'Missing id filter' });
    const id = decodeURIComponent(idMatch[1]);
    const idx = SEED_RESTAURANTS.findIndex((r) => r.id === id);
    if (idx < 0) return json(res, 404, { message: 'Restaurant not found' });
    const updated = { ...SEED_RESTAURANTS[idx], ...body };
    SEED_RESTAURANTS[idx] = updated;
    return json(res, 200, [updated]);
  });
}

function handleInsertRestaurants(req, res) {
  return readBody(req).then((body) => {
    const rows = (Array.isArray(body) ? body : [body]).map((row) => {
      const restaurant = {
        id: row.id || randomUUID(), rating: 0, review_count: 0, total_orders: 0,
        is_active: row.is_active !== false, is_paused: false, busy_mode: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        cuisine_type: row.cuisine_type || row.category || null,
        minimum_order: row.minimum_order ?? row.min_order_amount ?? 0,
        ...row,
      };
      SEED_RESTAURANTS.push(restaurant);
      return restaurant;
    });
    return postgrestResult(req, res, rows, 201);
  });
}

// ── Order Drafts (Phase 7F) ──────────────────────────────────────────────────
//
// Schema (mirrors deploy/supabase/61-order-drafts.sql):
//   order_drafts(
//     id, customer_id, restaurant_id, draft, signature,
//     expires_at, used, used_at, confirmed_by,
//     deleted_at, created_at, updated_at
//   )
//
// Used by /api/checkout/draft and /api/checkout/confirm.

// POST /rest/v1/order_drafts  — create new draft
function handleInsertOrderDraft(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    if (records.length === 0) {
      return json(res, 400, { message: 'No draft record' });
    }
    const inserted = [];
    for (const r of records) {
      if (!r.id || !r.customer_id || !r.restaurant_id || !r.draft || !r.signature || !r.expires_at) {
        return json(res, 400, { message: 'Missing required fields: id, customer_id, restaurant_id, draft, signature, expires_at' });
      }
      // Idempotent on id — overwrite if already exists (re-create)
      const existing = orderDraftsStore.get(r.id);
      if (existing && existing.used) {
        return json(res, 409, { message: 'draft_already_used' });
      }
      const record = {
        id: r.id,
        customer_id: r.customer_id,
        restaurant_id: r.restaurant_id,
        draft: r.draft,
        signature: r.signature,
        expires_at: r.expires_at,
        payment_intent_id: r.payment_intent_id || existing?.payment_intent_id || null,
        used: existing?.used || false,
        used_at: existing?.used_at || null,
        confirmed_by: existing?.confirmed_by || null,
        deleted_at: null,
        // 7G-B: state machine fields
        payment_status: r.payment_status || existing?.payment_status || 'none',
        order_creation_attempts: r.order_creation_attempts ?? existing?.order_creation_attempts ?? 0,
        last_payment_event_at: r.last_payment_event_at || existing?.last_payment_event_at || null,
        last_payment_event_type: r.last_payment_event_type || existing?.last_payment_event_type || null,
        last_payment_event_id: r.last_payment_event_id || existing?.last_payment_event_id || null,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      orderDraftsStore.set(r.id, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/order_drafts?... — query drafts (with filters)
function handleGetOrderDrafts(req, res) {
  const all = Array.from(orderDraftsStore.values());
  return json(res, 200, applyPostgrestFilters(all, req));
}

// PATCH /rest/v1/order_drafts?id=eq.<id>  — update draft (e.g., burn, payment_status)
function handleUpdateOrderDraft(req, res) {
  const match = req.url.match(/[?&]id=eq\.([^&]+)/);
  if (!match) return json(res, 400, { message: 'Missing id filter' });
  const id = decodeURIComponent(match[1]);
  const existing = orderDraftsStore.get(id);
  if (!existing) return json(res, 404, { message: 'Draft not found' });
  return readBody(req).then((body) => {
    // 7G-B: For state-machine updates, validate the transition.
    // If the body specifies a payment_status CAS (expected_status), enforce it.
    if (body.payment_status !== undefined && body._expected_payment_status !== undefined) {
      if (existing.payment_status !== body._expected_payment_status) {
        return json(res, 409, {
          message: 'CAS_failed',
          code: '23514',
          current: existing.payment_status,
          expected: body._expected_payment_status,
        });
      }
    }
    const { _expected_payment_status, ...cleanBody } = body;
    const updated = {
      ...existing,
      ...cleanBody,
      id: existing.id,  // immutable
      updated_at: new Date().toISOString(),
    };
    orderDraftsStore.set(id, updated);
    return json(res, 200, updated);
  });
}

// DELETE /rest/v1/order_drafts?id=eq.<id>  — soft delete
function handleDeleteOrderDraft(req, res) {
  const match = req.url.match(/[?&]id=eq\.([^&]+)/);
  if (!match) return json(res, 400, { message: 'Missing id filter' });
  const id = decodeURIComponent(match[1]);
  const existing = orderDraftsStore.get(id);
  if (!existing) return json(res, 404, { message: 'Draft not found' });
  existing.deleted_at = new Date().toISOString();
  orderDraftsStore.set(id, existing);
  return json(res, 204, null);
}

// ============================================================================
// Phase 7G-A: Payment Audit & Recovery handlers
// ============================================================================
//
// Schema mirrors deploy/supabase/62-payment-audit.sql and 63-orders-payment-unique.sql.
// These handlers back the payment_audit_log, stripe_webhook_events,
// and manual_recovery_queue tables.

// POST /rest/v1/payment_audit_log — INSERT only (no UPDATE, no DELETE)
// Returns 200 with the inserted row, or 409 if a duplicate (shouldn't happen with auto-id).
function handleInsertPaymentAudit(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      // Validate required fields
      if (!r.customer_id || !r.draft_id || !r.idempotency_key || !r.status) {
        return json(res, 400, { message: 'Missing required fields: customer_id, draft_id, idempotency_key, status' });
      }
      // Validate status enum (Phase 7G-B: expanded enum)
      const VALID_STATUS = new Set([
        'intent_created', 'intent_processing',
        'intent_requires_action', 'intent_requires_payment_method',
        'intent_succeeded', 'intent_failed', 'intent_canceled',
        'draft_burned', 'order_creation_started', 'order_creation_failed',
        'order_created', 'order_already_exists',
        'payment_received_draft_expired', 'payment_received_draft_missing',
        'duplicate_event', 'invalid_transition',
        'orphan_draft_detected', 'orphan_order_detected',
        'reconciliation_completed', 'error',
      ]);
      if (!VALID_STATUS.has(r.status)) {
        return json(res, 400, { message: 'Invalid status: ' + r.status });
      }
      const record = {
        id: paymentAuditLogStore.length + 1,
        payment_intent_id: r.payment_intent_id || null,
        customer_id: r.customer_id,
        draft_id: r.draft_id,
        order_id: r.order_id || null,
        status: r.status,
        stripe_event_id: r.stripe_event_id || null,
        idempotency_key: r.idempotency_key,
        ip: r.ip || null,
        user_agent: r.user_agent || null,
        error_reason: r.error_reason || null,
        metadata: r.metadata || null,
        created_at: r.created_at || new Date().toISOString(),
      };
      paymentAuditLogStore.push(record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/payment_audit_log?... — query (read-only)
// Used by admin/support to view the audit trail.
function handleGetPaymentAudit(req, res) {
  return json(res, 200, applyPostgrestFilters(paymentAuditLogStore, req));
}

// POST /rest/v1/stripe_webhook_events — INSERT with PRIMARY KEY dedup
// First INSERT wins; subsequent INSERTs with same event_id return 409.
function handleInsertStripeWebhookEvent(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.event_id) {
        return json(res, 400, { message: 'event_id is required' });
      }
      // PRIMARY KEY dedup: if event_id exists, return 409
      if (stripeWebhookEventsStore.has(r.event_id)) {
        return json(res, 409, {
          message: 'duplicate key value violates unique constraint "stripe_webhook_events_pkey"',
          code: '23505',
        });
      }
      const record = {
        event_id: r.event_id,
        event_type: r.event_type || 'unknown',
        payment_intent_id: r.payment_intent_id || null,
        processed_at: r.processed_at || new Date().toISOString(),
        result: r.result || 'processed',
        error_message: r.error_message || null,
      };
      stripeWebhookEventsStore.set(r.event_id, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/stripe_webhook_events?... — query (forensics)
function handleGetStripeWebhookEvents(req, res) {
  return json(res, 200, applyPostgrestFilters(
    Array.from(stripeWebhookEventsStore.values()),
    req,
  ));
}

// PATCH /rest/v1/manual_recovery_queue?id=eq.<id> — support resolution
// Used by admin/support to mark a recovery item as resolved/refunded/etc.
function handlePatchManualRecovery(req, res) {
  const match = req.url.match(/[?&]id=eq\.([^&]+)/);
  if (!match) return json(res, 400, { message: 'Missing id filter' });
  const id = parseInt(decodeURIComponent(match[1]), 10);
  const existing = manualRecoveryQueueStore.get(id);
  if (!existing) return json(res, 404, { message: 'Recovery item not found' });
  return readBody(req).then((body) => {
    // Validate status transition
    const VALID_TRANSITIONS = {
      'pending':       ['refunded', 'order_recreated', 'contacted', 'resolved'],
      'refunded':      ['resolved'],
      'order_recreated': ['resolved'],
      'contacted':     ['resolved', 'refunded', 'order_recreated'],
      'resolved':      [],  // terminal
    };
    const newStatus = body.status || existing.status;
    if (newStatus !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(newStatus)) {
        return json(res, 400, { message: 'Invalid status transition: ' + existing.status + ' -> ' + newStatus });
      }
    }
    const updated = {
      ...existing,
      ...body,
      id: existing.id,  // immutable
      payment_intent_id: existing.payment_intent_id,  // immutable
      customer_id: existing.customer_id,  // immutable
      draft_id: existing.draft_id,  // immutable
      amount_cents: existing.amount_cents,  // immutable
      currency: existing.currency,  // immutable
      created_at: existing.created_at,  // immutable
      resolved_at: newStatus === 'resolved' ? new Date().toISOString() : (body.resolved_at || existing.resolved_at),
    };
    manualRecoveryQueueStore.set(id, updated);
    return json(res, 200, [updated]);
  });
}

// POST /rest/v1/manual_recovery_queue — INSERT (CHANGE #1: paid but draft expired)
function handleInsertManualRecovery(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.payment_intent_id || !r.customer_id || !r.draft_id || r.amount_cents === undefined || r.amount_cents === null || !r.reason) {
        return json(res, 400, { message: 'Missing required fields: payment_intent_id, customer_id, draft_id, amount_cents, reason' });
      }
      const id = manualRecoveryQueueStore.size + 1;
      const record = {
        id,
        payment_intent_id: r.payment_intent_id,
        customer_id: r.customer_id,
        draft_id: r.draft_id,
        amount_cents: r.amount_cents,
        currency: r.currency || 'EUR',
        reason: r.reason,
        status: r.status || 'pending',
        resolution_notes: r.resolution_notes || null,
        resolved_at: r.resolved_at || null,
        resolved_by: r.resolved_by || null,
        created_at: r.created_at || new Date().toISOString(),
      };
      manualRecoveryQueueStore.set(id, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/manual_recovery_queue?... — admin/support query
function handleGetManualRecovery(req, res) {
  return json(res, 200, applyPostgrestFilters(
    Array.from(manualRecoveryQueueStore.values()),
    req,
  ));
}

// ============================================================================
// Phase 7G-B: payment_intent_history endpoints
// ============================================================================
// POST /rest/v1/payment_intent_history — INSERT (UNIQUE on payment_intent_id + event_id)
function handleInsertPaymentIntentHistory(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.payment_intent_id || !r.event_id || !r.event_type || !r.payment_state_at_event) {
        return json(res, 400, { message: 'Missing required fields: payment_intent_id, event_id, event_type, payment_state_at_event' });
      }
      const key = `${r.payment_intent_id}|${r.event_id}`;
      // UNIQUE constraint: payment_intent_id + event_id
      if (paymentIntentHistoryStore.has(key)) {
        return json(res, 409, {
          message: 'duplicate key value violates unique constraint "payment_intent_history_pkey"',
          code: '23505',
        });
      }
      const id = paymentIntentHistoryStore.size + 1;
      const record = {
        id,
        payment_intent_id: r.payment_intent_id,
        customer_id: r.customer_id || null,
        draft_id: r.draft_id || null,
        event_id: r.event_id,
        event_type: r.event_type,
        payment_state_at_event: r.payment_state_at_event,
        payment_state_after_event: r.payment_state_after_event || null,
        transitioned: r.transitioned !== undefined ? r.transitioned : true,
        received_at: r.received_at || new Date().toISOString(),
        ip: r.ip || null,
        user_agent: r.user_agent || null,
        metadata: r.metadata || null,
      };
      paymentIntentHistoryStore.set(key, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/payment_intent_history?... — query (filter by payment_intent_id, draft_id, etc.)
function handleGetPaymentIntentHistory(req, res) {
  const all = Array.from(paymentIntentHistoryStore.values());
  return json(res, 200, applyPostgrestFilters(all, req));
}

// PATCH /rest/v1/payment_intent_history?id=eq.<id>  — not allowed (append-only)
function handlePatchPaymentIntentHistory(req, res) {
  return json(res, 405, {
    message: 'payment_intent_history is append-only; PATCH is not allowed',
    code: 'append_only_table',
  });
}

// DELETE /rest/v1/payment_intent_history?id=eq.<id>  — not allowed
function handleDeletePaymentIntentHistory(req, res) {
  return json(res, 405, {
    message: 'payment_intent_history is append-only; DELETE is not allowed',
    code: 'append_only_table',
  });
}

// ============================================================================
// Phase 7G-B: payment_reconciliation_queue endpoints
// ============================================================================
// POST /rest/v1/payment_reconciliation_queue — INSERT
function handleInsertPaymentReconciliation(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.issue_type) {
        return json(res, 400, { message: 'Missing required field: issue_type' });
      }
      // Check for duplicate (same payment_intent_id + issue_type)
      const all = Array.from(paymentReconciliationQueueStore.values());
      const existing = all.find(
        (e) => e.issue_type === r.issue_type &&
               (r.payment_intent_id ? e.payment_intent_id === r.payment_intent_id : true) &&
               e.status === 'pending'
      );
      if (existing) {
        return json(res, 200, [existing]);
      }
      const id = paymentReconciliationQueueStore.size + 1;
      const record = {
        id,
        draft_id: r.draft_id || null,
        payment_intent_id: r.payment_intent_id || null,
        order_id: r.order_id || null,
        customer_id: r.customer_id || null,
        issue_type: r.issue_type,
        status: r.status || 'pending',
        details: r.details || null,
        detected_at: r.detected_at || new Date().toISOString(),
        resolved_at: r.resolved_at || null,
        resolved_by: r.resolved_by || null,
        resolution_notes: r.resolution_notes || null,
      };
      paymentReconciliationQueueStore.set(id, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/payment_reconciliation_queue?... — query
function handleGetPaymentReconciliation(req, res) {
  const all = Array.from(paymentReconciliationQueueStore.values());
  return json(res, 200, applyPostgrestFilters(all, req));
}

// PATCH /rest/v1/payment_reconciliation_queue?id=eq.<id>  — update status
function handlePatchPaymentReconciliation(req, res) {
  const match = req.url.match(/[?&]id=eq\.([^&]+)/);
  if (!match) return json(res, 400, { message: 'Missing id filter' });
  const id = parseInt(decodeURIComponent(match[1]), 10);
  const existing = paymentReconciliationQueueStore.get(id);
  if (!existing) return json(res, 404, { message: 'Not found' });
  return readBody(req).then((body) => {
    const updated = {
      ...existing,
      ...body,
      id: existing.id,
    };
    if (body.status && body.status !== 'pending' && !existing.resolved_at) {
      updated.resolved_at = new Date().toISOString();
    }
    paymentReconciliationQueueStore.set(id, updated);
    return json(res, 200, updated);
  });
}

// ============================================================================
// Phase 7G-C: payment_security_events endpoints (append-only)
// ============================================================================
// POST /rest/v1/payment_security_events — INSERT (allowed)
function handleInsertPaymentSecurityEvents(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.event_type || !r.reason || !r.severity) {
        return json(res, 400, { message: 'Missing required fields: event_type, severity, reason' });
      }
      const record = {
        id: paymentSecurityEventsStore.length + 1,
        event_type: r.event_type,
        severity: r.severity,
        user_id: r.user_id || null,
        draft_id: r.draft_id || null,
        payment_intent_id: r.payment_intent_id || null,
        stripe_event_id: r.stripe_event_id || null,
        ip: r.ip || null,
        user_agent: r.user_agent || null,
        request_id: r.request_id || null,
        route: r.route || null,
        reason: r.reason,
        metadata: r.metadata || null,
        created_at: new Date().toISOString(),
      };
      paymentSecurityEventsStore.push(record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/payment_security_events?... — query (service_role only)
function handleGetPaymentSecurityEvents(req, res) {
  return json(res, 200, applyPostgrestFilters(paymentSecurityEventsStore, req));
}

// PATCH /rest/v1/payment_security_events — REJECTED (append-only)
function handlePatchPaymentSecurityEvents(req, res) {
  return json(res, 405, { message: 'payment_security_events is append-only' });
}

// DELETE /rest/v1/payment_security_events — REJECTED (append-only)
function handleDeletePaymentSecurityEvents(req, res) {
  return json(res, 405, { message: 'payment_security_events is append-only' });
}

// ============================================================================
// Phase 7G-C: payment_rate_limit_buckets endpoints
// ============================================================================
// POST /rest/v1/payment_rate_limit_buckets — UPSERT (used by RPC simulation)
function handleUpsertRateLimitBucket(req, res) {
  return readBody(req).then((body) => {
    const r = Array.isArray(body) ? body[0] : body;
    if (!r.bucket_key) return json(res, 400, { message: 'Missing bucket_key' });
    const existing = rateLimitBucketsStore.get(r.bucket_key);
    const updated = {
      bucket_key: r.bucket_key,
      tokens: r.tokens !== undefined ? Number(r.tokens) : (existing?.tokens ?? 0),
      last_refill_at: r.last_refill_at || new Date().toISOString(),
      limit_count: r.limit_count ?? existing?.limit_count ?? 0,
      window_seconds: r.window_seconds ?? existing?.window_seconds ?? 0,
      updated_at: new Date().toISOString(),
    };
    rateLimitBucketsStore.set(r.bucket_key, updated);
    return json(res, 200, updated);
  });
}

// GET /rest/v1/payment_rate_limit_buckets?bucket_key=eq.<key> — read
function handleGetRateLimitBucket(req, res) {
  const all = Array.from(rateLimitBucketsStore.values());
  return json(res, 200, applyPostgrestFilters(all, req));
}

// ============================================================================
// Phase 7G-C: payment_binding endpoints
// ============================================================================
// POST /rest/v1/payment_binding — INSERT
function handleInsertPaymentBinding(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.payment_intent_id || !r.draft_id || !r.customer_id) {
        return json(res, 400, { message: 'Missing required fields: payment_intent_id, draft_id, customer_id' });
      }
      if (paymentBindingStore.has(r.payment_intent_id)) {
        return json(res, 409, { message: 'duplicate key value violates unique constraint "payment_binding_pkey"' });
      }
      const record = {
        payment_intent_id: r.payment_intent_id,
        draft_id: r.draft_id,
        customer_id: r.customer_id,
        restaurant_id: r.restaurant_id,
        expected_amount_cents: r.expected_amount_cents,
        currency: r.currency || 'eur',
        livemode: r.livemode === true,
        environment: r.environment || 'production',
        created_at: new Date().toISOString(),
      };
      paymentBindingStore.set(r.payment_intent_id, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/payment_binding?payment_intent_id=eq.<id> — read
function handleGetPaymentBinding(req, res) {
  const all = Array.from(paymentBindingStore.values());
  return json(res, 200, applyPostgrestFilters(all, req));
}

// ============================================================================
// Phase 7G-C: admin_action_log endpoints (append-only)
// ============================================================================
function handleInsertAdminActionLog(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.admin_user_id || !r.action || !r.resource_type || !r.resource_id) {
        return json(res, 400, { message: 'Missing required fields' });
      }
      const record = {
        id: adminActionLogStore.length + 1,
        ...r,
        created_at: new Date().toISOString(),
      };
      adminActionLogStore.push(record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

function handleGetAdminActionLog(req, res) {
  return json(res, 200, applyPostgrestFilters(adminActionLogStore, req));
}

function handlePatchAdminActionLog(req, res) {
  return json(res, 405, { message: 'admin_action_log is append-only' });
}

function handleDeleteAdminActionLog(req, res) {
  return json(res, 405, { message: 'admin_action_log is append-only' });
}

// ============================================================================
// Phase 7G-D: payment_refunds endpoints
// ============================================================================
// Mirrors migration 66-refunds.sql. Enforces:
//   - stripe_refund_id UNIQUE
//   - idempotency_key UNIQUE
//   - status CHECK (8 enum values)
//   - amount validation (positive, integer cents, ≤ MAX)
//   - DELETE forbidden (405)
// ============================================================================

const ALLOWED_REFUND_STATUSES = [
  'requested', 'validating', 'submitted', 'pending',
  'succeeded', 'failed', 'canceled', 'requires_review',
];

function handleInsertPaymentRefunds(req, res) {
  return readBody(req).then((body) => {
    // Phase 7G-E: Chaos — simulate Supabase disconnect (503)
    if (chaosState.payment_refunds_503) {
      return json(res, 503, { message: 'simulated Supabase disconnect' });
    }
    // Phase 7G-D: RLS — anon and authenticated have no insert access.
    // Only service_role can write. We distinguish by apikey header.
    // - service_role: uses the service-role key in the apikey header
    // - user: uses anon key in apikey + Bearer JWT in Authorization
    const apikey = String(req.headers['apikey'] || '');
    const isServiceRole = apikey.includes('service') || apikey === 'mock-service-key' || apikey === 'eyJ' || apikey.startsWith('sb_secret_');
    if (!isServiceRole) {
      return json(res, 403, { message: 'new row violates row-level security policy for table "payment_refunds"' });
    }
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      // Required fields
      if (!r.order_id || !r.payment_intent_id || !r.requested_by) {
        return json(res, 400, { message: 'Missing required fields: order_id, payment_intent_id, requested_by' });
      }
      if (r.requested_amount_cents === undefined || r.requested_amount_cents === null) {
        return json(res, 400, { message: 'requested_amount_cents is required' });
      }
      const amt = Number(r.requested_amount_cents);
      if (!Number.isFinite(amt) || !Number.isInteger(amt) || amt <= 0) {
        return json(res, 400, { message: 'requested_amount_cents must be a positive integer' });
      }
      if (amt > 1_000_000_000) {
        return json(res, 400, { message: 'requested_amount_cents too large' });
      }
      // UNIQUE: stripe_refund_id (if provided)
      if (r.stripe_refund_id) {
        for (const existing of paymentRefundsStore.values()) {
          if (existing.stripe_refund_id === r.stripe_refund_id) {
            return json(res, 409, { message: 'duplicate key value violates unique constraint "payment_refunds_stripe_refund_id_key"' });
          }
        }
      }
      // UNIQUE: idempotency_key
      if (r.idempotency_key) {
        for (const existing of paymentRefundsStore.values()) {
          if (existing.idempotency_key === r.idempotency_key) {
            return json(res, 409, { message: 'duplicate key value violates unique constraint "payment_refunds_idempotency_key_key"' });
          }
        }
      }
      // Status validation
      if (r.status && !ALLOWED_REFUND_STATUSES.includes(r.status)) {
        return json(res, 400, { message: `Invalid status: ${r.status}` });
      }
      // Currency validation
      if (!r.currency || !/^[A-Z]{3}$/.test(r.currency)) {
        return json(res, 400, { message: 'currency must be 3 uppercase letters' });
      }
      const id = r.id || (globalThis.crypto?.randomUUID?.() ?? `rf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      const record = {
        id,
        stripe_refund_id: r.stripe_refund_id ?? null,
        payment_intent_id: r.payment_intent_id,
        charge_id: r.charge_id ?? null,
        order_id: r.order_id,
        customer_id: r.customer_id,
        requested_by: r.requested_by,
        requested_amount_cents: amt,
        refunded_amount_cents: r.refunded_amount_cents ?? 0,
        currency: r.currency,
        reason: r.reason,
        internal_note: r.internal_note ?? null,
        status: r.status ?? 'requested',
        failure_reason: r.failure_reason ?? null,
        idempotency_key: r.idempotency_key ?? null,
        stripe_event_id: r.stripe_event_id ?? null,
        metadata: r.metadata ?? {},
        created_at: r.created_at ?? new Date().toISOString(),
        updated_at: r.updated_at ?? new Date().toISOString(),
        completed_at: r.completed_at ?? null,
      };
      paymentRefundsStore.set(id, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

function handleGetPaymentRefunds(req, res) {
  const all = Array.from(paymentRefundsStore.values());
  return json(res, 200, applyPostgrestFilters(all, req));
}

function handlePatchPaymentRefunds(req, res) {
  // PATCH allowed for status transitions. We don't enforce the state machine
  // strictly in the mock (the application layer does that), but we do enforce
  // that status is in the allowed set.
  return readBody(req).then((body) => {
    if (body.status && !ALLOWED_REFUND_STATUSES.includes(body.status)) {
      return json(res, 400, { message: `Invalid status: ${body.status}` });
    }
    // PATCH through Supabase's REST API uses query params for filter
    // For simplicity, we look up by id in the filter
    const url = new URL(req.url, 'http://localhost');
    const idFilter = url.searchParams.get('id') ?? '';
    const idEq = idFilter.replace(/^eq\./, '');
    const existing = paymentRefundsStore.get(idEq);
    if (!existing) {
      return json(res, 404, { message: 'Refund not found' });
    }
    // Apply the patch
    const updated = {
      ...existing,
      ...body,
      // Don't allow overwriting critical fields
      id: existing.id,
      stripe_refund_id: body.stripe_refund_id ?? existing.stripe_refund_id,
      payment_intent_id: existing.payment_intent_id,
      order_id: existing.order_id,
      customer_id: existing.customer_id,
      requested_by: existing.requested_by,
      requested_amount_cents: existing.requested_amount_cents,
      idempotency_key: existing.idempotency_key,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };
    paymentRefundsStore.set(idEq, updated);
    // Phase 7G-E: simulate the production DB trigger tg_payment_refunds_recompute
    // which automatically calls recompute_order_payment_status after every change.
    if (updated.order_id) {
      const order = ordersStore.get(updated.order_id);
      if (order) {
        const receivedCents = Math.round(Number(order.total ?? 0) * 100);
        let refundedSucceeded = 0, refundedPending = 0, refundedFailed = 0;
        for (const r of paymentRefundsStore.values()) {
          if (r.order_id !== updated.order_id) continue;
          const v = Number(r.refunded_amount_cents ?? 0);
          if (r.status === 'succeeded') refundedSucceeded += v;
          else if (['pending', 'submitted', 'validating', 'requested'].includes(r.status)) refundedPending += v;
          else if (['failed', 'requires_review', 'canceled'].includes(r.status)) refundedFailed += v;
        }
        let newStatus;
        if (receivedCents <= 0) newStatus = 'pending';
        else if (refundedSucceeded >= receivedCents && refundedPending === 0 && refundedFailed === 0) newStatus = 'refunded';
        else if (refundedSucceeded > 0 && refundedSucceeded < receivedCents) newStatus = 'partially_refunded';
        else if (refundedPending > 0 && refundedSucceeded < receivedCents) newStatus = 'refund_pending';
        else if (refundedFailed > 0 && refundedSucceeded === 0) newStatus = 'refund_failed';
        else newStatus = 'succeeded';
        order.payment_status = newStatus;
        order.amount_refunded_cents = refundedSucceeded;
        const lastRefund = Array.from(paymentRefundsStore.values())
          .filter((r) => r.order_id === updated.order_id)
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
        if (lastRefund) {
          order.last_refund_status = lastRefund.status;
          order.last_refund_at = lastRefund.updated_at;
        }
        order.updated_at = new Date().toISOString();
        ordersStore.set(updated.order_id, order);
      }
    }
    return json(res, 200, updated);
  });
}

function handleDeletePaymentRefunds(req, res) {
  // DB trigger raises EXCEPTION on DELETE; mock returns 405
  return json(res, 405, { message: 'payment_refunds rows cannot be deleted; refunds are immutable' });
}

// ── refund_audit_log (append-only) ──
function handleInsertRefundAuditLog(req, res) {
  return readBody(req).then((body) => {
    // Phase 7G-E: Chaos — simulate Supabase disconnect
    if (chaosState.refund_audit_log_503) {
      return json(res, 503, { message: 'simulated Supabase disconnect' });
    }
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.refund_id || !r.action || !r.order_id || !r.payment_intent_id) {
        return json(res, 400, { message: 'Missing required fields: refund_id, action, order_id, payment_intent_id' });
      }
      const record = {
        id: refundAuditLogStore.length + 1,
        ...r,
        created_at: r.created_at ?? new Date().toISOString(),
      };
      refundAuditLogStore.push(record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

function handleGetRefundAuditLog(req, res) {
  return json(res, 200, applyPostgrestFilters(refundAuditLogStore, req));
}

// ── refund_operation_locks ──
function handleInsertRefundLock(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.order_id) {
        return json(res, 400, { message: 'order_id is required' });
      }
      // Clean up expired
      const now = new Date();
      for (const [oid, lock] of refundOperationLocksStore.entries()) {
        if (new Date(lock.expires_at) < now) {
          refundOperationLocksStore.delete(oid);
        }
      }
      // PK on order_id: reject if a non-expired lock exists
      const existing = refundOperationLocksStore.get(r.order_id);
      if (existing && new Date(existing.expires_at) >= now) {
        return json(res, 409, { message: 'duplicate key value violates unique constraint "refund_operation_locks_pkey"' });
      }
      const record = {
        order_id: r.order_id,
        locked_by: r.locked_by,
        locked_at: r.locked_at ?? new Date().toISOString(),
        expires_at: r.expires_at ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
      refundOperationLocksStore.set(r.order_id, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

function handleDeleteRefundLock(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const orderIdFilter = url.searchParams.get('order_id') ?? '';
  const orderId = orderIdFilter.replace(/^eq\./, '');
  if (!orderId) {
    return json(res, 400, { message: 'order_id filter is required' });
  }
  refundOperationLocksStore.delete(orderId);
  return json(res, 204, {});
}

function handleGetRefundLock(req, res) {
  const all = Array.from(refundOperationLocksStore.values());
  return json(res, 200, applyPostgrestFilters(all, req));
}

// ============================================================================
// Phase 7G-C: rate limit RPC simulation
// ============================================================================
// POST /rest/v1/rpc/payment_rate_limit_check
function handleRateLimitCheckRpc(req, res) {
  return readBody(req).then((body) => {
    const key = body.p_bucket_key;
    const limit = body.p_limit;
    const windowSec = body.p_window_seconds;
    const burst = body.p_burst ?? limit;
    if (!key || !limit || !windowSec) {
      return json(res, 400, { message: 'Missing required params' });
    }
    const now = new Date();
    const existing = rateLimitBucketsStore.get(key);
    const refillRate = limit / windowSec;
    let tokens;
    if (!existing) {
      tokens = burst;
      rateLimitBucketsStore.set(key, {
        bucket_key: key,
        tokens,
        last_refill_at: now.toISOString(),
        limit_count: limit,
        window_seconds: windowSec,
        updated_at: now.toISOString(),
      });
    } else {
      const elapsedSec = (now.getTime() - new Date(existing.last_refill_at).getTime()) / 1000;
      tokens = Math.min(burst, existing.tokens + elapsedSec * refillRate);
    }
    let allowed;
    let retryAfter = 0;
    if (tokens >= 1) {
      tokens -= 1;
      allowed = true;
    } else {
      allowed = false;
      retryAfter = Math.max(1, Math.ceil((1 - tokens) / refillRate));
    }
    rateLimitBucketsStore.set(key, {
      ...(existing || {}),
      bucket_key: key,
      tokens,
      last_refill_at: now.toISOString(),
      limit_count: limit,
      window_seconds: windowSec,
      updated_at: now.toISOString(),
    });
    return json(res, 200, [{
      allowed,
      tokens_remaining: Math.floor(tokens),
      retry_after_seconds: retryAfter,
    }]);
  });
}

// POST /rest/v1/rpc/pg_try_advisory_lock (mock: always returns true)
function handleTryAdvisoryLock(req, res) {
  return json(res, 200, true);
}

// POST /rest/v1/rpc/pg_advisory_unlock (mock: returns true)
function handleAdvisoryUnlock(req, res) {
  return json(res, 200, true);
}

// Phase 7G-A: Mock Stripe simulator endpoints
// POST /rest/v1/stripe_payment_intents — create (or get existing by idempotency_key)
function handleInsertStripePaymentIntent(req, res) {
  return readBody(req).then((body) => {
    const records = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const r of records) {
      if (!r.id) return json(res, 400, { message: 'id is required' });
      // Idempotent on id
      if (paymentIntentsStore.has(r.id)) {
        const existing = paymentIntentsStore.get(r.id);
        return json(res, 200, [existing]);
      }
      const record = {
        id: r.id,
        client_secret: r.client_secret,
        amount: r.amount,
        currency: r.currency,
        status: r.status || 'requires_payment_method',
        metadata: r.metadata || {},
        created_at: r.created_at || new Date().toISOString(),
      };
      paymentIntentsStore.set(r.id, record);
      inserted.push(record);
    }
    return json(res, 201, inserted.length === 1 ? inserted[0] : inserted);
  });
}

// GET /rest/v1/stripe_payment_intents?id=eq.<id> — retrieve
function handleGetStripePaymentIntent(req, res) {
  return json(res, 200, applyPostgrestFilters(
    Array.from(paymentIntentsStore.values()),
    req,
  ));
}

// PATCH /rest/v1/stripe_payment_intents?id=eq.<id> — update status
// Used by the mock to simulate Stripe's payment lifecycle:
//   requires_payment_method → succeeded | canceled | etc.
function handleUpdateStripePaymentIntent(req, res) {
  const match = req.url.match(/[?&]id=eq\.([^&]+)/);
  if (!match) return json(res, 400, { message: 'Missing id filter' });
  const id = decodeURIComponent(match[1]);
  const existing = paymentIntentsStore.get(id);
  if (!existing) return json(res, 404, { message: 'PaymentIntent not found' });
  return readBody(req).then((body) => {
    const updated = { ...existing, ...body, id: existing.id };
    paymentIntentsStore.set(id, updated);
    return json(res, 200, [updated]);
  });
}

// ============================================================================
// Phase 7G-E: Chaos injection endpoint
// ============================================================================
// POST /rest/v1/chaos  body: { mode: "stripe-timeout"|"stripe-500"|"supabase-503", target: "payment_refunds"|... }
// GET  /rest/v1/chaos  — returns current chaos state
// DELETE /rest/v1/chaos — clears all chaos modes
// ============================================================================
function handleChaos(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, chaosState);
  }
  if (req.method === 'DELETE') {
    // Reset all chaos state
    Object.keys(chaosState).forEach((k) => { chaosState[k] = false; });
    chaosState.slow_ms = 0;
    return json(res, 200, { ok: true, message: 'all chaos modes cleared' });
  }
  // POST: set a chaos mode
  return readBody(req).then((body) => {
    if (!body || typeof body !== 'object') {
      return json(res, 400, { message: 'body must be JSON' });
    }
    const { mode, target } = body;
    switch (mode) {
      case 'supabase-503':
        // Supabase returns 503 for the target table
        if (target === 'payment_refunds') chaosState.payment_refunds_503 = true;
        else if (target === 'refund_audit_log') chaosState.refund_audit_log_503 = true;
        else if (target === 'orders_post') chaosState.orders_post_500 = true;
        else return json(res, 400, { message: 'unknown target' });
        return json(res, 200, { ok: true, chaosState });
      case 'supabase-ok':
        // Restore Supabase (clear 503/500)
        if (target === 'payment_refunds') chaosState.payment_refunds_503 = false;
        else if (target === 'refund_audit_log') chaosState.refund_audit_log_503 = false;
        else if (target === 'orders_post') chaosState.orders_post_500 = false;
        return json(res, 200, { ok: true, chaosState });
      case 'stripe-timeout':
        chaosState.stripe_timeout = true;
        return json(res, 200, { ok: true, chaosState });
      case 'stripe-500':
        chaosState.stripe_500 = true;
        return json(res, 200, { ok: true, chaosState });
      case 'stripe-ok':
        chaosState.stripe_timeout = false;
        chaosState.stripe_500 = false;
        return json(res, 200, { ok: true, chaosState });
      case 'slow':
        chaosState.slow_ms = Number(target) || 0;
        return json(res, 200, { ok: true, chaosState });
      case 'drop-connection':
        chaosState.drop_connection = true;
        // Hang the connection (never respond) - simulates network failure
        // For test purposes we hang the response; the client will timeout
        setTimeout(() => {
          try { res.destroy(); } catch (e) { /* ignore */ }
        }, 50);
        return; // never call res.end
      case 'reset':
        Object.keys(chaosState).forEach((k) => { chaosState[k] = false; });
        chaosState.slow_ms = 0;
        return json(res, 200, { ok: true, chaosState });
      default:
        return json(res, 400, { message: 'unknown mode' });
    }
  });
}

// POST /rest/v1/rpc/...
function handleRpc(req, res) {
  if (req.url.startsWith('/rest/v1/rpc/issue_financial_document')) {
    return readBody(req).then((body) => {
      const existing = Array.from(financialDocumentsStore.values()).find((row) => row.order_id === body.p_order_id && row.document_type === body.p_document_type);
      if (existing) return json(res, 200, existing);
      if (!['customer_receipt', 'merchant_transaction_statement'].includes(body.p_document_type)) return json(res, 400, { message: 'unsupported_document_type' });
      const prefix = body.p_document_type === 'customer_receipt' ? 'BG-BELEG' : 'BG-TRANS';
      const now = new Date().toISOString();
      const record = { id: randomUUID(), document_number: `${prefix}-${new Date().getFullYear()}-${String(financialDocumentSequence++).padStart(8, '0')}`, document_type: body.p_document_type, order_id: body.p_order_id, customer_id: body.p_customer_id, restaurant_id: body.p_restaurant_id, status: 'issued', currency: 'EUR', snapshot: body.p_snapshot, snapshot_sha256: body.p_snapshot_sha256, issued_at: now, superseded_by: null, created_by: body.p_created_by, created_at: now };
      financialDocumentsStore.set(record.id, record);
      return json(res, 200, record);
    });
  }
  if (req.url.startsWith('/rest/v1/rpc/expire_order_item_replacements')) {
    return readBody(req).then((body) => {
      const cutoff = new Date(body?.p_now || Date.now()).getTime();
      const expired = [];
      for (const replacement of orderItemReplacementsStore.values()) {
        if (replacement.status !== 'proposed' || new Date(replacement.expires_at).getTime() > cutoff) continue;
        const order = ordersStore.get(replacement.order_id); const item = orderItemsStore.get(replacement.order_item_id);
        replacement.status = 'expired'; replacement.responded_at = new Date(cutoff).toISOString(); replacement.applied_at = replacement.responded_at; replacement.updated_at = replacement.responded_at; orderItemReplacementsStore.set(replacement.id, replacement);
        if (item) { item.configuration = { ...(item.configuration || {}), replacement_id: replacement.id, fulfillment_status: 'unavailable_refund' }; orderItemsStore.set(item.id, item); }
        const adjustmentStatus = order?.payment_method === 'stripe' && ['paid', 'succeeded', 'partially_refunded'].includes(order?.payment_status) ? 'pending' : 'not_required';
        if (order && order.payment_method !== 'stripe') { order.subtotal = Math.max(0, Number(order.subtotal) - replacement.original_line_total); order.total = Math.max(0, Number(order.total) - replacement.original_line_total); ordersStore.set(order.id, order); }
        if (!Array.from(orderFinancialAdjustmentsStore.values()).some((entry) => entry.replacement_id === replacement.id)) { const adjustment = { id: randomUUID(), order_id: replacement.order_id, replacement_id: replacement.id, adjustment_type: 'retail_substitution_refund', amount_cents: Math.round(replacement.original_line_total * 100), currency: 'EUR', status: adjustmentStatus, created_at: new Date(cutoff).toISOString(), updated_at: new Date(cutoff).toISOString() }; orderFinancialAdjustmentsStore.set(adjustment.id, adjustment); }
        expired.push({ replacement_id: replacement.id, order_id: replacement.order_id, amount_cents: Math.round(replacement.original_line_total * 100), adjustment_status: adjustmentStatus });
      }
      return json(res, 200, expired);
    });
  }
  if (req.url.startsWith('/rest/v1/rpc/propose_order_item_replacement')) {
    return readBody(req).then((body) => {
      const order = ordersStore.get(body?.p_order_id);
      const item = orderItemsStore.get(body?.p_order_item_id);
      const product = SEED_PRODUCTS.find((entry) => entry.id === body?.p_replacement_product_id);
      if (!order) return json(res, 400, { message: 'ORDER_NOT_FOUND' });
      if (!item || item.order_id !== order.id) return json(res, 400, { message: 'ITEM_NOT_FOUND' });
      if (!['pending', 'confirmed', 'preparing'].includes(order.status)) return json(res, 400, { message: 'ORDER_STATE_LOCKED' });
      const restaurant = SEED_RESTAURANTS.find((entry) => entry.id === order.restaurant_id);
      if (!restaurant || restaurant.owner_id !== body?.p_actor_id) return json(res, 400, { message: 'FORBIDDEN' });
      if (!['market', 'pharmacy'].includes(restaurant.type)) return json(res, 400, { message: 'RETAIL_ONLY' });
      if (item.configuration?.fulfillment_status) return json(res, 409, { message: 'ITEM_ALREADY_RESOLVED' });
      if ((item.configuration?.substitution_preference || 'refund_item') === 'refund_item') return json(res, 400, { message: 'CUSTOMER_REQUESTED_REFUND' });
      if (!product || product.restaurant_id !== order.restaurant_id || product.is_available === false || product.is_active === false) return json(res, 400, { message: 'REPLACEMENT_UNAVAILABLE' });
      if (product.id === item.product_id) return json(res, 400, { message: 'SAME_PRODUCT' });
      if (Array.from(orderItemReplacementsStore.values()).some((entry) => entry.order_item_id === item.id && entry.status === 'proposed')) return json(res, 409, { message: 'OPEN_PROPOSAL_EXISTS' });
      const quantity = Number(body.p_replacement_quantity || 1);
      const originalTotal = Number(item.subtotal || Number(item.product_price) * Number(item.quantity));
      const replacementPrice = Number(product.discount_price ?? product.price);
      const replacementTotal = Number((replacementPrice * quantity).toFixed(2));
      if (replacementTotal > originalTotal) return json(res, 400, { message: 'REPLACEMENT_MORE_EXPENSIVE' });
      const now = new Date().toISOString();
      const replacement = { id: randomUUID(), order_id: order.id, order_item_id: item.id, original_product_id: item.product_id, original_product_name: item.product_name, original_unit_price: item.product_price, original_quantity: item.quantity, replacement_product_id: product.id, replacement_product_name: product.name, replacement_unit_price: replacementPrice, replacement_quantity: quantity, original_line_total: originalTotal, replacement_line_total: replacementTotal, adjustment_amount: Number((originalTotal - replacementTotal).toFixed(2)), reason: body.p_reason || null, status: 'proposed', expires_at: body.p_expires_at, proposed_by: body.p_actor_id, responded_by: null, responded_at: null, applied_at: null, created_at: now, updated_at: now };
      orderItemReplacementsStore.set(replacement.id, replacement);
      return json(res, 200, [replacement]);
    });
  }
  if (req.url.startsWith('/rest/v1/rpc/respond_order_item_replacement')) {
    return readBody(req).then((body) => {
      const order = ordersStore.get(body?.p_order_id);
      const replacement = orderItemReplacementsStore.get(body?.p_replacement_id);
      if (!order) return json(res, 400, { message: 'ORDER_NOT_FOUND' });
      if (order.customer_id !== body?.p_actor_id) return json(res, 400, { message: 'FORBIDDEN' });
      if (!replacement || replacement.order_id !== order.id) return json(res, 400, { message: 'REPLACEMENT_NOT_FOUND' });
      if (replacement.status !== 'proposed') return json(res, 409, { message: 'ALREADY_RESOLVED' });
      if (new Date(replacement.expires_at).getTime() <= Date.now()) { replacement.status = 'expired'; orderItemReplacementsStore.set(replacement.id, replacement); return json(res, 409, { message: 'PROPOSAL_EXPIRED' }); }
      const item = orderItemsStore.get(replacement.order_item_id);
      const accepted = body.p_action === 'accept';
      const credit = accepted ? replacement.adjustment_amount : replacement.original_line_total;
      if (accepted) Object.assign(item, { product_id: replacement.replacement_product_id, product_name: replacement.replacement_product_name, product_price: replacement.replacement_unit_price, quantity: replacement.replacement_quantity, subtotal: replacement.replacement_line_total, configuration: { ...(item.configuration || {}), replacement_id: replacement.id, original_product_id: replacement.original_product_id, original_product_name: replacement.original_product_name, fulfillment_status: 'substituted' } });
      else item.configuration = { ...(item.configuration || {}), replacement_id: replacement.id, fulfillment_status: 'unavailable_refund' };
      orderItemsStore.set(item.id, item);
      Object.assign(replacement, { status: accepted ? 'applied' : 'rejected', responded_by: body.p_actor_id, responded_at: new Date().toISOString(), applied_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      orderItemReplacementsStore.set(replacement.id, replacement);
      if (credit > 0) { if (order.payment_method !== 'stripe') { order.subtotal = Math.max(0, Number(order.subtotal) - credit); order.total = Math.max(0, Number(order.total) - credit); ordersStore.set(order.id, order); } const adjustment = { id: randomUUID(), order_id: order.id, replacement_id: replacement.id, adjustment_type: 'retail_substitution_refund', amount_cents: Math.round(credit * 100), currency: 'EUR', status: order.payment_method === 'stripe' && ['paid', 'succeeded', 'partially_refunded'].includes(order.payment_status) ? 'pending' : 'not_required', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; orderFinancialAdjustmentsStore.set(adjustment.id, adjustment); }
      return json(res, 200, [replacement]);
    });
  }
  if (req.url.startsWith('/rest/v1/rpc/approve_product_request')) {
    return readBody(req).then((body) => {
      if (!body?.p_actor_id) return json(res, 403, { code: '42501', message: 'admin_required' });
      const request = productRequestsStore.get(body?.p_request_id);
      if (!request) return json(res, 400, { message: 'request_not_found' });
      if (request.status !== 'pending') return json(res, 409, { message: 'request_already_reviewed' });
      const edits = body?.p_edits || {};
      const now = new Date().toISOString();
      const product = { id: randomUUID(), restaurant_id: request.restaurant_id, name: edits.name || request.name, description: edits.description ?? request.description, category: edits.category || request.category, price: Number(edits.price ?? request.suggested_price), image_url: edits.image_url || request.image_url || null, image_urls: [edits.image_url || request.image_url].filter(Boolean), is_active: true, is_available: true, approval_status: 'approved', archived_at: null, approved_by: body.p_actor_id, approved_at: now, created_at: now, updated_at: now };
      SEED_PRODUCTS.push(product);
      productRequestsStore.set(request.id, { ...request, status: 'approved', resulting_product_id: product.id, reviewed_by: body.p_actor_id, reviewed_at: now, updated_at: now });
      return json(res, 200, product.id);
    });
  }
  // Phase 7F: Order Draft atomic operations
  if (req.url.startsWith('/rest/v1/rpc/burn_order_draft')) {
    return readBody(req).then((body) => {
      const draftId = body?.p_draft_id;
      const confirmedBy = body?.p_confirmed_by;
      if (!draftId) return json(res, 400, { message: 'p_draft_id required' });
      const existing = orderDraftsStore.get(draftId);
      if (!existing) return json(res, 200, false);
      if (existing.used) return json(res, 200, false);
      if (existing.deleted_at) return json(res, 200, false);
      if (new Date(existing.expires_at) < new Date()) return json(res, 200, false);
      // Atomic burn
      existing.used = true;
      existing.used_at = new Date().toISOString();
      existing.confirmed_by = confirmedBy || null;
      existing.updated_at = new Date().toISOString();
      orderDraftsStore.set(draftId, existing);
      return json(res, 200, true);
    });
  }
  if (req.url.startsWith('/rest/v1/rpc/get_active_order_draft')) {
    return readBody(req).then((body) => {
      const customerId = body?.p_customer_id;
      if (!customerId) return json(res, 200, []);
      const all = Array.from(orderDraftsStore.values());
      const active = all
        .filter((d) => d.customer_id === customerId && !d.used && !d.deleted_at && new Date(d.expires_at) > new Date())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 1);
      return json(res, 200, active);
    });
  }
  if (req.url.startsWith('/rest/v1/rpc/gc_expired_order_drafts')) {
    return readBody(req).then(() => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      let count = 0;
      for (const [id, d] of orderDraftsStore) {
        if (d.deleted_at) continue;
        const expiresAt = new Date(d.expires_at).getTime();
        const usedAt = d.used_at ? new Date(d.used_at).getTime() : 0;
        if (expiresAt < oneDayAgo || (d.used && usedAt < sevenDaysAgo)) {
          d.deleted_at = new Date().toISOString();
          orderDraftsStore.set(id, d);
          count++;
        }
      }
      return json(res, 200, count);
    });
  }
  if (req.url.startsWith('/rest/v1/rpc/create_order_atomic')) {
    return readBody(req).then((body) => {
      // Atomic order creation: 1 order + N items in a single transaction.
      // In production, this is a Postgres function with BEGIN/COMMIT.
      // The mock simulates by writing both in sequence (no transaction,
      // but no other concurrent writer exists in mock).
      //
      // Phase 7G-A: payment_intent_id is now UNIQUE — mirrors migration 63.
      // If the same payment_intent_id is used twice (e.g. duplicate webhook),
      // the second call returns the EXISTING order (idempotent), not a new one.
      const items = body?.p_items || [];
      if (!Array.isArray(items) || items.length === 0) {
        return json(res, 400, { message: 'p_items must be a non-empty array' });
      }
      const existingByOrderNumber = Array.from(ordersStore.values()).find(
        (order) => order.order_number === body.p_order_number,
      );
      if (existingByOrderNumber) {
        return json(res, 200, [{
          order_id: existingByOrderNumber.id,
          order_number: existingByOrderNumber.order_number,
          duplicate: true,
        }]);
      }
      const paymentIntentId = body.p_payment_intent_id;
      // Idempotency check: if this payment_intent_id already created an order, return it
      if (paymentIntentId && orderPaymentIntents.has(paymentIntentId)) {
        const existingId = Array.from(ordersStore.values()).find(
          (o) => o.payment_intent_id === paymentIntentId,
        )?.id;
        if (existingId) {
          const existing = ordersStore.get(existingId);
          return json(res, 200, [{
            order_id: existingId,
            order_number: existing.order_number,
            duplicate: true,  // flag to indicate this was a dedup
          }]);
        }
      }
      const orderId = randomUUID();
      const now = new Date().toISOString();
      const fulfillmentType = body.p_fulfillment_type === 'pickup' ? 'pickup' : 'delivery';
      const pickupCode = fulfillmentType === 'pickup'
        ? String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
        : null;
      const rawDeliveryAddress = fulfillmentType === 'pickup' ? null : body.p_delivery_address;
      const privateDeliveryPreferences = rawDeliveryAddress && typeof rawDeliveryAddress === 'object'
        ? rawDeliveryAddress.delivery_preferences
        : null;
      const publicDeliveryAddress = rawDeliveryAddress && typeof rawDeliveryAddress === 'object'
        ? Object.fromEntries(Object.entries(rawDeliveryAddress).filter(([key]) => key !== 'delivery_preferences'))
        : rawDeliveryAddress;
      const order = {
        id: orderId,
        order_number: body.p_order_number,
        customer_id: body.p_customer_id,
        restaurant_id: body.p_restaurant_id,
        status: 'pending',
        subtotal: body.p_subtotal,
        fulfillment_type: fulfillmentType,
        pickup_code: pickupCode,
        driver_id: null,
        delivery_fee: fulfillmentType === 'pickup' ? 0 : body.p_delivery_fee,
        service_fee: body.p_service_fee,
        tip: body.p_tip,
        discount: body.p_discount,
        total: fulfillmentType === 'pickup' ? Number(body.p_total) - Number(body.p_delivery_fee || 0) : body.p_total,
        payment_method: body.p_payment_method,
        payment_intent_id: paymentIntentId || null,
        stripe_event_id: body.p_stripe_event_id || null,
        payment_status: paymentIntentId ? 'succeeded' : 'pending',
        amount_refunded_cents: 0,
        last_refund_status: null,
        last_refund_at: null,
        delivery_address: publicDeliveryAddress,
        customer_latitude: fulfillmentType === 'pickup' ? null : body.p_customer_latitude,
        customer_longitude: fulfillmentType === 'pickup' ? null : body.p_customer_longitude,
        scheduled_for: body.p_scheduled_for,
        created_at: now,
        updated_at: now,
      };
      ordersStore.set(orderId, order);
      if (privateDeliveryPreferences && Object.keys(privateDeliveryPreferences).length > 0) {
        orderDeliveryPreferencesStore.set(orderId, {
          order_id: orderId,
          customer_id: body.p_customer_id,
          preferences: privateDeliveryPreferences,
          created_at: now,
          updated_at: now,
        });
      }
      if (paymentIntentId) {
        orderPaymentIntents.add(paymentIntentId);
      }
      for (const it of items) {
        const itemId = randomUUID();
        const item = {
          id: itemId,
          order_id: orderId,
          product_id: it.product_id,
          product_name: it.product_name,
          product_price: it.product_price,
          quantity: it.quantity,
          subtotal: it.subtotal,
          config_key: it.config_key,
          configuration: it.configuration,
          created_at: now,
        };
        orderItemsStore.set(itemId, item);
      }
      return json(res, 200, [{ order_id: orderId, order_number: body.p_order_number }]);
    });
  }

  if (req.url.startsWith('/rest/v1/rpc/complete_driver_delivery')) {
    return readBody(req).then((body) => {
      const order = ordersStore.get(body?.p_order_id);
      if (!order || order.driver_id !== body?.p_driver_id || !['picked_up', 'delivering'].includes(order.status)) {
        return json(res, 409, { code: 'P0001', message: 'DELIVERY_STATE_CHANGED' });
      }
      const now = new Date().toISOString();
      Object.assign(order, { status: 'delivered', delivered_at: now, updated_at: now });
      ordersStore.set(order.id, order);
      if (body.p_proof_path) {
        orderDeliveryProofsStore.set(order.id, {
          id: order.id,
          order_id: order.id,
          driver_id: body.p_driver_id,
          storage_path: body.p_proof_path,
          mime_type: body.p_proof_mime_type,
          byte_size: body.p_proof_byte_size,
          captured_at: now,
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
          deleted_at: null,
          created_at: now,
        });
      }
      const status = driverStatusStore.get(body.p_driver_id);
      if (status?.current_order_id === order.id) driverStatusStore.set(body.p_driver_id, { ...status, is_on_delivery: false, current_order_id: null, updated_at: now });
      return postgrestResult(req, res, [order]);
    });
  }

  if (req.url.startsWith('/rest/v1/rpc/fail_driver_delivery')) {
    return readBody(req).then((body) => {
      const order = ordersStore.get(body?.p_order_id);
      if (!order || order.driver_id !== body?.p_driver_id || !['picked_up', 'delivering'].includes(order.status)) {
        return json(res, 409, { code: 'P0001', message: 'DELIVERY_STATE_CHANGED' });
      }
      const now = new Date().toISOString();
      Object.assign(order, { status: 'could_not_deliver', updated_at: now });
      ordersStore.set(order.id, order);
      orderFailedDeliveriesStore.set(order.id, {
        id: order.id,
        order_id: order.id,
        driver_id: body.p_driver_id,
        reason_code: body.p_reason_code,
        details: body.p_details || null,
        contact_attempts: body.p_contact_attempts,
        reported_at: now,
        resolved_at: null,
        resolved_by: null,
        resolution: null,
      });
      const status = driverStatusStore.get(body.p_driver_id);
      if (status?.current_order_id === order.id) driverStatusStore.set(body.p_driver_id, { ...status, is_on_delivery: false, current_order_id: null, updated_at: now });
      return postgrestResult(req, res, [order]);
    });
  }

  if (req.url.startsWith('/rest/v1/rpc/finalize_group_order')) {
    return readBody(req).then((body) => {
      const group = groupOrdersStore.get(body?.p_group_order_id);
      const order = ordersStore.get(body?.p_order_id);
      if (!group || !order || group.host_user_id !== body?.p_host_user_id || order.customer_id !== body?.p_host_user_id || order.restaurant_id !== group.restaurant_id) {
        return json(res, 200, false);
      }
      if (group.status === 'completed' && group.completed_order_id === order.id) return json(res, 200, true);
      if (group.status !== 'locked' || group.completed_order_id) return json(res, 200, false);
      groupOrdersStore.set(group.id, { ...group, status: 'completed', completed_order_id: order.id, updated_at: new Date().toISOString() });
      return json(res, 200, true);
    });
  }

  // Phase 7G-B: update_draft_payment_state (CAS)
  if (req.url.startsWith('/rest/v1/rpc/update_draft_payment_state')) {
    return readBody(req).then((body) => {
      const draftId = body?.p_draft_id;
      const expected = body?.p_expected_status;
      const newStatus = body?.p_new_status;
      if (!draftId || !newStatus) return json(res, 200, [{ ok: false, current_status: null }]);
      const existing = orderDraftsStore.get(draftId);
      if (!existing) return json(res, 200, [{ ok: false, current_status: null }]);
      // CAS: only update if current state matches expected
      if (existing.payment_status !== expected) {
        return json(res, 200, [{ ok: false, current_status: existing.payment_status }]);
      }
      existing.payment_status = newStatus;
      if (body.p_last_event_at) existing.last_payment_event_at = body.p_last_event_at;
      if (body.p_last_event_type) existing.last_payment_event_type = body.p_last_event_type;
      if (body.p_last_event_id) existing.last_payment_event_id = body.p_last_event_id;
      orderDraftsStore.set(draftId, existing);
      return json(res, 200, [{ ok: true, current_status: newStatus }]);
    });
  }

  // Phase 7G-B: get_payment_intent_history
  if (req.url.startsWith('/rest/v1/rpc/get_payment_intent_history')) {
    return readBody(req).then((body) => {
      const piId = body?.p_payment_intent_id;
      if (!piId) return json(res, 200, []);
      const all = Array.from(paymentIntentHistoryStore.values()).filter((r) => r.payment_intent_id === piId);
      return json(res, 200, all);
    });
  }

  // Phase 7G-C: payment_rate_limit_check
  if (req.url.startsWith('/rest/v1/rpc/payment_rate_limit_check')) {
    return handleRateLimitCheckRpc(req, res);
  }

  // Phase 7G-C: pg_try_advisory_lock (mock: always true)
  if (req.url.startsWith('/rest/v1/rpc/pg_try_advisory_lock')) {
    return json(res, 200, true);
  }
  if (req.url.startsWith('/rest/v1/rpc/pg_advisory_unlock')) {
    return json(res, 200, true);
  }

  // Phase 7G-D: recompute_order_payment_status
  if (req.url.startsWith('/rest/v1/rpc/recompute_order_payment_status')) {
    return readBody(req).then((body) => {
      const orderId = body?.p_order_id;
      if (!orderId) return json(res, 400, { code: 'P0002', message: 'order_not_found' });
      const order = ordersStore.get(orderId);
      if (!order) return json(res, 400, { code: 'P0002', message: 'order_not_found' });
      const receivedCents = Math.round(Number(order.total ?? 0) * 100);
      let refundedSucceeded = 0, refundedPending = 0, refundedFailed = 0;
      for (const r of paymentRefundsStore.values()) {
        if (r.order_id !== orderId) continue;
        const v = Number(r.refunded_amount_cents ?? 0);
        if (r.status === 'succeeded') refundedSucceeded += v;
        else if (['pending', 'submitted', 'validating', 'requested'].includes(r.status)) refundedPending += v;
        else if (['failed', 'requires_review', 'canceled'].includes(r.status)) refundedFailed += v;
      }
      let newStatus;
      if (receivedCents <= 0) newStatus = 'pending';
      else if (refundedSucceeded >= receivedCents && refundedPending === 0 && refundedFailed === 0) newStatus = 'refunded';
      else if (refundedSucceeded > 0 && refundedSucceeded < receivedCents) newStatus = 'partially_refunded';
      else if (refundedPending > 0 && refundedSucceeded < receivedCents) newStatus = 'refund_pending';
      else if (refundedFailed > 0 && refundedSucceeded === 0) newStatus = 'refund_failed';
      else newStatus = 'succeeded';
      // Update order
      order.payment_status = newStatus;
      order.amount_refunded_cents = refundedSucceeded;
      // Last refund
      const lastRefund = Array.from(paymentRefundsStore.values())
        .filter((r) => r.order_id === orderId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (lastRefund) {
        order.last_refund_status = lastRefund.status;
        order.last_refund_at = lastRefund.updated_at;
      }
      order.updated_at = new Date().toISOString();
      ordersStore.set(orderId, order);
      return json(res, 200, newStatus);
    });
  }

  // Phase 7G-D: refund_max_amount_cents
  if (req.url.startsWith('/rest/v1/rpc/refund_max_amount_cents')) {
    return readBody(req).then((body) => {
      const orderId = body?.p_order_id;
      if (!orderId) return json(res, 400, { code: 'P0002', message: 'order_not_found' });
      const order = ordersStore.get(orderId);
      if (!order) return json(res, 400, { code: 'P0002', message: 'order_not_found' });
      const received = Math.round(Number(order.total ?? 0) * 100);
      let refunded = 0, pending = 0;
      for (const r of paymentRefundsStore.values()) {
        if (r.order_id !== orderId) continue;
        const v = Number(r.refunded_amount_cents ?? 0);
        if (r.status === 'succeeded') refunded += v;
        else if (['pending', 'submitted', 'validating', 'requested'].includes(r.status)) pending += v;
      }
      const max = Math.max(0, received - refunded - pending);
      return json(res, 200, [{
        received_cents: received,
        already_refunded_cents: refunded,
        pending_cents: pending,
        max_refundable_cents: max,
        can_full_refund: received > 0 && refunded + pending === 0,
        currency: 'EUR',
      }]);
    });
  }

  return json(res, 200, []);
}

// POST /auth/v1/admin/users
async function handleAdminCreateUser(req, res) {
  const body = await readBody(req);
  const { email, password, email_confirm, user_metadata, app_metadata } = body;
  if (!email || !password) return badRequest(res, 'Missing email or password');
  if (registeredUsers.has(email.toLowerCase()) || ACCOUNTS[email.toLowerCase()]) {
    return json(res, 422, { msg: 'A user with this email address has already been registered', code: 'email_exists' });
  }
  const id = randomUUID();
  const account = {
    id,
    email: email.toLowerCase(),
    password,
    // Mirror Supabase's trusted server-managed claims. Production onboarding
    // stores authorization in app_metadata, never in user-editable metadata.
    role: app_metadata?.app_role || 'customer',
    permissions: Array.isArray(app_metadata?.permissions) ? app_metadata.permissions : [],
    name: user_metadata?.name || email.split('@')[0],
    is_active: true,
    is_verified: email_confirm !== false,
  };
  registeredUsers.set(email.toLowerCase(), account);
  return json(res, 200, {
    id: account.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: account.email,
    email_confirmed_at: account.is_verified ? new Date().toISOString() : null,
    phone: '',
    confirmed_at: account.is_verified ? new Date().toISOString() : null,
    last_sign_in_at: null,
    app_metadata: authAppMetadata(account),
    user_metadata: user_metadata || {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// POST /auth/v1/invite — mirrors Supabase admin inviteUserByEmail.
// The mock never exposes a usable password or activation token; tests only
// assert that a pending auth identity is created and receives trusted metadata.
async function handleAdminInviteUser(req, res) {
  const body = await readBody(req);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const userMetadata = body.data && typeof body.data === 'object' ? body.data : {};
  if (!email) return badRequest(res, 'Missing email');
  if (registeredUsers.has(email) || ACCOUNTS[email]) {
    return json(res, 422, { msg: 'A user with this email address has already been registered', code: 'email_exists' });
  }
  const account = {
    id: randomUUID(),
    email,
    password: null,
    role: 'customer',
    permissions: [],
    name: userMetadata.name || email.split('@')[0],
    metadata: userMetadata,
    is_active: true,
    is_verified: false,
  };
  registeredUsers.set(email, account);
  return json(res, 200, authUserRow(account));
}

// GET /auth/v1/admin/users?email=...
async function handleAdminListUsers(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const emailFilter = url.searchParams.get('email');
  const idFilter = url.searchParams.get('id');
  const eqMatch = (filter) => {
    if (!filter) return null;
    const m = filter.match(/^eq\.(.+)$/);
    return m ? m[1] : filter;
  };
  const emailVal = eqMatch(emailFilter);
  const idVal = eqMatch(idFilter);

  const all = [...Object.values(ACCOUNTS), ...registeredUsers.values()];
  const result = all.filter((u) => {
    if (emailVal && u.email.toLowerCase() !== emailVal.toLowerCase()) return false;
    if (idVal && u.id !== idVal) return false;
    return true;
  });
  const rows = result.map((u) => ({
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.is_verified ? '2025-01-01T00:00:00.000Z' : null,
    phone: '',
    confirmed_at: u.is_verified ? '2025-01-01T00:00:00.000Z' : null,
    last_sign_in_at: '2025-01-01T00:00:00.000Z',
    app_metadata: authAppMetadata(u),
    user_metadata: { name: u.name },
    identities: [],
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  }));
  return json(res, 200, rows);
}

// DELETE /auth/v1/admin/users/<uuid>
async function handleAdminDeleteUser(req, res) {
  const m = req.url.match(/\/auth\/v1\/admin\/users\/([^/?]+)/);
  const userId = m ? m[1] : null;
  if (!userId) return badRequest(res, 'Missing user id');
  for (const [email, u] of registeredUsers.entries()) {
    if (u.id === userId) { registeredUsers.delete(email); return json(res, 200, {}); }
  }
  return json(res, 404, { msg: 'User not found', code: 'user_not_found' });
}

// POST /rest/v1/email_otps  (insert new OTP)
async function handleInsertOtp(req, res) {
  const body = await readBody(req);
  const records = Array.isArray(body) ? body : [body];
  const inserted = records.map((r) => {
    const id = randomUUID();
    const record = {
      id,
      email: r.email,
      user_id: r.user_id,
      code_hash: r.code_hash,
      purpose: r.purpose,
      expires_at: r.expires_at,
      used_at: r.used_at || null,
      created_at: new Date().toISOString(),
    };
    otpStore.set(id, record);
    return record;
  });
  return json(res, 201, inserted);
}

// PATCH /rest/v1/email_otps?id=eq.<uuid>&used_at=is.null
async function handleUpdateOtp(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const body = await readBody(req);
  const updated = [];
  for (const [id, record] of otpStore.entries()) {
    if (body.used_at) {
      record.used_at = body.used_at;
      updated.push(record);
    }
  }
  return json(res, 200, updated);
}

// GET /rest/v1/email_otps?email=eq.<email>&purpose=eq.<purpose>&used_at=is.null
async function handleGetOtps(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const emailFilter = url.searchParams.get('email');
  const purposeFilter = url.searchParams.get('purpose');
  const eqMatch = (filter) => {
    if (!filter) return null;
    const m = filter.match(/^eq\.(.+)$/);
    return m ? m[1] : filter;
  };
  const emailVal = eqMatch(emailFilter);
  const purposeVal = eqMatch(purposeFilter);
  const result = [];
  for (const r of otpStore.values()) {
    if (emailVal && r.email.toLowerCase() !== emailVal.toLowerCase()) continue;
    if (purposeVal && r.purpose !== purposeVal) continue;
    if (r.used_at) continue;
    result.push(r);
  }
  const accept = req.headers.accept || '';
  const isSingle = accept.includes('application/vnd.pgrst.object+json');
  if (isSingle) {
    if (result.length === 0) {
      res.writeHead(406, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'No rows found', code: 'PGRST116' }));
    }
    return json(res, 200, result[0]);
  }
  return json(res, 200, result);
}

// POST /rest/v1/legal_acceptance_records
async function handleInsertLegalAcceptance(req, res) {
  const body = await readBody(req);
  const records = Array.isArray(body) ? body : [body];
  const inserted = [];

  for (const input of records) {
    const required = ['user_id', 'terms_version', 'privacy_version', 'locale'];
    const missing = required.find((field) => !input?.[field]);
    if (missing) {
      return json(res, 400, {
        message: `null value in column "${missing}" violates not-null constraint`,
        code: '23502',
      });
    }
    if (!['de', 'ar', 'en'].includes(input.locale)) {
      return json(res, 400, {
        message: 'new row violates check constraint "legal_acceptance_records_locale_check"',
        code: '23514',
      });
    }
    const source = input.source || 'self_registration';
    if (!['self_registration', 'admin_onboarding', 'migration'].includes(source)) {
      return json(res, 400, {
        message: 'new row violates check constraint "legal_acceptance_records_source_check"',
        code: '23514',
      });
    }
    const duplicate = [...legalAcceptanceStore.values()].some((record) =>
      record.user_id === input.user_id
      && record.terms_version === input.terms_version
      && record.privacy_version === input.privacy_version
    );
    if (duplicate) {
      return json(res, 409, {
        message: 'duplicate key value violates unique constraint "legal_acceptance_records_user_id_terms_version_privacy_version_key"',
        code: '23505',
      });
    }

    const record = {
      id: input.id || randomUUID(),
      user_id: input.user_id,
      terms_version: input.terms_version,
      privacy_version: input.privacy_version,
      locale: input.locale,
      source,
      accepted_at: input.accepted_at || new Date().toISOString(),
    };
    legalAcceptanceStore.set(record.id, record);
    inserted.push(record);
  }

  return json(res, 201, inserted);
}

// GET /rest/v1/legal_acceptance_records?user_id=eq.<uuid>
async function handleGetLegalAcceptances(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const filters = ['id', 'user_id', 'terms_version', 'privacy_version', 'locale', 'source'];
  let result = [...legalAcceptanceStore.values()];
  for (const field of filters) {
    const raw = url.searchParams.get(field);
    if (!raw) continue;
    const value = raw.startsWith('eq.') ? raw.slice(3) : raw;
    result = result.filter((record) => String(record[field]) === value);
  }
  const limit = Number.parseInt(url.searchParams.get('limit') || '', 10);
  if (Number.isFinite(limit) && limit >= 0) result = result.slice(0, limit);

  const accept = req.headers.accept || '';
  if (accept.includes('application/vnd.pgrst.object+json')) {
    if (result.length !== 1) {
      return json(res, 406, { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' });
    }
    return json(res, 200, result[0]);
  }
  return json(res, 200, result);
}

// DELETE /rest/v1/legal_acceptance_records?user_id=eq.<uuid>
async function handleDeleteLegalAcceptances(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const idFilter = url.searchParams.get('id');
  const userIdFilter = url.searchParams.get('user_id');
  const id = idFilter?.startsWith('eq.') ? idFilter.slice(3) : idFilter;
  const userId = userIdFilter?.startsWith('eq.') ? userIdFilter.slice(3) : userIdFilter;
  const deleted = [];
  for (const [recordId, record] of legalAcceptanceStore.entries()) {
    if (id && recordId !== id) continue;
    if (userId && record.user_id !== userId) continue;
    legalAcceptanceStore.delete(recordId);
    deleted.push(record);
  }
  return json(res, 200, deleted);
}

// POST /rest/v1/password_reset_tokens
async function handleInsertResetToken(req, res) {
  const body = await readBody(req);
  const records = Array.isArray(body) ? body : [body];
  const inserted = records.map((r) => {
    const id = randomUUID();
    const record = {
      id,
      email: r.email,
      user_id: r.user_id,
      token_hash: r.token_hash,
      expires_at: r.expires_at,
      used_at: r.used_at || null,
      created_at: new Date().toISOString(),
    };
    resetTokens.set(id, record);
    return record;
  });
  return json(res, 201, inserted);
}

// GET /rest/v1/password_reset_tokens?email=eq.<email>
async function handleGetResetTokens(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const emailFilter = url.searchParams.get('email');
  const eqMatch = (filter) => {
    if (!filter) return null;
    const m = filter.match(/^eq\.(.+)$/);
    return m ? m[1] : filter;
  };
  const emailVal = eqMatch(emailFilter);
  const result = [];
  for (const r of resetTokens.values()) {
    if (emailVal && r.email.toLowerCase() !== emailVal.toLowerCase()) continue;
    if (r.used_at) continue;
    result.push(r);
  }
  const accept = req.headers.accept || '';
  const isSingle = accept.includes('application/vnd.pgrst.object+json');
  if (isSingle) {
    if (result.length === 0) {
      res.writeHead(406, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'No rows found', code: 'PGRST116' }));
    }
    return json(res, 200, result[0]);
  }
  return json(res, 200, result);
}

// PATCH /rest/v1/password_reset_tokens?id=eq.<uuid>
async function handleUpdateResetToken(req, res) {
  const body = await readBody(req);
  const updated = [];
  for (const [, record] of resetTokens.entries()) {
    if (body.used_at) {
      record.used_at = body.used_at;
      updated.push(record);
    }
  }
  return json(res, 200, updated);
}

// POST /rest/v1/magic_link_tokens
async function handleInsertMagicLinkToken(req, res) {
  const body = await readBody(req);
  const records = Array.isArray(body) ? body : [body];
  const inserted = records.map((r) => {
    const id = randomUUID();
    const record = {
      id,
      email: r.email,
      user_id: r.user_id,
      token_hash: r.token_hash,
      expires_at: r.expires_at,
      used_at: r.used_at || null,
      created_at: new Date().toISOString(),
      redirect_to: r.redirect_to,
    };
    magicLinkTokens.set(id, record);
    return record;
  });
  return json(res, 201, inserted);
}

// GET /rest/v1/magic_link_tokens?token_hash=eq.<hash>
async function handleGetMagicLinkTokens(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const tokenHashFilter = url.searchParams.get('token_hash');
  const emailFilter = url.searchParams.get('email');
  const eqMatch = (filter) => {
    if (!filter) return null;
    const m = filter.match(/^eq\.(.+)$/);
    return m ? m[1] : filter;
  };
  const tokenHash = eqMatch(tokenHashFilter);
  const emailVal = eqMatch(emailFilter);
  const result = [];
  for (const r of magicLinkTokens.values()) {
    if (tokenHash && r.token_hash !== tokenHash) continue;
    if (emailVal && r.email && r.email.toLowerCase() !== emailVal.toLowerCase()) continue;
    if (r.used_at) continue;
    result.push(r);
  }
  const accept = req.headers.accept || '';
  const isSingle = accept.includes('application/vnd.pgrst.object+json');
  if (isSingle) {
    if (result.length === 0) {
      res.writeHead(406, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'No rows found', code: 'PGRST116' }));
    }
    return json(res, 200, result[0]);
  }
  return json(res, 200, result);
}

// PATCH /rest/v1/magic_link_tokens?id=eq.<uuid>
async function handleUpdateMagicLinkToken(req, res) {
  const body = await readBody(req);
  const updated = [];
  for (const [, record] of magicLinkTokens.entries()) {
    if (body.used_at) {
      record.used_at = body.used_at;
      updated.push(record);
    }
  }
  return json(res, 200, updated);
}

function authUserRow(account) {
  return {
    id: account.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: account.email,
    phone: account.phone || '',
    app_metadata: authAppMetadata(account),
    user_metadata: {
      role: account.role,
      name: account.name,
      permissions: account.permissions ?? [],
      ...(account.metadata ?? {}),
    },
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  };
}

function handleAdminGetUser(req, res) {
  const m = req.url.match(/\/auth\/v1\/admin\/users\/([^/?]+)/);
  const userId = m ? decodeURIComponent(m[1]) : null;
  const account = [...Object.values(ACCOUNTS), ...registeredUsers.values()].find((entry) => entry.id === userId);
  return account ? json(res, 200, { user: authUserRow(account) }) : json(res, 404, { msg: 'User not found', code: 'user_not_found' });
}

// PUT /auth/v1/admin/users/<uuid>
async function handleAdminUpdateUser(req, res) {
  const m = req.url.match(/\/auth\/v1\/admin\/users\/([^/?]+)/);
  const userId = m ? m[1] : null;
  if (!userId) return badRequest(res, 'Missing user id');
  const body = await readBody(req);
  const account = [...Object.values(ACCOUNTS), ...registeredUsers.values()].find((entry) => entry.id === userId);
  if (!account) return json(res, 404, { msg: 'User not found', code: 'user_not_found' });
  if (body.user_metadata) {
    account.name = body.user_metadata.name || account.name;
    account.metadata = { ...(account.metadata ?? {}), ...body.user_metadata };
  }
  if (body.app_metadata) {
    account.role = body.app_metadata.app_role || account.role;
    account.permissions = Array.isArray(body.app_metadata.permissions) ? body.app_metadata.permissions : account.permissions;
  }
  if (body.email) account.email = body.email.toLowerCase();
  if (body.password) account.password = body.password;
  if (body.email_confirm === true) account.is_verified = true;
  if (body.ban_duration) account.is_active = false;
  return json(res, 200, authUserRow(account));
}

// ── Server ──
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const grantType = url.searchParams.get('grant_type');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    });
    return res.end();
  }

  try {
    // GoTrue routes
    if (path === '/auth/v1/token' && grantType === 'password' && req.method === 'POST') {
      return handlePasswordGrant(req, res);
    }
    if (path === '/auth/v1/token' && grantType === 'refresh_token' && req.method === 'POST') {
      return handleRefreshToken(req, res);
    }
    if (path === '/auth/v1/user' && req.method === 'GET') {
      return handleGetUser(req, res);
    }
    if (path === '/auth/v1/logout' && req.method === 'POST') {
      return handleLogout(req, res);
    }
    if (path === '/auth/v1/otp' && req.method === 'POST') {
      return handleOtpRequest(req, res);
    }
    if (path === '/auth/v1/invite' && req.method === 'POST') {
      return handleAdminInviteUser(req, res);
    }
    if (path === '/auth/v1/admin/users' && req.method === 'POST') {
      return handleAdminCreateUser(req, res);
    }
    if (path === '/auth/v1/admin/users' && req.method === 'GET') {
      return handleAdminListUsers(req, res);
    }
    // /auth/v1/admin/users/<uuid> — delete / update
    if (path.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') {
      return handleAdminDeleteUser(req, res);
    }
    if (path.startsWith('/auth/v1/admin/users/') && req.method === 'GET') {
      return handleAdminGetUser(req, res);
    }
    if (path.startsWith('/auth/v1/admin/users/') && req.method === 'PUT') {
      return handleAdminUpdateUser(req, res);
    }

    // Private Supabase Storage subset used by delivery proof workflows.
    if (path.startsWith('/storage/v1/object/sign/delivery-proofs/') && req.method === 'POST') {
      const objectPath = decodeURIComponent(path.slice('/storage/v1/object/sign/delivery-proofs/'.length));
      if (!privateStorageObjects.has(`delivery-proofs/${objectPath}`)) return json(res, 404, { message: 'Object not found' });
      return json(res, 200, { signedURL: `/object/sign/delivery-proofs/${objectPath}?token=mock-delivery-proof` });
    }
    if (path.startsWith('/storage/v1/object/delivery-proofs/') && req.method === 'POST') {
      const objectPath = decodeURIComponent(path.slice('/storage/v1/object/delivery-proofs/'.length));
      const bytes = await readRawBody(req);
      privateStorageObjects.set(`delivery-proofs/${objectPath}`, bytes);
      return json(res, 200, { Key: `delivery-proofs/${objectPath}` });
    }
    if (path === '/storage/v1/object/delivery-proofs' && req.method === 'DELETE') {
      const body = await readBody(req);
      for (const objectPath of body.prefixes || []) privateStorageObjects.delete(`delivery-proofs/${objectPath}`);
      return json(res, 200, { message: 'Successfully deleted' });
    }
    if (path.startsWith('/storage/v1/object/sign/delivery-proofs/') && req.method === 'GET') {
      const encoded = path.slice('/storage/v1/object/sign/delivery-proofs/'.length);
      const objectPath = decodeURIComponent(encoded);
      const bytes = privateStorageObjects.get(`delivery-proofs/${objectPath}`);
      if (!bytes) return json(res, 404, { message: 'Object not found' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' });
      return res.end(bytes);
    }
    if (path.startsWith('/storage/v1/object/sign/support-attachments/') && req.method === 'POST') {
      const objectPath = decodeURIComponent(path.slice('/storage/v1/object/sign/support-attachments/'.length));
      if (!privateStorageObjects.has(`support-attachments/${objectPath}`)) return json(res, 404, { message: 'Object not found' });
      return json(res, 200, { signedURL: `/object/sign/support-attachments/${objectPath}?token=mock-support-attachment` });
    }
    if (path.startsWith('/storage/v1/object/support-attachments/') && req.method === 'POST') {
      const objectPath = decodeURIComponent(path.slice('/storage/v1/object/support-attachments/'.length));
      const bytes = await readRawBody(req);
      privateStorageObjects.set(`support-attachments/${objectPath}`, bytes);
      return json(res, 200, { Key: `support-attachments/${objectPath}` });
    }
    if (path === '/storage/v1/object/support-attachments' && req.method === 'DELETE') {
      const body = await readBody(req);
      for (const objectPath of body.prefixes || []) privateStorageObjects.delete(`support-attachments/${objectPath}`);
      return json(res, 200, { message: 'Successfully deleted' });
    }
    if (path.startsWith('/storage/v1/object/sign/support-attachments/') && req.method === 'GET') {
      const objectPath = decodeURIComponent(path.slice('/storage/v1/object/sign/support-attachments/'.length));
      const bytes = privateStorageObjects.get(`support-attachments/${objectPath}`);
      if (!bytes) return json(res, 404, { message: 'Object not found' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' });
      return res.end(bytes);
    }

    // PostgREST
    if (path === '/rest/v1/users' && req.method === 'GET') {
      return handleGetUserProfile(req, res);
    }
    if (path.startsWith('/rest/v1/users') && req.method === 'GET') {
      return handleGetUserProfile(req, res);
    }
    if (path === '/rest/v1/users' && req.method === 'POST') {
      return handleInsertUser(req, res);
    }
    // Orders
    if (path === '/rest/v1/orders' && req.method === 'POST') {
      // Phase 7G-E: Chaos — simulate database transaction failure
      if (chaosState.orders_post_500) {
        return json(res, 500, { message: 'simulated DB transaction failure' });
      }
      if (chaosState.slow_ms > 0) {
        // Slow down by N ms
        return new Promise((resolve) => {
          setTimeout(() => resolve(handleInsertOrder(req, res)), chaosState.slow_ms);
        });
      }
      return handleInsertOrder(req, res);
    }
    if (path === '/rest/v1/orders' && req.method === 'GET') {
      return handleGetOrders(req, res);
    }
    if (path === '/rest/v1/orders' && req.method === 'PATCH') {
      return handleUpdateOrders(req, res);
    }
    if (path.startsWith('/rest/v1/orders') && req.method === 'GET') {
      return handleGetOrders(req, res);
    }
    if (path.startsWith('/rest/v1/loyalty_config') && req.method === 'GET') {
      return handleGetLoyaltyConfig(req, res);
    }
    if (path === '/rest/v1/search_analytics_events' && req.method === 'POST') {
      return handleInsertSearchAnalytics(req, res);
    }
    if (path === '/rest/v1/search_analytics_events' && req.method === 'GET') {
      // For stats: return all events (or limited)
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const limit = parseInt(url.searchParams.get('limit') || '10000');
      const slice = searchAnalyticsEvents.slice(0, limit);
      return json(res, 200, slice);
    }
    if (path.startsWith('/rest/v1/search_analytics_aggregates') && req.method === 'GET') {
      return handleGetSearchAnalytics(req, res);
    }
    if (path === '/rest/v1/order_items' && req.method === 'POST') {
      return handleInsertOrderItems(req, res);
    }
    if (path === '/rest/v1/order_items' && req.method === 'GET') {
      return handleGetOrderItems(req, res);
    }
    if (path === '/rest/v1/driver_status' && req.method === 'GET') {
      return handleGetDriverStatus(req, res);
    }
    if (path === '/rest/v1/driver_status' && req.method === 'POST') {
      return handleUpsertDriverStatus(req, res);
    }
    if (path === '/rest/v1/driver_status' && req.method === 'PATCH') {
      return handleUpdateDriverStatus(req, res);
    }
    if (path === '/rest/v1/driver_documents') {
      return handleDriverDocuments(req, res);
    }
    if (path === '/rest/v1/consent_records') {
      return handleConsentRecords(req, res);
    }
    if (path === '/rest/v1/data_subject_requests') {
      return handleStoredTable(req, res, dataSubjectRequestsStore, { status: 'pending' });
    }
    if (path === '/rest/v1/drivers' && req.method === 'GET') {
      return handleGetDrivers(req, res);
    }
    if (path === '/rest/v1/drivers' && req.method === 'POST') {
      return handleUpsertDrivers(req, res);
    }
    if (path === '/rest/v1/drivers' && req.method === 'PATCH') {
      return handleUpdateDrivers(req, res);
    }
    if (path === '/rest/v1/driver_working_hours' || path.startsWith('/rest/v1/driver_working_hours')) {
      return handleStoredTable(req, res, driverWorkingHoursStore);
    }
    if (path === '/rest/v1/order_tracking_events' && req.method === 'GET') {
      return handleGetTrackingEvents(req, res);
    }
    if (path === '/rest/v1/order_tracking_events' && req.method === 'POST') {
      return handleInsertTrackingEvent(req, res);
    }
    if (path === '/rest/v1/notifications') {
      return handleNotifications(req, res);
    }
    if (path === '/rest/v1/notification_preferences') {
      return handleNotificationPreferences(req, res);
    }
    if (path === '/rest/v1/push_subscriptions') {
      return handlePushSubscriptions(req, res);
    }
    if (path === '/rest/v1/notification_delivery_log') {
      return handleNotificationDeliveryLog(req, res);
    }
    if (path === '/rest/v1/config') {
      return handleConfig(req, res);
    }
    if (path === '/rest/v1/system_settings') {
      return handleSystemSettings(req, res);
    }
    if (path === '/rest/v1/webhooks') {
      return handleStoredTable(req, res, webhooksStore, { enabled: true, events: ['*'] });
    }
    if (path === '/rest/v1/webhook_deliveries') {
      return handleStoredTable(req, res, webhookDeliveriesStore, { status: 'pending', attempts: 0 });
    }
    if (path === '/rest/v1/automation_rules') {
      return handleStoredTable(req, res, automationRulesStore, { enabled: true, conditions: [], actions: [] });
    }
    if (path === '/rest/v1/automation_executions') {
      return handleStoredTable(req, res, automationExecutionsStore);
    }
    if (path === '/rest/v1/admin_notifications') {
      return handleStoredTable(req, res, adminNotificationsStore, { severity: 'medium', read_at: null });
    }
    if (path === '/rest/v1/coupons') {
      return handleStoredTable(req, res, couponsStore, {
        usage_count: 0,
        min_order_amount: 0,
        max_discount: null,
        usage_limit: null,
        restaurant_id: null,
        is_active: true,
      });
    }
    if (path === '/rest/v1/promotions') {
      return handleStoredTable(req, res, promotionsStore, {
        description: '',
        restaurant_id: null,
        is_active: true,
      });
    }
    if (path === '/rest/v1/support_tickets' && req.method === 'GET') {
      return handleGetSupportTickets(req, res);
    }
    if (path === '/rest/v1/support_tickets' && req.method === 'POST') {
      return handleInsertSupportTicket(req, res);
    }
    if (path === '/rest/v1/support_tickets' && req.method === 'PATCH') {
      return handleUpdateSupportTickets(req, res);
    }
    if (path === '/rest/v1/support_tickets' && req.method === 'DELETE') {
      return handleDeleteSupportRows(req, res, supportTicketsStore);
    }
    if (path === '/rest/v1/support_ticket_replies' && req.method === 'GET') {
      return handleGetSupportReplies(req, res);
    }
    if (path === '/rest/v1/support_ticket_replies' && req.method === 'POST') {
      return handleInsertSupportReply(req, res);
    }
    if (path === '/rest/v1/support_ticket_replies' && req.method === 'DELETE') {
      return handleDeleteSupportRows(req, res, supportTicketRepliesStore);
    }
    if (path === '/rest/v1/support_ticket_attachments') {
      return handleStoredTable(req, res, supportTicketAttachmentsStore, { reply_id: null, deleted_at: null });
    }
    if (path.startsWith('/rest/v1/users') && req.method === 'PATCH') {
      return handleUpdateUser(req, res);
    }
    if (path.startsWith('/rest/v1/users') && req.method === 'DELETE') {
      // Find the id filter and delete
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const idFilter = url.searchParams.get('id');
      const m = idFilter && idFilter.match(/^eq\.(.+)$/);
      const idValue = m ? m[1] : null;
      if (idValue) {
        for (const [email, u] of registeredUsers.entries()) {
          if (u.id === idValue) { registeredUsers.delete(email); break; }
        }
      }
      return json(res, 200, []);
    }
    if (path === '/rest/v1/delivery_zones' || path.startsWith('/rest/v1/delivery_zones')) {
      return handleZones(req, res);
    }
    if (path === '/rest/v1/products' || path.startsWith('/rest/v1/products')) {
      if (req.method === 'POST') return handleInsertProducts(req, res);
      if (req.method === 'PATCH') return handlePatchProducts(req, res);
      if (req.method === 'DELETE') return handleDeleteProducts(req, res);
      return handleGetProducts(req, res);
    }
    if (path === '/rest/v1/product_requests' || path.startsWith('/rest/v1/product_requests')) {
      if (req.method === 'POST') return handleInsertProductRequests(req, res);
      if (req.method === 'PATCH') return handlePatchProductRequests(req, res);
      return handleGetProductRequests(req, res);
    }
    if (path === '/rest/v1/restaurant_verifications' || path.startsWith('/rest/v1/restaurant_verifications')) {
      return handleStoredTable(req, res, restaurantVerificationsStore, {
        status: 'pending',
        country_code: 'DE',
        reviewed_at: null,
        reviewed_by: null,
      });
    }
    if (path === '/rest/v1/audit_log' || path.startsWith('/rest/v1/audit_log')) {
      return handleStoredTable(req, res, auditLogStore);
    }
    if (path === '/rest/v1/financial_documents' || path.startsWith('/rest/v1/financial_documents')) {
      if (req.method === 'PATCH' || req.method === 'DELETE') return json(res, 405, { message: 'issued_financial_document_is_immutable' });
      return handleStoredTable(req, res, financialDocumentsStore);
    }
    if (path === '/rest/v1/system_announcements' || path.startsWith('/rest/v1/system_announcements')) {
      return handleAnnouncements(req, res);
    }
    if (path === '/rest/v1/restaurants' || path.startsWith('/rest/v1/restaurants')) {
      if (req.method === 'POST') return handleInsertRestaurants(req, res);
      if (req.method === 'PATCH') return handlePatchRestaurants(req, res);
      return handleGetRestaurants(req, res);
    }
    if (path === '/rest/v1/restaurant_special_hours' || path.startsWith('/rest/v1/restaurant_special_hours')) {
      return handleStoredTable(req, res, restaurantSpecialHoursStore);
    }
    if (path === '/rest/v1/order_item_replacements' || path.startsWith('/rest/v1/order_item_replacements')) {
      return handleStoredTable(req, res, orderItemReplacementsStore);
    }
    if (path === '/rest/v1/order_financial_adjustments' || path.startsWith('/rest/v1/order_financial_adjustments')) {
      return handleStoredTable(req, res, orderFinancialAdjustmentsStore);
    }
    if (path === '/rest/v1/group_orders' || path.startsWith('/rest/v1/group_orders')) {
      if (req.method === 'GET') {
        const rows = applyPostgrestFilters(Array.from(groupOrdersStore.values()), req).map((row) => ({
          ...row,
          restaurants: SEED_RESTAURANTS.find((restaurant) => restaurant.id === row.restaurant_id) || null,
        }));
        return postgrestResult(req, res, rows);
      }
      return handleStoredTable(req, res, groupOrdersStore, { status: 'open', locked_at: null, completed_order_id: null });
    }
    if (path === '/rest/v1/group_order_participants' || path.startsWith('/rest/v1/group_order_participants')) {
      return handleStoredTable(req, res, groupOrderParticipantsStore, { is_host: false });
    }
    if (path === '/rest/v1/group_order_items' || path.startsWith('/rest/v1/group_order_items')) {
      return handleStoredTable(req, res, groupOrderItemsStore);
    }
    if (path === '/rest/v1/order_delivery_preferences' || path.startsWith('/rest/v1/order_delivery_preferences')) {
      return handleOrderDeliveryPreferences(req, res);
    }
    if (path === '/rest/v1/order_delivery_proofs' || path.startsWith('/rest/v1/order_delivery_proofs')) {
      return handleStoredTable(req, res, orderDeliveryProofsStore);
    }
    if (path === '/rest/v1/order_failed_deliveries' || path.startsWith('/rest/v1/order_failed_deliveries')) {
      return handleStoredTable(req, res, orderFailedDeliveriesStore);
    }

    // ── Order Drafts (Phase 7F) ──────────────────────
    if (path === '/rest/v1/order_drafts' && req.method === 'POST') {
      return handleInsertOrderDraft(req, res);
    }
    if (path === '/rest/v1/order_drafts' && req.method === 'GET') {
      return handleGetOrderDrafts(req, res);
    }
    if (path === '/rest/v1/order_drafts' && req.method === 'PATCH') {
      return handleUpdateOrderDraft(req, res);
    }
    if (path === '/rest/v1/order_drafts' && req.method === 'DELETE') {
      return handleDeleteOrderDraft(req, res);
    }

    // ── Phase 7G-A: Payment Audit & Recovery ──────────────────────
    if (path === '/rest/v1/payment_audit_log' && req.method === 'POST') {
      return handleInsertPaymentAudit(req, res);
    }
    if (path === '/rest/v1/payment_audit_log' && req.method === 'GET') {
      return handleGetPaymentAudit(req, res);
    }
    if (path === '/rest/v1/stripe_webhook_events' && req.method === 'POST') {
      return handleInsertStripeWebhookEvent(req, res);
    }
    if (path === '/rest/v1/stripe_webhook_events' && req.method === 'GET') {
      return handleGetStripeWebhookEvents(req, res);
    }
    if (path === '/rest/v1/manual_recovery_queue' && req.method === 'POST') {
      return handleInsertManualRecovery(req, res);
    }
    if (path === '/rest/v1/manual_recovery_queue' && req.method === 'GET') {
      return handleGetManualRecovery(req, res);
    }
    if (path === '/rest/v1/manual_recovery_queue' && req.method === 'PATCH') {
      return handlePatchManualRecovery(req, res);
    }

    // ── Phase 7G-A: Mock Stripe simulator ──────────────────────
    if (path === '/rest/v1/stripe_payment_intents' && req.method === 'POST') {
      return handleInsertStripePaymentIntent(req, res);
    }
    if (path === '/rest/v1/stripe_payment_intents' && req.method === 'GET') {
      return handleGetStripePaymentIntent(req, res);
    }
    if (path === '/rest/v1/stripe_payment_intents' && req.method === 'PATCH') {
      return handleUpdateStripePaymentIntent(req, res);
    }

    // ── Phase 7G-B: payment_intent_history ──────────────────────
    if (path === '/rest/v1/payment_intent_history' && req.method === 'POST') {
      return handleInsertPaymentIntentHistory(req, res);
    }
    if (path === '/rest/v1/payment_intent_history' && req.method === 'GET') {
      return handleGetPaymentIntentHistory(req, res);
    }
    if (path === '/rest/v1/payment_intent_history' && req.method === 'PATCH') {
      return handlePatchPaymentIntentHistory(req, res);
    }
    if (path === '/rest/v1/payment_intent_history' && req.method === 'DELETE') {
      return handleDeletePaymentIntentHistory(req, res);
    }

    // ── Phase 7G-B: payment_reconciliation_queue ─────────────────
    if (path === '/rest/v1/payment_reconciliation_queue' && req.method === 'POST') {
      return handleInsertPaymentReconciliation(req, res);
    }
    if (path === '/rest/v1/payment_reconciliation_queue' && req.method === 'GET') {
      return handleGetPaymentReconciliation(req, res);
    }
    if (path === '/rest/v1/payment_reconciliation_queue' && req.method === 'PATCH') {
      return handlePatchPaymentReconciliation(req, res);
    }

    // ── Phase 7G-C: payment_security_events ──────────────────────
    if (path === '/rest/v1/payment_security_events' && req.method === 'POST') {
      return handleInsertPaymentSecurityEvents(req, res);
    }
    if (path === '/rest/v1/payment_security_events' && req.method === 'GET') {
      return handleGetPaymentSecurityEvents(req, res);
    }
    if (path === '/rest/v1/payment_security_events' && req.method === 'PATCH') {
      return handlePatchPaymentSecurityEvents(req, res);
    }
    if (path === '/rest/v1/payment_security_events' && req.method === 'DELETE') {
      return handleDeletePaymentSecurityEvents(req, res);
    }

    // ── Phase 7G-C: payment_rate_limit_buckets ───────────────────
    if (path === '/rest/v1/payment_rate_limit_buckets' && (req.method === 'POST' || req.method === 'PATCH')) {
      return handleUpsertRateLimitBucket(req, res);
    }
    if (path === '/rest/v1/payment_rate_limit_buckets' && req.method === 'GET') {
      return handleGetRateLimitBucket(req, res);
    }

    // ── Phase 7G-C: payment_binding ──────────────────────────────
    if (path === '/rest/v1/payment_binding' && req.method === 'POST') {
      return handleInsertPaymentBinding(req, res);
    }
    if (path === '/rest/v1/payment_binding' && req.method === 'GET') {
      return handleGetPaymentBinding(req, res);
    }

    // ── Phase 7G-C: admin_action_log ─────────────────────────────
    if (path === '/rest/v1/admin_action_log' && req.method === 'POST') {
      return handleInsertAdminActionLog(req, res);
    }
    if (path === '/rest/v1/admin_action_log' && req.method === 'GET') {
      return handleGetAdminActionLog(req, res);
    }
    if (path === '/rest/v1/admin_action_log' && req.method === 'PATCH') {
      return handlePatchAdminActionLog(req, res);
    }
    if (path === '/rest/v1/admin_action_log' && req.method === 'DELETE') {
      return handleDeleteAdminActionLog(req, res);
    }

    // ── Phase 7G-D: payment_refunds ───────────────────────────────
    if (path === '/rest/v1/payment_refunds' && req.method === 'POST') {
      return handleInsertPaymentRefunds(req, res);
    }
    if (path === '/rest/v1/payment_refunds' && req.method === 'GET') {
      return handleGetPaymentRefunds(req, res);
    }
    if (path === '/rest/v1/payment_refunds' && req.method === 'PATCH') {
      return handlePatchPaymentRefunds(req, res);
    }
    if (path === '/rest/v1/payment_refunds' && req.method === 'DELETE') {
      return handleDeletePaymentRefunds(req, res);
    }

    // ── Phase 7G-D: refund_audit_log (append-only) ────────────────
    if (path === '/rest/v1/refund_audit_log' && req.method === 'POST') {
      return handleInsertRefundAuditLog(req, res);
    }
    if (path === '/rest/v1/refund_audit_log' && req.method === 'GET') {
      return handleGetRefundAuditLog(req, res);
    }
    if (path === '/rest/v1/refund_audit_log' && req.method === 'PATCH') {
      return json(res, 405, { message: 'refund_audit_log is append-only' });
    }
    if (path === '/rest/v1/refund_audit_log' && req.method === 'DELETE') {
      return json(res, 405, { message: 'refund_audit_log is append-only' });
    }

    // ── Phase 7G-D: refund_operation_locks ────────────────────────
    if (path === '/rest/v1/refund_operation_locks' && req.method === 'POST') {
      return handleInsertRefundLock(req, res);
    }
    if (path === '/rest/v1/refund_operation_locks' && req.method === 'DELETE') {
      return handleDeleteRefundLock(req, res);
    }
    if (path === '/rest/v1/refund_operation_locks' && req.method === 'GET') {
      return handleGetRefundLock(req, res);
    }

    // ── Phase 7G-E: Chaos injection endpoints ────────────────────────
    if (path === '/rest/v1/chaos' && (req.method === 'GET' || req.method === 'POST' || req.method === 'DELETE')) {
      return handleChaos(req, res);
    }

    if (path.startsWith('/rest/v1/rpc/')) {
      return handleRpc(req, res);
    }

    // email_otps table
    if (path === '/rest/v1/email_otps' && req.method === 'POST') {
      return handleInsertOtp(req, res);
    }
    if (path === '/rest/v1/email_otps' && req.method === 'GET') {
      return handleGetOtps(req, res);
    }
    if (path.startsWith('/rest/v1/email_otps') && req.method === 'PATCH') {
      return handleUpdateOtp(req, res);
    }

    // Immutable signup legal acceptance evidence (service-role only in production)
    if (path === '/rest/v1/legal_acceptance_records' && req.method === 'POST') {
      return handleInsertLegalAcceptance(req, res);
    }
    if (path === '/rest/v1/legal_acceptance_records' && req.method === 'GET') {
      return handleGetLegalAcceptances(req, res);
    }
    if (path === '/rest/v1/legal_acceptance_records' && req.method === 'DELETE') {
      return handleDeleteLegalAcceptances(req, res);
    }

    // password_reset_tokens table
    if (path === '/rest/v1/password_reset_tokens' && req.method === 'POST') {
      return handleInsertResetToken(req, res);
    }
    if (path === '/rest/v1/password_reset_tokens' && req.method === 'GET') {
      return handleGetResetTokens(req, res);
    }
    if (path.startsWith('/rest/v1/password_reset_tokens') && req.method === 'PATCH') {
      return handleUpdateResetToken(req, res);
    }

    // magic_link_tokens table
    if (path === '/rest/v1/magic_link_tokens' && req.method === 'POST') {
      return handleInsertMagicLinkToken(req, res);
    }
    if (path === '/rest/v1/magic_link_tokens' && req.method === 'GET') {
      return handleGetMagicLinkTokens(req, res);
    }
    if (path.startsWith('/rest/v1/magic_link_tokens') && req.method === 'PATCH') {
      return handleUpdateMagicLinkToken(req, res);
    }

    // /auth/v1/recover — password reset email trigger
    if (path === '/auth/v1/recover' && req.method === 'POST') {
      // Just acknowledge — the branded email is sent by the route
      return json(res, 200, {});
    }

    // /auth/v1/verify — verify a token (used by /api/auth/verify)
    if (path.startsWith('/auth/v1/verify') && req.method === 'POST') {
      const body = await readBody(req);
      const { type, token, email, password } = body;
      // Find user by email
      let account = null;
      for (const a of [...Object.values(ACCOUNTS), ...registeredUsers.values()]) {
        if (a.email.toLowerCase() === (email || '').toLowerCase()) { account = a; break; }
      }
      if (!account) return json(res, 401, { msg: 'Token has expired or is invalid', code: 'otp_expired' });

      if (type === 'recovery' && password) {
        account.password = password;
        account.is_verified = true;
        return json(res, 200, {
          access_token: makeAccessToken(account.id),
          refresh_token: makeRefreshToken(),
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: account.id, email: account.email,
            app_metadata: authAppMetadata(account),
            user_metadata: { name: account.name },
          },
        });
      }
      return json(res, 200, {
        access_token: makeAccessToken(account.id),
        refresh_token: makeRefreshToken(),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: account.id, email: account.email,
          app_metadata: authAppMetadata(account),
          user_metadata: { name: account.name },
        },
      });
    }

    // Health
    if (path === '/health' || path === '/') {
      return json(res, 200, { status: 'ok', mock: 'supabase', accounts: Object.keys(ACCOUNTS) });
    }

    // Default: log and 404
    console.error(`[mock-supabase] ${req.method} ${path} → 404`);
    return notFound(res, `Mock route not implemented: ${req.method} ${path}`);
  } catch (e) {
    console.error(`[mock-supabase] Error:`, e);
    return json(res, 500, { msg: e.message, code: 'internal_error' });
  }
});

// Minimal Phoenix-channel handshake for browser acceptance tests. It does not
// fabricate database events; it only acknowledges joins and heartbeats so the
// application can exercise its graceful empty real-time state without noisy
// WebSocket failures. Real event delivery remains a staging acceptance item.
const realtimeServer = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  const path = new URL(request.url || '/', `http://localhost:${PORT}`).pathname;
  if (path !== '/realtime/v1/websocket') {
    socket.destroy();
    return;
  }
  realtimeServer.handleUpgrade(request, socket, head, (client) => {
    realtimeServer.emit('connection', client, request);
  });
});

realtimeServer.on('connection', (client) => {
  client.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (Array.isArray(message)) {
        const [joinRef, ref, topic, event] = message;
        if (event === 'phx_join' || event === 'heartbeat') {
          client.send(JSON.stringify([
            joinRef,
            ref,
            topic,
            'phx_reply',
            { status: 'ok', response: event === 'phx_join' ? { postgres_changes: [] } : {} },
          ]));
        }
        return;
      }
      if (message && (message.event === 'phx_join' || message.event === 'heartbeat')) {
        client.send(JSON.stringify({
          topic: message.topic,
          event: 'phx_reply',
          payload: { status: 'ok', response: message.event === 'phx_join' ? { postgres_changes: [] } : {} },
          ref: message.ref,
          join_ref: message.join_ref,
        }));
      }
    } catch {
      // Ignore malformed local test frames without terminating the socket.
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-supabase] listening on http://localhost:${PORT}`);
  console.log(`[mock-supabase] demo accounts:`);
  for (const [email, a] of Object.entries(ACCOUNTS)) {
    console.log(`  ${email} / ${a.password}  → ${a.role}`);
  }
});
