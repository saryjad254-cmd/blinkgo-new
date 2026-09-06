import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const dynamic = 'force-dynamic';
const ApprovalEditsSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  price: z.number().positive().max(9999).optional(),
  image_url: z.string().trim().url().max(2048).optional(),
}).strict();
const ReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), id: z.string().uuid(), edits: ApprovalEditsSchema.optional() }),
  z.object({ action: z.literal('reject'), id: z.string().uuid(), reason: z.string().trim().min(3).max(1000) }),
]);

export async function GET(req: NextRequest) {
  const admin = await requireApiRole(['manager', 'admin', 'super_admin']);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status');
  const service = createServiceClient();
  let query = service.from('product_requests').select('*, restaurant:restaurant_id(id,name)').order('created_at', { ascending: status === 'pending' });
  if (status && ['pending', 'approved', 'rejected'].includes(status)) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  return NextResponse.json({ ok: true, requests: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireApiRole(['manager', 'admin', 'super_admin']);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const parsed = ReviewSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid review' }, { status: 400 });
  const service = createServiceClient();
  const now = new Date().toISOString();
  if (parsed.data.action === 'reject') {
    const { data, error } = await service.from('product_requests').update({ status: 'rejected', rejection_reason: parsed.data.reason, reviewed_by: admin.id, reviewed_at: now, updated_at: now }).eq('id', parsed.data.id).eq('status', 'pending').select('id').maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: 'Request was already reviewed' }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  const { data: productId, error } = await service.rpc('approve_product_request', {
    p_request_id: parsed.data.id,
    p_edits: parsed.data.edits ?? {},
    p_actor_id: admin.id,
  });
  if (error) {
    const conflict = /already_reviewed|request_not_found/i.test(error.message);
    return NextResponse.json({ ok: false, error: conflict ? 'Request was already reviewed' : safeErrorMessage(error) }, { status: conflict ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, product_id: productId });
}
