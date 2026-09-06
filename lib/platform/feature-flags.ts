import { createHash } from 'node:crypto';
import { ServiceUnavailableError } from '@/lib/foundation/errors';
import { logger } from '@/lib/logging';
import { createServiceClient } from '@/lib/supabase/service';

export const FEATURE_FLAG_KEYS = [
  'surface.customer.write.enabled',
  'surface.merchant.write.enabled',
  'surface.courier.write.enabled',
  'checkout.enabled',
  'orders.create.enabled',
  'payments.stripe.enabled',
  'payments.cash.enabled',
  'dispatch.offers.enabled',
  'notifications.delivery.enabled',
  'features.customer_pickup.enabled',
  'features.group_orders.enabled',
  'features.retail_substitutions.enabled',
  'features.blinkgo_plus.enabled',
  'features.owned_commerce.enabled',
  'features.b2b_delivery.enabled',
  'features.age_restricted.enabled',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];
export type FeatureFlagKind = 'feature' | 'kill_switch' | 'surface';
export type ActiveOrderPolicy = 'allow' | 'preserve_active' | 'block_all';

export interface FeatureFlagRecord {
  key: FeatureFlagKey;
  kind: FeatureFlagKind;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  dependencies: FeatureFlagKey[];
  scope: {
    roles?: string[];
    city_ids?: string[];
    include_user_ids?: string[];
    exclude_user_ids?: string[];
  };
  active_order_policy: ActiveOrderPolicy;
  version: number;
  change_reason: string;
  updated_at: string;
}

export interface FeatureFlagContext {
  userId?: string | null;
  role?: string | null;
  cityId?: string | null;
  activeOrder?: boolean;
  rolloutSeed?: string;
}

export interface FeatureFlagDecision {
  key: FeatureFlagKey;
  enabled: boolean;
  reason:
    | 'enabled'
    | 'disabled'
    | 'dependency_disabled'
    | 'outside_scope'
    | 'outside_rollout'
    | 'active_order_preserved'
    | 'configuration_unavailable'
    | 'dependency_cycle';
  source: 'database' | 'safe_default';
  version: number;
  dependency?: FeatureFlagKey;
  degraded: boolean;
}

const SAFE_DEFAULTS: Record<FeatureFlagKey, Omit<FeatureFlagRecord, 'updated_at'>> = {
  'surface.customer.write.enabled': base('surface.customer.write.enabled', 'surface', true, [], 'preserve_active'),
  'surface.merchant.write.enabled': base('surface.merchant.write.enabled', 'surface', true, [], 'preserve_active'),
  'surface.courier.write.enabled': base('surface.courier.write.enabled', 'surface', true, [], 'preserve_active'),
  'checkout.enabled': base('checkout.enabled', 'kill_switch', true, ['surface.customer.write.enabled'], 'preserve_active'),
  'orders.create.enabled': base('orders.create.enabled', 'kill_switch', true, ['checkout.enabled'], 'preserve_active'),
  'payments.stripe.enabled': base('payments.stripe.enabled', 'kill_switch', true, ['orders.create.enabled'], 'preserve_active'),
  'payments.cash.enabled': base('payments.cash.enabled', 'kill_switch', true, ['orders.create.enabled'], 'preserve_active'),
  'dispatch.offers.enabled': base('dispatch.offers.enabled', 'kill_switch', true, ['surface.courier.write.enabled'], 'preserve_active'),
  'notifications.delivery.enabled': base('notifications.delivery.enabled', 'kill_switch', true, [], 'allow'),
  'features.customer_pickup.enabled': base('features.customer_pickup.enabled', 'feature', true, ['checkout.enabled'], 'allow'),
  'features.group_orders.enabled': base('features.group_orders.enabled', 'feature', true, ['checkout.enabled'], 'allow'),
  'features.retail_substitutions.enabled': base('features.retail_substitutions.enabled', 'feature', true, ['surface.merchant.write.enabled'], 'preserve_active'),
  'features.blinkgo_plus.enabled': base('features.blinkgo_plus.enabled', 'feature', false, [], 'allow'),
  'features.owned_commerce.enabled': base('features.owned_commerce.enabled', 'feature', false, [], 'allow'),
  'features.b2b_delivery.enabled': base('features.b2b_delivery.enabled', 'feature', false, [], 'allow'),
  'features.age_restricted.enabled': base('features.age_restricted.enabled', 'feature', false, [], 'block_all'),
};

function base(
  key: FeatureFlagKey,
  kind: FeatureFlagKind,
  enabled: boolean,
  dependencies: FeatureFlagKey[],
  activeOrderPolicy: ActiveOrderPolicy,
): Omit<FeatureFlagRecord, 'updated_at'> {
  return {
    key,
    kind,
    description: key,
    enabled,
    rollout_percentage: enabled ? 100 : 0,
    dependencies,
    scope: {},
    active_order_policy: activeOrderPolicy,
    version: 1,
    change_reason: 'safe application default',
  };
}

const CACHE_TTL_MS = 3_000;
let cache: { expiresAt: number; flags: Map<FeatureFlagKey, FeatureFlagRecord>; source: 'database' | 'safe_default' } | null = null;

function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === 'string' && (FEATURE_FLAG_KEYS as readonly string[]).includes(value);
}

