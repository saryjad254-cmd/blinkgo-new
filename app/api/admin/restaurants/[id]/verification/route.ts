import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(['admin'], req);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = await props.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === 'approve' || body.action === 'reject' || body.action === 'suspend' ? body.action : null;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
  if (!action || ((action === 'reject' || action === 'suspend') && reason.length < 5)) {
    return NextResponse.json({ ok: false, error: 'Valid review action and reason required' }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const { data: restaurant, error: restaurantError } = await db.from('restaurants').select('id,owner_id,is_active').eq('id', id).maybeSingle();
    if (restaurantError || !restaurant) return NextResponse.json({ ok: false, error: 'Restaurant not found' }, { status: 404 });
    const now = new Date().toISOString();
    const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended';
    const { data: verification, error: verificationError } = await db.from('restaurant_verifications').update({ status: nextStatus, reviewed_by: auth.id, reviewed_at: now, rejection_reason: action === 'approve' ? null : reason, updated_at: now }).eq('restaurant_id', id).select().maybeSingle();
    if (verificationError || !verification) return NextResponse.json({ ok: false, error: safeErrorMessage(verificationError) }, { status: 400 });

    const publish = action === 'approve';
    const { error: publishError } = await db.from('restaurants').update({ is_active: publish, is_paused: false, updated_at: now }).eq('id', id);
    if (publishError) {
      await db.from('restaurant_verifications').update({ status: 'pending', reviewed_by: null, reviewed_at: null, rejection_reason: null, updated_at: now }).eq('restaurant_id', id);
      return NextResponse.json({ ok: false, error: safeErrorMessage(publishError) }, { status: 400 });
    }
    if (restaurant.owner_id) await db.from('users').update({ is_verified: publish }).eq('id', restaurant.owner_id);
    await recordAudit({ actor_id: auth.id, action: `restaurant.verification.${action}`, target_type: 'restaurant', target_id: id, metadata: { verification_status: nextStatus, published: publish, reason: reason || undefined } });
    return NextResponse.json({ ok: true, verification, is_active: publish });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}
