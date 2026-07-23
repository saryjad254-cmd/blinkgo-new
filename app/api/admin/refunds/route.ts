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
    const { data } = await svc
      .from('refunds')
      .select('*, orders(order_number, total, customer_id)')
      .order('created_at', { ascending: false });
    return ok({ refunds: data ?? [] });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.error!;
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const action = url.searchParams.get('action');
    if (!id) return ok({ processed: false });
    const svc = createServiceClient();
    if (action === 'process') {
      const { error } = await svc
        .from('refunds')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          processed_by: guard.auth?.user?.id,
        })
        .eq('id', id);
      if (error) {
        logger.error('Refund process failed', { id }, error);
        return ok({ processed: false });
      }
      // Mark order as refunded
      const { data: refund } = await svc.from('refunds').select('order_id, amount').eq('id', id).single();
      if (refund) {
        await svc.from('orders').update({
          refunded_at: new Date().toISOString(),
          refund_amount: refund.amount,
        }).eq('id', refund.order_id);
      }
      return ok({ processed: true });
    }
    return ok({ processed: false });
  });
}
