import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/admin-guard';
import { ok, withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
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
    return ok({ updated: true });
  });
}
