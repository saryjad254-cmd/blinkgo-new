import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.staging.local', override: true });
const projectRef = 'egjehqoilbjvzgbnksds';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (process.env.ALLOW_STAGING_MUTATIONS !== '1') throw new Error('Set ALLOW_STAGING_MUTATIONS=1');
if (!url.includes(projectRef)) throw new Error(`Refusing to run outside ${projectRef}`);

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, secretKey, options);
const anon = createClient(url, publishableKey, options);
const customer = createClient(url, publishableKey, options);
const admin = createClient(url, publishableKey, options);
const stamp = Date.now();
const userIds = [];
const rows = {};

async function makeUser(label, appRole) {
  const email = `qa.auth.audit.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { app_role: appRole },
    user_metadata: { name: `Auth Audit ${label}` },
  });
  if (error) throw error;
  userIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signIn(client, user) {
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
}

try {
  const member = await makeUser('customer', 'customer');
  const operator = await makeUser('admin', 'admin');
  await Promise.all([signIn(customer, member), signIn(admin, operator)]);

  const inserts = [
    ['login_attempts', {
      email: member.email,
      user_id: member.id,
      success: false,
      failure_reason: 'qa_test',
    }, 'id'],
    ['security_audit_log', {
      event_type: 'AUTH_FAILURE',
      user_id: member.id,
      details: { qa: true },
    }, 'id'],
    ['activity_log', {
      actor_id: operator.id,
      actor_email: operator.email,
      action: 'qa_audit_test',
      details: { qa: true },
    }, 'id'],
    ['admin_daily_reset_log', {
      reset_by: operator.id,
      reset_date: new Date(2_100, 0, 1 + (stamp % 300)).toISOString().slice(0, 10),
      orders_reset: 0,
      metadata: { qa: true },
    }, 'id'],
    ['magic_link_tokens', {
      user_id: member.id,
      email: member.email,
      token_hash: crypto.randomUUID().replaceAll('-', ''),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }, 'id'],
    ['geocode_cache', {
      query_hash: `qa-${stamp}`,
      query: 'QA Straße 1, Wesseling',
      source: 'qa',
      result: { lat: 50.82, lng: 6.97 },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }, 'query_hash'],
  ];

  for (const [table, values, key] of inserts) {
    const { data, error } = await service.from(table).insert(values).select(key).single();
    if (error) throw error;
    rows[table] = data[key];
  }

  for (const table of ['login_attempts', 'security_audit_log', 'activity_log', 'admin_daily_reset_log']) {
    assert.equal((await admin.from(table).select('*').eq('id', rows[table])).data?.length, 1, `admin reads ${table}`);
    assert.equal((await customer.from(table).select('*').eq('id', rows[table])).data?.length, 0, `customer cannot read ${table}`);
    assert.ok((await admin.from(table).insert({})).error, `admin cannot forge ${table}`);
  }

  for (const table of ['magic_link_tokens', 'geocode_cache']) {
    const key = table === 'geocode_cache' ? 'query_hash' : 'id';
    const adminRead = await admin.from(table).select('*').eq(key, rows[table]);
    assert.ok(adminRead.error || adminRead.data?.length === 0, `admin cannot read internal ${table}`);
    assert.ok((await admin.from(table).insert({})).error, `admin cannot write internal ${table}`);
  }

  for (const table of inserts.map(([table]) => table)) {
    const result = await anon.from(table).select('*').limit(1);
    assert.ok(result.error || result.data?.length === 0, `anonymous ${table} access must be denied`);
  }

  console.log('Staging auth/audit RLS: PASS');
  console.log('  ✓ auth tokens, geocode cache and login writes are server-only');
  console.log('  ✓ admins can inspect but cannot forge or mutate audit evidence');
  console.log('  ✓ customers and anonymous sessions cannot read sensitive logs');
} finally {
  if (rows.geocode_cache) await service.from('geocode_cache').delete().eq('query_hash', rows.geocode_cache);
  if (rows.magic_link_tokens) await service.from('magic_link_tokens').delete().eq('id', rows.magic_link_tokens);
  if (rows.admin_daily_reset_log) await service.from('admin_daily_reset_log').delete().eq('id', rows.admin_daily_reset_log);
  if (rows.activity_log) await service.from('activity_log').delete().eq('id', rows.activity_log);
  if (rows.security_audit_log) await service.from('security_audit_log').delete().eq('id', rows.security_audit_log);
  if (rows.login_attempts) await service.from('login_attempts').delete().eq('id', rows.login_attempts);
  for (const id of userIds.reverse()) {
    await service.from('notification_preferences').delete().eq('user_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
