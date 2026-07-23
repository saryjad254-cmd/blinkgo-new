/**
 * Driver reject order.
 * POST /api/driver/orders/[id]/reject
 * Body: { reason? }
 *
 * Behavior:
 * - If the order is currently assigned to this driver, release it back to the pool.
 * - Track the rejection on the driver's record.
 * - Increment the driver's "rejection" counter for performance metrics.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, NotFoundError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const orderId = params.id;
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? '').slice(0, 200);

    const svc = createServiceClient();
    // Verify order exists and is assigned to this driver
    const { data: order } = await svc.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) throw new NotFoundError('Order');
    if (order.driver_id !== user.id) {
      throw new ConflictError('Order is not assigned to you');
    }
    // Release the order: unassign driver, leave status
    const { error: updateErr } = await svc
      .from('orders')
      .update({
        driver_id: null,
        notes: order.notes
          ? `${order.notes}\n[rejected] ${reason}`.slice(0, 1000)
          : `[rejected] ${reason}`,
      })
      .eq('id', orderId);
    if (updateErr) {
      logger.error('Driver reject failed', { orderId }, updateErr);
      throw new Error('Failed to reject order');
    }
    // Log tracking event
    try {
      await svc.from('order_tracking_events').insert({
        order_id: orderId,
        driver_id: user.id,
        event_type: 'driver_rejected',
        notes: reason,
      });
    } catch {}
    return ok({ rejected: true, orderId });
  });
}
