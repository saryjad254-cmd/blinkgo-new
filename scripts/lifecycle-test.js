/**
 * BlinkGo launch-gate E2E order test.
 *
 * This test uses the real Next.js API, real Supabase staging data and four
 * independently authenticated roles. It never changes an order status with
 * a service client or bypasses application authorization.
 *
 * Run:
 *   TEST_BASE_URL=http://localhost:3100 node scripts/lifecycle-test.js
 */

const BASE = process.env.TEST_BASE_URL || process.env.BASE_URL || 'http://localhost:3100';
const RUN_ID = `${Date.now().toString(36)}-${process.pid}`;

const ACCOUNTS = {
  customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
  driver: { email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!' },
  restaurant: { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' },
  admin: { email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' },
};

const IP_BY_ROLE = {
  customer: `10.43.${(process.pid % 200) + 1}.11`,
  restaurant: `10.43.${(process.pid % 200) + 1}.12`,
  driver: `10.43.${(process.pid % 200) + 1}.13`,
  admin: `10.43.${(process.pid % 200) + 1}.14`,
};

const cookies = {};
let passed = 0;

function payloadData(body) {
  return body?.ok === true && body?.data && typeof body.data === 'object' ? body.data : body;
}

function expect(label, condition, evidence) {
  if (!condition) {
    const detail = evidence === undefined ? '' : `: ${JSON.stringify(evidence).slice(0, 800)}`;
    throw new Error(`${label}${detail}`);
  }
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function section(label) {
  console.log(`\n▶ ${label}`);
}

function captureCookies(role, headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  cookies[role] = values.map((value) => value.split(';')[0]).filter(Boolean).join('; ');
}

async function request(method, path, role, body, extraHeaders = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      'x-forwarded-for': IP_BY_ROLE[role],
      'x-blinkgo-test-run': 'local-e2e',
      ...(cookies[role] ? { Cookie: cookies[role] } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: response.status, ok: response.ok, body: json, headers: response.headers };
}

async function login(role) {
  const response = await request('POST', '/api/auth/login', role, ACCOUNTS[role]);
  captureCookies(role, response.headers);
  expect(`${role} login`, response.ok && response.body?.ok === true && Boolean(cookies[role]), {
    status: response.status,
    body: response.body,
  });
}

async function updateDriverLocation(orderId, lat, lng) {
  const response = await request('POST', '/api/driver/location', 'driver', {
    latitude: lat,
    longitude: lng,
    accuracy: 5,
    heading: 0,
    speed: 0,
    active_order_id: orderId,
  });
  expect('driver location persisted', response.ok && response.body?.ok === true, response);
}

async function customerJourney(orderId) {
  const response = await request('GET', `/api/orders/track?order_id=${orderId}`, 'customer');
  const data = payloadData(response.body);
  expect('customer can track order', response.ok && Boolean(data?.order?.id), response);
  return data;
}

async function drainFixtureDelivery() {
  const response = await request('GET', '/api/driver/active-order', 'driver');
  const active = payloadData(response.body)?.order;
  if (!active) return;

  section(`Complete existing staging fixture ${active.order_number || active.id}`);
  let status = active.status;
  if (status === 'confirmed') {
    const preparing = await request('PATCH', '/api/orders/status', 'restaurant', { order_id: active.id, status: 'preparing' });
    expect('fixture moved to preparing through merchant API', preparing.ok && preparing.body?.ok === true, preparing);
    status = 'preparing';
  }
  if (status === 'preparing') {
    const ready = await request('PATCH', '/api/orders/status', 'restaurant', { order_id: active.id, status: 'ready' });
    expect('fixture moved to ready through merchant API', ready.ok && ready.body?.ok === true, ready);
    status = 'ready';
  }
  if (status === 'ready' || status === 'assigned') {
    await updateDriverLocation(active.id, Number(active.restaurant_latitude), Number(active.restaurant_longitude));
    const arrived = await request('POST', `/api/driver/orders/${active.id}/arrive`, 'driver', { stage: 'pickup' });
    expect('fixture pickup arrival recorded', arrived.ok && arrived.body?.ok === true, arrived);
    const pickup = await request('POST', `/api/driver/orders/${active.id}/pickup`, 'driver');
    expect('fixture picked up through driver API', pickup.ok && pickup.body?.ok === true, pickup);
    status = 'picked_up';
  }
  if (status === 'picked_up' || status === 'delivering') {
    await updateDriverLocation(active.id, Number(active.customer_latitude), Number(active.customer_longitude));
    const arrived = await request('POST', `/api/driver/orders/${active.id}/arrive`, 'driver', { stage: 'dropoff' });
    expect('fixture drop-off arrival recorded', arrived.ok && arrived.body?.ok === true, arrived);
    const journey = await customerJourney(active.id);
    const completed = await request('POST', `/api/driver/orders/${active.id}/complete`, 'driver', {
      delivery_pin: journey?.journey?.delivery_pin,
    });
    expect('fixture completed through driver API', completed.ok && completed.body?.ok === true, completed);
  }
}

async function clearAbandonedStagingOrders(restaurantId, customerId) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE)) {
    throw new Error('launch E2E cleanup is restricted to a localhost staging server');
  }

  section('Clear abandoned orders from earlier staging runs through the admin API');
  // Only pre-pickup orders are cancellable. In-flight deliveries are drained
  // through the real driver completion flow before this cleanup runs.
  const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'assigned'];
  let cancelled = 0;
  for (const status of activeStatuses) {
    const listing = await request('GET', `/api/admin/orders?status=${status}&limit=100`, 'admin');
    expect(`admin can inspect ${status} staging orders`, listing.ok, listing);
    const rows = listing.body?.orders ?? payloadData(listing.body)?.orders ?? [];
    const abandoned = rows.filter((row) =>
      row.restaurant_id === restaurantId && row.customer_id === customerId);
    for (const order of abandoned) {
      const response = await request('PATCH', '/api/orders/status', 'admin', {
        order_id: order.id,
        status: 'cancelled',
        metadata: { reason: 'staging_launch_e2e_cleanup' },
      });
      expect(`admin cancels abandoned staging order ${order.order_number || order.id}`, response.ok, response);
      cancelled += 1;
    }
  }
  console.log(`  ${cancelled ? `cleaned ${cancelled}` : 'no'} abandoned staging order${cancelled === 1 ? '' : 's'}`);
}

