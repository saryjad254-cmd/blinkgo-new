/**
 * Customer Refund Request
 * ────────────────────────
 * POST /api/orders/[id]/refund
 * Body: { reason: string }
 *
 * Customer-only. Submits a refund request for an order.
 * After restaurant review/admin approval, the refund is processed.
 *
 * Refund rules:
 *  - Order must be 'delivered' or 'cancelled'
 *  - Within 7 days of order placement
 *  - One refund request per order
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFUND_WINDOW_DAYS = 7;
const REFUND_REASONS = [
  'food_quality',
  'wrong_order',
  'missing_items',
  'late_delivery',
  'damaged',
  'other',
] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Auth
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    // 2) Parse reason
    const body = await req.json().catch(() => ({}));
    const reasonKey = String(body.reason ?? '');
    if (!REFUND_REASONS.includes(reasonKey as any)) {
      throw new ValidationError('Invalid refund reason');
    }
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null;

    // 3) Get order
    const supabase = createServerClient();
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, customer_id, status, total, created_at')
      .eq('id', params.id)
      .single();

    if (orderErr || !order) throw new NotFoundError('Order not found');
    if (order.customer_id !== user.id) {
      throw new AuthorizationError('You can only request refunds for your own orders');
    }

    // 4) Check eligibility
    if (!['delivered', 'cancelled'].includes(order.status)) {
      throw new ValidationError(`Refunds can only be requested for delivered or cancelled orders (current: ${order.status})`);
    }

    const orderDate = new Date(order.created_at);
    const now = new Date();
    const daysSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceOrder > REFUND_WINDOW_DAYS) {
      throw new ValidationError(`Refund window has expired (${REFUND_WINDOW_DAYS} days)`);
    }

    // 5) Check no existing refund
    const svc = createServiceClient();
    const { data: existing } = await svc
      .from('refunds')
      .select('id, status')
      .eq('order_id', params.id)
      .maybeSingle();

    if (existing) {
      throw new ConflictError(`A refund request already exists for this order (status: ${existing.status})`);
    }

    // 6) Create refund request
    const { data: refund, error: refundErr } = await svc
      .from('refunds')
      .insert({
        order_id: params.id,
        amount: order.total,
        reason: `${reasonKey}${notes ? `: ${notes}` : ''}`,
        status: 'pending',
      })
      .select()
      .single();

    if (refundErr || !refund) {
      logger.error('Refund creation failed', { orderId: params.id, userId: user.id }, refundErr);
      throw new Error('Failed to create refund request');
    }

    // 7) Notify admins (in-app)
    try {
      const { data: admins } = await svc.from('users').select('id').in('role', ['admin', 'super_admin']);
      if (admins && admins.length > 0) {
        const notifications = admins.map((a: any) => ({
          user_id: a.id,
          type: 'refund_request',
          title: 'Neue Rückerstattungsanfrage',
          body: `Bestellung #${order.id.slice(0, 8)} · €${order.total.toFixed(2)}`,
          data: { refund_id: refund.id, order_id: order.id },
        }));
        await svc.from('notifications').insert(notifications);
      }
    } catch (e) {
      // Non-fatal
      logger.warn('Failed to notify admins of refund', { refundId: refund.id, error: (e as Error).message });
    }

    return ok({ refund });
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    const supabase = createServerClient();
    const { data: refunds, error } = await supabase
      .from('refunds')
      .select('*')
      .eq('order_id', params.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Failed to fetch refunds');
    return ok({ refunds: refunds ?? [] });
  });
}
