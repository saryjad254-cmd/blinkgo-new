import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { AuthorizationError, ConflictError, ValidationError } from '@/lib/foundation/errors';
import { fail, ok, withErrorHandling } from '@/lib/foundation/response';
import {
  FEATURE_FLAG_KEYS,
  getFeatureFlagSnapshot,
  invalidateFeatureFlagCache,
  type ActiveOrderPolicy,
  type FeatureFlagKey,
} from '@/lib/platform/feature-flags';
import { audit } from '@/lib/services/audit-log';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ACTIVE_ORDER_POLICIES: ActiveOrderPolicy[] = ['allow', 'preserve_active', 'block_all'];

function isFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === 'string' && (FEATURE_FLAG_KEYS as readonly string[]).includes(value);
}

function parseStringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length > 100)) {
    throw new ValidationError(`${field} must be a string array`);
  }
  return [...new Set(value)];
}

function parseScope(value: unknown): Record<string, string[]> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('scope must be an object');
  const raw = value as Record<string, unknown>;
  const allowed = ['roles', 'city_ids', 'include_user_ids', 'exclude_user_ids'];
  if (Object.keys(raw).some((key) => !allowed.includes(key))) throw new ValidationError('scope contains an unsupported field');
  const scope: Record<string, string[]> = {};
  for (const key of allowed) {
    const list = parseStringList(raw[key], `scope.${key}`);
    if (list) scope[key] = list;
  }
  return scope;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.error!;
    const service = createServiceClient();
    const [snapshot, versionResult] = await Promise.all([
      getFeatureFlagSnapshot(),
      service.from('platform_feature_flag_versions').select('flag_key,version,change_reason,changed_by,changed_at').order('changed_at', { ascending: false }).limit(100),
    ]);
    return ok({ flags: snapshot.flags, source: snapshot.source, degraded: snapshot.degraded, recent_versions: versionResult.data ?? [] });
  }) as Promise<NextResponse>;
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.error!;
    const role = String(guard.auth?.profile?.role ?? '');
    if (!['admin', 'super_admin'].includes(role)) return fail(new AuthorizationError('Manager access is read-only for feature flags'));

    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Invalid request body');
    const body = raw as Record<string, unknown>;
    if (!isFlagKey(body.key)) throw new ValidationError('Unknown feature flag key');
    if (!Number.isInteger(body.expected_version) || Number(body.expected_version) < 1) throw new ValidationError('expected_version is required');
    if (typeof body.change_reason !== 'string' || body.change_reason.trim().length < 8 || body.change_reason.length > 500) {
      throw new ValidationError('change_reason must contain 8 to 500 characters');
    }

    const updates: Record<string, unknown> = {
      version: Number(body.expected_version) + 1,
      change_reason: body.change_reason.trim(),
      updated_by: guard.auth?.user?.id ?? null,
    };
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new ValidationError('enabled must be boolean');
      updates.enabled = body.enabled;
    }
    if (body.rollout_percentage !== undefined) {
      if (!Number.isInteger(body.rollout_percentage) || Number(body.rollout_percentage) < 0 || Number(body.rollout_percentage) > 100) {
        throw new ValidationError('rollout_percentage must be an integer between 0 and 100');
      }
      updates.rollout_percentage = Number(body.rollout_percentage);
    }
    const dependencies = parseStringList(body.dependencies, 'dependencies');
    if (dependencies) {
      if (dependencies.some((entry) => !isFlagKey(entry))) throw new ValidationError('dependencies contain an unknown feature flag');
      if (dependencies.includes(body.key)) throw new ValidationError('A feature flag cannot depend on itself');
      updates.dependencies = dependencies;
    }
    const scope = parseScope(body.scope);
    if (scope) updates.scope = scope;
    if (body.active_order_policy !== undefined) {
      if (!VALID_ACTIVE_ORDER_POLICIES.includes(body.active_order_policy as ActiveOrderPolicy)) {
        throw new ValidationError('Invalid active_order_policy');
      }
      updates.active_order_policy = body.active_order_policy;
    }

    const { data, error } = await createServiceClient()
      .from('platform_feature_flags')
      .update(updates)
      .eq('key', body.key)
      .eq('version', Number(body.expected_version))
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ConflictError('Feature flag changed by another administrator; reload before retrying');

    invalidateFeatureFlagCache();
    await audit('ADMIN_FEATURE_FLAG_CHANGED', {
      severity: data.kind === 'kill_switch' ? 'warn' : 'info',
      userId: guard.auth?.user?.id,
      userEmail: guard.auth?.user?.email ?? undefined,
      userRole: role,
      resource: 'platform_feature_flag',
      resourceId: body.key,
      metadata: {
        version: data.version,
        enabled: data.enabled,
        rollout_percentage: data.rollout_percentage,
        active_order_policy: data.active_order_policy,
        change_reason: data.change_reason,
      },
    });
    return ok({ flag: data });
  }) as Promise<NextResponse>;
}
