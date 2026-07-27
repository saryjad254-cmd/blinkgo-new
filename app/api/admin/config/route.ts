import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/admin-guard';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => listConfig() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function listConfig(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const svc = createServiceClient();
    const { data, error } = await svc.from('config').select('*').order('key');
    if (error) return ok({ config: [] });
    return ok({ config: data ?? [] });
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => updateConfig(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function updateConfig(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const { key, value, description } = await req.json();
    if (!key) return ok({ updated: false });
    const svc = createServiceClient();
    const { error } = await svc.from('config').upsert({
      key,
      value,
      description: description ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (error) {
      logger.error('Config update failed', { key }, error);
      return ok({ updated: false });
    }
    const me = await getApiUserWithRole();
    if (me) {
      await audit('ADMIN_CONFIG_CHANGED', {
        severity: 'info',
        userId: me.user.id,
        userRole: me.user.role,
        resource: 'config',
        resourceId: key,
        metadata: { key },
      });
    }
    return ok({ updated: true });
  });
}
