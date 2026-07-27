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
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { audit } from '@/lib/services/audit-log';
import { getApiUserWithRole } from '@/lib/auth-helper';
import { CouponService } from '@/lib/services/coupon-service';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => listCoupons() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function listCoupons(): Promise<NextResponse> {
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
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => createCoupon(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function createCoupon(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const body = await req.json().catch(() => ({}));
    const coupon = await CouponService.create(body);
    const me = await getApiUserWithRole();
    if (me) {
      await audit('ADMIN_CONFIG_CHANGED', {
        severity: 'info',
        userId: me.user.id,
        userRole: me.user.role,
        resource: 'coupon',
        resourceId: String(coupon?.id ?? ''),
        metadata: { code: body.code, type: body.type },
      });
    }
    return ok({ coupon });
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => deleteCoupon(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function deleteCoupon(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return ok({ deleted: false });
    const svc = createServiceClient();
    await svc.from('coupons').delete().eq('id', id);
    const me = await getApiUserWithRole();
    if (me) {
      await audit('ADMIN_CONFIG_CHANGED', {
        severity: 'warn',
        userId: me.user.id,
        userRole: me.user.role,
        resource: 'coupon',
        resourceId: id,
        metadata: { action: 'delete' },
      });
    }
    return ok({ deleted: true });
  });
}
