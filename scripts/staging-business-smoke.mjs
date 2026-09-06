/**
 * Idempotent BlinkGo staging fixture + role-boundary smoke test.
 * Leaves clearly marked demo business data for browser verification.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.staging.local', override: true });

const PROJECT_REF = 'egjehqoilbjvzgbnksds';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (process.env.ALLOW_STAGING_MUTATIONS !== '1') {
  throw new Error('Refusing to seed without ALLOW_STAGING_MUTATIONS=1');
}
if (!url.includes(PROJECT_REF)) throw new Error(`Refusing to run outside ${PROJECT_REF}`);
if (!publishableKey.startsWith('sb_publishable_') || !secretKey.startsWith('sb_secret_')) {
  throw new Error('Staging Supabase keys are missing');
}

const service = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ids = {
  customer: 'b1000000-0000-4000-8000-000000000101',
  driver: 'b1000000-0000-4000-8000-000000000102',
  restaurantUser: 'b1000000-0000-4000-8000-000000000103',
  admin: 'b1000000-0000-4000-8000-000000000104',
  restaurant: 'b1000000-0000-4000-8000-000000000201',
  zone: 'b1000000-0000-4000-8000-000000000301',
  burger: 'b1000000-0000-4000-8000-000000000401',
  pizza: 'b1000000-0000-4000-8000-000000000402',
  bowl: 'b1000000-0000-4000-8000-000000000403',
  address: 'b1000000-0000-4000-8000-000000000501',
  order: 'b1000000-0000-4000-8000-000000000601',
  orderItem: 'b1000000-0000-4000-8000-000000000701',
};

const accounts = [
  { key: 'customer', id: ids.customer, role: 'customer', email: 'demo@blinkgo.de', password: 'DemoCustomer!2024', name: 'Mia Kunde' },
  { key: 'driver', id: ids.driver, role: 'driver', email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!', name: 'Marco Fahrer' },
  { key: 'restaurant', id: ids.restaurantUser, role: 'restaurant', email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!', name: 'Blink Burger Partner' },
  { key: 'admin', id: ids.admin, role: 'admin', email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!', name: 'BlinkGo QA Admin' },
];

const passwords = new Map();
const fail = (label, error) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    fail('List Auth users', error);
    users.push(...(data?.users ?? []));
    if ((data?.users?.length ?? 0) < 100) break;
  }
  return users;
}

async function ensureAccounts() {
  const existing = await listAuthUsers();
  for (const account of accounts) {
    const password = account.password;
    passwords.set(account.key, password);
    const match = existing.find((user) => user.id === account.id || user.email === account.email);
    if (match && match.id !== account.id) {
      throw new Error(`Fixture email ${account.email} belongs to unexpected id ${match.id}`);
    }
    if (match) {
      const { error } = await service.auth.admin.updateUserById(match.id, {
        email: account.email,
        password,
        email_confirm: true,
        app_metadata: {
          ...match.app_metadata,
          app_role: account.role,
          ...(account.role === 'admin' ? { permissions: ['payment_support'] } : {}),
        },
        user_metadata: { ...match.user_metadata, name: account.name },
      });
      fail(`Update ${account.role} Auth identity`, error);
    } else {
      const { error } = await service.auth.admin.createUser({
        id: account.id,
        email: account.email,
        password,
        email_confirm: true,
        app_metadata: {
          app_role: account.role,
          ...(account.role === 'admin' ? { permissions: ['payment_support'] } : {}),
        },
        user_metadata: { name: account.name },
      });
      fail(`Create ${account.role} Auth identity`, error);
    }
  }
}

async function upsert(table, value) {
  const { error } = await service.from(table).upsert(value, { onConflict: 'id' });
  fail(`Upsert ${table}`, error);
}

async function seedBusinessData() {
  await upsert('delivery_zones', {
    id: ids.zone,
    name: 'Wesseling Zentrum – QA',
    description: 'Isolierte BlinkGo Staging-Testzone',
    center_lat: 50.8196,
    center_lng: 6.9748,
    radius_km: 7,
    delivery_fee: 2.99,
    min_order_amount: 10,
    priority: 100,
    is_active: true,
    polygon: {
      type: 'Polygon',
      coordinates: [[[6.90, 50.77], [7.05, 50.77], [7.05, 50.87], [6.90, 50.87], [6.90, 50.77]]],
    },
  });

  await upsert('restaurants', {
    id: ids.restaurant,
    owner_id: ids.restaurantUser,
    name: 'Blink Burger Lab',
    name_ar: 'مختبر بلينك برغر',
    description: 'Frische Burger und Bowls – echte Staging-Testdaten.',
    description_ar: 'برغر وأطباق طازجة – بيانات اختبار حقيقية.',
    email: 'wesseling@blinkgo.de',
    phone: '+49 2236 000000',
    address: 'Flach-Fengler-Straße 120',
    city: 'Wesseling',
    category: 'Burger',
    cuisine: ['Burger', 'American', 'Bowls'],
    type: 'restaurant',
    latitude: 50.8196,
    longitude: 6.9748,
    delivery_fee: 2.99,
    min_order: 10,
    min_order_amount: 10,
    delivery_time: 25,
    estimated_delivery_time: '25–35 Min.',
    rating: 4.8,
    total_reviews: 128,
    review_count: 128,
    is_active: true,
    is_verified: true,
    is_online: true,
    is_open_now: true,
    is_24_7: true,
    accepting_orders: true,
    is_featured: true,
    is_promoted: true,
    delivery_zones: { areas: ['Wesseling'], radius: 7 },
    metadata: { staging_fixture: true, brand: 'BlinkGo' },
  });

  const products = [
    { id: ids.burger, name: 'BlinkGo Fire Burger', name_ar: 'برغر بلينك جو الحار', category: 'Burger', price: 12.9, emoji: '🍔', badge: 'Bestseller', sold_count: 420 },
    { id: ids.pizza, name: 'Red Speed Pizza', name_ar: 'بيتزا السرعة الحمراء', category: 'Pizza', price: 11.5, emoji: '🍕', badge: 'Neu', sold_count: 260 },
    { id: ids.bowl, name: 'Golden Power Bowl', name_ar: 'طبق الطاقة الذهبي', category: 'Bowls', price: 10.9, emoji: '🥗', badge: 'Healthy', sold_count: 180 },
  ].map((product, index) => ({
    ...product,
    restaurant_id: ids.restaurant,
    description: 'Frisch zubereitet im Blink Burger Lab.',
    description_ar: 'يُحضّر طازجًا في مطعم بلينك.',
    is_active: true,
    is_available: true,
    in_stock: true,
    stock: 100,
    stock_count: 100,
    track_stock: true,
    approval_status: 'approved',
    is_featured: index === 0,
    rating: 4.8 - index * 0.1,
    total_reviews: 80 - index * 10,
    prep_time: 15,
    preparation_time: 15,
    sort_order: index,
    display_order: index,
    metadata: { staging_fixture: true },
    modifiers: [],
  }));
  const { error: productsError } = await service.from('products').upsert(products, { onConflict: 'id' });
  fail('Upsert products', productsError);

  await upsert('drivers', {
    id: ids.driver,
    user_id: ids.driver,
    full_name: 'Marco Fahrer',
    vehicle_type: 'scooter',
    vehicle_plate: 'BG-QA 101',
    license_number: 'STAGING-ONLY',
    city: 'Wesseling',
    zone_id: ids.zone,
    status: 'active',
    is_active: true,
    is_approved: true,
    is_online: true,
    is_available: false,
    current_lat: 50.8175,
    current_lng: 6.981,
    current_latitude: 50.8175,
    current_longitude: 6.981,
    rating: 4.9,
    metadata: { staging_fixture: true },
  });

  const requiredDriverDocuments = [
    'id_proof',
    'employment_contract',
    'health_insurance',
    'tax_id_confirmation',
    'social_insurance_number_proof',
    'payout_account_verification',
    'license',
    'insurance',
    'vehicle_registration',
  ];
  const { error: documentsError } = await service.from('driver_documents').upsert(
    requiredDriverDocuments.map((documentType, index) => ({
      id: `b1000000-0000-4000-8000-${String(801 + index).padStart(12, '0')}`,
      driver_id: ids.driver,
      document_type: documentType,
      document_url: `staging://approved/${documentType}`,
      status: 'approved',
      submission_kind: 'file',
      reviewed_at: new Date().toISOString(),
      reviewed_by: ids.admin,
    })),
    { onConflict: 'id' },
  );
  fail('Upsert approved driver documents', documentsError);

  const { error: profileError } = await service.from('users').update({ restaurant_id: ids.restaurant }).eq('id', ids.restaurantUser);
  fail('Connect restaurant owner profile', profileError);

  await upsert('customer_addresses', {
    id: ids.address,
    customer_id: ids.customer,
    label: 'Zuhause – QA',
    address: 'Kölner Straße 10, 50389 Wesseling',
    latitude: 50.823,
    longitude: 6.99,
    is_default: true,
    details: 'Nur Staging-Testdaten',
  });

  // Reuse the current live staging fixture when possible. A previous manual
  // driver demo may have completed the canonical order; the production state
  // machine correctly forbids moving a terminal order back to `delivering`.
  // In that case create one new isolated live fixture instead of weakening the
  // trigger or accumulating a new order on every idempotent rerun.
  const { data: liveFixtures, error: liveFixtureError } = await service
    .from('orders')
    .select('id')
    .eq('customer_id', ids.customer)
    .eq('restaurant_id', ids.restaurant)
    .eq('driver_id', ids.driver)
    .eq('status', 'delivering')
    .contains('metadata', { staging_fixture: true, lifecycle: 'live-demo' })
    .order('created_at', { ascending: false })
    .limit(1);
  fail('Find reusable live staging order', liveFixtureError);
  const reusableOrderId = liveFixtures?.[0]?.id;
  if (reusableOrderId) {
    ids.order = reusableOrderId;
    const { data: existingItems, error: existingItemsError } = await service
      .from('order_items')
      .select('id')
      .eq('order_id', reusableOrderId)
      .limit(1);
    fail('Find reusable staging order item', existingItemsError);
    ids.orderItem = existingItems?.[0]?.id ?? crypto.randomUUID();
  } else {
    const { data: canonicalOrder, error: canonicalOrderError } = await service
      .from('orders')
      .select('id,status')
      .eq('id', ids.order)
      .maybeSingle();
    fail('Inspect canonical staging order', canonicalOrderError);
    if (canonicalOrder && canonicalOrder.status !== 'delivering') {
      ids.order = crypto.randomUUID();
      ids.orderItem = crypto.randomUUID();
    }
  }

  await upsert('orders', {
    id: ids.order,
    order_number: `BG-STAGING-${ids.order.replaceAll('-', '').slice(0, 12).toUpperCase()}`,
    customer_id: ids.customer,
    restaurant_id: ids.restaurant,
    driver_id: ids.driver,
    status: 'delivering',
    items: [{ product_id: ids.burger, name: 'BlinkGo Fire Burger', quantity: 1, price: 12.9 }],
    subtotal: 12.9,
    delivery_fee: 2.99,
    service_fee: 0.99,
    total: 16.88,
    payment_method: 'test',
    payment_status: 'paid',
    delivery_address: { street: 'Kölner Straße 10', city: 'Wesseling', label: 'Zuhause – QA' },
    restaurant_latitude: 50.8196,
    restaurant_longitude: 6.9748,
    customer_latitude: 50.823,
    customer_longitude: 6.99,
    delivery_latitude: 50.823,
    delivery_longitude: 6.99,
    estimated_delivery: new Date(Date.now() + 18 * 60_000).toISOString(),
    currency: 'EUR',
    metadata: { staging_fixture: true, lifecycle: 'live-demo' },
  });
  await upsert('order_items', {
    id: ids.orderItem,
    order_id: ids.order,
    product_id: ids.burger,
    product_name: 'BlinkGo Fire Burger',
    product_price: 12.9,
    quantity: 1,
    subtotal: 12.9,
    name: 'BlinkGo Fire Burger',
    price: 12.9,
    unit_price: 12.9,
    category: 'Burger',
  });

  const now = new Date().toISOString();
  const { error: driverStatusError } = await service.from('driver_status').upsert({
    driver_id: ids.driver,
    is_online: true,
    is_on_delivery: true,
    is_active: true,
    current_order_id: ids.order,
    active_order_id: ids.order,
    latitude: 50.8175,
    longitude: 6.981,
    current_lat: 50.8175,
    current_lng: 6.981,
    last_seen: now,
    last_location_at: now,
    updated_at: now,
  }, { onConflict: 'driver_id' });
  fail('Upsert driver live status', driverStatusError);
}

async function signedInClient(account) {
  const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: passwords.get(account.key) });
  fail(`Sign in ${account.role}`, error);
  return client;
}

async function expectVisible(client, table, id, label) {
  const { data, error } = await client.from(table).select('id').eq('id', id);
  fail(label, error);
  if (!data?.some((row) => row.id === id)) throw new Error(`${label}: fixture row is not visible`);
}

async function verifyRoleBoundaries() {
  const clients = Object.fromEntries(await Promise.all(accounts.map(async (account) => [account.key, await signedInClient(account)])));
  const anon = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });

  await expectVisible(anon, 'restaurants', ids.restaurant, 'Anonymous restaurant catalog');
  await expectVisible(anon, 'products', ids.burger, 'Anonymous product catalog');
  await expectVisible(clients.customer, 'orders', ids.order, 'Customer own order');
  await expectVisible(clients.restaurant, 'orders', ids.order, 'Restaurant own order');
  await expectVisible(clients.driver, 'orders', ids.order, 'Driver assigned order');
  await expectVisible(clients.admin, 'orders', ids.order, 'Admin order oversight');

  const { data: driverStatus, error: driverStatusError } = await clients.driver
    .from('driver_status')
    .select('driver_id,is_online,is_on_delivery,current_order_id')
    .eq('driver_id', ids.driver)
    .maybeSingle();
  fail('Driver reads own live status', driverStatusError);
  if (!driverStatus?.is_online || !driverStatus.is_on_delivery || driverStatus.current_order_id !== ids.order) {
    throw new Error('Driver live status is not connected to the active staging order');
  }
  await expectVisible(clients.customer, 'customer_addresses', ids.address, 'Customer own address');
  await expectVisible(clients.driver, 'drivers', ids.driver, 'Driver own operational record');

  const { data: anonymousOrders, error: anonymousOrdersError } = await anon.from('orders').select('id').eq('id', ids.order);
  fail('Anonymous order privacy', anonymousOrdersError);
  if ((anonymousOrders?.length ?? 0) !== 0) throw new Error('Anonymous users can read private orders');
}

await ensureAccounts();
await seedBusinessData();
await verifyRoleBoundaries();

console.log('Staging business journey: PASS');
console.log('  ✓ Idempotent Wesseling zone, restaurant, products, address, driver, and live order seeded');
console.log('  ✓ Customer, restaurant, driver, and admin authenticated against real Supabase');
console.log('  ✓ Catalog visibility and private role-bound order access verified');
console.log('  ✓ Anonymous order access denied');
