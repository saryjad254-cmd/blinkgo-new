#!/usr/bin/env node
/**
 * Phase 7H-C Final Hardening — Verify driver_status RLS behaviorally
 *
 * Tests:
 *   - ANON cannot SELECT driver_status
 *   - ANON cannot INSERT/UPDATE/DELETE driver_status
 *   - DRIVER can SELECT only their own row
 *   - DRIVER can UPDATE their own row
 *   - DRIVER cannot SELECT another driver's row
 *   - DRIVER cannot UPDATE another driver's row
 *   - ADMIN can SELECT all rows
 *   - Service role still works
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

let pass = 0, fail = 0;
const results = [];
function t(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  if (cond) pass++; else fail++;
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}

// Build clients
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Create test drivers
const TS = Date.now();
const testPrefix = `g7hc_rls_${TS}_`;

// Driver A
const { data: uA } = await service.auth.admin.createUser({
  email: `${testPrefix}drv_a@test.com`, password: 'TestPass123!', email_confirm: true,
  user_metadata: { name: 'RLS Driver A', is_online: true },
  app_metadata: { app_role: 'driver' }
});
const driverAId = uA?.user?.id;
await service.from('users').upsert({ id: driverAId, email: uA.user.email, name: 'RLS Driver A', role: 'driver', is_active: true }, { onConflict: 'id' });
await service.from('drivers').upsert({ id: driverAId, full_name: 'RLS Driver A', is_active: true, is_available: true }, { onConflict: 'id' });
await service.from('driver_status').upsert({ driver_id: driverAId, is_online: true, is_on_delivery: false, current_order_id: null, latitude: 52.5200, longitude: 13.4050, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' });

// Driver B
const { data: uB } = await service.auth.admin.createUser({
  email: `${testPrefix}drv_b@test.com`, password: 'TestPass123!', email_confirm: true,
  user_metadata: { name: 'RLS Driver B', is_online: true },
  app_metadata: { app_role: 'driver' }
});
const driverBId = uB?.user?.id;
await service.from('users').upsert({ id: driverBId, email: uB.user.email, name: 'RLS Driver B', role: 'driver', is_active: true }, { onConflict: 'id' });
await service.from('drivers').upsert({ id: driverBId, full_name: 'RLS Driver B', is_active: true, is_available: true }, { onConflict: 'id' });
await service.from('driver_status').upsert({ driver_id: driverBId, is_online: true, is_on_delivery: false, current_order_id: null, latitude: 52.5500, longitude: 13.4100, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' });

// Admin
const { data: uAdmin } = await service.auth.admin.createUser({
  email: `${testPrefix}admin@test.com`, password: 'TestPass123!', email_confirm: true,
  user_metadata: { name: 'RLS Admin' },
  app_metadata: { app_role: 'admin' }
});
const adminId = uAdmin?.user?.id;
await service.from('users').upsert({ id: adminId, email: uAdmin.user.email, name: 'RLS Admin', role: 'admin', is_active: true }, { onConflict: 'id' });

// Get anon key for "user A" client
const driverAClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { error: signInAError } = await driverAClient.auth.signInWithPassword({ email: `${testPrefix}drv_a@test.com`, password: 'TestPass123!' });

const driverBClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { error: signInBError } = await driverBClient.auth.signInWithPassword({ email: `${testPrefix}drv_b@test.com`, password: 'TestPass123!' });

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { error: signInAdminError } = await adminClient.auth.signInWithPassword({ email: `${testPrefix}admin@test.com`, password: 'TestPass123!' });

if (signInAError || signInBError || signInAdminError) {
  throw new Error('RLS fixture sign-in failed');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-C — driver_status RLS VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// ANON tests (no auth)
// ═══════════════════════════════════════════════════════════════
console.log('--- ANON (unauthenticated) ---');
{
  const { data } = await anon.from('driver_status').select('*');
  t('ANON cannot SELECT all driver_status', (data?.length ?? 0) === 0,
    `rows returned: ${data?.length ?? 'null'} (RLS should hide everything)`);
}

{
  const { data, error } = await anon.from('driver_status').select('*').eq('driver_id', driverAId);
  t('ANON cannot SELECT a specific driver', (data?.length ?? 0) === 0,
    `rows: ${data?.length ?? 'null'}, error: ${error?.message || 'none'}`);
}

{
  const { error } = await anon.from('driver_status').insert({
    driver_id: randomUUID(), is_online: true, is_on_delivery: false
  });
  t('ANON cannot INSERT driver_status', error !== null,
    `error: ${error?.message || 'NO ERROR — leaked insert!'}`);
}

{
  // RLS silently denies with 0 rows affected (no error from PostgREST)
  // Need to verify the UPDATE did not actually change anything
  const { data: beforeRows } = await service.from('driver_status').select('is_online').eq('driver_id', driverAId);
  const before = beforeRows?.[0];
  await anon.from('driver_status')
    .update({ is_online: false })
    .eq('driver_id', driverAId);
  const { data: afterRows } = await service.from('driver_status').select('is_online').eq('driver_id', driverAId);
  const after = afterRows?.[0];
  t('ANON cannot UPDATE driver_status (no rows changed)', before?.is_online === after?.is_online,
    `before: ${before?.is_online}, after: ${after?.is_online} (RLS silently denies)`);
}

{
  const { data: beforeRows } = await service.from('driver_status').select('driver_id').eq('driver_id', driverAId);
  const before = beforeRows?.[0];
  await anon.from('driver_status')
    .delete()
    .eq('driver_id', driverAId);
  const { data: afterRows } = await service.from('driver_status').select('driver_id').eq('driver_id', driverAId);
  const after = afterRows?.[0];
  t('ANON cannot DELETE driver_status (row still exists)',
    before?.driver_id && after?.driver_id === before?.driver_id,
    `before: ${before?.driver_id}, after: ${after?.driver_id} (RLS silently denies)`);
}

// ═══════════════════════════════════════════════════════════════
// DRIVER A tests (authenticated as driver A)
// ═══════════════════════════════════════════════════════════════
console.log('\n--- DRIVER A (own auth) ---');
{
  const { data } = await driverAClient.from('driver_status').select('*');
  t('DRIVER A sees own row only', data?.length === 1 && data[0]?.driver_id === driverAId,
    `rows: ${data?.length}, ids: ${data?.map(d => d.driver_id).join(',')}`);
}

{
  const { data } = await driverAClient.from('driver_status').select('*').eq('driver_id', driverBId);
  t('DRIVER A cannot SELECT DRIVER B', (data?.length ?? 0) === 0,
    `rows: ${data?.length ?? 'null'} (should be 0)`);
}

{
  const { data } = await driverAClient.from('driver_status')
    .update({ latitude: 99.99 })
    .eq('driver_id', driverAId)
    .select();
  t('DRIVER A can UPDATE own row', data?.length === 1 && Math.abs(data[0]?.latitude - 99.99) < 0.01,
    `updated: ${data?.[0]?.latitude}`);
}

{
  const { data } = await driverAClient.from('driver_status')
    .update({ latitude: 0 })
    .eq('driver_id', driverBId)
    .select();
  t('DRIVER A cannot UPDATE DRIVER B', (data?.length ?? 0) === 0,
    `rows updated: ${data?.length ?? 'null'} (should be 0)`);
}

// ═══════════════════════════════════════════════════════════════
// DRIVER B tests
// ═══════════════════════════════════════════════════════════════
console.log('\n--- DRIVER B (own auth) ---');
{
  const { data } = await driverBClient.from('driver_status').select('*');
  t('DRIVER B sees own row only', data?.length === 1 && data[0]?.driver_id === driverBId,
    `rows: ${data?.length}, ids: ${data?.map(d => d.driver_id).join(',')}`);
}

{
  const { data } = await driverBClient.from('driver_status').select('*').eq('driver_id', driverAId);
  t('DRIVER B cannot SELECT DRIVER A', (data?.length ?? 0) === 0,
    `rows: ${data?.length ?? 'null'}`);
}

// ═══════════════════════════════════════════════════════════════
// ADMIN tests
// ═══════════════════════════════════════════════════════════════
console.log('\n--- ADMIN (own auth) ---');
{
  const { data } = await adminClient.from('driver_status').select('*');
  t('ADMIN can SELECT all driver_status', (data?.length ?? 0) >= 2,
    `rows: ${data?.length ?? 'null'} (should be >= 2)`);
}

// ═══════════════════════════════════════════════════════════════
// Service role still works
// ═══════════════════════════════════════════════════════════════
console.log('\n--- SERVICE ROLE ---');
{
  const { data } = await service.from('driver_status').select('*').in('driver_id', [driverAId, driverBId]);
  t('SERVICE ROLE can SELECT all', (data?.length ?? 0) === 2,
    `rows: ${data?.length ?? 'null'}`);
}

{
  const { data } = await service.from('driver_status')
    .upsert({ driver_id: driverAId, is_online: true, is_on_delivery: false, current_order_id: null, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' })
    .select();
  t('SERVICE ROLE can UPSERT', data?.length === 1, `rows: ${data?.length}`);
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
console.log('\n--- CLEANUP ---');
await service.from('driver_status').delete().in('driver_id', [driverAId, driverBId]);
await service.from('drivers').delete().in('id', [driverAId, driverBId]);
await service.from('users').delete().in('id', [driverAId, driverBId, adminId]);
await service.auth.admin.deleteUser(driverAId).catch(() => null);
await service.auth.admin.deleteUser(driverBId).catch(() => null);
await service.auth.admin.deleteUser(adminId).catch(() => null);

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`Total: ${pass} pass, ${fail} fail (out of ${pass + fail})`);
console.log(`Pass rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

if (fail > 0) {
  console.log('\n=== Failed tests ===');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  ❌ ${r.name}: ${r.detail || ''}`);
  }
}

process.exit(fail > 0 ? 1 : 0);
