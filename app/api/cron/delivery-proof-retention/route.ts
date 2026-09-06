import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { DELIVERY_PROOF_BUCKET } from '@/lib/driver/delivery-outcome-policy';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const service = createServiceClient();
  const { data: expired, error } = await service
    .from('order_delivery_proofs')
    .select('order_id,storage_path')
    .is('deleted_at', null)
    .lte('expires_at', new Date().toISOString())
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: 'Retention query failed' }, { status: 500 });

  let deleted = 0;
  const failed: string[] = [];
  for (const proof of expired ?? []) {
    const { error: removeError } = await service.storage.from(DELIVERY_PROOF_BUCKET).remove([proof.storage_path]);
    if (removeError) { failed.push(proof.order_id); continue; }
    const { error: updateError } = await service.from('order_delivery_proofs').update({ deleted_at: new Date().toISOString() }).eq('order_id', proof.order_id).is('deleted_at', null);
    if (updateError) failed.push(proof.order_id);
    else deleted += 1;
  }
  logger.info('cron.delivery-proof-retention.completed', { scanned: expired?.length ?? 0, deleted, failed: failed.length });
  return NextResponse.json({ ok: failed.length === 0, scanned: expired?.length ?? 0, deleted, failed });
}

export const POST = GET;
