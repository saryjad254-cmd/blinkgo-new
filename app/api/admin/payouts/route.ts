/**
 * Admin: Driver Payouts Management
 * ────────────────────────────────
 * GET  /api/admin/payouts        - List all payouts
 * POST /api/admin/payouts        - Create new payout period
 * POST /api/admin/payouts?id=X   - Update payout (mark paid, etc.)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ValidationError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { DRIVER_DELIVERY_SHARE } from '@/lib/config/fees';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const supabase = createServerClient();
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
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const { data: profile } = await supabaseAuth
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      throw new AuthorizationError('Admin access required');
    }

    const url = new URL(req.url);
    const payoutId = url.searchParams.get('id');
    const body = await req.json().catch(() => ({}));

    const svc = createServiceClient();

    // Update existing payout
    if (payoutId) {
      const updates: any = {};
      if (body.status) updates.status = body.status;
      if (body.paid_at) updates.paid_at = body.paid_at;
      if (body.payment_reference) updates.payment_reference = body.payment_reference;
      if (body.payment_method) updates.payment_method = body.payment_method;
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.adjustments !== undefined) updates.adjustments = body.adjustments;

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
      return ok({ payout: data });
    }

    // Generate new payout period for a driver
    const driverId = String(body.driver_id ?? '');
    const periodStart = new Date(body.period_start ?? Date.now() - 7 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(body.period_end ?? Date.now());

    if (!driverId) throw new ValidationError('driver_id is required');

    // Calculate payout from orders in the period
    const { data: orders, error: ordersErr } = await svc
      .from('orders')
      .select('id, delivery_fee, tip, total, status, delivered_at')
      .eq('driver_id', driverId)
      .gte('delivered_at', periodStart.toISOString())
      .lte('delivered_at', periodEnd.toISOString())
      .eq('status', 'delivered');

    if (ordersErr) {
      logger.error('payout calculation failed', { driverId }, ordersErr);
      throw new Error('Failed to calculate payout');
    }

    const deliveryCount = orders?.length ?? 0;
    const basePayout = (orders ?? []).reduce((sum, o) => sum + Number(o.delivery_fee ?? 0) * DRIVER_DELIVERY_SHARE, 0);
    const tipsTotal = (orders ?? []).reduce((sum, o) => sum + Number(o.tip ?? 0), 0);
    const grossPayout = basePayout + tipsTotal;
    const netPayout = grossPayout;

    const { data, error } = await svc
      .from('driver_payouts')
      .insert({
        driver_id: driverId,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        base_payout: basePayout,
        tips_total: tipsTotal,
        bonuses_total: 0,
        gross_payout: grossPayout,
        net_payout: netPayout,
        order_count: deliveryCount,
        delivery_count: deliveryCount,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !data) {
      logger.error('payout creation failed', { driverId }, error);
      throw new Error('Failed to create payout');
    }

    return ok({ payout: data });
  });
}
