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
const customerAClient = createClient(url, publishableKey, options);
const customerBClient = createClient(url, publishableKey, options);
const stamp = Date.now();
const userIds = [];
const restaurantIds = [];
const couponIds = [];
let orderId;
let reviewId;

async function makeCustomer(label) {
  const email = `qa.catalog.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { app_role: 'customer' },
    user_metadata: { name: `Catalog ${label}` },
  });
  if (error) throw error;
  userIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

try {
  const customerA = await makeCustomer('a');
  const customerB = await makeCustomer('b');
  for (const [client, user] of [[customerAClient, customerA], [customerBClient, customerB]]) {
    const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    if (error) throw error;
  }

  const { data: restaurants, error: restaurantError } = await service.from('restaurants').insert([
    { name: `QA public ${stamp}`, type: 'restaurant', is_active: true, is_verified: true, is_hidden: false },
    { name: `QA unverified ${stamp}`, type: 'restaurant', is_active: true, is_verified: false, is_hidden: false },
    { name: `QA hidden ${stamp}`, type: 'restaurant', is_active: true, is_verified: true, is_hidden: true },
    { name: `QA inactive ${stamp}`, type: 'restaurant', is_active: false, is_verified: true, is_hidden: false },
  ]).select('id,name');
  if (restaurantError) throw restaurantError;
  restaurantIds.push(...restaurants.map((row) => row.id));
  const publicRestaurant = restaurants.find((row) => row.name.startsWith('QA public'));

  for (const client of [anon, customerAClient]) {
    const { data, error } = await client.from('restaurants').select('id').in('id', restaurantIds);
    if (error) throw error;
    assert.deepEqual(data.map((row) => row.id), [publicRestaurant.id]);
  }

  const now = Date.now();
  const day = 86_400_000;
  const couponRows = [
    { code: `QAOK${stamp}`, name: 'QA current', type: 'fixed', value: 1, is_active: true, deleted_at: null, start_date: new Date(now - day).toISOString(), end_date: new Date(now + day).toISOString(), usage_limit: 5, usage_count: 0 },
    { code: `QAFUT${stamp}`, name: 'QA future', type: 'fixed', value: 1, is_active: true, deleted_at: null, start_date: new Date(now + day).toISOString(), end_date: new Date(now + 2 * day).toISOString() },
    { code: `QAEXP${stamp}`, name: 'QA expired', type: 'fixed', value: 1, is_active: true, deleted_at: null, start_date: new Date(now - 2 * day).toISOString(), end_date: new Date(now - day).toISOString() },
    { code: `QADEL${stamp}`, name: 'QA deleted', type: 'fixed', value: 1, is_active: true, deleted_at: new Date().toISOString(), start_date: new Date(now - day).toISOString(), end_date: new Date(now + day).toISOString() },
    { code: `QAUSED${stamp}`, name: 'QA exhausted', type: 'fixed', value: 1, is_active: true, deleted_at: null, start_date: new Date(now - day).toISOString(), end_date: new Date(now + day).toISOString(), usage_limit: 1, usage_count: 1 },
  ];
  const { data: coupons, error: couponError } = await service.from('coupons').insert(couponRows).select('id,code');
  if (couponError) throw couponError;
  couponIds.push(...coupons.map((row) => row.id));
  for (const client of [anon, customerAClient]) {
    const { data, error } = await client.from('coupons').select('id,code').in('id', couponIds);
    if (error) throw error;
    assert.deepEqual(data.map((row) => row.code), [`QAOK${stamp}`]);
  }

  const { data: order, error: orderError } = await service.from('orders').insert({
    order_number: `QA-CATALOG-${stamp}`,
    customer_id: customerA.id,
    restaurant_id: publicRestaurant.id,
    status: 'delivered',
    total: 10,
    payment_status: 'paid',
    delivery_address: { street: 'QA Straße 1', city: 'Wesseling' },
  }).select('id').single();
  if (orderError) throw orderError;
  orderId = order.id;

  const forged = await customerBClient.from('reviews').insert({
    order_id: orderId,
    customer_id: customerB.id,
    restaurant_id: publicRestaurant.id,
    rating: 5,
    comment: 'forged',
  });
  assert.ok(forged.error);

  const { data: review, error: reviewError } = await customerAClient.from('reviews').insert({
    order_id: orderId,
    customer_id: customerA.id,
    restaurant_id: publicRestaurant.id,
    rating: 5,
    comment: 'verified participant',
  }).select('id').single();
  if (reviewError) throw reviewError;
  reviewId = review.id;

  assert.ok((await anon.from('reviews').select('id').eq('id', reviewId)).error);
  assert.equal((await customerAClient.from('reviews').select('id').eq('id', reviewId)).data?.length, 1);
  assert.equal((await customerBClient.from('reviews').select('id').eq('id', reviewId)).data?.length, 0);

  console.log('Staging public catalog RLS: PASS');
  console.log('  ✓ only verified, visible, active restaurants are public');
  console.log('  ✓ only current, undeleted, non-exhausted coupons are public');
  console.log('  ✓ raw reviews are participant-only and require a delivered owned order');
} finally {
  if (reviewId) await service.from('reviews').delete().eq('id', reviewId);
  if (orderId) await service.from('orders').delete().eq('id', orderId);
  if (couponIds.length) await service.from('coupons').delete().in('id', couponIds);
  if (restaurantIds.length) await service.from('restaurants').delete().in('id', restaurantIds);
  for (const id of userIds.reverse()) {
    await service.from('notification_preferences').delete().eq('user_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
