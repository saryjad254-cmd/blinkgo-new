/**
 * System settings API.
 * Managers may inspect settings; only administrators may change them.
 * Secrets must remain in environment variables and are rejected here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SETTING_KEY = /^[a-z][a-z0-9_.-]{0,99}$/;
const SECRET_KEY = /(?:password|secret|token|api[_-]?key|private[_-]?key|credential)/i;
const MAX_SETTINGS_PER_REQUEST = 50;
const MAX_VALUE_BYTES = 10_000;

type SettingResult = {
  key: string;
  ok: boolean;
  setting?: unknown;
  error?: string;
};

function settingsObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validateSetting(key: string, value: unknown) {
  if (!SETTING_KEY.test(key) || SECRET_KEY.test(key)) {
    throw new ValidationError(`Setting key is not allowed: ${key}`);
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new ValidationError(`Setting value is not JSON-compatible: ${key}`);
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ValidationError(`Setting value is not JSON-compatible: ${key}`);
  }
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_VALUE_BYTES) {
    throw new ValidationError(`Setting value is too large: ${key}`);
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    async () => {
      const svc = createServiceClient();
      const { data, error } = await svc
        .from('system_settings')
        .select('key, value, updated_at, updated_by')
        .order('key');

      if (error) {
        logger.warn('settings fetch failed', {}, error);
        return ok({ settings: {}, raw: [] });
      }

      const settings: Record<string, unknown> = {};
      for (const row of data ?? []) settings[row.key] = row.value;
      return ok({ settings, raw: data ?? [] });
    },
  )(req) as NextResponse;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await withSecurity(
    secureRoute('strict', ['admin', 'super_admin']),
    async (ctx, request) => {
      const rawBody: unknown = await request.json().catch(() => null);
      const body = settingsObject(rawBody);
      const updates = settingsObject(body?.settings);
      if (!updates) throw new ValidationError('settings object is required');

      const entries = Object.entries(updates);
      if (entries.length === 0 || entries.length > MAX_SETTINGS_PER_REQUEST) {
        throw new ValidationError(`settings must contain 1-${MAX_SETTINGS_PER_REQUEST} entries`);
      }
      for (const [key, value] of entries) validateSetting(key, value);

      const svc = createServiceClient();
      const results: SettingResult[] = [];
      for (const [key, value] of entries) {
        const { data, error } = await svc
          .from('system_settings')
          .upsert({
            key,
            value,
            updated_by: ctx.auth.user.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' })
          .select('key, value, updated_at, updated_by')
          .single();
        if (error) {
          logger.warn('setting update failed', { key }, error);
          results.push({ key, ok: false, error: error.message });
        } else {
          results.push({ key, ok: true, setting: data });
        }
      }

      await audit('ADMIN_CONFIG_CHANGED', {
        severity: 'warn',
        userId: ctx.auth.user.id,
        userRole: ctx.auth.user.role,
        resource: 'system_settings',
        metadata: { updated_keys: entries.map(([key]) => key) },
      });
      return ok({ results });
    },
  )(req) as NextResponse;
}
