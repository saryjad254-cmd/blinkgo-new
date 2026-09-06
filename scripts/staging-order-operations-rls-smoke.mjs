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
const stranger = createClient(url, publishableKey, options);
const driver = createClient(url, publishableKey, options);
const admin = createClient(url, publishableKey, options);
const stamp = Date.now();
const userIds = [];
const rows = {};

async function makeUser(label, appRole) {
  const email = `qa.order.ops.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { app_role: appRole },
    user_metadata: { name: `Order Ops ${label}` },
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
  const owner = await makeUser('customer', 'customer');
  const other = await makeUser('stranger', 'customer');
  const courier = await makeUser('driver', 'driver');
  const operator = await makeUser('admin', 'admin');
  await Promise.all([
    signIn(customer, owner),
    signIn(stranger, other),
    signIn(driver, courier),
    signIn(admin, operator),
  ]);

  const { data: order, error: orderError } = await service.from('orders').insert({
    order_number: `QA-OPS-${stamp}`,
    customer_id: owner.id,
    restaurant_id: 'b1000000-0000-4000-8000-000000000201',
    driver_id: courier.id,
    status: 'confirmed',
    total: 10,
    payment_status: 'paid',
    delivery_address: { street: 'QA Straße 1', city: 'Wesseling' },
  }).select('id').single();
  if (orderError) throw orderError;
  rows.order = order.id;

  const { data: event, error: eventError } = await service.from('order_tracking_events').insert({
    order_id: order.id,
    driver_id: courier.id,
    event_type: 'location_update',
    latitude: 50.82,
    longitude: 6.97,
  }).select('id').single();
  if (eventError) throw eventError;
  rows.event = event.id;
  assert.equal((await customer.from('order_tracking_events').select('id').eq('id', event.id)).data?.length, 1);
  assert.equal((await driver.from('order_tracking_events').select('id').eq('id', event.id)).data?.length, 1);
  assert.equal((await admin.from('order_tracking_events').select('id').eq('id', event.id)).data?.length, 1);
  assert.equal((await stranger.from('order_tracking_events').select('id').eq('id', event.id)).data?.length, 0);
  assert.ok((await driver.from('order_tracking_events').insert({
    order_id: order.id,
    driver_id: courier.id,
    event_type: 'location_update',
  })).error);

  const { data: payment, error: paymentError } = await service.from('payments').insert({
    order_id: order.id,
    customer_id: owner.id,
    amount: 10,
    method: 'cash',
    status: 'paid',
    metadata: { qa: true },
  }).select('id').single();
  if (paymentError) throw paymentError;
  rows.payment = payment.id;
  assert.equal((await customer.from('payments').select('id').eq('id', payment.id)).data?.length, 1);
  assert.equal((await admin.from('payments').select('id').eq('id', payment.id)).data?.length, 1);
  assert.equal((await stranger.from('payments').select('id').eq('id', payment.id)).data?.length, 0);
  assert.equal((await driver.from('payments').select('id').eq('id', payment.id)).data?.length, 0);
  assert.ok((await customer.from('payments').insert({
    order_id: order.id,
    customer_id: owner.id,
    amount: 999,
    method: 'cash',
  })).error);

  const { data: modification, error: modificationError } = await service.from('order_modifications').insert({
    order_id: order.id,
    modified_by: owner.id,
    modification_type: 'change_instructions',
    details: { instructions: 'QA' },
    previous_total: 10,
    new_total: 10,
    delta: 0,
  }).select('id').single();
  if (modificationError) throw modificationError;
  rows.modification = modification.id;
  assert.equal((await customer.from('order_modifications').select('id').eq('id', modification.id)).data?.length, 1);
  assert.equal((await admin.from('order_modifications').select('id').eq('id', modification.id)).data?.length, 1);
  assert.equal((await stranger.from('order_modifications').select('id').eq('id', modification.id)).data?.length, 0);
  assert.ok((await customer.from('order_modifications').insert({
    order_id: order.id,
    modified_by: owner.id,
    modification_type: 'change_tip',
    details: {},
  })).error);

  const { data: wallet, error: walletError } = await service.from('wallet_transactions').insert({
    user_id: owner.id,
    type: 'credit',
    amount: 5,
    balance_after: 5,
    description: 'QA credit',
  }).select('id').single();
  if (walletError) throw walletError;
  rows.wallet = wallet.id;
  assert.equal((await customer.from('wallet_transactions').select('id').eq('id', wallet.id)).data?.length, 1);
  assert.equal((await stranger.from('wallet_transactions').select('id').eq('id', wallet.id)).data?.length, 0);
  assert.ok((await customer.from('wallet_transactions').insert({
    user_id: owner.id,
    type: 'credit',
    amount: 999,
  })).error);

  const { data: message, error: messageError } = await customer.from('chat_messages').insert({
    thread_id: `qa-${stamp}`,
    sender_id: owner.id,
    receiver_id: other.id,
    message: 'QA message',
  }).select('id').single();
  if (messageError) throw messageError;
  rows.message = message.id;
  assert.equal((await customer.from('chat_messages').select('id').eq('id', message.id)).data?.length, 1);
  assert.equal((await stranger.from('chat_messages').select('id').eq('id', message.id)).data?.length, 1);
  assert.equal((await driver.from('chat_messages').select('id').eq('id', message.id)).data?.length, 0);
  assert.ok((await stranger.from('chat_messages').insert({
    thread_id: `qa-${stamp}`,
    sender_id: owner.id,
    receiver_id: other.id,
    message: 'Spoofed',
  })).error);
  assert.ok((await customer.from('chat_messages').delete().eq('id', message.id)).error);

  for (const table of ['order_modifications', 'order_tracking_events', 'payments', 'chat_messages', 'wallet_transactions']) {
    const result = await anon.from(table).select('*').limit(1);
    assert.ok(result.error || result.data?.length === 0, `anonymous ${table} access must be denied`);
  }

  console.log('Staging order operations RLS: PASS');
  console.log('  ✓ precise tracking data is limited to order participants and admins');
  console.log('  ✓ order modifications and wallet ledger are server-written and owner-scoped');
  console.log('  ✓ peer chat is limited to sender and receiver without spoofed writes');
} finally {
  if (rows.message) await service.from('chat_messages').delete().eq('id', rows.message);
  if (rows.wallet) await service.from('wallet_transactions').delete().eq('id', rows.wallet);
  if (rows.modification) await service.from('order_modifications').delete().eq('id', rows.modification);
  if (rows.event) await service.from('order_tracking_events').delete().eq('id', rows.event);
  if (rows.payment) await service.from('payments').delete().eq('id', rows.payment);
  if (rows.order) await service.from('orders').delete().eq('id', rows.order);
  for (const id of userIds.reverse()) {
    await service.from('notification_preferences').delete().eq('user_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
