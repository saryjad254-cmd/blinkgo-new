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
    const { data, error } = await svc
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('Promotions list failed', {}, error);
      return ok({ promotions: [] });
    }
    return ok({ promotions: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const body = await req.json().catch(() => ({}));
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('promotions')
      .insert({
        title: body.title,
        description: body.description ?? '',
        discount_type: body.discount_type ?? 'percentage',
        discount_value: body.discount_value ?? 10,
        restaurant_id: body.restaurant_id || null,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        is_active: true,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error('Failed to create promotion');
    }
    return ok({ promotion: data });
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return ok({ deleted: false });
    const svc = createServiceClient();
    await svc.from('promotions').delete().eq('id', id);
    return ok({ deleted: true });
  });
}
