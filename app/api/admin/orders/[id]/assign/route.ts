/**
 * Admin: Manual Order Assignment
 * ───────────────────────────────
 * POST /api/admin/orders/[id]/assign
 * Body: { driver_id: string }
 *
 * Manually assign a driver to an order (override auto-dispatch).
 * Admin-only operation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ValidationError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Auth
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    // 2) Verify admin
    const { data: profile } = await supabaseAuth
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      throw new AuthorizationError('Admin access required');
    }

    // 3) Parse
    const body = await req.json().catch(() => ({}));
    const driverId = String(body.driver_id ?? '');
    if (!driverId) throw new ValidationError('driver_id is required');

    // 4) Verify driver is online
    const svc = createServiceClient();
    const { data: driver, error: driverErr } = await svc
      .from('driver_status')
      .select('is_online, last_location_lat, last_location_lng')
      .eq('driver_id', driverId)
      .single();

    if (driverErr || !driver) {
      throw new NotFoundError('Driver not found or not registered');
    }
    if (!driver.is_online) {
      throw new ValidationError('Driver is offline and cannot accept orders');
    }

    // 5) Get order
    const { data: order, error: orderErr } = await svc
      .from('orders')
      .select('id, status, driver_id')
      .eq('id', params.id)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order not found');
    }
    if (order.status !== 'pending' && order.status !== 'confirmed') {
      throw new ValidationError(`Cannot assign order in status: ${order.status}`);
    }
    if (order.driver_id) {
      throw new ValidationError('Order is already assigned to a driver');
    }

    // 6) Update order
    const { error: updateErr } = await svc
      .from('orders')
      .update({
        driver_id: driverId,
        accepted_at: new Date().toISOString(),
        status: 'confirmed',
      })
      .eq('id', params.id);

    if (updateErr) {
      logger.error('Manual order assign failed', { orderId: params.id, driverId }, updateErr);
      throw new Error('Failed to assign driver');
    }

    // 7) Notify driver
    try {
      await svc.from('notifications').insert({
        user_id: driverId,
        type: 'order_assigned',
        title: 'Neue Bestellung zugewiesen',
        body: `Bestellung #${order.id.slice(0, 8)} wurde dir manuell zugewiesen`,
        data: { order_id: order.id, assigned_by_admin: true },
      });
    } catch (e) {
      logger.warn('Failed to notify driver of manual assignment', { orderId: params.id, driverId, error: (e as Error).message });
    }

    return ok({ assigned: true, driver_id: driverId });
  });
}
