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
const admin = createClient(url, publishableKey, options);
const stamp = Date.now();
const users = [];
const rows = {};

async function makeUser(label, appRole = 'customer') {
  const email = `qa.history.rls.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { app_role: appRole },
    user_metadata: { name: `History RLS ${label}` },
  });
  if (error) throw error;
  users.push(data.user.id);
  return { id: data.user.id, email, password };
}

try {
  const userA = await makeUser('a');
  const userB = await makeUser('b');
  const adminUser = await makeUser('admin', 'admin');
  assert.equal((await a.auth.signInWithPassword({ email: userA.email, password: userA.password })).error, null);
  assert.equal((await b.auth.signInWithPassword({ email: userB.email, password: userB.password })).error, null);
  assert.equal((await admin.auth.signInWithPassword({ email: adminUser.email, password: adminUser.password })).error, null);

  const { data: address, error: addressError } = await a.from('addresses').insert({
    user_id: userA.id,
    label: 'QA Home',
    street: 'QA Straße 1',
    city: 'Wesseling',
    latitude: 50.82,
    longitude: 6.97,
  }).select('id').single();
  if (addressError) throw addressError;
  rows.address = address.id;
  assert.equal((await b.from('addresses').select('id').eq('id', address.id)).data?.length, 0);
  assert.equal((await b.from('addresses').update({ city: 'Bonn' }).eq('id', address.id).select('id')).data?.length, 0);
  assert.equal((await b.from('addresses').insert({ user_id: userA.id, street: 'Blocked' })).error?.code, '42501');

  const { data: recent, error: recentError } = await a.from('recently_viewed').insert({
    user_id: userA.id,
    restaurant_id: 'b1000000-0000-4000-8000-000000000201',
  }).select('id').single();
  if (recentError) throw recentError;
  rows.recent = recent.id;
  assert.equal((await b.from('recently_viewed').select('id').eq('id', recent.id)).data?.length, 0);

  const { data: search, error: searchError } = await a.from('search_history').insert({
    user_id: userA.id,
    query: `qa-${stamp}`,
    result_count: 1,
  }).select('id').single();
  if (searchError) throw searchError;
  rows.search = search.id;
  assert.equal((await b.from('search_history').select('id').eq('id', search.id)).data?.length, 0);

  const { data: points, error: pointsError } = await service.from('loyalty_points').insert({
    user_id: userA.id,
    balance: 10,
    total_earned: 10,
    total_redeemed: 0,
    tier: 'bronze',
  }).select('id').single();
  if (pointsError) throw pointsError;
  rows.points = points.id;
  const { data: transaction, error: transactionError } = await service.from('loyalty_transactions').insert({
    user_id: userA.id,
    amount: 10,
    reason: 'qa_test',
  }).select('id').single();
  if (transactionError) throw transactionError;
  rows.transaction = transaction.id;
  assert.equal((await a.from('loyalty_points').select('id').eq('id', points.id)).data?.length, 1);
  assert.equal((await b.from('loyalty_points').select('id').eq('id', points.id)).data?.length, 0);
  assert.equal((await a.from('loyalty_transactions').select('id').eq('id', transaction.id)).data?.length, 1);
  assert.equal((await b.from('loyalty_transactions').select('id').eq('id', transaction.id)).data?.length, 0);
  assert.equal((await a.from('loyalty_points').update({ balance: 999 }).eq('id', points.id).select('id')).data?.length ?? 0, 0);
  assert.equal((await admin.from('loyalty_points').select('id').eq('id', points.id)).data?.length, 1);
  assert.equal((await admin.from('loyalty_points').update({ balance: 15 }).eq('id', points.id).select('balance')).data?.[0]?.balance, 15);

  const { data: order, error: orderError } = await service.from('orders').insert({
    order_number: `QA-RLS-${stamp}`,
    customer_id: userA.id,
    restaurant_id: 'b1000000-0000-4000-8000-000000000201',
    status: 'delivered',
    total: 10,
    payment_status: 'paid',
    delivery_address: { street: 'QA Straße 1', city: 'Wesseling' },
    delivered_at: new Date().toISOString(),
  }).select('id').single();
  if (orderError) throw orderError;
  rows.order = order.id;

  // The production rating endpoint validates ownership/status and writes with
  // the server client. Raw table writes are intentionally closed to browsers.
  const { data: rating, error: ratingError } = await service.from('ratings').insert({
    order_id: order.id,
    customer_id: userA.id,
    restaurant_id: 'b1000000-0000-4000-8000-000000000201',
    restaurant_rating: 5,
    food_rating: 5,
    comment: `QA rating ${stamp}`,
  }).select('id').single();
  if (ratingError) throw ratingError;
  rows.rating = rating.id;
  const anonymousRating = await anon.from('ratings').select('id').eq('id', rating.id);
  assert.ok(anonymousRating.error || anonymousRating.data?.length === 0);
  assert.equal((await a.from('ratings').select('id').eq('id', rating.id)).data?.length, 1);
  assert.equal((await b.from('ratings').select('id').eq('id', rating.id)).data?.length, 0);
  assert.ok((await b.from('ratings').insert({
    order_id: order.id,
    customer_id: userB.id,
    restaurant_id: 'b1000000-0000-4000-8000-000000000201',
    restaurant_rating: 1,
  })).error);
  assert.ok((await a.from('ratings').insert({
    order_id: crypto.randomUUID(),
    customer_id: userA.id,
    restaurant_id: 'b1000000-0000-4000-8000-000000000201',
    restaurant_rating: 1,
  })).error);
  assert.ok((await a.from('ratings').update({ restaurant_rating: 1 }).eq('id', rating.id)).error);
  assert.ok((await a.from('ratings').delete().eq('id', rating.id)).error);

  for (const table of ['addresses', 'recently_viewed', 'search_history', 'loyalty_points', 'loyalty_transactions']) {
    const result = await anon.from(table).select('*').limit(1);
    assert.ok(result.error || result.data?.length === 0, `anonymous ${table} access must be denied`);
  }

  console.log('Staging customer history/loyalty RLS: PASS');
  console.log('  ✓ addresses, search and recent history are owner-only');
  console.log('  ✓ loyalty is owner-readable, admin-managed and cross-user isolated');
  console.log('  ✓ raw ratings are participant-read, API-created and client-immutable');
} finally {
  if (rows.rating) await service.from('ratings').delete().eq('id', rows.rating);
  if (rows.order) await service.from('orders').delete().eq('id', rows.order);
  if (rows.transaction) await service.from('loyalty_transactions').delete().eq('id', rows.transaction);
  if (rows.points) await service.from('loyalty_points').delete().eq('id', rows.points);
  if (rows.search) await service.from('search_history').delete().eq('id', rows.search);
  if (rows.recent) await service.from('recently_viewed').delete().eq('id', rows.recent);
  if (rows.address) await service.from('addresses').delete().eq('id', rows.address);
  for (const id of users.reverse()) {
    await service.from('notification_preferences').delete().eq('user_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
