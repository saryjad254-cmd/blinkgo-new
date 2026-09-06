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
const clients = Object.fromEntries(
  ['customer', 'restaurantA', 'restaurantB', 'driverA', 'driverB', 'admin'].map((key) => [
    key,
    createClient(url, publishableKey, options),
  ]),
);
const stamp = Date.now();
const users = [];
const rows = {};

async function makeUser(label, appRole) {
  const email = `qa.principal.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { app_role: appRole },
    user_metadata: { name: `Principal ${label}` },
  });
  if (error) throw error;
  users.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signIn(client, user) {
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
}

try {
  const customer = await makeUser('customer', 'customer');
  const restaurantA = await makeUser('restaurant-a', 'restaurant');
  const restaurantB = await makeUser('restaurant-b', 'restaurant');
  const driverA = await makeUser('driver-a', 'driver');
  const driverB = await makeUser('driver-b', 'driver');
  const admin = await makeUser('admin', 'admin');

  await Promise.all([
    signIn(clients.customer, customer),
    signIn(clients.restaurantA, restaurantA),
    signIn(clients.restaurantB, restaurantB),
    signIn(clients.driverA, driverA),
    signIn(clients.driverB, driverB),
    signIn(clients.admin, admin),
  ]);

  const { data: restaurantRows, error: restaurantError } = await service.from('restaurants').insert([
    { owner_id: restaurantA.id, name: `QA Principal A ${stamp}`, is_active: false },
    { owner_id: restaurantB.id, name: `QA Principal B ${stamp}`, is_active: false },
  ]).select('id,owner_id');
  if (restaurantError) throw restaurantError;
  rows.restaurantA = restaurantRows.find((row) => row.owner_id === restaurantA.id).id;
  rows.restaurantB = restaurantRows.find((row) => row.owner_id === restaurantB.id).id;

  const { data: order, error: orderError } = await service.from('orders').insert({
    order_number: `QA-PRINCIPAL-${stamp}`,
    customer_id: customer.id,
    restaurant_id: rows.restaurantA,
    driver_id: driverA.id,
    status: 'assigned',
    total: 10,
    payment_status: 'paid',
    delivery_address: { street: 'QA Straße 1', city: 'Wesseling' },
  }).select('id').single();
  if (orderError) throw orderError;
  rows.order = order.id;

  const { error: profilesError } = await service.from('drivers').upsert([
    { id: driverA.id, user_id: driverA.id, full_name: 'QA Driver A', is_active: true },
    { id: driverB.id, user_id: driverB.id, full_name: 'QA Driver B', is_active: true },
  ], { onConflict: 'id' });
  if (profilesError) throw profilesError;

  const { data: shareLink, error: shareError } = await service.from('share_links').insert({
    token: `qa-${crypto.randomUUID().replaceAll('-', '')}`,
    resource_type: 'order',
    resource_id: order.id,
    created_by: customer.id,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }).select('id').single();
  if (shareError) throw shareError;
  rows.shareLink = shareLink.id;

  const { data: badge, error: badgeError } = await service.from('badges').insert({
    user_id: customer.id,
    badge_type: 'qa',
    badge_name: 'QA only',
  }).select('id').single();
  if (badgeError) throw badgeError;
  rows.badge = badge.id;

  const { data: rating, error: ratingError } = await service.from('ratings').insert({
    order_id: order.id,
    customer_id: customer.id,
    restaurant_id: rows.restaurantA,
    driver_id: driverA.id,
    restaurant_rating: 5,
    driver_rating: 5,
    food_rating: 5,
    comment: 'QA participant boundary',
  }).select('id').single();
  if (ratingError) throw ratingError;
  rows.rating = rating.id;

  rows.privateConfigKey = `qa.private.${stamp}`;
  rows.privateSettingKey = `qa_private_${stamp}`;
  const { error: configError } = await service.from('config').insert({ key: rows.privateConfigKey, value: { secret: true } });
  if (configError) throw configError;
  const { error: settingError } = await service.from('system_settings').insert({ key: rows.privateSettingKey, value: { secret: true } });
  if (settingError) throw settingError;

  for (const driverId of [driverA.id, driverB.id]) {
    const { error } = await service.from('driver_status').upsert({
      driver_id: driverId,
      is_online: true,
      is_on_delivery: driverId === driverA.id,
      current_order_id: driverId === driverA.id ? order.id : null,
      latitude: 50.82,
      longitude: 6.97,
    }, { onConflict: 'driver_id' });
    if (error) throw error;
  }

  assert.ok((await clients.customer.from('driver_status').insert({
    driver_id: customer.id,
    is_online: true,
  })).error);
  assert.ok((await clients.customer.from('restaurants').insert({
    owner_id: customer.id,
    name: `Forbidden customer restaurant ${stamp}`,
    is_active: false,
  })).error);

  assert.ok((await anon.from('drivers').select('id').limit(1)).error);
  assert.equal((await clients.customer.from('drivers').select('id').eq('id', driverA.id)).data?.length, 0);
  assert.equal((await clients.driverA.from('drivers').select('id').eq('id', driverA.id)).data?.length, 1);
  assert.equal((await clients.driverA.from('drivers').select('id').eq('id', driverB.id)).data?.length, 0);
  assert.equal((await clients.admin.from('drivers').select('id').in('id', [driverA.id, driverB.id])).data?.length, 2);

  assert.equal((await clients.customer.from('share_links').select('id').eq('id', shareLink.id)).data?.length, 1);
  assert.equal((await clients.restaurantA.from('share_links').select('id').eq('id', shareLink.id)).data?.length, 0);
  assert.equal((await clients.admin.from('share_links').select('id').eq('id', shareLink.id)).data?.length, 1);
  assert.ok((await clients.restaurantA.from('share_links').insert({
    token: `qa-spoof-${stamp}`,
    resource_type: 'order',
    resource_id: order.id,
    created_by: customer.id,
  })).error);

  assert.equal((await clients.customer.from('badges').select('id').eq('id', badge.id)).data?.length, 1);
  assert.equal((await clients.restaurantA.from('badges').select('id').eq('id', badge.id)).data?.length, 0);
  assert.ok((await clients.customer.from('badges').insert({ user_id: customer.id, badge_type: 'forged', badge_name: 'Forged' })).error);
  assert.equal((await anon.from('config').select('key').eq('key', rows.privateConfigKey)).data?.length, 0);
  assert.equal((await clients.customer.from('config').select('key').eq('key', rows.privateConfigKey)).data?.length, 0);
  assert.equal((await anon.from('system_settings').select('key').eq('key', rows.privateSettingKey)).data?.length, 0);

  assert.ok((await anon.from('ratings').select('id').eq('id', rating.id)).error);
  assert.equal((await clients.customer.from('ratings').select('id').eq('id', rating.id)).data?.length, 1);
  assert.equal((await clients.driverA.from('ratings').select('id').eq('id', rating.id)).data?.length, 1);
  assert.equal((await clients.restaurantA.from('ratings').select('id').eq('id', rating.id)).data?.length, 1);
  assert.equal((await clients.restaurantB.from('ratings').select('id').eq('id', rating.id)).data?.length, 0);

  assert.equal((await clients.driverA.from('driver_status').select('driver_id').eq('driver_id', driverA.id)).data?.length, 1);
  assert.equal((await clients.driverA.from('driver_status').select('driver_id').eq('driver_id', driverB.id)).data?.length, 0);
  assert.equal((await clients.driverA.from('driver_status').update({ is_online: false }).eq('driver_id', driverA.id).select('driver_id')).data?.length, 1);
  assert.equal((await clients.driverA.from('driver_status').update({ is_online: false }).eq('driver_id', driverB.id).select('driver_id')).data?.length, 0);

  assert.equal((await clients.restaurantA.from('driver_status').select('driver_id').eq('driver_id', driverA.id)).data?.length, 1);
  assert.equal((await clients.restaurantB.from('driver_status').select('driver_id').eq('driver_id', driverA.id)).data?.length, 0);
  const restaurantDriverWrite = await clients.restaurantA.from('driver_status')
    .update({ latitude: 1, longitude: 1 })
    .eq('driver_id', driverA.id)
    .select('driver_id');
  assert.ok(restaurantDriverWrite.error || restaurantDriverWrite.data?.length === 0);

  assert.equal((await clients.restaurantA.from('restaurants').update({ description: 'Owned update' }).eq('id', rows.restaurantA).select('id')).data?.length, 1);
  assert.equal((await clients.restaurantB.from('restaurants').update({ description: 'Cross-tenant update' }).eq('id', rows.restaurantA).select('id')).data?.length, 0);

  assert.equal((await clients.admin.from('driver_status').select('driver_id').in('driver_id', [driverA.id, driverB.id])).data?.length, 2);
  for (const status of ['picked_up', 'delivered']) {
    const { error } = await service.from('orders').update({ status }).eq('id', order.id);
    if (error) throw error;
  }
  assert.equal((await clients.restaurantA.from('driver_status').select('driver_id').eq('driver_id', driverA.id)).data?.length, 0);

  console.log('Staging principal role boundaries RLS: PASS');
  console.log('  ✓ customer cannot self-provision driver or restaurant authority');
  console.log('  ✓ drivers can write only their own presence row');
  console.log('  ✓ restaurant location visibility is active-order and tenant scoped');
  console.log('  ✓ driver profiles, share tokens, badges and future private config are not public');
} finally {
  if (rows.rating) await service.from('ratings').delete().eq('id', rows.rating);
  if (rows.badge) await service.from('badges').delete().eq('id', rows.badge);
  if (rows.shareLink) await service.from('share_links').delete().eq('id', rows.shareLink);
  if (rows.privateConfigKey) await service.from('config').delete().eq('key', rows.privateConfigKey);
  if (rows.privateSettingKey) await service.from('system_settings').delete().eq('key', rows.privateSettingKey);
  if (rows.order) await service.from('orders').delete().eq('id', rows.order);
  if (users.length) await service.from('driver_status').delete().in('driver_id', users);
  if (users.length) await service.from('drivers').delete().in('id', users);
  if (rows.restaurantA || rows.restaurantB) {
    await service.from('restaurants').delete().in('id', [rows.restaurantA, rows.restaurantB].filter(Boolean));
  }
  for (const id of users.reverse()) {
    await service.from('notification_preferences').delete().eq('user_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
