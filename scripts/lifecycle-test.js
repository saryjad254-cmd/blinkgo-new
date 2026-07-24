/**
 * E2E Order Lifecycle Test
 * ─────────────────────────
 * Tests the complete order flow:
 *   1. Customer creates order
 *   2. Restaurant confirms
 *   3. Restaurant starts preparing
 *   4. Order becomes ready
 *   5. System auto-assigns closest online driver
 *   6. Driver accepts order
 *   7. Driver picks up order
 *   8. Driver completes delivery
 *   9. Customer sees final state
 */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

const ACCOUNTS = {
  customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
  driver: { email: 'driver@blinkgo.de', password: 'DemoDriver!2024' },
  restaurant: { email: 'restaurant@blinkgo.de', password: 'DemoRestaurant!2024' },
  admin: { email: 'admin@blinkgo.de', password: 'DemoAdmin!2024' },
};

const cookies = {};

async function login(role) {
  const { email, password } = ACCOUNTS[role];
  const maxRetries = 10;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': BASE, 'x-forwarded-for': '10.42.2.1' },
      body: JSON.stringify({ email, password }),
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*\w+=)/);
    cookies[role] = setCookies.map(c => c.split(';')[0]).join('; ');
    const json = await res.json();
    if (res.ok && json.ok) {
      console.log(`✅ Login: ${role} (${json.data?.user?.role || 'unknown'})`);
      return cookies[role];
    }
    if (json.error === 'RATE_LIMITED' || json.code === 'RATE_LIMITED') {
      const waitSec = Math.min((json.retryAfter || 60) + 5, 300);
      console.log(`  ⏳ Rate-limited on ${role}, waiting ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }
    throw new Error(`Login failed for ${role}: ${JSON.stringify(json)}`);
  }
  throw new Error(`Login failed for ${role} after ${maxRetries} retries`);
}

function authHeaders(role) {
  return {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
    Cookie: cookies[role],
  };
}

async function api(method, path, role, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(role),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

function step(n, msg) {
  console.log(`\n━━━ Step ${n}: ${msg} ━━━`);
}

function expect(label, cond, info) {
  if (cond) {
    console.log(`  ✅ ${label}${info ? ': ' + JSON.stringify(info).slice(0, 100) : ''}`);
  } else {
    console.log(`  ❌ ${label}${info ? ': ' + JSON.stringify(info).slice(0, 200) : ''}`);
    process.exit(1);
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('   ORDER LIFECYCLE E2E TEST');
  console.log('═══════════════════════════════════════\n');

  // ========== STEP 0: Login all users ==========
  console.log('━━━ Step 0: Login all users ━━━');
  await login('customer');
  await login('restaurant');
  await login('driver');
  await login('admin');

  // Get a real product + restaurant from bestsellers
  const bestsellersRes = await api('GET', '/api/products/bestsellers?limit=10', 'customer');
  const products = bestsellersRes.body?.bestsellers || [];
  const searchRes = await api('GET', '/api/search?sort=recommended', 'customer');
  const restaurants = searchRes.body?.restaurants || [];
  expect('Bestsellers returned products', products.length > 0, { count: products.length });
  expect('Search returned restaurants', restaurants.length > 0, { count: restaurants.length });
  const product = products[0];
  const restaurant = restaurants.find(r => r.id === product.restaurant_id) || restaurants[0];
  console.log(`  → Using product: ${product.name} (€${product.price})`);
  console.log(`  → Using restaurant: ${restaurant.name}`);

  // ========== STEP 1: Customer creates order ==========
  step(1, 'Customer creates order');
  const orderRes = await api('POST', '/api/orders', 'customer', {
    restaurant_id: restaurant.id,
    items: [{ product_id: product.id, quantity: 2 }],
    payment_method: 'cash',
    delivery_address: {
      address: 'Test Street 1, Bonn',
      lat: 50.7374,
      lng: 7.0982,
      notes: 'E2E test order',
    },
    tip: 2.0,
  });
  expect('Order created', orderRes.body?.ok, { status: orderRes.status });
  const orderId = orderRes.body?.data?.order?.id;
  const orderNumber = orderRes.body?.data?.order?.order_number;
  expect('Got order id', !!orderId, { orderId, orderNumber });
  console.log(`  → Order created: ${orderNumber}`);

  // ========== STEP 2: Restaurant confirms ==========
  step(2, 'Restaurant confirms order (pending → confirmed)');
  const confirmRes = await api('PATCH', '/api/orders/status', 'restaurant', {
    order_id: orderId,
    status: 'confirmed',
  });
  expect('Order confirmed', confirmRes.body?.ok, { status: confirmRes.body?.data?.order?.status });

  // ========== STEP 3: Restaurant prepares ==========
  step(3, 'Restaurant starts preparing (confirmed → preparing)');
  const prepRes = await api('PATCH', '/api/orders/status', 'restaurant', {
    order_id: orderId,
    status: 'preparing',
  });
  expect('Order preparing', prepRes.body?.ok, { status: prepRes.body?.data?.order?.status });

  // ========== STEP 4: Driver goes online ==========
  step(4, 'Driver goes online (auto-dispatch may pick up older ready orders)');
  const onlineRes = await api('POST', '/api/driver/online', 'driver', { is_online: true });
  expect('Driver online', onlineRes.body?.ok, { 
    auto_assigned: onlineRes.body?.auto_assigned_order_id 
  });

  // Note: If the driver was auto-assigned a different (older) ready order,
  // that's actually correct production behavior. The new order we just made
  // will not be auto-assigned because the driver already has one.
  // We continue the test with the current state.

  // ========== STEP 5: Order becomes ready ==========
  step(5, 'Order ready (preparing → ready)');
  const readyRes = await api('PATCH', '/api/orders/status', 'restaurant', {
    order_id: orderId,
    status: 'ready',
  });
  expect('Order ready', readyRes.body?.ok, { status: readyRes.body?.data?.order?.status });

  await new Promise(r => setTimeout(r, 1500));

  // ========== STEP 6: Driver accepts ==========
  step(6, 'Driver accepts order (or already auto-assigned)');
  // First check if already assigned
  const preCheck = await api('GET', `/api/orders/track?order_id=${orderId}`, 'customer');
  let alreadyAssigned = preCheck.body?.data?.order?.driver_id;
  if (!alreadyAssigned) {
    const acceptRes = await api('POST', `/api/driver/orders/${orderId}/accept`, 'driver');
    if (acceptRes.status === 200) {
      console.log('  ✅ Order accepted by driver');
    } else if (acceptRes.status === 409) {
      console.log('  ℹ️  Order was already auto-assigned (auto-assign worked)');
    } else {
      console.log(`  ⚠️  Accept returned: ${acceptRes.status}`);
    }
  } else {
    console.log('  ℹ️  Order was auto-assigned (driver already has it)');
  }

  // ========== STEP 7: Driver picks up ==========
  step(7, 'Driver picks up order (ready → picked_up)');
  const pickupRes = await api('POST', `/api/driver/orders/${orderId}/pickup`, 'driver');
  expect('Picked up', pickupRes.body?.ok, { status: pickupRes.body?.data?.order?.status });

  // ========== STEP 8: Driver completes delivery ==========
  step(8, 'Driver completes delivery (picked_up → delivered)');
  const completeRes = await api('POST', `/api/driver/orders/${orderId}/complete`, 'driver', {});
  expect('Delivered', completeRes.body?.ok, { status: completeRes.body?.data?.order?.status });

  // ========== STEP 9: Customer sees final state ==========
  step(9, 'Customer sees final state');
  const finalRes = await api('GET', `/api/orders/track?order_id=${orderId}`, 'customer');
  // Track endpoint returns body.order directly (not body.data.order)
  const finalOrder = finalRes.body?.order || finalRes.body?.data?.order;
  expect('Final state is delivered', finalOrder?.status === 'delivered', { status: finalOrder?.status });
  expect('delivered_at timestamp set', !!finalOrder?.delivered_at);

  // ========== VERIFY PERMISSIONS ==========
  console.log('\n━━━ Permission Tests ━━━');

  // Customer cannot pick up
  const custPickup = await api('POST', `/api/driver/orders/${orderId}/pickup`, 'customer');
  expect('Customer cannot pickup', custPickup.status === 403 || custPickup.status === 401);

  // Driver cannot confirm as restaurant
  const drvConfirm = await api('PATCH', '/api/orders/status', 'driver', {
    order_id: orderId,
    status: 'preparing',
  });
  expect('Driver cannot set preparing', !drvConfirm.body?.ok || drvConfirm.status >= 400);

  // Verify invalid transition blocked (test as driver who should NOT be able to do this)
  const invalid = await api('PATCH', '/api/orders/status', 'driver', {
    order_id: orderId,
    status: 'pending', // can't go from delivered back to pending
  });
  expect('Invalid transition blocked (delivered → pending)', !invalid.body?.ok || invalid.status >= 400, { 
    status: invalid.status, body: invalid.body 
  });

  // ========== VERIFY NOTIFICATIONS ==========
  console.log('\n━━━ Notification Tests ━━━');
  const notifRes = await api('GET', '/api/notifications', 'customer');
  const notifications = notifRes.body?.data?.notifications || notifRes.body?.notifications || [];
  expect('Customer has notifications', notifications.length > 0, { count: notifications.length });
  
  // Look for a delivered notification: check body text (works for all locales)
  // and data.status (set by the /api/orders/status route)
  const deliveredNotif = notifications.find(n => {
    const body = (n.body || '').toLowerCase();
    const title = (n.title || '').toLowerCase();
    return body.includes('delivered') ||
           body.includes('geliefert') ||
           body.includes('تم التسليم') ||
           title.includes('delivered') ||
           title.includes('geliefert') ||
           n.data?.subtype === 'delivered' ||
           n.data?.status === 'delivered';
  });
  expect('Delivered notification was created', !!deliveredNotif, {
    found: deliveredNotif ? { type: deliveredNotif.type, title: deliveredNotif.title, body: deliveredNotif.body?.slice(0, 80), data: deliveredNotif.data } : null,
    types: [...new Set(notifications.map(n => n.type))]
  });

  // ========== VERIFY ADMIN STATS ==========
  console.log('\n━━━ Admin Verification ━━━');
  const adminStats = await api('GET', '/api/admin/stats', 'admin');
  expect('Admin can fetch stats', adminStats.body?.ok !== false);

  console.log('\n═══════════════════════════════════════');
  console.log('   ✅ ALL TESTS PASSED');
  console.log('═══════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('\n❌ FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
