import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { getAuditLog } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const actor_id = url.searchParams.get('actor_id') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const target_type = url.searchParams.get('target_type') || undefined;

  try {
    const result = await getAuditLog({ limit, offset, actor_id, action, target_type });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
