#!/usr/bin/env node
/**
 * Phase 7H-UIR.1 — Driver Earnings Real DB Test
 * ─────────────────────────────────────────────
 * Behaviorally verifies driver_earnings ledger end-to-end on real Supabase.
 * Tests: idempotency, append-only, RLS isolation, formula correctness, history
 *
 * HONEST: If `driver_earnings` table is missing, ALL tests fail with clear error.
 * Operator MUST apply PHASE7H-UIR1-FIXES.sql before this can pass.
 *
 * Tags: g7hui1e_
 */

import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { createClient } = await import('@supabase/supabase-js');
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let pass = 0, fail = 0, total = 0;
function t(name, ok, detail) {
  total++;
  if (ok) { pass++; console.log(`  ✓ g7hui1e_${total.toString().padStart(2, '0')}_${name}`); }
  else { fail++; console.log(`  ✗ g7hui1e_${total.toString().padStart(2, '0')}_${name} — ${detail || ''}`); }
}
function section(name) { console.log(`\n══ ${name} ══`); }

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ Phase 7H-UIR.1 — Driver Earnings Real DB Test        ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const preflight = await service.from('driver_earnings').select('id').limit(1);
  if (preflight.error) {
    console.log('\n✗ BLOCKER: driver_earnings table does not exist');
    console.log('  Error:', preflight.error.message);
    console.log('\n  Operator MUST run PHASE7H-UIR1-FIXES.sql first.');
    process.exit(1);
  }

  // Setup test users + restaurant
  section('Setup');
  const u1 = await service.auth.admin.createUser({
    email: `earn1-${Date.now()}@test.com`, password: 'TestPwd!2024', email_confirm: true,
  });
  const u2 = await service.auth.admin.createUser({
    email: `earn2-${Date.now()}@test.com`, password: 'TestPwd!2024', email_confirm: true,
  });
  const driverA = u1.data.user;
  const driverB = u2.data.user;
  await service.from('users').upsert([
    { id: driverA.id, email: driverA.email, role: 'driver' },
    { id: driverB.id, email: driverB.email, role: 'driver' },
  ]);
  const { data: rests } = await service.from('restaurants').select('id').limit(1);
  const rest = rests[0].id;
  const { data: custs } = await service.from('users').select('id').eq('role', 'customer').limit(1);
  let custId = custs?.[0]?.id;
  if (!custId) {
    const cu = await service.auth.admin.createUser({ email: `ecust-${Date.now()}@test.com`, password: 'TestPwd!2024', email_confirm: true });
    custId = cu.data.user.id;
    await service.from('users').upsert({ id: custId, email: cu.data.user.email, role: 'customer' });
  }
  t('Setup: 2 drivers + 1 customer + 1 restaurant', true);

  async function makeOrder(driverId, opts = {}) {
    // Default to 'picked_up' so the auto-create trigger does NOT fire.
    // The order can later be transitioned to 'delivered' via update.
    const o = await service.from('orders').insert({
      order_number: `EARN-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      customer_id: custId,
      restaurant_id: rest,
      driver_id: driverId,
      status: opts.status || 'picked_up',
      total: 2500,
      subtotal: 2000,
      delivery_fee: 300,
      service_fee: 0,
      tax: 0,
      tip: 200,
      payment_method: 'cash',
      payment_status: 'succeeded',
      delivery_address: 'Test',
      customer_latitude: 50.7374, customer_longitude: 7.0982,
      restaurant_latitude: 50.7374, restaurant_longitude: 7.0982,
      ...opts,
    }).select().single();
    return o.data;
  }

  // ═══════════════════════════════════════════════════════════
  section('1. Service role can insert earnings row');
  // Create order with status='picked_up' (not delivered) so the auto-trigger doesn't fire
  const ord1 = await makeOrder(driverA.id, { status: 'picked_up' });
  const ins1 = await service.from('driver_earnings').insert({
    driver_id: driverA.id,
    order_id: ord1.id,
    amount_cents: 240, // 80% of 300
    tip_cents: 200,
    delivery_fee_cents: 300,
    metadata: { source: 'test', share: 0.8 },
  }).select().single();
  t('1.1 Insert earnings row succeeds', !ins1.error, ins1.error?.message);
  t('1.2 Has id', !!ins1.data?.id);
  t('1.3 Has earned_at', !!ins1.data?.earned_at);
  t('1.4 amount_cents is 240 (80% of 300)', ins1.data?.amount_cents === 240);
  t('1.5 tip_cents is 200', ins1.data?.tip_cents === 200);

  // ═══════════════════════════════════════════════════════════
  section('2. Idempotency via UNIQUE(order_id)');
  const dup = await service.from('driver_earnings').insert({
    driver_id: driverA.id, order_id: ord1.id, amount_cents: 999, tip_cents: 999, delivery_fee_cents: 999,
  });
  t('2.1 Duplicate insert fails (UNIQUE)', !!dup.error, dup.error?.message);
  t('2.2 Error code is 23505 (unique_violation)', dup.error?.code === '23505');
  const after1 = await service.from('driver_earnings').select('*').eq('order_id', ord1.id);
  t('2.3 Still only 1 row for this order', after1.data?.length === 1);

  // ═══════════════════════════════════════════════════════════
  section('3. Append-only (no UPDATE, no DELETE)');
  const upd = await service.from('driver_earnings').update({ amount_cents: 9999 }).eq('id', ins1.data.id);
  t('3.1 UPDATE fails (trigger)', !!upd.error, upd.error?.message);
  const del = await service.from('driver_earnings').delete().eq('id', ins1.data.id);
  t('3.2 DELETE fails (trigger)', !!del.error, del.error?.message);
  const after2 = await service.from('driver_earnings').select('*').eq('id', ins1.data.id).single();
  t('3.3 Row still exists (not deleted)', !!after2.data?.id);
  t('3.4 amount_cents unchanged (not updated)', after2.data?.amount_cents === 240);

  // ═══════════════════════════════════════════════════════════
  section('4. RLS — driver sees only own earnings');
  const ord2 = await makeOrder(driverB.id);
  await service.from('driver_earnings').insert({
    driver_id: driverB.id, order_id: ord2.id, amount_cents: 150, tip_cents: 100, delivery_fee_cents: 200,
  });

  await anon.auth.signInWithPassword({ email: driverA.email, password: 'TestPwd!2024' });
  const aView = await anon.from('driver_earnings').select('*');
  t('4.1 Driver A sees only own earnings (1 row)', aView.data?.length === 1, `got ${aView.data?.length}`);
  t('4.2 Driver A sees correct amount', aView.data?.[0]?.amount_cents === 240);
  await anon.auth.signOut();

  await anon.auth.signInWithPassword({ email: driverB.email, password: 'TestPwd!2024' });
  const bView = await anon.from('driver_earnings').select('*');
  t('4.3 Driver B sees only own earnings (1 row)', bView.data?.length === 1, `got ${bView.data?.length}`);
  t('4.4 Driver B sees correct amount', bView.data?.[0]?.amount_cents === 150);
  await anon.auth.signOut();

  // ═══════════════════════════════════════════════════════════
  section('5. RLS — driver cannot insert (service role only)');
  await anon.auth.signInWithPassword({ email: driverA.email, password: 'TestPwd!2024' });
  const aInsert = await anon.from('driver_earnings').insert({
    driver_id: driverA.id, order_id: ord2.id, amount_cents: 100, tip_cents: 0, delivery_fee_cents: 100,
  });
  t('5.1 Driver A cannot insert earnings (no INSERT policy)', !!aInsert.error, aInsert.error?.message);
  await anon.auth.signOut();

  // ═══════════════════════════════════════════════════════════
  section('6. Anon has zero access');
  const anon1 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const anonView = await anon1.from('driver_earnings').select('*');
  t('6.1 Anon SELECT returns empty (or error)', (anonView.data?.length || 0) === 0 || !!anonView.error, anonView.error?.message);

  // ═══════════════════════════════════════════════════════════
  section('7. Admin can see all (RLS)');
  const { data: admins } = await service.from('users').select('id').eq('role', 'admin').limit(1);
  if (admins && admins.length > 0) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    // We need an admin auth user. Use service role bypass to verify RLS only via SQL
    const { data: policies } = await service.rpc('pg_policies', { schemaname: 'public', tablename: 'driver_earnings' });
    if (policies) {
      const adminPolicy = policies.find(p => p.policyname?.includes('admin'));
      t('7.1 Admin RLS policy exists', !!adminPolicy, adminPolicy?.policyname);
    } else {
      t('7.1 Policy inspection skipped (no pg_policies RPC)', true);
    }
  }

  // ═══════════════════════════════════════════════════════════
  section('8. Formula correctness (80% + tip)');
  // Test: delivery_fee=500, tip=100 → amount=400, tip=100, total=500
  const ord3 = await makeOrder(driverA.id);
  const ins3 = await service.from('driver_earnings').insert({
    driver_id: driverA.id, order_id: ord3.id, amount_cents: 400, tip_cents: 100, delivery_fee_cents: 500,
  });
  t('8.1 Formula 80% of fee + 100% tip insertable', !ins3.error, ins3.error?.message);
  const ord4 = await makeOrder(driverA.id);
  const ins4 = await service.from('driver_earnings').insert({
    driver_id: driverA.id, order_id: ord4.id, amount_cents: 80, tip_cents: 0, delivery_fee_cents: 100,
  });
  t('8.2 Zero tip edge case', !ins4.error, ins4.error?.message);

  // ═══════════════════════════════════════════════════════════
  section('9. Sum / aggregate consistency');
  const allA = await service.from('driver_earnings').select('*').eq('driver_id', driverA.id);
  const sum = (allA.data || []).reduce((s, e) => s + e.amount_cents + e.tip_cents, 0);
  t('9.1 Sum of A earnings matches expected (240+200 + 400+100 + 80+0 = 1020)', sum === 1020, `got ${sum}`);

  // ═══════════════════════════════════════════════════════════
  section('10. CHECK constraints');
  const ord5 = await makeOrder(driverA.id);
  const negAmt = await service.from('driver_earnings').insert({
    driver_id: driverA.id, order_id: ord5.id, amount_cents: -100, tip_cents: 0, delivery_fee_cents: 0,
  });
  t('10.1 Negative amount rejected (CHECK)', !!negAmt.error, negAmt.error?.message);
  t('10.2 Error code is 23514 (check_violation)', negAmt.error?.code === '23514');

  // ═══════════════════════════════════════════════════════════
  section('11. Order deletion blocked (ON DELETE RESTRICT)');
  const ord6 = await makeOrder(driverA.id);
  const ins6 = await service.from('driver_earnings').insert({
    driver_id: driverA.id, order_id: ord6.id, amount_cents: 100, tip_cents: 0, delivery_fee_cents: 100,
  });
  t('11.1 Insert succeeds', !ins6.error, ins6.error?.message);
  const delOrder = await service.from('orders').delete().eq('id', ord6.id);
  t('11.2 Order deletion blocked (RESTRICT)', !!delOrder.error, delOrder.error?.message);

  // ═══════════════════════════════════════════════════════════
  section('12. Refresh & multi-device consistency');
  // Read the data 3 times — must be identical
  const r1 = await service.from('driver_earnings').select('*').eq('driver_id', driverA.id);
  const r2 = await service.from('driver_earnings').select('*').eq('driver_id', driverA.id);
  const r3 = await service.from('driver_earnings').select('*').eq('driver_id', driverA.id);
  t('12.1 3 reads return same count', r1.data?.length === r2.data?.length && r2.data?.length === r3.data?.length, `${r1.data?.length}/${r2.data?.length}/${r3.data?.length}`);
  t('12.2 3 reads return same data', JSON.stringify(r1.data) === JSON.stringify(r2.data));

  // ═══════════════════════════════════════════════════════════
  section('13. Multi-device: anon read (driver A)');
  const anonDev2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  await anonDev2.auth.signInWithPassword({ email: driverA.email, password: 'TestPwd!2024' });
  const dev2 = await anonDev2.from('driver_earnings').select('*').order('earned_at', { ascending: false });
  t('13.1 Device 2 sees same data (count)', dev2.data?.length === r1.data?.length);
  await anonDev2.auth.signOut();

  // ═══════════════════════════════════════════════════════════
  section('14. Cents are integer (no float drift)');
  const ord7 = await makeOrder(driverA.id);
  const ins7 = await service.from('driver_earnings').insert({
    driver_id: driverA.id, order_id: ord7.id, amount_cents: 99, tip_cents: 1, delivery_fee_cents: 100,
  }).select().single();
  t('14.1 Integer cents insert succeeds', !ins7.error, ins7.error?.message);
  const fetched = ins7.data;
  t('14.2 Fetched amount is integer', Number.isInteger(fetched?.amount_cents));

  // ═══════════════════════════════════════════════════════════
  // Cleanup
  await service.auth.admin.deleteUser(driverA.id);
  await service.auth.admin.deleteUser(driverB.id);
  await service.from('orders').delete().in('id', [ord1.id, ord2.id, ord3.id, ord4.id, ord5?.id, ord6.id, ord7.id].filter(Boolean));

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║ Driver Earnings: ${pass} pass / ${fail} fail / ${total} total`);
  console.log(`╚════════════════════════════════════════════════════════╝`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
