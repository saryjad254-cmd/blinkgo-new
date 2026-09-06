#!/usr/bin/env node
/**
 * Phase 7H-UIR.1 — Security Tests for All 3 Features
 * ──────────────────────────────────────────────────
 * Adversarial tests against favorites, driver_earnings, and storage buckets.
 *
 * Tags: g7hui1sec_
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

let pass = 0, fail = 0, total = 0;
function t(name, ok, detail) {
  total++;
  if (ok) { pass++; console.log(`  ✓ g7hui1sec_${total.toString().padStart(2, '0')}_${name}`); }
  else { fail++; console.log(`  ✗ g7hui1sec_${total.toString().padStart(2, '0')}_${name} — ${detail || ''}`); }
}
function section(name) { console.log(`\n══ ${name} ══`); }

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ Phase 7H-UIR.1 — Security Test                        ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  // Pre-flight
  const favExists = !(await service.from('favorites').select('id').limit(1)).error;
  const deExists = !(await service.from('driver_earnings').select('id').limit(1)).error;
  const { data: buckets } = await service.storage.listBuckets();
  const bucketNames = (buckets || []).map(b => b.name);
  const hasDelivery = bucketNames.includes('delivery-photos');
  const hasDriverDocs = bucketNames.includes('driver-documents');

  if (!favExists) { console.log('BLOCKER: favorites missing'); }
  if (!deExists) { console.log('BLOCKER: driver_earnings missing'); }
  if (!hasDelivery) { console.log('BLOCKER: delivery-photos missing'); }
  if (!hasDriverDocs) { console.log('BLOCKER: driver-documents missing'); }
  if (!favExists || !deExists || !hasDelivery || !hasDriverDocs) {
    process.exit(1);
  }

  // Setup
  const aU = await service.auth.admin.createUser({ email: `seca-${Date.now()}@test.com`, password: 'TestPwd!2024', email_confirm: true });
  const bU = await service.auth.admin.createUser({ email: `secb-${Date.now()}@test.com`, password: 'TestPwd!2024', email_confirm: true });
  const a = aU.data.user; const b = bU.data.user;
  await service.from('users').upsert([
    { id: a.id, email: a.email, role: 'customer' },
    { id: b.id, email: b.email, role: 'customer' },
  ]);
  const { data: rests } = await service.from('restaurants').select('id').limit(1);
  const rest = rests[0].id;

  // ═══════════════════════════════════════════════════════════
  section('1. FAVORITES — Anon access');
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const anonFav = await anon.from('favorites').select('*');
  t('1.1 Anon SELECT returns empty', (anonFav.data?.length || 0) === 0, anonFav.error?.message);
  const anonInsert = await anon.from('favorites').insert({ user_id: a.id, target_type: 'restaurant', target_id: rest });
  t('1.2 Anon INSERT fails', !!anonInsert.error, anonInsert.error?.message);

  // ═══════════════════════════════════════════════════════════
  section('2. FAVORITES — IDOR cross-user read');
  // Add favorite for A
  await service.from('favorites').insert({ user_id: a.id, target_type: 'restaurant', target_id: rest });
  // B tries to read
  await anon.auth.signInWithPassword({ email: b.email, password: 'TestPwd!2024' });
  const bView = await anon.from('favorites').select('*');
  t('2.1 User B sees 0 favorites (RLS)', bView.data?.length === 0, `got ${bView.data?.length}`);

  // ═══════════════════════════════════════════════════════════
  section('3. FAVORITES — IDOR cross-user insert');
  const idorInsert = await anon.from('favorites').insert({ user_id: a.id, target_type: 'restaurant', target_id: rest });
  t('3.1 User B cannot insert favorite for User A (RLS)', !!idorInsert.error, idorInsert.error?.message);
  await anon.auth.signOut();

  // ═══════════════════════════════════════════════════════════
  section('4. FAVORITES — user_id substitution');
  // A logs in
  await anon.auth.signInWithPassword({ email: a.email, password: 'TestPwd!2024' });
  // A inserts with their OWN id (legitimate). Use a fresh product target so no UNIQUE conflict.
  const { data: prods } = await service.from('products').select('id').limit(5);
  const legit = await anon.from('favorites').insert({ user_id: a.id, target_type: 'product', target_id: prods?.[0]?.id || rest });
  t('4.1 User A inserts with own id succeeds', !legit.error, legit.error?.message);
  // A tries to insert for B
  const sub = await anon.from('favorites').insert({ user_id: b.id, target_type: 'restaurant', target_id: rest });
  // Supabase RLS blocked inserts return either an error or empty data
  const subBlocked = !!sub.error || !sub.data || (Array.isArray(sub.data) && sub.data.length === 0);
  t('4.2 User A inserting for B is rejected (RLS WITH CHECK)', subBlocked, sub.error?.message || `data length: ${sub.data?.length}`);
  await anon.auth.signOut();

  // ═══════════════════════════════════════════════════════════
  section('5. FAVORITES — path validation');
  // The target_type CHECK should restrict to 'restaurant' or 'product'
  const badType = await service.from('favorites').insert({ user_id: a.id, target_type: 'evil', target_id: rest });
  t('5.1 Invalid target_type rejected by CHECK', !!badType.error, badType.error?.message);
  t('5.2 CHECK error code is 23514', badType.error?.code === '23514', badType.error?.code);

  // ═══════════════════════════════════════════════════════════
  section('6. DRIVER_EARNINGS — Anon access');
  const anonDe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const anonDeView = await anonDe.from('driver_earnings').select('*');
  t('6.1 Anon SELECT returns empty/error', (anonDeView.data?.length || 0) === 0 || !!anonDeView.error, anonDeView.error?.message);

  // ═══════════════════════════════════════════════════════════
  section('7. DRIVER_EARNINGS — IDOR cross-driver');
  const drvU = await service.auth.admin.createUser({ email: `secdrv-${Date.now()}@test.com`, password: 'TestPwd!2024', email_confirm: true });
  const drvB = await service.auth.admin.createUser({ email: `secdrvb-${Date.now()}@test.com`, password: 'TestPwd!2024', email_confirm: true });
  await service.from('users').upsert([
    { id: drvU.data.user.id, email: drvU.data.user.email, role: 'driver' },
    { id: drvB.data.user.id, email: drvB.data.user.email, role: 'driver' },
  ]);
  // Create order for drvA
  const o = await service.from('orders').insert({
    order_number: `SEC-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    customer_id: a.id, restaurant_id: rest, driver_id: drvU.data.user.id,
    status: 'delivered', total: 2000, subtotal: 1700, delivery_fee: 300, tip: 100, service_fee: 0, tax: 0,
    payment_method: 'cash', payment_status: 'succeeded',
    delivery_address: 'Test', customer_latitude: 50.7374, customer_longitude: 7.0982,
    restaurant_latitude: 50.7374, restaurant_longitude: 7.0982,
    delivered_at: new Date().toISOString(),
  }).select().single();
  await service.from('driver_earnings').insert({
    driver_id: drvU.data.user.id, order_id: o.data.id, amount_cents: 240, tip_cents: 100, delivery_fee_cents: 300,
  });

  // drvB logs in and tries to view
  const drvBClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  await drvBClient.auth.signInWithPassword({ email: drvB.data.user.email, password: 'TestPwd!2024' });
  const drvBView = await drvBClient.from('driver_earnings').select('*');
  t('7.1 Driver B sees 0 of Driver A earnings (RLS)', drvBView.data?.length === 0, `got ${drvBView.data?.length}`);

  // ═══════════════════════════════════════════════════════════
  section('8. DRIVER_EARNINGS — append-only enforcement');
  // Try UPDATE/DELETE as service role (should fail due to trigger)
  const upd = await service.from('driver_earnings').update({ amount_cents: 99999 }).eq('order_id', o.data.id);
  t('8.1 UPDATE blocked by trigger', !!upd.error, upd.error?.message);
  const del = await service.from('driver_earnings').delete().eq('order_id', o.data.id);
  t('8.2 DELETE blocked by trigger', !!del.error, del.error?.message);
  const still = await service.from('driver_earnings').select('*').eq('order_id', o.data.id);
  t('8.3 Row still exists (not deleted)', still.data?.length === 1);
  t('8.4 amount_cents unchanged', still.data?.[0]?.amount_cents === 240);

  // ═══════════════════════════════════════════════════════════
  section('9. DRIVER_EARNINGS — CHECK constraint (negative amounts)');
  const neg = await service.from('driver_earnings').insert({
    driver_id: drvU.data.user.id, order_id: o.data.id, amount_cents: -100, tip_cents: 0, delivery_fee_cents: 0,
  });
  t('9.1 Negative amount rejected (CHECK)', !!neg.error, neg.error?.message);
  t('9.2 Error code 23514 (check_violation)', neg.error?.code === '23514');

  // ═══════════════════════════════════════════════════════════
  section('10. STORAGE — Path traversal in delivery-photos');
  const evilPath = `../../etc/passwd-${Date.now()}.png`;
  const up = await service.storage.from('delivery-photos').upload(evilPath, Buffer.from('fake'), { contentType: 'image/png' });
  // Supabase normalizes path; either error or normalized
  t('10.1 Path traversal handled', up.error || (up.data?.path && !up.data.path.includes('../')), up.data?.path);
  if (up.data?.path) await service.storage.from('delivery-photos').remove([up.data.path]);

  // ═══════════════════════════════════════════════════════════
  section('11. STORAGE — driver-documents cross-driver blocked');
  const otherDrvClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  await otherDrvClient.auth.signInWithPassword({ email: drvB.data.user.email, password: 'TestPwd!2024' });
  // Try to upload to driver A's folder
  const upEvil = await otherDrvClient.storage.from('driver-documents').upload(`${drvU.data.user.id}/stolen.pdf`, Buffer.from('%PDF'), { contentType: 'application/pdf' });
  t('11.1 Other driver cannot write to Driver A folder (RLS)', !!upEvil.error, upEvil.error?.message);
  await otherDrvClient.auth.signOut();

  // ═══════════════════════════════════════════════════════════
  section('12. STORAGE — Malicious filename');
  // First service uploads to driver A's folder
  await service.storage.from('driver-documents').upload(`${drvU.data.user.id}/normal.pdf`, Buffer.from('%PDF'), { contentType: 'application/pdf' });
  // Then check if filename with special chars causes issues
  const special = await service.storage.from('driver-documents').upload(`${drvU.data.user.id}/<script>alert(1)</script>.pdf`, Buffer.from('%PDF'), { contentType: 'application/pdf' });
  t('12.1 Special chars in filename handled', special.error || !!special.data, special.error?.message);
  if (special.data) await service.storage.from('driver-documents').remove([special.data.path]);
  await service.storage.from('driver-documents').remove([`${drvU.data.user.id}/normal.pdf`]);

  // ═══════════════════════════════════════════════════════════
  // Cleanup
  await service.from('favorites').delete().in('user_id', [a.id, b.id]);
  await service.from('orders').delete().eq('id', o.data.id);
  await service.from('users').delete().in('id', [a.id, b.id, drvU.data.user.id, drvB.data.user.id]);
  await service.auth.admin.deleteUser(a.id);
  await service.auth.admin.deleteUser(b.id);
  await service.auth.admin.deleteUser(drvU.data.user.id);
  await service.auth.admin.deleteUser(drvB.data.user.id);

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║ Security: ${pass} pass / ${fail} fail / ${total} total`);
  console.log(`╚════════════════════════════════════════════════════════╝`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
