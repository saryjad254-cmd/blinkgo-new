#!/usr/bin/env node

import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.staging.local', override: true });

const PROJECT = 'egjehqoilbjvzgbnksds';
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (process.env.ALLOW_STAGING_MUTATIONS !== '1') throw new Error('Set ALLOW_STAGING_MUTATIONS=1');
if (!url.includes(PROJECT) || !BASE.startsWith('http://localhost:')) throw new Error('Refusing to run outside the BlinkGo staging project and localhost app');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now();
const prefix = `qa.catalog.${stamp}`;
const password = `${crypto.randomUUID().replaceAll('-', '')}Aa!7`;
const createdUsers = [];
let storeId = null;
let categoryId = null;
let productId = null;
let orderId = null;
let passed = 0;
const png = new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], 'blinkgo-test.png', { type: 'image/png' });

function check(value, message) {
  assert.ok(value, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

async function createUser(role) {
  const email = `${prefix}.${role}@blinkgo.invalid`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { app_role: role }, user_metadata: { name: `QA ${role}` } });
  if (error) throw error;
  const id = data.user.id;
  createdUsers.push(id);
  const { error: profileError } = await service.from('users').upsert({ id, email, name: `QA ${role}`, role, is_active: true, is_verified: true }, { onConflict: 'id' });
  if (profileError) throw profileError;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError || !login.session?.access_token) throw loginError || new Error(`No ${role} session`);
  return { id, email, token: login.session.access_token, client };
}

