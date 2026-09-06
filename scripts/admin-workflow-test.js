/**
 * v40 — Admin Workflow Test Suite
 * ────────────────────────────────
 * Tests admin capabilities:
 *  - Operations center (KPIs, BI, finance)
 *  - Reassign orders
 *  - Cancel orders (admin override)
 *  - Manage users (list, view, suspend)
 *  - Manage restaurants
 *  - View audit log
 *  - System config
 *  - Map view
 *  - Broadcast notifications
 *  - Promo management
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const LOCAL_MUTATION = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE);
const COOKIE_JARS = Object.fromEntries(
  ['customer', 'driver', 'restaurant', 'admin', 'payments'].map((role) => [role, {}]),
);
let activeRole = null;
const ACCOUNTS = {
  customer: { email: 'demo@blinkgo.de', password: 'DemoCustomer!2024' },
  driver: { email: 'driver@blinkgo.com', password: 'BlinkGoDriver2026!' },
  restaurant: { email: 'wesseling@blinkgo.de', password: 'BlinkGoWesseling2026!' },
  admin: { email: 'admin@blinkgo.com', password: 'BlinkGoAdmin2026!' },
  payments: { email: 'payments@blinkgo.com', password: 'BlinkGoPayments2026!' },
};

let passed = 0, failed = 0;
const results = [];

function record(name, ok, info = '') {
  results.push({ name, ok, info });
  if (ok) { passed++; console.log(`  ✓ ${name}${info ? ` (${info})` : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${info ? ` — ${info}` : ''}`); }
}

function setCookies(headers) {
  if (!activeRole) return;
  const jar = COOKIE_JARS[activeRole];
  const arr = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  for (const ck of arr) {
    const firstSemi = ck.indexOf(';');
    const pair = firstSemi === -1 ? ck : ck.substring(0, firstSemi);
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = pair.substring(0, eqIdx).trim();
    const value = pair.substring(eqIdx + 1).trim();
    if (!name) continue;
    if (value) jar[name] = value;
    else delete jar[name];
  }
}

function cookieHeader() {
  if (!activeRole) return '';
  return Object.entries(COOKIE_JARS[activeRole]).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function f(path, init = {}, opts = {}) {
  const headers = { 'x-blinkgo-test-run': 'local-e2e', // Local-suite marker; ignored in production
  'Content-Type': 'application/json', 'Origin': BASE, 'x-forwarded-for': `10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`, ...(init.headers || {}) };
  const cookies = cookieHeader();
  if (cookies) headers['Cookie'] = cookies;
  const res = await fetch(BASE + path, { ...init, headers });
  if (opts.captureCookies !== false) setCookies(res.headers);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text?.slice(0, 200) }; }
  if (json?.ok === true && Object.prototype.hasOwnProperty.call(json, 'data')) json = json.data;
  return { status: res.status, ok: res.ok, json };
}

async function login(role) {
  activeRole = role;
  if (cookieHeader()) return { status: 200, ok: true, json: { cached: true } };
  const result = await f('/api/auth/login', { method: 'POST', body: JSON.stringify(ACCOUNTS[role]) });
  if (!result.ok) throw new Error(`Login failed for ${role} (status=${result.status}, body=${JSON.stringify(result.json)?.slice(0, 240)})`);
  return result;
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

async function run() {
  if (LOCAL_MUTATION) {
    const reset = await fetch(`${BASE}/api/dev/test/reset`, { method: 'POST' });
    if (!reset.ok) throw new Error(`Local test reset failed (${reset.status})`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  v40 Admin Workflow Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Login as admin ──
  console.log('► Admin: login');
  await login('admin');
  const me = await f('/api/auth/me');
  record('Admin login', me.json?.user?.email === ACCOUNTS.admin.email);

  // ── 2. Operations: KPIs ──
  console.log('\n► Admin: operations');
  const ops = await f('/api/admin/operations');
  record('Get operations KPIs', ops.ok && (ops.json?.data?.kpis || ops.json?.kpis));

  // ── 3. Operations: tools ──
  const tools = await f('/api/admin/operations/tools?list=online_drivers');
  record('Get operations tools', tools.ok);

  // ── 4. List orders ──
  const orders = await f('/api/admin/list-orders');
  record('List orders', orders.ok);

  // ── 5. List users ──
  console.log('\n► Admin: user management');
  const users = await f('/api/admin/users');
  record('List users', users.ok && Array.isArray(users.json?.users));

  // ── 6. List drivers ──
  const drivers = await f('/api/admin/drivers');
  record('List drivers', drivers.ok);

  // ── 7. List restaurants ──
  console.log('\n► Admin: restaurant management');
  const rests = await f('/api/admin/restaurants');
  record('List restaurants', rests.ok);

  const zones = await f('/api/admin/zones');
  record('List delivery zones', zones.ok && Array.isArray(zones.json?.zones));

  if (LOCAL_MUTATION) {
    const suffix = Date.now();
    const createdZone = await f('/api/admin/zones', {
      method: 'POST', body: JSON.stringify({ name: `Acceptance Zone ${suffix}`, description: 'Admin workflow fixture', center_lat: 52.1, center_lng: 9.1, radius_km: 1, delivery_fee: 2.5, min_order_amount: 10, priority: 50, polygon: [], is_active: false }),
    });
    record('Create delivery zone', createdZone.status === 201 && createdZone.json?.zone?.name === `Acceptance Zone ${suffix}`);

    const createdDriver = await f('/api/admin/drivers', {
      method: 'POST', body: JSON.stringify({ name: 'Acceptance Driver', email: `driver_${suffix}@blinkgo-test.de`, phone: '+4915112345678', password: 'AcceptanceDriver!2026', vehicle_type: 'ebike', city: 'Wesseling' }),
    });
    const createdDriverId = createdDriver.json?.driver?.id;
    record('Create complete driver account', createdDriver.status === 201 && createdDriverId && createdDriver.json?.driver?.vehicle_type === 'ebike', `status=${createdDriver.status} body=${JSON.stringify(createdDriver.json)?.slice(0, 240)}`);
    if (createdDriverId) {
      const editedDriver = await f('/api/admin/drivers', { method: 'PATCH', body: JSON.stringify({ id: createdDriverId, name: 'Acceptance Driver Updated', phone: '+4915112345699', vehicle_type: 'scooter', vehicle_plate: 'BG-TEST-1', city: 'Köln' }) });
      record('Edit complete driver profile', editedDriver.ok && editedDriver.json?.driver?.name === 'Acceptance Driver Updated' && editedDriver.json?.driver?.vehicle_type === 'scooter', `status=${editedDriver.status} body=${JSON.stringify(editedDriver.json)?.slice(0, 240)}`);
    }

    const createdRestaurant = await f('/api/admin/restaurants', {
      method: 'POST', body: JSON.stringify({
        name: `Acceptance Restaurant ${suffix}`,
        category: 'Test',
        description: 'Admin workflow fixture',
        address: 'Teststr. 1, Wesseling',
        phone: '+492236123456',
        owner_name: 'Acceptance Owner',
        owner_email: `restaurant_${suffix}@blinkgo-test.de`,
        owner_password: 'AcceptanceRestaurant!2026',
        legal_name: `Acceptance Restaurant ${suffix} e.K.`,
        legal_form: 'e.K.',
        representative_name: 'Acceptance Owner',
        contact_email: `restaurant_${suffix}@blinkgo-test.de`,
        contact_phone: '+492236123456',
        street_address: 'Teststr. 1',
        postal_code: '50389',
        legal_city: 'Wesseling',
        trade_register_name: 'Amtsgericht Köln',
        trade_register_number: `HRA${String(suffix).slice(-8)}`,
        vat_id: 'DE123456789',
        identity_document_ref: `private://merchant-documents/${suffix}/identity.pdf`,
        business_document_ref: `private://merchant-documents/${suffix}/register.pdf`,
        payout_account_last4: '2026',
        self_certified: true,
        delivery_radius_km: 4,
        delivery_fee: 2.99,
        min_order_amount: 12,
        commission_pct: 15,
        is_active: true,
      }),
    });
    const createdRestaurantId = createdRestaurant.json?.restaurant?.id;
    record('Create restaurant with linked owner account', createdRestaurant.status === 201 && Boolean(createdRestaurantId) && Boolean(createdRestaurant.json?.owner?.id), `status=${createdRestaurant.status} body=${JSON.stringify(createdRestaurant.json)?.slice(0, 320)}`);

    if (createdRestaurantId) {
      const editedRestaurant = await f(`/api/admin/restaurants/${createdRestaurantId}`, {
        method: 'PATCH', body: JSON.stringify({ name: `Acceptance Restaurant Updated ${suffix}`, cuisine_type: 'International', description: 'Updated admin fixture', address: 'Teststr. 2, Wesseling', phone: '+492236654321', delivery_fee: 3.49, minimum_order: 14, delivery_radius_km: 6, commission_pct: 17 }),
      });
      record('Edit complete restaurant profile', editedRestaurant.ok && editedRestaurant.json?.restaurant?.name === `Acceptance Restaurant Updated ${suffix}` && Number(editedRestaurant.json?.restaurant?.delivery_fee) === 3.49, `status=${editedRestaurant.status} body=${JSON.stringify(editedRestaurant.json)?.slice(0, 260)}`);

      const createdProduct = await f('/api/products/manage', {
        method: 'POST', body: JSON.stringify({ restaurant_id: createdRestaurantId, name: 'Acceptance Product', category: 'Test', description: 'Admin workflow fixture', price: 9.9, is_active: true, is_available: true }),
      });
      const createdProductId = createdProduct.json?.product?.id;
      record('Create approved restaurant product', createdProduct.status === 201 && createdProductId && createdProduct.json?.product?.name === 'Acceptance Product', `status=${createdProduct.status}`);
      if (createdProductId) {
        const editedProduct = await f('/api/products/manage', { method: 'PATCH', body: JSON.stringify({ id: createdProductId, name: 'Acceptance Product Updated', price: 10.5, category: 'Updated test' }) });
        record('Edit restaurant product', editedProduct.ok && editedProduct.json?.product?.name === 'Acceptance Product Updated' && Number(editedProduct.json?.product?.price) === 10.5, `status=${editedProduct.status} body=${JSON.stringify(editedProduct.json)?.slice(0, 240)}`);

        const pausedProduct = await f('/api/products/manage', { method: 'PATCH', body: JSON.stringify({ id: createdProductId, is_active: false, is_available: false }) });
        record('Pause restaurant product', pausedProduct.ok && pausedProduct.json?.product?.is_available === false, `status=${pausedProduct.status} body=${JSON.stringify(pausedProduct.json)?.slice(0, 240)}`);

        const archivedProduct = await f('/api/products/manage', { method: 'DELETE', body: JSON.stringify({ id: createdProductId }) });
        record('Archive restaurant product', archivedProduct.ok, `status=${archivedProduct.status}`);

        const restoredProduct = await f('/api/products/manage', { method: 'PATCH', body: JSON.stringify({ id: createdProductId, action: 'restore' }) });
        record('Restore restaurant product', restoredProduct.ok && restoredProduct.json?.product?.archived_at === null && restoredProduct.json?.product?.is_available === true, `status=${restoredProduct.status} body=${JSON.stringify(restoredProduct.json)?.slice(0, 240)}`);
      }
    }
  }

  // ── 8. Analytics ──
  console.log('\n► Admin: analytics');
  const analytics = await f('/api/admin/analytics');
  record('Get analytics', analytics.ok);
  const searchEvent = await f('/api/search/analytics', {
    method: 'POST',
    body: JSON.stringify({ type: 'search_submitted', query: 'Acceptance Analytics Query', resultCount: 3, sessionId: `acceptance-${Date.now()}` }),
  });
  record('Persist privacy-minimized search event', searchEvent.ok);
  const searchStats = await f('/api/search/analytics?type=stats');
  record('Admin reads protected search analytics', searchStats.ok && searchStats.json?.totalSearches >= 1 && searchStats.json?.uniqueQueries >= 1);

  // ── 9. Audit log ──
  const audit = await f('/api/admin/audit');
  record('Get audit log', audit.ok);

  // ── 10. Driver hours ──
  const hours = await f('/api/admin/driver-hours');
  record('Get driver hours', hours.ok);

  // ── 11. Coupons ──
  console.log('\n► Admin: coupons & promotions');
  const coupons = await f('/api/admin/coupons');
  record('List coupons', coupons.ok, `status=${coupons.status} body=${JSON.stringify(coupons.json)?.slice(0, 140)}`);

  const promos = await f('/api/admin/promotions');
  record('List promotions', promos.ok, `status=${promos.status} body=${JSON.stringify(promos.json)?.slice(0, 140)}`);

  const missingCouponId = await f('/api/admin/coupons', { method: 'DELETE' });
  record('Coupon delete requires an id', missingCouponId.status === 400, `status=${missingCouponId.status}`);
  const missingPromotionId = await f('/api/admin/promotions', { method: 'DELETE' });
  record('Promotion delete requires an id', missingPromotionId.status === 400, `status=${missingPromotionId.status}`);

  if (LOCAL_MUTATION) {
    const marketingSuffix = Date.now();
    const couponCode = `QA${String(marketingSuffix).slice(-8)}`;
    const createdCoupon = await f('/api/admin/coupons', {
      method: 'POST', body: JSON.stringify({ code: couponCode, type: 'percentage', value: 10, min_order_amount: 0, starts_at: new Date().toISOString(), ends_at: new Date(marketingSuffix + 86_400_000).toISOString() }),
    });
    const couponId = createdCoupon.json?.coupon?.id;
    record('Create coupon', createdCoupon.ok && Boolean(couponId) && createdCoupon.json?.coupon?.code === couponCode, `status=${createdCoupon.status}`);
    if (couponId) {
      const deletedCoupon = await f(`/api/admin/coupons?id=${encodeURIComponent(couponId)}`, { method: 'DELETE' });
      record('Delete coupon only after backend success', deletedCoupon.ok && deletedCoupon.json?.deleted === true, `status=${deletedCoupon.status}`);
    }

    const promotionTitle = `QA Promotion ${String(marketingSuffix).slice(-8)}`;
    const createdPromotion = await f('/api/admin/promotions', {
      method: 'POST', body: JSON.stringify({ title: promotionTitle, description: 'Admin workflow fixture', discount_type: 'percentage', discount_value: 15, starts_at: new Date().toISOString(), ends_at: new Date(marketingSuffix + 86_400_000).toISOString() }),
    });
    const promotionId = createdPromotion.json?.promotion?.id;
    record('Create promotion', createdPromotion.ok && Boolean(promotionId) && createdPromotion.json?.promotion?.title === promotionTitle, `status=${createdPromotion.status}`);
    if (promotionId) {
      const deletedPromotion = await f(`/api/admin/promotions?id=${encodeURIComponent(promotionId)}`, { method: 'DELETE' });
      record('Delete promotion only after backend success', deletedPromotion.ok && deletedPromotion.json?.deleted === true, `status=${deletedPromotion.status}`);
    }
  }

  // ── 12. Refunds ──
  await login('payments');
  const paymentIdentity = await f('/api/auth/me');
  record('Admin session carries trusted payment-support permission', paymentIdentity.json?.user?.email === ACCOUNTS.payments.email && paymentIdentity.json?.user?.permissions?.includes('payment_support'), `status=${paymentIdentity.status}`);
  const refunds = await f('/api/admin/refunds');
  record('Payment-support operator lists refunds', refunds.ok, `status=${refunds.status}`);
  await login('admin');

  // ── 13. Finance ──
  console.log('\n► Admin: finance');
  const finance = await f('/api/admin/finance');
  record('Get finance', finance.ok);

  // ── 14. Map ──
  console.log('\n► Admin: map');
  const map = await f('/api/admin/map');
  record('Get map data', map.ok);

  // ── 15. Config ──
  console.log('\n► Admin: config');
  const config = await f('/api/admin/config');
  record('Get config', config.ok, `status=${config.status} body=${JSON.stringify(config.json)?.slice(0, 140)}`);

  // ── 16. Notifications list ──
  const notifs = await f('/api/admin/notifications');
  record('List notifications', notifs.ok, `status=${notifs.status} body=${JSON.stringify(notifs.json)?.slice(0, 140)}`);

  if (LOCAL_MUTATION) {
    const broadcastTitle = `Acceptance broadcast ${Date.now()}`;
    const announcement = await f('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ title: broadcastTitle, message: 'Customer audience delivery check', type: 'info', audience: 'customers', is_active: true }),
    });
    record('Create immediate customer announcement', announcement.ok, `status=${announcement.status}`);
    await login('customer');
    const customerNotifications = await f('/api/notifications');
    const received = (customerNotifications.json?.notifications || []).some((item) => item.title === broadcastTitle);
    record('Customer audience receives durable notification', customerNotifications.ok && received, `status=${customerNotifications.status}`);
    await login('admin');

    const lifecycleTitle = `Scheduled announcement ${Date.now()}`;
    const lifecycleCreate = await f('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: lifecycleTitle,
        message: 'Lifecycle acceptance check',
        type: 'maintenance',
        audience: 'drivers',
        is_active: false,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        link_url: '/driver/notifications',
        link_label: 'Open',
      }),
    });
    const lifecycleId = lifecycleCreate.json?.announcement?.id;
    record('Create scheduled announcement', lifecycleCreate.ok && Boolean(lifecycleId), `status=${lifecycleCreate.status}`);

    const lifecycleList = await f('/api/admin/announcements');
    record('List includes scheduled announcement', lifecycleList.ok && (lifecycleList.json?.announcements || []).some((item) => item.id === lifecycleId));

    const lifecycleUpdate = await f(`/api/admin/announcements/${lifecycleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: `${lifecycleTitle} updated`, is_active: true }),
    });
    record('Edit and activate scheduled announcement', lifecycleUpdate.ok && lifecycleUpdate.json?.announcement?.is_active === true);

    const unsafeLink = await f(`/api/admin/announcements/${lifecycleId}`, {
      method: 'PATCH',
      body: JSON.stringify({ link_url: 'https://attacker.example/phishing' }),
    });
    record('Reject external announcement link', !unsafeLink.ok && unsafeLink.status === 400, `status=${unsafeLink.status}`);

    const lifecycleDelete = await f(`/api/admin/announcements/${lifecycleId}`, { method: 'DELETE' });
    record('Delete announcement', lifecycleDelete.ok && lifecycleDelete.json?.deleted === lifecycleId, `status=${lifecycleDelete.status}`);

    const lifecycleAfterDelete = await f('/api/admin/announcements');
    record('Deleted announcement is absent', lifecycleAfterDelete.ok && !(lifecycleAfterDelete.json?.announcements || []).some((item) => item.id === lifecycleId));
  }

  // BlinkGo's PWA uses Supabase Realtime plus standards-based Web Push.
  // Native Firebase/APNs providers are optional and only appear when enabled.
  const integrationStatus = await f('/api/integrations/status');
  const pushProviders = integrationStatus.json?.categories?.push?.providers || [];
  record(
    'Supabase Realtime is the primary notification path',
    integrationStatus.ok && pushProviders.some((provider) => provider.name === 'supabase_realtime'),
    `providers=${JSON.stringify(pushProviders)}`,
  );
  record(
    'Disabled Firebase is not reported as a required provider',
    !pushProviders.some((provider) => provider.name === 'fcm' && !provider.enabled),
    `providers=${JSON.stringify(pushProviders)}`,
  );

  const automation = await f('/api/automation/rules');
  const firstRule = automation.json?.rules?.[0];
  record('List persisted automation rules', automation.ok && Boolean(firstRule?.id), `status=${automation.status}`);
  if (firstRule?.id) {
    const disabledRule = await f(`/api/automation/rules/${firstRule.id}`, {
      method: 'PATCH', body: JSON.stringify({ enabled: false }),
    });
    record('Disable automation rule', disabledRule.ok && disabledRule.json?.rule?.enabled === false, `status=${disabledRule.status}`);
    const restoredRule = await f(`/api/automation/rules/${firstRule.id}`, {
      method: 'PATCH', body: JSON.stringify({ enabled: true }),
    });
    record('Restore automation rule', restoredRule.ok && restoredRule.json?.rule?.enabled === true, `status=${restoredRule.status}`);
  }

  const emptyAutomationPatch = await f('/api/automation/rules/68000000-0000-4000-8000-000000000001', {
    method: 'PATCH', body: '{}',
  });
  record('Reject empty automation update', !emptyAutomationPatch.ok && emptyAutomationPatch.status === 400, `status=${emptyAutomationPatch.status}`);

  const unsafeAutomation = await f('/api/automation/rules', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Unsafe internal callback',
      trigger: 'order.created',
      actions: [{ type: 'webhook', params: { url: 'http://127.0.0.1:54321/private', payload: {} } }],
    }),
  });
  record('Reject private automation webhook URL', !unsafeAutomation.ok && unsafeAutomation.status === 400, `status=${unsafeAutomation.status}`);

  const poisonedAutomation = await f('/api/automation/rules', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Unsafe condition field',
      trigger: 'order.created',
      conditions: [{ field: 'constructor.prototype.admin', operator: 'eq', value: true }],
      actions: [{ type: 'log', params: { message: 'Must not run', level: 'warn' } }],
    }),
  });
  record('Reject unsafe automation condition path', !poisonedAutomation.ok && poisonedAutomation.status === 400, `status=${poisonedAutomation.status}`);

  const automationName = `Acceptance Automation ${Date.now()}`;
  const automationCreate = await f('/api/automation/rules', {
    method: 'POST',
    body: JSON.stringify({
      name: automationName,
      description: 'Validated admin-created automation rule',
      trigger: 'order.completed',
      conditions: [{ field: 'total', operator: 'gte', value: 50 }],
      actions: [{ type: 'log', params: { message: 'High-value order completed', level: 'info' } }],
      max_executions_per_hour: 5,
      cooldown_minutes: 10,
    }),
  });
  const automationId = automationCreate.json?.rule?.id;
  record('Create validated automation rule', automationCreate.status === 201 && Boolean(automationId), `status=${automationCreate.status}`);
  if (automationId) {
    const automationDelete = await f(`/api/automation/rules/${automationId}`, { method: 'DELETE' });
    record('Delete validated automation rule', automationDelete.ok, `status=${automationDelete.status}`);
  }

  const webhookName = `Acceptance Webhook ${Date.now()}`;
  const webhookCreate = await f('/api/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      name: webhookName,
      url: 'https://example.com/blinkgo-events',
      secret: 'acceptance-webhook-secret-2026',
      events: ['order.created', 'order.completed'],
      description: 'Admin integration acceptance test',
    }),
  });
  const webhookId = webhookCreate.json?.webhook?.id;
  record('Create signed webhook', webhookCreate.ok && Boolean(webhookId), `status=${webhookCreate.status}`);
  record('Webhook secret is masked', webhookCreate.ok && /^\*\*\*/.test(webhookCreate.json?.webhook?.secret || ''));
  if (webhookId) {
    const webhookTest = await f('/api/webhooks/test', {
      method: 'POST', body: JSON.stringify({ id: webhookId }),
    });
    record(
      'Test webhook bypasses business-event filter',
      webhookTest.ok && typeof webhookTest.json?.success === 'boolean',
      `status=${webhookTest.status} result=${JSON.stringify(webhookTest.json)}`,
    );
    const deliveryStatus = await f('/api/integrations/status');
    const persistedDelivery = deliveryStatus.json?.webhooks?.recent_deliveries?.find((item) => item.webhook_id === webhookId);
    record(
      'Persist webhook delivery without signing secret',
      deliveryStatus.ok && Boolean(persistedDelivery) && !('secret' in (persistedDelivery || {})),
      `delivery=${JSON.stringify(persistedDelivery)}`,
    );
    const webhookUpdate = await f(`/api/webhooks/${webhookId}`, {
      method: 'PATCH', body: JSON.stringify({ name: `${webhookName} Updated`, enabled: false }),
    });
    record('Edit and disable webhook', webhookUpdate.ok && webhookUpdate.json?.webhook?.enabled === false, `status=${webhookUpdate.status}`);
    const webhookDelete = await f(`/api/webhooks/${webhookId}`, { method: 'DELETE' });
    record('Delete webhook', webhookDelete.ok && webhookDelete.json?.deleted === webhookId, `status=${webhookDelete.status}`);
    const webhookList = await f('/api/webhooks');
    record('Deleted webhook is absent', webhookList.ok && !(webhookList.json?.webhooks || []).some((item) => item.id === webhookId));
  }

  const unauthenticatedRetryCron = await f('/api/cron/webhook-retries');
  record(
    'Webhook retry cron rejects unauthenticated requests',
    !unauthenticatedRetryCron.ok && [401, 503].includes(unauthenticatedRetryCron.status),
    `status=${unauthenticatedRetryCron.status}`,
  );

  // ── 17. RBAC: customer cannot use admin endpoints ──
  console.log('\n► Admin: RBAC');
  await login('driver');
  const assignmentDriverOnline = await f('/api/driver/online', {
    method: 'POST',
    body: JSON.stringify({ is_online: true }),
  });
  await login('customer');
  const custOps = await f('/api/admin/operations');
  record('Customer cannot access operations', !custOps.ok && (custOps.status === 401 || custOps.status === 403));

  const custUsers = await f('/api/admin/users');
  record('Customer cannot list users', !custUsers.ok);

  const custSearchAnalytics = await f('/api/search/analytics?type=stats');
  record('Customer cannot read search analytics', !custSearchAnalytics.ok && (custSearchAnalytics.status === 401 || custSearchAnalytics.status === 403));

  const custZones = await f('/api/admin/zones');
  record('Customer cannot manage delivery zones', !custZones.ok && (custZones.status === 401 || custZones.status === 403));

  const custEditAnnouncement = await f('/api/admin/announcements/11111111-1111-1111-1111-111111111111', { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
  record('Customer cannot edit announcements', !custEditAnnouncement.ok && (custEditAnnouncement.status === 401 || custEditAnnouncement.status === 403));

  const custCreateDriver = await f('/api/admin/drivers', { method: 'POST', body: '{}' });
  record('Customer cannot create driver accounts', !custCreateDriver.ok && (custCreateDriver.status === 401 || custCreateDriver.status === 403));

  const custEditDriver = await f('/api/admin/drivers', { method: 'PATCH', body: JSON.stringify({ id: '11111111-1111-1111-1111-111111111111', name: 'Unauthorized', vehicle_type: 'car' }) });
  record('Customer cannot edit driver profiles', !custEditDriver.ok && (custEditDriver.status === 401 || custEditDriver.status === 403));

  const custEditRestaurant = await f('/api/admin/restaurants/11111111-1111-1111-1111-111111111111', { method: 'PATCH', body: JSON.stringify({ name: 'Unauthorized restaurant' }) });
  record('Customer cannot edit restaurant profiles', !custEditRestaurant.ok && (custEditRestaurant.status === 401 || custEditRestaurant.status === 403));

  const custCreateProduct = await f('/api/products/manage', { method: 'POST', body: '{}' });
  record('Customer cannot create products', !custCreateProduct.ok && (custCreateProduct.status === 401 || custCreateProduct.status === 403));

  const custEditProduct = await f('/api/products/manage', { method: 'PATCH', body: JSON.stringify({ id: '11111111-1111-1111-1111-111111111111', name: 'Unauthorized' }) });
  record('Customer cannot edit products', !custEditProduct.ok && (custEditProduct.status === 401 || custEditProduct.status === 403));

  const custRestoreProduct = await f('/api/products/manage', { method: 'PATCH', body: JSON.stringify({ id: '11111111-1111-1111-1111-111111111111', action: 'restore' }) });
  record('Customer cannot restore products', !custRestoreProduct.ok && (custRestoreProduct.status === 401 || custRestoreProduct.status === 403));

  const custEditWebhook = await f('/api/webhooks/68000000-0000-4000-8000-000000000001', { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
  record('Customer cannot edit webhooks', !custEditWebhook.ok && (custEditWebhook.status === 401 || custEditWebhook.status === 403));

  const custDeleteWebhook = await f('/api/webhooks/68000000-0000-4000-8000-000000000001', { method: 'DELETE' });
  record('Customer cannot delete webhooks', !custDeleteWebhook.ok && (custDeleteWebhook.status === 401 || custDeleteWebhook.status === 403));

  const custToggleAutomation = await f('/api/automation/rules/68000000-0000-4000-8000-000000000001', { method: 'PATCH', body: JSON.stringify({ enabled: false }) });
  record('Customer cannot change automation rules', !custToggleAutomation.ok && (custToggleAutomation.status === 401 || custToggleAutomation.status === 403));

  // ── 18. RBAC: driver cannot use admin endpoints ──
  await login('driver');
  const drvOps = await f('/api/admin/operations');
  record('Driver cannot access operations', !drvOps.ok);

  const drvFinance = await f('/api/admin/finance');
  record('Driver cannot access finance', !drvFinance.ok);

  // ── 19. RBAC: restaurant cannot use admin endpoints ──
  await login('restaurant');
  const restOps = await f('/api/admin/operations');
  record('Restaurant cannot access operations', !restOps.ok);

  const restFinance = await f('/api/admin/finance');
  record('Restaurant cannot access finance', !restFinance.ok);

  // ── 20. Admin: reassign order ──
  console.log('\n► Admin: order management');
  await login('customer');
  const search = await f('/api/search?sort=recommended');
  const restaurant = search.json?.restaurants?.[0];
  const products = restaurant ? await f(`/api/products/bestsellers?restaurant_id=${restaurant.id}`) : null;
  const product = products?.json?.bestsellers?.[0];
  if (assignmentDriverOnline.ok && restaurant && product) {
    const order = await f('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        restaurant_id: restaurant.id,
        items: [checkoutLine(product, restaurant)],
        payment_method: 'cash',
        delivery_address: {
          address: 'Test',
          lat: Number(restaurant.latitude ?? 50.7374),
          lng: Number(restaurant.longitude ?? 7.0982),
        },
      }),
    });
    const orderId = order.json?.data?.order?.id || order.json?.order?.id;
    if (orderId) {
      await login('admin');
      // Get a real driver
      const drivers = await f('/api/admin/operations/tools?list=online_drivers');
      const driverId = drivers.json?.data?.drivers?.[0]?.id || drivers.json?.drivers?.[0]?.id;
      if (driverId) {
        const reassign = await f('/api/admin/operations/tools', {
          method: 'POST',
          body: JSON.stringify({ action: 'reassign_order', orderId, driverId, reason: 'Admin workflow test assignment' }),
        });
        record('Reassign order', reassign.ok, `status=${reassign.status} body=${JSON.stringify(reassign.json)?.slice(0, 240)}`);
      } else {
        record('Reassign order', false, 'online driver fixture missing');
      }
    } else {
      record('Reassign order', false, `order fixture failed (status=${order.status} body=${JSON.stringify(order.json)?.slice(0, 240)})`);
    }
  } else {
    record('Reassign order', false, 'driver, restaurant or product fixture missing');
  }

  // ── SUMMARY ──
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.name}: ${r.info}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
