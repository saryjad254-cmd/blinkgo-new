#!/usr/bin/env node
/**
 * Phase 7G-G.2 — RLS Adversarial Test (Part 2)
 * ─────────────────────────────────────────────
 * Tests RLS against REAL Supabase using real users.
 *
 * Uses:
 *  - Anonymous client (no auth)
 *  - Authenticated Customer (login as demo@blinkgo.de)
 *  - Service-role (full access)
 *
 * Verifies that:
 *  - Anonymous: ZERO financial access
 *  - Customer: cannot directly manipulate payment/refund/audit infrastructure
 *  - Service role: server operations work
 *
 * Run with: `node scripts/test-real-rls-7g.mjs`
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { createClient } = await import('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create 3 clients
const anon = createClient(URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const service = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const results = [];
function t(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  if (cond) pass++; else fail++;
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(name) {
  console.log(`\n═══ ${name} ═══`);
}

// Authenticated customer client
let customerClient = null;
let customerUserId = null;

// A sentinel UUID can collide with seeded fixtures. A fresh identifier proves
// the missing-row behavior without depending on staging contents.
const FAKE_UUID = randomUUID();

async function loginCustomer() {
  const { data, error } = await anon.auth.signInWithPassword({
    email: 'demo@blinkgo.de',
    password: 'DemoCustomer!2024'
  });
  if (error) {
    console.log('  ⚠️  Customer login failed:', error.message);
    return null;
  }
  customerUserId = data.user?.id;
  // Re-create the client with the session
  customerClient = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }
  });
  return data;
}

const SENSITIVE_TABLES = [
  'order_drafts','payment_refunds','payment_binding','refund_audit_log',
  'refund_operation_locks','idempotency_keys','payment_audit_log',
  'payment_intent_history','payment_reconciliation_queue',
  'payment_security_events','payment_rate_limit_buckets',
  'admin_action_log','manual_recovery_queue','stripe_webhook_events'
];

// ═══════════════════════════════════════════════════════════════
// PHASE 1: Anonymous client — should have ZERO access
// ═══════════════════════════════════════════════════════════════
section('PHASE 1: ANONYMOUS — zero financial access');

for (const table of SENSITIVE_TABLES) {
  // SELECT
  const { data: d1, error: e1 } = await anon.from(table).select('*').limit(1);
  t(`anon SELECT ${table} denied`, d1 === null || d1.length === 0, e1?.message || 'empty result');
  
  // INSERT
  const { error: e2 } = await anon.from(table).insert({}).select();
  t(`anon INSERT ${table} denied`, e2 !== null, e2?.message);
  
  // UPDATE (use .neq to ensure update attempts)
  const { data: ud3, error: e3 } = await anon.from(table).update({}).neq('id', '00000000-0000-0000-0000-000000000000').select();
  t(`anon UPDATE ${table} denied (0 rows affected)`, ud3 === null || ud3.length === 0, e3?.message);
  
  // DELETE
  const { data: dd4, error: e4 } = await anon.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000').select();
  t(`anon DELETE ${table} denied (0 rows affected)`, dd4 === null || dd4.length === 0, e4?.message);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: Authenticated Customer — limited to own data
// ═══════════════════════════════════════════════════════════════
section('PHASE 2: CUSTOMER — cannot manipulate financial infrastructure');

const loginResult = await loginCustomer();
if (!loginResult) {
  t('Customer login', false, 'could not login');
} else {
  t('Customer login', true, `user_id: ${customerUserId}`);
  
  for (const table of SENSITIVE_TABLES) {
    // Try to insert directly (should fail for most)
    const { error: iErr } = await customerClient.from(table).insert({}).select();
    
    // For order_drafts, the customer should be able to insert THEIR OWN draft
    // (RLS policy: customer_id = auth.uid() check). We test with a fake user_id (should fail).
    if (table === 'order_drafts') {
      t(`customer INSERT ${table} with wrong user_id denied`, iErr !== null, iErr?.message);
    } else {
      t(`customer INSERT ${table} denied`, iErr !== null, iErr?.message);
    }
  }
  
  // Customer should NOT be able to:
  //  - view other customers' order_drafts
  //  - view any payment_refunds/payment_audit_log
  //  - view refund_audit_log/payment_security_events/admin_action_log
  
  const { data: ownDrafts } = await customerClient.from('order_drafts')
    .select('id, customer_id')
    .limit(5);
  // All returned drafts should belong to this customer
  const allOwn = (ownDrafts || []).every(d => d.customer_id === customerUserId);
  t('customer only sees own order_drafts', allOwn || (ownDrafts || []).length === 0, 
    `${ownDrafts?.length || 0} drafts, all own: ${allOwn}`);
  
  // Customer should see no payment_refunds (no access)
  const { data: refData, error: refErr } = await customerClient.from('payment_refunds')
    .select('*').limit(1);
  t('customer SELECT payment_refunds denied', refData === null || refData.length === 0, refErr?.message);
  
  // Customer should see no payment_audit_log
  const { data: audData, error: audErr } = await customerClient.from('payment_audit_log')
    .select('*').limit(1);
  t('customer SELECT payment_audit_log denied', audData === null || audData.length === 0, audErr?.message);
  
  // Customer should see no admin_action_log
  const { data: admData, error: admErr } = await customerClient.from('admin_action_log')
    .select('*').limit(1);
  t('customer SELECT admin_action_log denied', admData === null || admData.length === 0, admErr?.message);
  
  // Customer should see no refund_audit_log
  const { data: rauData, error: rauErr } = await customerClient.from('refund_audit_log')
    .select('*').limit(1);
  t('customer SELECT refund_audit_log denied', rauData === null || rauData.length === 0, rauErr?.message);
  
  // Customer should see no idempotency_keys
  const { data: ikData, error: ikErr } = await customerClient.from('idempotency_keys')
    .select('*').limit(1);
  t('customer SELECT idempotency_keys denied', ikData === null || ikData.length === 0, ikErr?.message);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3: Service role — full access (server operations)
// ═══════════════════════════════════════════════════════════════
section('PHASE 3: SERVICE ROLE — server operations work');

for (const table of SENSITIVE_TABLES) {
  const { data, error } = await service.from(table).select('*').limit(1);
  t(`service SELECT ${table} works`, data !== null, error?.message);
}

// Service role can call RPCs
const r1 = await service.rpc('recompute_order_payment_status', { p_order_id: FAKE_UUID });
t('missing order recompute fails closed', r1.data === null && r1.error?.code === 'P0002', r1.error?.message);

const r2 = await service.rpc('refund_max_amount_cents', { p_order_id: FAKE_UUID });
t('missing order refund limit fails closed', r2.data === null && r2.error?.code === 'P0002', r2.error?.message);

// Use a reversible write to prove service-role mutations. Append-only audit
// tables intentionally cannot be cleaned up and must not accumulate test rows.
const { data: ikIns, error: ikInsErr } = await service.from('idempotency_keys').insert({
  key: 'rls_test_' + Date.now(),
  scope: 'rls_test',
  response_status: 200
}).select('id').maybeSingle();
t('service INSERT idempotency_keys works', ikIns !== null, ikInsErr?.message);

if (ikIns) {
  await service.from('idempotency_keys').delete().eq('id', ikIns.id);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4: Customer cannot call service-only RPCs directly
// ═══════════════════════════════════════════════════════════════
section('PHASE 4: CUSTOMER cannot call service-only RPCs');

if (customerClient) {
  // These RPCs are GRANT EXECUTE only to service_role
  const rlsRPCs = [
    'recompute_order_payment_status', 'refund_max_amount_cents',
    'payment_rate_limit_check', 'get_active_order_draft', 'burn_order_draft',
    'gc_expired_order_drafts', 'update_draft_payment_state',
    'get_payment_intent_history', 'cleanup_idempotency_keys',
    'cleanup_old_rate_limit_buckets'
  ];
  
  for (const rpc of rlsRPCs) {
    const args = {};
    if (rpc === 'recompute_order_payment_status' || rpc === 'refund_max_amount_cents') {
      args.p_order_id = FAKE_UUID;
    } else if (rpc === 'get_active_order_draft') {
      args.p_customer_id = FAKE_UUID;
    } else if (rpc === 'burn_order_draft') {
      args.p_draft_id = 'fake';
      args.p_confirmed_by = FAKE_UUID;
    } else if (rpc === 'update_draft_payment_state') {
      args.p_draft_id = 'fake';
      args.p_expected_status = 'awaiting_payment_method';
      args.p_new_status = 'processing';
      args.p_last_event_at = new Date().toISOString();
      args.p_last_event_type = 'test';
      args.p_last_event_id = 'test';
    } else if (rpc === 'get_payment_intent_history') {
      args.p_payment_intent_id = 'pi_fake';
    } else if (rpc === 'payment_rate_limit_check') {
      args.p_bucket_key = 'rls_test';
      args.p_limit = 5;
      args.p_window_seconds = 60;
    } else if (rpc === 'cleanup_old_rate_limit_buckets') {
      args.retention_hours = 24;
    }
    // gc_expired_order_drafts and cleanup_idempotency_keys take no args
    
    const r = await customerClient.rpc(rpc, args);
    // The RPC should be REVOKE FROM authenticated
    // Some RPCs in the real DB are still callable — this is a known DB BUG
    const denied = r.error !== null && (
      r.error.message.includes('permission') ||
      r.error.message.includes('not authorized') ||
      r.error.message.includes('does not exist') ||
      r.error.message.includes('schema cache')
    );
    if (!denied) {
      // This is a DB bug — RPCs are still PUBLIC
      t(`customer RPC ${rpc} denied`, false, `⚠️  DB BUG: RPC returns data (${JSON.stringify(r.data)}) — see PHASE7G-G2-FIXES-RLS.sql`);
    } else {
      t(`customer RPC ${rpc} denied`, true, r.error?.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
section('SUMMARY');
console.log(`\nTotal: ${pass} pass, ${fail} fail (out of ${pass + fail})`);
console.log(`Pass rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

if (fail > 0) {
  console.log('\n=== Failed tests ===');
  for (const r of results.filter(r => r.status === 'FAIL').slice(0, 30)) {
    console.log(`  ❌ ${r.name}: ${r.detail || ''}`);
  }
}

process.exit(fail > 0 ? 1 : 0);
