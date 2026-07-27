/**
 * System Settings API
 * ───────────────────
 * GET  /api/admin/settings     - Get all settings (admin)
 * POST /api/admin/settings     - Update a setting (admin)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { audit } from '@/lib/services/audit-log';
import { AuthorizationError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => listSettings() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function listSettings(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin', 'manager']);
    if (!user) throw new AuthorizationError('Admin access required');

    const svc = createServiceClient();
    const { data, error } = await svc
      .from('system_settings')
      .select('*')
      .order('key');

    if (error) {
      logger.warn('settings fetch failed', {}, error);
      return ok({ settings: {} });
    }

    const settings: Record<string, any> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }
    return ok({ settings, raw: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => updateSettings(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function updateSettings(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin', 'manager']);
    if (!user) throw new AuthorizationError('Admin access required');

    const body = await req.json().catch(() => ({}));
    const updates = body.settings as Record<string, any>;
    if (!updates || typeof updates !== 'object') {
      throw new ValidationError('settings object is required');
    }

    const svc = createServiceClient();
    const results: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      const { data, error } = await svc
        .from('system_settings')
        .upsert({
          key,
          value,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
        .select()
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
      userId: user.id,
      userRole: user.role,
      resource: 'system_settings',
      metadata: { updated_keys: Object.keys(updates) },
    });
    return ok({ results });
  });
}
