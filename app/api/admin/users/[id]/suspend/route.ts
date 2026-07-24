import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServiceClient();
    const { error } = await db.from('users').update({ is_active: false }).eq('id', params.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await recordAudit({ actor_id: auth.id, action: 'user.suspend', target_type: 'user', target_id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
