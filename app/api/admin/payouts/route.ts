/**
 * Admin: Driver Payouts Management
 * ────────────────────────────────
 * GET  /api/admin/payouts        - List all payouts
 * POST /api/admin/payouts        - Create new payout period
 * POST /api/admin/payouts?id=X   - Update payout (mark paid, etc.)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { requireApiRole } from '@/lib/auth-helper';
import { audit } from '@/lib/services/audit-log';
import { AuthorizationError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { computeEarnings } from '@/lib/services/driver-earnings';
import { postDriverPayoutFinancialJournal } from '@/lib/finance/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('lenient', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async () => listPayouts() as any,
  )(req)) as unknown as NextResponse;
}

async function listPayouts(): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin', 'manager']);
    if (!user) throw new AuthorizationError('Admin access required');

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('driver_payouts')
      .select('*, users!driver_payouts_driver_id_fkey(name, email, phone)')
      .order('period_end', { ascending: false })
      .limit(100);

    if (error) {
      logger.warn('admin payouts fetch failed', {}, error);
      return ok({ payouts: [] });
    }
    return ok({ payouts: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return (await withSecurity(
    secureRoute('strict', ['admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (_ctx, r) => upsertPayout(r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function upsertPayout(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const user = await requireApiRole(['admin', 'super_admin', 'manager']);
    if (!user) throw new AuthorizationError('Admin access required');

    const url = new URL(req.url);
    const payoutId = url.searchParams.get('id');
    const body = await req.json().catch(() => ({}));

    const svc = createServiceClient();

    if (payoutId) {
      const allowedStatuses = new Set(['pending', 'processing', 'paid', 'failed', 'cancelled']);
      if (body.status && !allowedStatuses.has(String(body.status))) {
        throw new ValidationError('Invalid payout status');
      }
      if (body.status === 'paid' && !String(body.payment_reference ?? '').trim()) {
        throw new ValidationError('payment_reference is required when marking a payout paid');
      }
      const updates: Record<string, unknown> = {};
      if (body.status) updates.status = body.status;
      if (body.status === 'paid') updates.paid_at = body.paid_at ?? new Date().toISOString();
      else if (body.paid_at) updates.paid_at = body.paid_at;
      if (body.payment_reference) updates.payment_reference = body.payment_reference;
      if (body.payment_method) updates.payment_method = body.payment_method;
      if (body.notes !== undefined) updates.notes = body.notes;

      const { data, error } = await svc
        .from('driver_payouts')
        .update(updates)
        .eq('id', payoutId)
        .select()
        .single();

      if (error) {
        logger.error('payout update failed', { payoutId }, error);
        throw new Error('Failed to update payout');
      }
      await audit('ADMIN_CONFIG_CHANGED', {
        severity: 'warn',
        userId: user.id,
        userRole: user.role,
        resource: 'driver_payout',
        resourceId: payoutId,
        metadata: { updates: Object.keys(updates) },
      });
      const ledger = data.status === 'paid'
        ? await postDriverPayoutFinancialJournal({
            id: data.id, driver_id: data.driver_id, net_payout: data.total_payout,
            payment_reference: data.payment_reference, paid_at: data.paid_at,
          })
        : { posted: false, reason: 'not_paid' as const };
      return ok({ payout: data, ledger });
    }

    const driverId = String(body.driver_id ?? '');
    const periodStart = new Date(body.period_start ?? Date.now() - 7 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(body.period_end ?? Date.now());

    if (!driverId) throw new ValidationError('driver_id is required');

    const { data: orders, error: ordersErr } = await svc
      .from('orders')
      .select('id, delivery_fee, tip, total, status, delivered_at, restaurant_latitude, restaurant_longitude, customer_latitude, customer_longitude')
      .eq('driver_id', driverId)
      .gte('delivered_at', periodStart.toISOString())
      .lte('delivered_at', periodEnd.toISOString())
      .eq('status', 'delivered');

    if (ordersErr) {
      logger.error('payout calculation failed', { driverId }, ordersErr);
      throw new Error('Failed to calculate payout');
    }

    const deliveryCount = orders?.length ?? 0;
    const basePayout = (orders ?? []).reduce((sum, order) => sum + computeEarnings({ ...order, tip: 0 }).base, 0);
    const tipsTotal = (orders ?? []).reduce((sum, o) => sum + Number(o.tip ?? 0), 0);
    const grossPayout = basePayout + tipsTotal;
    const netPayout = grossPayout;

    const { data, error } = await svc
      .from('driver_payouts')
      .insert({
        driver_id: driverId,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        total_base: basePayout,
        total_tips: tipsTotal,
        total_payout: netPayout,
        total_orders: deliveryCount,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !data) {
      logger.error('payout creation failed', { driverId }, error);
      throw new Error('Failed to create payout');
    }
    await audit('ADMIN_CONFIG_CHANGED', {
      severity: 'info',
      userId: user.id,
      userRole: user.role,
      resource: 'driver_payout',
      resourceId: data.id,
      metadata: { driver_id: driverId, period_start: periodStart.toISOString(), period_end: periodEnd.toISOString(), gross_payout: grossPayout },
    });
    return ok({ payout: data });
  });
}
