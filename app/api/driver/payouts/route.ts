/**
 * Driver Payouts API
 * ──────────────────
 * GET  /api/driver/payouts   - List driver's payouts
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const usesLocalSupabaseMock = /localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '');

type DriverPayoutRow = {
  id: string;
  period_start: string;
  period_end: string;
  total_base?: number | string | null;
  total_tips?: number | string | null;
  total_payout?: number | string | null;
  total_orders?: number | string | null;
  status?: string | null;
  paid_at?: string | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['driver', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => driverPayouts(ctx.auth.user.id) as any,
  )(req)) as unknown as NextResponse;
}

async function driverPayouts(driverId: string): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('driver_payouts')
      .select('id,period_start,period_end,total_base,total_tips,total_payout,total_orders,status,paid_at')
      .eq('driver_id', driverId)
      .order('period_end', { ascending: false });

    if (error) {
      if (usesLocalSupabaseMock) return ok({ payouts: [] });
      logger.error('payouts fetch failed', { userId: driverId }, error);
      throw new Error('Failed to load payouts');
    }
    return ok({
      payouts: ((data ?? []) as DriverPayoutRow[]).map((payout) => ({
        id: payout.id,
        period_start: payout.period_start,
        period_end: payout.period_end,
        status: payout.status ?? 'pending',
        paid_at: payout.paid_at ?? null,
        base_payout: Number(payout.total_base ?? 0),
        tips_total: Number(payout.total_tips ?? 0),
        bonuses_total: 0,
        gross_payout: Number(payout.total_payout ?? 0),
        net_payout: Number(payout.total_payout ?? 0),
        delivery_count: Number(payout.total_orders ?? 0),
      })),
    });
  });
}
