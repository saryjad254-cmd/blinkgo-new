import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { getWebhookManager } from '@/lib/integrations/webhooks/manager';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const manager = getWebhookManager();
  const webhooks = await manager.list();
  // Don't expose secrets in the list
  const sanitized = webhooks.map((w) => ({ ...w, secret: w.secret ? '***' + w.secret.slice(-4) : '' }));
  return NextResponse.json({ ok: true, webhooks: sanitized });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.url || !body.secret || !body.name) {
      return NextResponse.json({ ok: false, error: 'url, secret, name required' }, { status: 400 });
    }
    const manager = getWebhookManager();
    const created = await manager.create({
      name: body.name,
      url: body.url,
      secret: body.secret,
      events: body.events || ['*'],
      enabled: body.enabled ?? true,
      description: body.description,
    });
    if (!created) return NextResponse.json({ ok: false, error: 'Failed to create' }, { status: 500 });
    await recordAudit({ actor_id: auth.id, action: 'webhook.create', target_type: 'webhook', target_id: created.id, metadata: { name: body.name, url: body.url } });
    return NextResponse.json({ ok: true, webhook: { ...created, secret: '***' + created.secret.slice(-4) } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