function checkoutLine(product, restaurant) {
  const selectedModifiers = Object.fromEntries((product.modifiers || [])
    .filter((modifier) => modifier.required && Number(modifier.min_select || 0) > 0)
    .map((modifier) => [
      modifier.id,
      (modifier.options || []).slice(0, Number(modifier.min_select)).map((option) => option.id),
    ]));
  const unitPrice = Number(product.discount_price ?? product.price ?? 0);
  const minimumOrder = Number(restaurant.minimum_order ?? restaurant.min_order_amount ?? 0);
  const quantity = unitPrice > 0 ? Math.max(1, Math.ceil((minimumOrder + 0.01) / unitPrice)) : 1;
  return { product_id: product.id, quantity, configuration: { selected_modifiers: selectedModifiers } };
}

async function main() {
  console.log(`BlinkGo launch E2E against ${BASE}`);

  section('Authenticate all production roles');
  for (const role of ['customer', 'restaurant', 'driver', 'admin']) await login(role);

  const customerMe = await request('GET', '/api/auth/me', 'customer');
  const customerId = payloadData(customerMe.body)?.user?.id;
  expect('customer identity resolves', customerMe.ok && Boolean(customerId), customerMe);
  const driverMe = await request('GET', '/api/auth/me', 'driver');
  const driverId = payloadData(driverMe.body)?.user?.id;
  expect('driver identity resolves', driverMe.ok && Boolean(driverId), driverMe);
  const merchantDashboard = await request('GET', '/api/restaurant/dashboard', 'restaurant');
  const merchantRestaurantId = merchantDashboard.body?.stats?.restaurantId
    ?? payloadData(merchantDashboard.body)?.stats?.restaurantId;
  expect('restaurant identity resolves', merchantDashboard.ok && Boolean(merchantRestaurantId), merchantDashboard);

  // Each acceptance run starts from an orderable merchant state. These are
  // ordinary merchant APIs, not database or service-role bypasses.
  const resumed = await request('POST', '/api/restaurant/pause', 'restaurant', { paused: false });
  expect('restaurant is accepting orders', resumed.ok && resumed.body?.paused === false, resumed);
  const busyOff = await request('POST', '/api/restaurant/busy-mode', 'restaurant', { busy: false });
  expect('restaurant busy mode is off', busyOff.ok && busyOff.body?.busyMode === false, busyOff);

  await drainFixtureDelivery();
  await clearAbandonedStagingOrders(merchantRestaurantId, customerId);

  section('Discover an orderable restaurant and product');
  const search = await request('GET', '/api/search?sort=recommended', 'customer');
  const restaurants = payloadData(search.body)?.restaurants ?? [];
  expect('customer discovery returns restaurant', search.ok && restaurants.length > 0, search);
  const restaurant = restaurants.find((row) => row.id === merchantRestaurantId);
  expect('customer discovery includes the authenticated merchant', Boolean(restaurant), {
    merchantRestaurantId,
    discoveredIds: restaurants.map((row) => row.id),
  });
  const detail = await request('GET', `/api/restaurants/${restaurant.id}`, 'customer');
  expect('restaurant detail opens', detail.ok && payloadData(detail.body)?.restaurant?.id === restaurant.id, detail);
  const menu = await request('GET', `/api/products/bestsellers?restaurant_id=${restaurant.id}`, 'customer');
  const products = payloadData(menu.body)?.bestsellers ?? payloadData(menu.body)?.products ?? [];
  const product = products.find((row) => row.is_available !== false && row.is_active !== false);
  expect('restaurant has an available product', menu.ok && Boolean(product), menu);

  section('Customer creates exactly one cash order');
  const orderInput = {
    restaurant_id: restaurant.id,
    items: [checkoutLine(product, restaurant)],
    payment_method: 'cash',
    fulfillment_type: 'delivery',
    delivery_address: {
      address: 'Kölner Straße 10, 50389 Wesseling',
      lat: 50.823,
      lng: 6.99,
      notes: `Launch E2E ${RUN_ID}`,
    },
    tip: 1,
  };
  const idempotencyKey = `launch-e2e-${RUN_ID}`;
  const created = await request('POST', '/api/orders', 'customer', orderInput, { 'X-Idempotency-Key': idempotencyKey });
  const createdOrder = payloadData(created.body)?.order;
  expect('customer order created', created.ok && Boolean(createdOrder?.id), created);
  const duplicate = await request('POST', '/api/orders', 'customer', orderInput, { 'X-Idempotency-Key': idempotencyKey });
  const duplicateOrder = payloadData(duplicate.body)?.order;
  expect('duplicate checkout returns the same order', duplicate.ok && duplicateOrder?.id === createdOrder.id, duplicate);
  const orderId = createdOrder.id;

  section('Restaurant receives and prepares the same order');
  const dashboard = await request('GET', '/api/restaurant/dashboard', 'restaurant');
  expect('restaurant receives pending order', dashboard.ok && (dashboard.body?.activeOrders ?? []).some((row) => row.id === orderId), dashboard);
  for (const status of ['confirmed', 'preparing', 'ready']) {
    const updated = await request('PATCH', '/api/orders/status', 'restaurant', { order_id: orderId, status });
    const resultingStatus = payloadData(updated.body)?.order?.status;
    const expectedStatus = status === 'ready' && resultingStatus === 'assigned' ? 'assigned' : status;
    expect(`restaurant marks ${status}`, updated.ok && resultingStatus === expectedStatus, updated);
  }

  section('Driver receives, accepts and picks up the order');
  const online = await request('POST', '/api/driver/online', 'driver', { is_online: true });
  expect('driver is online', online.ok && online.body?.ok === true, online);
  const trackedReady = await customerJourney(orderId);
  expect('ready order assigned to launch driver', trackedReady.order?.driver_id === driverId, trackedReady.order);
  expect('ready order entered assigned state', trackedReady.order?.status === 'assigned', trackedReady.order);
  await updateDriverLocation(orderId, Number(trackedReady.positions?.restaurant?.lat), Number(trackedReady.positions?.restaurant?.lng));
  const accepted = await request('POST', `/api/driver/orders/${orderId}/accept`, 'driver');
  expect('driver explicitly confirms assigned order', accepted.ok && accepted.body?.ok === true, accepted);
  const pickupArrival = await request('POST', `/api/driver/orders/${orderId}/arrive`, 'driver', { stage: 'pickup' });
  expect('driver arrival at restaurant recorded', pickupArrival.ok && pickupArrival.body?.ok === true, pickupArrival);
  const pickup = await request('POST', `/api/driver/orders/${orderId}/pickup`, 'driver');
  expect('driver marks picked_up', pickup.ok && payloadData(pickup.body)?.order?.status === 'picked_up', pickup);
  const customerPickedUp = await request('GET', `/api/orders/status?order_id=${orderId}`, 'customer');
  expect('customer sees picked_up', customerPickedUp.ok && payloadData(customerPickedUp.body)?.status === 'picked_up', customerPickedUp);

  section('Driver arrives and completes delivery');
  const afterPickup = await customerJourney(orderId);
  await updateDriverLocation(orderId, Number(afterPickup.positions?.customer?.lat), Number(afterPickup.positions?.customer?.lng));
  const dropoffArrival = await request('POST', `/api/driver/orders/${orderId}/arrive`, 'driver', { stage: 'dropoff' });
  expect('driver arrival at customer recorded', dropoffArrival.ok && dropoffArrival.body?.ok === true, dropoffArrival);
  const beforeComplete = await customerJourney(orderId);
  expect('customer receives delivery PIN', /^\d{4}$/.test(beforeComplete.journey?.delivery_pin ?? ''), beforeComplete.journey);
  const completed = await request('POST', `/api/driver/orders/${orderId}/complete`, 'driver', {
    delivery_pin: beforeComplete.journey.delivery_pin,
  });
  expect('driver marks delivered', completed.ok && payloadData(completed.body)?.order?.status === 'delivered', completed);

  section('All roles see the same final order');
  const finalJourney = await customerJourney(orderId);
  expect('customer tracking shows delivered', finalJourney.order?.status === 'delivered' && Boolean(finalJourney.order?.delivered_at), finalJourney.order);
  const history = await request('GET', '/api/orders/recent?limit=50', 'customer');
  expect('customer history contains delivered order', (payloadData(history.body)?.orders ?? []).some((row) => row.id === orderId && row.status === 'delivered'), history);
  const driverHistory = await request('GET', '/api/driver/orders?status=completed&limit=50', 'driver');
  expect('driver history contains delivered order', (payloadData(driverHistory.body)?.orders ?? []).some((row) => row.id === orderId && row.status === 'delivered'), driverHistory);
  const merchantStatus = await request('GET', `/api/orders/status?order_id=${orderId}`, 'restaurant');
  expect('restaurant sees delivered status', merchantStatus.ok && payloadData(merchantStatus.body)?.status === 'delivered', merchantStatus);
  const adminOrders = await request('GET', `/api/admin/orders?q=${encodeURIComponent(createdOrder.order_number)}&limit=20`, 'admin');
  expect('admin sees full delivered order', adminOrders.ok && (adminOrders.body?.orders ?? []).some((row) => row.id === orderId && row.status === 'delivered'), adminOrders);

  console.log(`\nLAUNCH E2E: PASS (${passed} assertions, order ${createdOrder.order_number})`);
}

main().catch((error) => {
  console.error(`\nLAUNCH E2E: FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