function headers(token, json = true) {
  return { Authorization: `Bearer ${token}`, Origin: BASE, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

async function api(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers(token, options.body instanceof FormData ? false : true), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function upload(token, id, kind) {
  const form = new FormData(); form.set('id', id); form.set('kind', kind); form.set('file', png);
  return api('/api/admin/catalog-media', token, { method: 'POST', body: form });
}

async function storageExists(publicUrl, bucket) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const pathname = new URL(publicUrl).pathname;
  const index = pathname.indexOf(marker);
  if (index < 0) return false;
  const path = decodeURIComponent(pathname.slice(index + marker.length));
  const { data, error } = await service.storage.from(bucket).download(path);
  return Boolean(data && !error);
}

async function status(token, statusValue, driverId) {
  return api('/api/orders/status', token, { method: 'PATCH', body: JSON.stringify({ order_id: orderId, status: statusValue, ...(driverId ? { driver_id: driverId } : {}) }) });
}

try {
  const admin = await createUser('admin');
  const customer = await createUser('customer');
  const driver = await createUser('driver');
  check(Boolean(admin.token && customer.token && driver.token), 'admin, customer, and driver sessions authenticate');

  const ownerEmail = `${prefix}.owner@blinkgo.invalid`;
  const allDays = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, { open: '00:00', close: '23:59' }]));
  const createPayload = {
    name: `BlinkGo QA Store ${stamp}`, type: 'restaurant', category: 'QA Food', description: 'Persistent admin-created storefront', address: 'Kölner Straße 1, 50389 Wesseling', phone: '+492236000000',
    owner_name: 'QA Merchant', owner_email: ownerEmail, owner_phone: '+491700000000', latitude: 50.8207, longitude: 6.9786, opening_hours: allDays,
    delivery_radius_km: 20, delivery_fee: 1.99, min_order_amount: 1, commission_pct: 15,
    legal_name: 'BlinkGo QA Merchant GmbH', legal_form: 'GmbH', representative_name: 'QA Merchant', contact_email: ownerEmail, contact_phone: '+491700000000', street_address: 'Kölner Straße 1', postal_code: '50389', legal_city: 'Wesseling', trade_register_name: 'Amtsgericht Köln', trade_register_number: `HRB${stamp}`, identity_document_ref: `encrypted-id-${stamp}`, business_document_ref: `encrypted-business-${stamp}`, payout_account_last4: '1234', self_certified: true,
  };
  let createStore = await api('/api/admin/restaurants', admin.token, { method: 'POST', body: JSON.stringify(createPayload) });
  if (createStore.response.status === 429) {
    const retryAfter = Math.max(1, Number(createStore.response.headers.get('Retry-After') || 1));
    console.log(`  • invite rate limit: waiting ${retryAfter}s`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 60) * 1000));
    createStore = await api('/api/admin/restaurants', admin.token, { method: 'POST', body: JSON.stringify(createPayload) });
  }
  check(createStore.response.status === 201 && createStore.body.restaurant?.id, `admin creates a real store (${createStore.response.status})`);
  storeId = createStore.body.restaurant.id;
  const ownerId = createStore.body.owner.id;
  createdUsers.push(ownerId);
  await service.auth.admin.updateUserById(ownerId, { password, email_confirm: true, app_metadata: { app_role: 'restaurant' } });
  await service.from('users').update({ is_active: true, is_verified: true, restaurant_id: storeId }).eq('id', ownerId);

  const approval = await api(`/api/admin/restaurants/${storeId}/verification`, admin.token, { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) });
  check(approval.response.ok && approval.body.is_active === true, 'admin trader approval publishes the store');
  const editedStore = await api(`/api/admin/restaurants/${storeId}`, admin.token, { method: 'PATCH', body: JSON.stringify({ type: 'shop', delivery_fee: 2.49, minimum_order: 2, latitude: 50.8208, longitude: 6.9787, opening_hours: allDays }) });
  check(editedStore.response.ok && editedStore.body.restaurant?.type === 'shop', 'store type, pricing, map location, and hours persist');
  const restoredType = await api(`/api/admin/restaurants/${storeId}`, admin.token, { method: 'PATCH', body: JSON.stringify({ type: 'restaurant' }) });
  check(restoredType.response.ok, 'store type can be restored for food ordering');

  const logo1 = await upload(admin.token, storeId, 'restaurant_logo');
  check(logo1.response.ok && (await fetch(logo1.body.url)).ok, 'store logo uploads to persistent public Storage');
  const logo2 = await upload(admin.token, storeId, 'restaurant_logo');
  check(logo2.response.ok && logo2.body.url !== logo1.body.url && !(await storageExists(logo1.body.url, 'restaurant-images')), 'replacing store logo removes the superseded object');
  const cover = await upload(admin.token, storeId, 'restaurant_cover');
  check(cover.response.ok && (await fetch(cover.body.url)).ok, 'store cover uploads to persistent public Storage');

  const createdCategory = await api('/api/admin/categories', admin.token, { method: 'POST', body: JSON.stringify({ restaurant_id: storeId, name: 'QA Meals', description: 'QA category', sort_order: 10 }) });
  check(createdCategory.response.status === 201 && createdCategory.body.category?.id, 'admin creates a persisted store category');
  categoryId = createdCategory.body.category.id;
  const renamedCategory = await api('/api/admin/categories', admin.token, { method: 'PATCH', body: JSON.stringify({ id: categoryId, name: 'QA Signature Meals', sort_order: 2 }) });
  check(renamedCategory.response.ok && renamedCategory.body.category?.sort_order === 2, 'admin renames and reorders a category');
  const directCategoryWrite = await customer.client.from('categories').insert({ restaurant_id: storeId, name: 'Unauthorized category', sort_order: 999 }).select();
  check(Boolean(directCategoryWrite.error) || !directCategoryWrite.data?.length, 'customer cannot mutate catalog categories directly');

  const createdProduct = await api('/api/products/manage', admin.token, { method: 'POST', body: JSON.stringify({ restaurant_id: storeId, name: `QA Burger ${stamp}`, description: 'Admin-created orderable product', price: 9.9, category_id: categoryId, is_active: true, is_available: true }) });
  check(createdProduct.response.status === 201 && createdProduct.body.product?.category_id === categoryId, 'admin creates a product linked to the category');
  productId = createdProduct.body.product.id;
  const editedProduct = await api('/api/products/manage', admin.token, { method: 'PATCH', body: JSON.stringify({ id: productId, price: 10.5, description: 'Updated persistent product' }) });
  check(editedProduct.response.ok && Number(editedProduct.body.product?.price) === 10.5, 'admin override price and product details persist');
  const productImage1 = await upload(admin.token, productId, 'product_image');
  const productImage2 = await upload(admin.token, productId, 'product_image');
  check(productImage2.response.ok && productImage2.body.url !== productImage1.body.url && !(await storageExists(productImage1.body.url, 'product-images')), 'product image replace persists and cleans the old object');

  const hideCategory = await api('/api/admin/categories', admin.token, { method: 'PATCH', body: JSON.stringify({ id: categoryId, is_hidden: true }) });
  const hiddenMenu = await api(`/api/products/by-restaurant?restaurant_id=${storeId}`, customer.token);
  check(hideCategory.response.ok && !hiddenMenu.body.products?.some((item) => item.id === productId), 'hidden category removes its products from the customer menu');
  await api('/api/admin/categories', admin.token, { method: 'PATCH', body: JSON.stringify({ id: categoryId, is_hidden: false }) });
  await api('/api/products/manage', admin.token, { method: 'PATCH', body: JSON.stringify({ id: productId, is_available: false, is_active: false }) });
  const pausedMenu = await api(`/api/products/by-restaurant?restaurant_id=${storeId}`, customer.token);
  check(!pausedMenu.body.products?.some((item) => item.id === productId), 'paused product disappears from the customer menu');
  await api('/api/products/manage', admin.token, { method: 'PATCH', body: JSON.stringify({ id: productId, is_available: true, is_active: true }) });

  const hiddenStore = await api(`/api/admin/restaurants/${storeId}`, admin.token, { method: 'PATCH', body: JSON.stringify({ is_hidden: true }) });
  const hiddenDetail = await api(`/api/restaurants/${storeId}`, customer.token);
  check(hiddenStore.response.ok && hiddenDetail.response.status === 404, 'hidden store cannot be opened through a stale customer URL');
  await api(`/api/admin/restaurants/${storeId}`, admin.token, { method: 'PATCH', body: JSON.stringify({ is_hidden: false }) });
  const search = await api(`/api/search?q=${encodeURIComponent(`BlinkGo QA Store ${stamp}`)}`, customer.token);
  check(search.response.ok && JSON.stringify(search.body).includes(storeId), 'admin-created store appears in customer discovery');
  const detail = await api(`/api/restaurants/${storeId}`, customer.token);
  const menu = await api(`/api/products/by-restaurant?restaurant_id=${storeId}`, customer.token);
  check(detail.response.ok && menu.body.products?.some((item) => item.id === productId), 'customer opens store and sees its category product');

  const avatar1 = new FormData(); avatar1.set('file', png);
  const firstAvatar = await api('/api/account/avatar', customer.token, { method: 'POST', body: avatar1 });
  check(firstAvatar.response.ok && (await fetch(firstAvatar.body.avatar_url)).ok, 'customer uploads and saves a persistent profile photo');
  const avatar2 = new FormData(); avatar2.set('file', png);
  const secondAvatar = await api('/api/account/avatar', customer.token, { method: 'POST', body: avatar2 });
  check(secondAvatar.response.ok && secondAvatar.body.avatar_url !== firstAvatar.body.avatar_url && !(await storageExists(firstAvatar.body.avatar_url, 'avatar-images')), 'customer replaces the photo and old object is removed');
  const avatarDb = await service.from('users').select('avatar_url').eq('id', customer.id).single();
  check(avatarDb.data?.avatar_url === secondAvatar.body.avatar_url, 'customer avatar URL survives through the database profile');
  const removedAvatar = await api('/api/account/avatar', customer.token, { method: 'DELETE' });
  check(removedAvatar.response.ok && !(await storageExists(secondAvatar.body.avatar_url, 'avatar-images')), 'customer removes the profile photo and Storage object');

  const quote = await api('/api/cart/quote', customer.token, { method: 'POST', body: JSON.stringify({ restaurant_id: storeId, fulfillment_type: 'delivery', items: [{ product_id: productId, quantity: 1, configuration: {} }] }) });
  check(quote.response.ok && quote.body.lines?.[0]?.config_key, 'customer receives a server-authoritative cart quote');
  const deliveryAddress = { address: 'Kölner Straße 2, 50389 Wesseling', lat: 50.8209, lng: 6.9788 };
  const draft = await api('/api/checkout/draft', customer.token, { method: 'POST', body: JSON.stringify({ restaurant_id: storeId, fulfillment_type: 'delivery', items: [{ product_id: productId, quantity: 1, config_key: quote.body.lines[0].config_key, configuration: {} }], payment_method: 'cash', delivery_address: deliveryAddress }) });
  check(draft.response.ok && draft.body?.data?.draft?.can_place_order === true, `customer creates an orderable signed draft: ${JSON.stringify(draft.body?.data?.draft?.issues || [])}`);
  const cash = await api('/api/checkout/cash', customer.token, { method: 'POST', body: JSON.stringify({ draft_id: draft.body.data.draft.draft_id }) });
  check(cash.response.ok && cash.body?.data?.order?.id, 'cash checkout creates one persisted order');
  orderId = cash.body.data.order.id;

  const ownerClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ownerLogin = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password });
  check(!ownerLogin.error && ownerLogin.data.session?.access_token, 'admin-created restaurant owner can authenticate');
  const ownerToken = ownerLogin.data.session.access_token;
  check((await status(ownerToken, 'confirmed')).response.ok, 'restaurant accepts the new order');
  check((await status(ownerToken, 'preparing')).response.ok, 'restaurant marks the order preparing');
  const ready = await status(ownerToken, 'ready', driver.id);
  check(ready.response.ok && ready.body?.data?.order?.status === 'assigned', 'restaurant marks ready and assigns the driver');
  check((await status(driver.token, 'picked_up')).response.ok, 'assigned driver marks the order picked up');
  check((await status(driver.token, 'delivered')).response.ok, 'assigned driver completes delivery');
  const tracked = await api(`/api/orders/track?order_id=${orderId}`, customer.token);
  check(tracked.response.ok && tracked.body?.data?.order?.status === 'delivered', 'customer sees the delivered state');
  const history = await api('/api/orders/recent?limit=20', customer.token);
  check(history.response.ok && JSON.stringify(history.body).includes(orderId), 'delivered order appears in customer history');
  const adminOrders = await api(`/api/admin/orders?q=${encodeURIComponent(cash.body.data.order.order_number)}`, admin.token);
  check(
    adminOrders.response.ok && adminOrders.body.orders?.some((item) => item.id === orderId && item.status === 'delivered'),
    `admin sees the complete order and final status (${adminOrders.response.status}: ${JSON.stringify(adminOrders.body)})`,
  );
  const persisted = await service.from('orders').select('status,restaurant_id,driver_id').eq('id', orderId).single();
  check(persisted.data?.status === 'delivered' && persisted.data.restaurant_id === storeId && persisted.data.driver_id === driver.id, 'order lifecycle persists customer → store → driver → delivered');

  const removeProductImage = await api('/api/admin/catalog-media', admin.token, { method: 'DELETE', body: JSON.stringify({ id: productId, kind: 'product_image' }) });
  check(removeProductImage.response.ok && !(await storageExists(productImage2.body.url, 'product-images')), 'admin removes the product image cleanly');
  const archiveProduct = await api('/api/products/manage', admin.token, { method: 'DELETE', body: JSON.stringify({ id: productId }) });
  check(archiveProduct.response.ok, 'admin archives the product without destroying order history');
  const deleteCategory = await api('/api/admin/categories', admin.token, { method: 'DELETE', body: JSON.stringify({ id: categoryId }) });
  check(deleteCategory.response.ok, 'admin deletes the category'); categoryId = null;
  await api('/api/admin/catalog-media', admin.token, { method: 'DELETE', body: JSON.stringify({ id: storeId, kind: 'restaurant_logo' }) });
  await api('/api/admin/catalog-media', admin.token, { method: 'DELETE', body: JSON.stringify({ id: storeId, kind: 'restaurant_cover' }) });
  const archiveStoreResult = await api(`/api/admin/restaurants/${storeId}`, admin.token, { method: 'DELETE' });
  check(archiveStoreResult.response.ok, 'admin archives the store while preserving historical order references');

  console.log(`Admin catalog/media E2E: PASS (${passed}/${passed})`);
} finally {
  if (orderId) await service.from('orders').delete().eq('id', orderId);
  if (productId) await service.from('products').delete().eq('id', productId);
  if (categoryId) await service.from('categories').delete().eq('id', categoryId);
  if (storeId) {
    await service.from('restaurant_verifications').delete().eq('restaurant_id', storeId);
    await service.from('restaurants').delete().eq('id', storeId);
  }
  for (const id of [...new Set(createdUsers)].reverse()) {
    await service.from('users').delete().eq('id', id);
    await service.auth.admin.deleteUser(id).catch(() => undefined);
  }
}
