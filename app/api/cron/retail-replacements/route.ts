import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { createRefund } from '@/lib/services/refund-service';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest, expected: string): boolean {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return false;
  const provided = header.slice(7).trim();
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  if (req.nextUrl.searchParams.size > 0) {
    return NextResponse.json({ ok: false, error: 'query_parameters_not_allowed' }, { status: 400 });
  }
  if (!authorized(req, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const service = createServiceClient();
  const { data: expired, error: expiryError } = await service.rpc('expire_order_item_replacements', { p_now: new Date().toISOString() });
  if (expiryError) return NextResponse.json({ ok: false, error: expiryError.message }, { status: 500 });

  const { data: operator } = await service.from('users').select('id,role').eq('role', 'super_admin').eq('is_active', true).limit(1).maybeSingle();
  const { data: pending } = await service.from('order_financial_adjustments').select('id,order_id,replacement_id,amount_cents,status,payment_refund_id').in('status', ['pending', 'processing']).order('created_at').limit(50);
  let submitted = 0; let reconciled = 0; let failed = 0;
  for (const adjustment of pending ?? []) {
    try {
      if (adjustment.payment_refund_id) {
        const { data: refund } = await service.from('payment_refunds').select('status').eq('id', adjustment.payment_refund_id).maybeSingle();
        if (refund?.status === 'succeeded') { await service.from('order_financial_adjustments').update({ status: 'succeeded', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', adjustment.id).eq('status', 'processing'); reconciled += 1; }
        else if (['failed', 'canceled', 'requires_review'].includes(refund?.status ?? '')) { await service.from('order_financial_adjustments').update({ status: 'failed', failure_reason: `Refund status: ${refund?.status}`, updated_at: new Date().toISOString() }).eq('id', adjustment.id); failed += 1; }
        continue;
      }
      if (!operator) { logger.error('retail_replacement.refund_operator_missing', { adjustment_id: adjustment.id }); continue; }
      const result = await createRefund(service, { userId: operator.id, role: 'super_admin', permissions: ['payment_support'], requestId: `retail-adjustment:${adjustment.id}` }, { orderId: adjustment.order_id, mode: 'partial', amountCents: Number(adjustment.amount_cents), reason: 'item_unavailable', internalNote: `Automated retail substitution credit ${adjustment.replacement_id}`, clientIdempotencyKey: `retail-${adjustment.id}` });
      await service.from('order_financial_adjustments').update({ payment_refund_id: result.refund.id, status: result.refund.status === 'succeeded' ? 'succeeded' : 'processing', completed_at: result.refund.status === 'succeeded' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', adjustment.id).eq('status', 'pending');
      submitted += 1;
    } catch (cause) {
      logger.error('retail_replacement.refund_failed', { adjustment_id: adjustment.id, error: cause instanceof Error ? cause.message : String(cause) });
      await service.from('order_financial_adjustments').update({ status: 'failed', failure_reason: cause instanceof Error ? cause.message.slice(0, 500) : 'Unknown refund error', updated_at: new Date().toISOString() }).eq('id', adjustment.id);
      failed += 1;
    }
  }
  return NextResponse.json({ ok: true, expired: Array.isArray(expired) ? expired.length : 0, submitted, reconciled, failed });
}

export async function GET(req: NextRequest): Promise<NextResponse> { return POST(req); }
