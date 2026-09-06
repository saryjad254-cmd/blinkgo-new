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
const ownerClient = createClient(url, publishableKey, options);
const customerClient = createClient(url, publishableKey, options);
const adminClient = createClient(url, publishableKey, options);
const stamp = Date.now();
const ids = { users: [], restaurant: crypto.randomUUID(), category: crypto.randomUUID(), approved: crypto.randomUUID(), pending: crypto.randomUUID(), stat: crypto.randomUUID(), proof: crypto.randomUUID() };

async function makeUser(label, appRole) {
  const email = `qa.catalog.${label}.${stamp}@blinkgo.invalid`;
  const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { app_role: appRole }, user_metadata: { name: `QA ${label}` } });
  if (error) throw error;
  ids.users.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signIn(client, user) {
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
}

async function deniedOrEmpty(client, table) {
  const result = await client.from(table).select('*').limit(1);
  return Boolean(result.error || result.data?.length === 0);
}

try {
  const owner = await makeUser('owner', 'restaurant');
  const customer = await makeUser('customer', 'customer');
  const admin = await makeUser('admin', 'admin');
  await Promise.all([signIn(ownerClient, owner), signIn(customerClient, customer), signIn(adminClient, admin)]);

  const { error: restaurantError } = await service.from('restaurants').insert({ id: ids.restaurant, owner_id: owner.id, name: `QA Catalog ${stamp}`, is_active: true });
  if (restaurantError) throw restaurantError;
  const { error: categoryError } = await service.from('categories').insert({ id: ids.category, restaurant_id: ids.restaurant, name: 'QA category' });
  if (categoryError) throw categoryError;
  const { error: productError } = await service.from('products').insert([
    { id: ids.approved, restaurant_id: ids.restaurant, name: 'QA approved', category: 'QA', price: 5, approval_status: 'approved', is_active: true, is_available: true },
    { id: ids.pending, restaurant_id: ids.restaurant, name: 'QA archived', category: 'QA', price: 7, approval_status: 'archived', archived_at: new Date().toISOString(), is_active: false, is_available: false },
  ]);
  if (productError) throw productError;
  const futureDate = new Date(Date.UTC(2100, 0, 1 + (stamp % 300))).toISOString().slice(0, 10);
  const { error: statError } = await service.from('daily_stats').insert({ id: ids.stat, date: futureDate, total_orders: 2, total_revenue: 99 });
  if (statError) throw statError;
  const { error: proofError } = await service.from('delivery_proofs').insert({ id: ids.proof, photo_url: 'private://qa-proof', signature: 'qa-signature', notes: 'private' });
  if (proofError) throw proofError;

  for (const client of [anon, ownerClient, customerClient, adminClient]) {
    assert.ok(await deniedOrEmpty(client, 'daily_stats'), 'daily stats must be private');
    assert.ok(await deniedOrEmpty(client, 'delivery_proofs'), 'legacy delivery proofs must be private');
  }

  assert.equal((await anon.from('categories').select('id').eq('id', ids.category)).data?.length, 1, 'anon reads categories');
  assert.ok((await anon.from('categories').insert({ name: 'forged' })).error, 'anon cannot create categories');
  assert.ok((await ownerClient.from('categories').insert({ name: 'forged' })).error, 'restaurant cannot bypass category API');

  assert.equal((await anon.from('products').select('id').in('id', [ids.approved, ids.pending])).data?.length, 1, 'anon sees approved product only');
  assert.equal((await customerClient.from('products').select('id').in('id', [ids.approved, ids.pending])).data?.length, 1, 'customer sees approved product only');
  assert.equal((await ownerClient.from('products').select('id').in('id', [ids.approved, ids.pending])).data?.length, 2, 'owner sees own pending product');
  assert.equal((await adminClient.from('products').select('id').in('id', [ids.approved, ids.pending])).data?.length, 2, 'admin sees catalog workflow');

  const safeUpdate = await ownerClient.from('products').update({ price: 6, is_available: false }).eq('id', ids.approved).select('id').single();
  assert.equal(safeUpdate.error, null, 'owner updates allowed operational columns');
  assert.ok((await ownerClient.from('products').update({ approval_status: 'approved' }).eq('id', ids.pending)).error, 'owner cannot self-approve product');
  assert.ok((await ownerClient.from('products').update({ restaurant_id: crypto.randomUUID() }).eq('id', ids.pending)).error, 'owner cannot reassign product');
  assert.ok((await ownerClient.from('products').update({ name: 'forged name' }).eq('id', ids.pending)).error, 'owner cannot bypass product approval content');
  assert.ok((await customerClient.from('products').update({ price: 1 }).eq('id', ids.approved)).error || (await customerClient.from('products').select('price').eq('id', ids.approved).single()).data?.price !== 1, 'customer cannot change product');

  console.log('Staging catalog/metrics RLS: PASS');
  console.log('  ✓ financial metrics and legacy proof data are server-only');
  console.log('  ✓ public catalog exposes approved products only');
  console.log('  ✓ merchant updates are restricted to reviewed operational columns');
} finally {
  await service.from('delivery_proofs').delete().eq('id', ids.proof);
  await service.from('daily_stats').delete().eq('id', ids.stat);
  await service.from('products').delete().in('id', [ids.approved, ids.pending]);
  await service.from('categories').delete().eq('id', ids.category);
  await service.from('restaurants').delete().eq('id', ids.restaurant);
  for (const id of ids.users.reverse()) {
    await service.from('notification_preferences').delete().eq('user_id', id);
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id);
  }
}
