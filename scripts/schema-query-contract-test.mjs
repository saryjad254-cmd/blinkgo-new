import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
let passed = 0;
let failed = 0;

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function requires(relativePath, snippets) {
  const text = source(relativePath);
  for (const snippet of snippets) {
    check(`${relativePath} requires ${snippet}`, text.includes(snippet));
  }
}

function forbids(relativePath, snippets) {
  const text = source(relativePath);
  for (const snippet of snippets) {
    check(`${relativePath} forbids ${snippet}`, !text.includes(snippet));
  }
}

requires('app/(customer)/payment-history/page.tsx', [
  ".from('payments')",
  ".eq('customer_id', user.id)",
  ".from('payment_refunds')",
  'requested_amount_cents',
]);
forbids('app/(customer)/payment-history/page.tsx', [
  ".eq('user_id', user.id)",
  ".from('refunds')",
]);

requires('app/api/orders/[id]/refund/route.ts', [
  ".from('payment_refunds')",
  "status: 'requested'",
  ".from('support_tickets')",
]);
forbids('app/api/orders/[id]/refund/route.ts', [
  ".from('payments')",
  "rpc('request_refund'",
  'payment_provider:',
  'provider_payment_id:',
]);

requires('lib/repositories/payments.ts', [
  'customer_id',
  'stripe_payment_intent_id',
  'stripe_charge_id',
  ".from('payment_refunds')",
]);
forbids('lib/repositories/payments.ts', [
  'provider_payment_id:',
  "provider, provider_payment_id",
  ".from('refunds')",
  'completed_at =',
]);

requires('lib/repositories/addresses.ts', ['latitude', 'longitude', 'details']);
forbids('lib/repositories/addresses.ts', ['postal_code', 'deleted_at', 'updated_at']);
forbids('app/api/addresses/route.ts', ['postal_code']);

requires('lib/repositories/orders.ts', ['customer_latitude', 'customer_longitude', 'picked_up_at', 'event_type']);
forbids('lib/repositories/orders.ts', [
  'customer_lat, customer_lng',
  ".is('deleted_at'",
  'patch.ready_at',
  'patch.picked_at',
  "event, metadata, created_at",
]);

requires('lib/repositories/restaurants.ts', ['latitude', 'longitude', 'is_hidden', "q.contains('cuisine'"]);
forbids('lib/repositories/restaurants.ts', [
  ".eq('slug'",
  "q.eq('cuisine_type'",
  "q.eq('is_visible'",
  'postal_code',
  'deleted_at',
]);

requires('lib/repositories/drivers.ts', ['total_base', 'total_tips', 'total_payout']);
forbids('lib/repositories/drivers.ts', ["q.select('id, driver_id, amount, currency"]);

requires('lib/services/order-service.ts', [
  'customer_latitude:',
  'customer_longitude:',
  "case 'ready': return { prepared_at: now }",
  'restaurants!orders_restaurant_id_fkey(owner_id)',
  "throw new AuthorizationError('Unsupported order viewer role')",
  ".eq('owner_id', filter.userId)",
]);
forbids('lib/services/order-service.ts', [
  'customer_lat:',
  'customer_lng:',
  'commission,',
  'ready_at: now',
  'picked_up_at: now',
  'data.restaurant_id !== viewer.id',
  "q.eq('restaurant_id', filter.userId)",
]);

requires('app/api/analytics/restaurant/route.ts', ['ready_at: o.prepared_at', 'restaurantByOrder.get(i.order_id)']);
forbids('app/api/analytics/restaurant/route.ts', ['ready_at: o.ready_at', 'restaurant_id: i.restaurant_id']);

requires('lib/api/ownership.ts', [".select('id, customer_id')", 'addr.customer_id']);

console.log(`\nSchema query contract: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
