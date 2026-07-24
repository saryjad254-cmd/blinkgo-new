/**
 * Admin Coupons API
 * GET  /api/admin/coupons     — list all
 * POST /api/admin/coupons     — create
 * DELETE /api/admin/coupons   — delete (?id=...)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/admin-guard';
import { ok, withErrorHandling } from '@/lib/api/response';
import { CouponService } from '@/lib/services/coupon-service';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const svc = createServiceClient();
    const { data, error } = await svc.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) {
      logger.error('Admin coupons list failed', {}, error);
      return ok({ coupons: [] });
    }
    return ok({ coupons: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const body = await req.json().catch(() => ({}));
    const coupon = await CouponService.create(body);
    return ok({ coupon });
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
    await svc.from('coupons').delete().eq('id', id);
    return ok({ deleted: true });
  });
}
