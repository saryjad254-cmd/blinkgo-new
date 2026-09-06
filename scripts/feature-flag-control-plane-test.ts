import assert from 'node:assert/strict';
import {
  evaluateFlagSet,
  type FeatureFlagKey,
  type FeatureFlagRecord,
} from '../lib/platform/feature-flags';

const now = new Date().toISOString();
const makeFlag = (
  key: FeatureFlagKey,
  overrides: Partial<FeatureFlagRecord> = {},
): FeatureFlagRecord => ({
  key,
  kind: 'feature',
  description: key,
  enabled: true,
  rollout_percentage: 100,
  dependencies: [],
  scope: {},
  active_order_policy: 'allow',
  version: 1,
  change_reason: 'test fixture',
  updated_at: now,
  ...overrides,
});

const test = (name: string, run: () => void) => {
  run();
  console.log(`PASS ${name}`);
};

test('disabled dependency fails closed', () => {
  const flags = new Map<FeatureFlagKey, FeatureFlagRecord>([
    ['surface.customer.write.enabled', makeFlag('surface.customer.write.enabled', { enabled: false })],
    ['checkout.enabled', makeFlag('checkout.enabled', { dependencies: ['surface.customer.write.enabled'] })],
  ]);
  const decision = evaluateFlagSet('checkout.enabled', flags, { userId: 'customer-1' });
  assert.equal(decision.enabled, false);
  assert.equal(decision.reason, 'dependency_disabled');
  assert.equal(decision.dependency, 'surface.customer.write.enabled');
});

test('dependency cycle fails closed', () => {
  const flags = new Map<FeatureFlagKey, FeatureFlagRecord>([
    ['checkout.enabled', makeFlag('checkout.enabled', { dependencies: ['orders.create.enabled'] })],
    ['orders.create.enabled', makeFlag('orders.create.enabled', { dependencies: ['checkout.enabled'] })],
  ]);
  const decision = evaluateFlagSet('checkout.enabled', flags);
  assert.equal(decision.enabled, false);
  assert.equal(decision.reason, 'dependency_cycle');
});

test('active order is preserved by an operational freeze', () => {
  const flags = new Map<FeatureFlagKey, FeatureFlagRecord>([
    ['dispatch.offers.enabled', makeFlag('dispatch.offers.enabled', {
      kind: 'kill_switch',
      enabled: false,
      active_order_policy: 'preserve_active',
    })],
  ]);
  assert.equal(evaluateFlagSet('dispatch.offers.enabled', flags, { activeOrder: false }).enabled, false);
  const active = evaluateFlagSet('dispatch.offers.enabled', flags, { activeOrder: true });
  assert.equal(active.enabled, true);
  assert.equal(active.reason, 'active_order_preserved');
});

test('block_all policy never bypasses an emergency freeze', () => {
  const flags = new Map<FeatureFlagKey, FeatureFlagRecord>([
    ['features.age_restricted.enabled', makeFlag('features.age_restricted.enabled', {
      enabled: false,
      active_order_policy: 'block_all',
    })],
  ]);
  assert.equal(evaluateFlagSet('features.age_restricted.enabled', flags, { activeOrder: true }).enabled, false);
});

test('role and city scopes are enforced', () => {
  const flags = new Map<FeatureFlagKey, FeatureFlagRecord>([
    ['features.group_orders.enabled', makeFlag('features.group_orders.enabled', {
      scope: { roles: ['customer'], city_ids: ['cologne'] },
    })],
  ]);
  assert.equal(evaluateFlagSet('features.group_orders.enabled', flags, { role: 'driver', cityId: 'cologne' }).enabled, false);
  assert.equal(evaluateFlagSet('features.group_orders.enabled', flags, { role: 'customer', cityId: 'berlin' }).enabled, false);
  assert.equal(evaluateFlagSet('features.group_orders.enabled', flags, { role: 'customer', cityId: 'cologne' }).enabled, true);
});

test('rollout assignment is deterministic for one identity', () => {
  const flags = new Map<FeatureFlagKey, FeatureFlagRecord>([
    ['features.group_orders.enabled', makeFlag('features.group_orders.enabled', { rollout_percentage: 50 })],
  ]);
  const first = evaluateFlagSet('features.group_orders.enabled', flags, { userId: 'stable-customer' });
  for (let index = 0; index < 20; index += 1) {
    assert.deepEqual(evaluateFlagSet('features.group_orders.enabled', flags, { userId: 'stable-customer' }), first);
  }
});

test('future features are disabled when configuration is unavailable', () => {
  const decision = evaluateFlagSet('features.b2b_delivery.enabled', new Map(), {}, 'safe_default');
  assert.equal(decision.enabled, false);
  assert.equal(decision.reason, 'configuration_unavailable');
  assert.equal(decision.degraded, true);
});

console.log('Feature flag control-plane contract: 7/7 passed');