function normalizeRecord(value: unknown): FeatureFlagRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!isFeatureFlagKey(row.key)) return null;
  const kind = row.kind;
  const activeOrderPolicy = row.active_order_policy;
  if (!['feature', 'kill_switch', 'surface'].includes(String(kind))) return null;
  if (!['allow', 'preserve_active', 'block_all'].includes(String(activeOrderPolicy))) return null;
  const dependencies = Array.isArray(row.dependencies) ? row.dependencies.filter(isFeatureFlagKey) : [];
  const rollout = Number(row.rollout_percentage);
  const scope = row.scope && typeof row.scope === 'object' && !Array.isArray(row.scope)
    ? row.scope as FeatureFlagRecord['scope']
    : {};
  return {
    key: row.key,
    kind: kind as FeatureFlagKind,
    description: typeof row.description === 'string' ? row.description : row.key,
    enabled: row.enabled === true,
    rollout_percentage: Number.isInteger(rollout) ? Math.min(100, Math.max(0, rollout)) : 0,
    dependencies,
    scope,
    active_order_policy: activeOrderPolicy as ActiveOrderPolicy,
    version: Number.isInteger(Number(row.version)) ? Math.max(1, Number(row.version)) : 1,
    change_reason: typeof row.change_reason === 'string' ? row.change_reason : 'unspecified',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date(0).toISOString(),
  };
}

function safeDefaultMap(): Map<FeatureFlagKey, FeatureFlagRecord> {
  return new Map(FEATURE_FLAG_KEYS.map((key) => [key, { ...SAFE_DEFAULTS[key], updated_at: new Date(0).toISOString() }]));
}

async function loadFlags(): Promise<{ flags: Map<FeatureFlagKey, FeatureFlagRecord>; source: 'database' | 'safe_default' }> {
  if (cache && cache.expiresAt > Date.now()) return cache;
  try {
    const { data, error } = await createServiceClient()
      .from('platform_feature_flags')
      .select('key,kind,description,enabled,rollout_percentage,dependencies,scope,active_order_policy,version,change_reason,updated_at');
    if (error) throw error;
    const flags = safeDefaultMap();
    for (const row of data ?? []) {
      const normalized = normalizeRecord(row);
      if (normalized) flags.set(normalized.key, normalized);
    }
    cache = { flags, source: 'database', expiresAt: Date.now() + CACHE_TTL_MS };
  } catch (error) {
    logger.warn('feature_flags.configuration_unavailable', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    cache = { flags: safeDefaultMap(), source: 'safe_default', expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return cache;
}

function inScope(flag: FeatureFlagRecord, context: FeatureFlagContext): boolean {
  const { scope } = flag;
  if (scope.exclude_user_ids?.includes(String(context.userId))) return false;
  if (scope.include_user_ids?.length && !scope.include_user_ids.includes(String(context.userId))) return false;
  if (scope.roles?.length && !scope.roles.includes(String(context.role))) return false;
  if (scope.city_ids?.length && !scope.city_ids.includes(String(context.cityId))) return false;
  return true;
}

function rolloutBucket(key: FeatureFlagKey, context: FeatureFlagContext): number {
  const identity = context.rolloutSeed || context.userId || `${context.role || 'anonymous'}:${context.cityId || 'global'}`;
  const digest = createHash('sha256').update(`${key}:${identity}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export function evaluateFlagSet(
  key: FeatureFlagKey,
  flags: Map<FeatureFlagKey, FeatureFlagRecord>,
  context: FeatureFlagContext = {},
  source: 'database' | 'safe_default' = 'database',
  visiting: Set<FeatureFlagKey> = new Set(),
): FeatureFlagDecision {
  const flag = flags.get(key) ?? { ...SAFE_DEFAULTS[key], updated_at: new Date(0).toISOString() };
  const degraded = source === 'safe_default';
  if (visiting.has(key)) return { key, enabled: false, reason: 'dependency_cycle', source, version: flag.version, degraded };
  if (!flag.enabled) {
    if (context.activeOrder && flag.active_order_policy === 'preserve_active') {
      return { key, enabled: true, reason: 'active_order_preserved', source, version: flag.version, degraded };
    }
    return { key, enabled: false, reason: degraded ? 'configuration_unavailable' : 'disabled', source, version: flag.version, degraded };
  }
  if (!inScope(flag, context)) return { key, enabled: false, reason: 'outside_scope', source, version: flag.version, degraded };
  if (flag.rollout_percentage < 100 && rolloutBucket(key, context) >= flag.rollout_percentage) {
    return { key, enabled: false, reason: 'outside_rollout', source, version: flag.version, degraded };
  }
  const nextVisiting = new Set(visiting).add(key);
  for (const dependency of flag.dependencies) {
    const decision = evaluateFlagSet(dependency, flags, context, source, nextVisiting);
    if (!decision.enabled) {
      return { key, enabled: false, reason: decision.reason === 'dependency_cycle' ? 'dependency_cycle' : 'dependency_disabled', source, version: flag.version, dependency, degraded };
    }
  }
  return { key, enabled: true, reason: 'enabled', source, version: flag.version, degraded };
}

export async function evaluateFeatureFlag(key: FeatureFlagKey, context: FeatureFlagContext = {}): Promise<FeatureFlagDecision> {
  const { flags, source } = await loadFlags();
  return evaluateFlagSet(key, flags, context, source);
}

export async function getFeatureFlagSnapshot(): Promise<{
  flags: FeatureFlagRecord[];
  source: 'database' | 'safe_default';
  degraded: boolean;
}> {
  const loaded = await loadFlags();
  return {
    flags: [...loaded.flags.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key)),
    source: loaded.source,
    degraded: loaded.source === 'safe_default',
  };
}

export async function requireFeatureFlag(key: FeatureFlagKey, context: FeatureFlagContext = {}): Promise<FeatureFlagDecision> {
  const decision = await evaluateFeatureFlag(key, context);
  if (!decision.enabled) {
    throw new ServiceUnavailableError('This operation is temporarily unavailable', {
      meta: { feature: key, reason: decision.reason, dependency: decision.dependency, version: decision.version },
    });
  }
  return decision;
}

export function invalidateFeatureFlagCache(): void {
  cache = null;
}
