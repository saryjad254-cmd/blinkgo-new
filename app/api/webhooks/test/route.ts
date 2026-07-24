import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { getWebhookManager } from '@/lib/integrations/webhooks/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    const manager = getWebhookManager();
    const result = await manager.test(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
