import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => driverStats() as any,
  )({} as NextRequest)) as unknown as NextResponse;
}

async function driverStats(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['driver', 'admin', 'super_admin', 'manager']);
    if (!user) throw new AuthenticationError();

    const supa = createServiceClient();
    const driverId = user.id;

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startISO = startOfDay.toISOString();

    const { data: todaysOrders, error } = await supa
      .from('orders')
      .select('id, total, delivery_fee, tip, delivered_at, created_at')
      .eq('driver_id', driverId)
      .eq('status', 'delivered')
      .gte('delivered_at', startISO)
      .order('delivered_at', { ascending: false });

    if (error) {
      return fail(error as any);
    }

    const todayCount = todaysOrders?.length || 0;
    const todayEarnings = (todaysOrders || []).reduce(
      (s, o: any) => s + Number(o.delivery_fee || 0) + Number(o.tip || 0),
      0
    );

    const { count: totalCount } = await supa
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .eq('status', 'delivered');

    return ok({
      today_count: todayCount,
      today_earnings: Math.round(todayEarnings * 100) / 100,
      today_total_revenue: Math.round((todaysOrders || []).reduce((s, o: any) => s + Number(o.total || 0), 0) * 100) / 100,
      total_deliveries: totalCount || 0,
    });
  });
}

// Re-export fail for error handling
import { fail } from '@/lib/api/response';
