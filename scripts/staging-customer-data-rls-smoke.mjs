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
const a = createClient(url, publishableKey, options);
const b = createClient(url, publishableKey, options);
const stamp = Date.now();
const createdIds = [];

async function makeUser(label) {
  const email = `qa.customer.rls.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { app_role: 'customer' },
    user_metadata: { name: `Customer RLS ${label}` },
  });
  if (error) throw error;
  createdIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

let notificationId;
let favoriteId;
let pushId;
try {
  const userA = await makeUser('a');
  const userB = await makeUser('b');
  assert.equal((await a.auth.signInWithPassword({ email: userA.email, password: userA.password })).error, null);
  assert.equal((await b.auth.signInWithPassword({ email: userB.email, password: userB.password })).error, null);

  const favoriteInput = {
    user_id: userA.id,
    restaurant_id: 'b1000000-0000-4000-8000-000000000201',
  };
  const { data: favorite, error: favoriteError } = await a.from('favorites').insert(favoriteInput).select('id').single();
  if (favoriteError) throw favoriteError;
  favoriteId = favorite.id;
  assert.equal((await a.from('favorites').select('id').eq('id', favoriteId)).data?.length, 1);
  assert.equal((await b.from('favorites').select('id').eq('id', favoriteId)).data?.length, 0);
  const crossFavorite = await b.from('favorites').insert({
    user_id: userA.id,
    restaurant_id: favoriteInput.restaurant_id,
  });
  assert.equal(crossFavorite.error?.code, '42501');
  assert.equal((await b.from('favorites').delete().eq('id', favoriteId).select('id')).data?.length, 0);

  await service.from('notification_preferences').upsert({ user_id: userA.id }, { onConflict: 'user_id' });
  assert.equal((await a.from('notification_preferences').update({ push_enabled: false }).eq('user_id', userA.id).select('user_id')).data?.length, 1);
  assert.equal((await b.from('notification_preferences').select('user_id').eq('user_id', userA.id)).data?.length, 0);
  assert.equal((await b.from('notification_preferences').update({ push_enabled: true }).eq('user_id', userA.id).select('user_id')).data?.length, 0);
  assert.ok((await b.from('notification_preferences').insert({ user_id: userA.id })).error);

  const endpoint = `https://qa-${stamp}.blinkgo.invalid/push`;
  const { data: push, error: pushError } = await a.from('push_subscriptions').insert({
    user_id: userA.id,
    endpoint,
    p256dh: 'qa-public-key',
    auth: 'qa-auth-key',
  }).select('id').single();
  if (pushError) throw pushError;
  pushId = push.id;
  assert.equal((await b.from('push_subscriptions').select('id').eq('id', pushId)).data?.length, 0);
  assert.equal((await b.from('push_subscriptions').delete().eq('id', pushId).select('id')).data?.length, 0);

  const { data: notification, error: notificationError } = await service.from('notifications').insert({
    user_id: userA.id,
    type: 'order',
    title: `QA customer RLS ${stamp}`,
    body: 'Server-created notification',
    data: { qa: true },
  }).select('id').single();
  if (notificationError) throw notificationError;
  notificationId = notification.id;
  assert.equal((await a.from('notifications').select('id').eq('id', notificationId)).data?.length, 1);
  assert.equal((await b.from('notifications').select('id').eq('id', notificationId)).data?.length, 0);
  assert.equal((await a.from('notifications').update({ is_read: true }).eq('id', notificationId).select('id')).data?.length, 1);
  assert.ok((await a.from('notifications').insert({ user_id: userA.id, type: 'order', title: 'client', body: 'blocked', data: {} })).error);
  assert.ok((await a.from('notifications').update({ title: 'tampered' }).eq('id', notificationId)).error);
  assert.ok((await a.from('notifications').delete().eq('id', notificationId)).error);

  for (const table of ['favorites', 'notification_preferences', 'push_subscriptions', 'notifications']) {
    const { data, error } = await anon.from(table).select('*').limit(1);
    assert.ok(error || data?.length === 0, `anonymous ${table} access must be denied`);
  }

  console.log('Staging customer-data RLS: PASS');
  console.log('  ✓ favorites, preferences and push subscriptions are owner-only');
  console.log('  ✓ notifications are server-created and client acknowledgement is column-limited');
  console.log('  ✓ anonymous and cross-user access is denied');
} finally {
  if (notificationId) await service.from('notifications').delete().eq('id', notificationId);
  if (favoriteId) await service.from('favorites').delete().eq('id', favoriteId);
  if (pushId) await service.from('push_subscriptions').delete().eq('id', pushId);
  for (const id of createdIds.reverse()) {
    await service.from('notification_preferences').delete().eq('user_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
