import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { isDriverVerificationComplete } from '@/lib/driver/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiRole(['admin', 'super_admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServiceClient();
    if (params.id === auth.id) {
      return NextResponse.json({ ok: false, error: 'Your account is already active in this session' }, { status: 403 });
    }
    const { data: target, error: targetError } = await db.from('users').select('id, role').eq('id', params.id).maybeSingle();
    if (targetError) return NextResponse.json({ ok: false, error: safeErrorMessage(targetError) }, { status: 400 });
    if (!target) return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    if (['admin', 'super_admin'].includes(String(target.role)) && auth.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'Only a super admin can reactivate administrator accounts' }, { status: 403 });
    }
    if (target.role === 'driver') {
      let { data: driver } = await db.from('drivers').select('id,user_id,vehicle_type,is_approved').eq('user_id', params.id).maybeSingle();
      if (!driver) ({ data: driver } = await db.from('drivers').select('id,user_id,vehicle_type,is_approved').eq('id', params.id).maybeSingle());
      const { data: documents, error: documentsError } = await db
        .from('driver_documents')
        .select('document_type,status,uploaded_at')
        .eq('driver_id', params.id);
      if (documentsError || !driver || !isDriverVerificationComplete(driver.vehicle_type, documents ?? [])) {
        return NextResponse.json({ ok: false, error: 'Driver documents must all be approved before activation' }, { status: 409 });
      }
      await db.from('drivers').update({ is_approved: true, status: 'active', is_online: false, is_available: false }).eq('id', driver.id);
    }
    const { error } = await db.from('users').update({ is_active: true }).eq('id', params.id);
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    await recordAudit({ actor_id: auth.id, action: 'user.unsuspend', target_type: 'user', target_id: params.id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 * Without it, the App Router returns 404 for non-POST methods, which makes
 * the route look "missing" instead of "method-not-allowed".
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
