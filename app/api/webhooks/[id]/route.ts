import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { recordAudit } from '@/lib/audit/audit-trail';
import { parseWebhookInput } from '@/lib/admin/webhook-input';
import { ValidationError } from '@/lib/errors';
import { getWebhookManager } from '@/lib/integrations/webhooks/manager';
import { UnsafeOutboundUrlError, validateWebhookUrl } from '@/lib/security/outbound-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function sanitized(webhook: Awaited<ReturnType<ReturnType<typeof getWebhookManager>['get']>>) {
  if (!webhook) return null;
  return { ...webhook, secret: webhook.secret ? `***${webhook.secret.slice(-4)}` : '' };
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const manager = getWebhookManager();
    const existing = await manager.get(id);
    if (!existing) return NextResponse.json({ ok: false, error: 'Webhook not found' }, { status: 404 });

    const input = parseWebhookInput(await req.json(), 'update');
    if (input.url) input.url = await validateWebhookUrl(input.url);
    const updated = await manager.update(id, input);
    if (!updated) return NextResponse.json({ ok: false, error: 'Failed to update webhook' }, { status: 500 });

    await recordAudit({
      actor_id: auth.id,
      action: 'webhook.update',
      target_type: 'webhook',
      target_id: id,
      metadata: { fields: Object.keys(input).filter((field) => field !== 'secret') },
    });
    return NextResponse.json({ ok: true, webhook: sanitized(updated) });
  } catch (error) {
    if (error instanceof UnsafeOutboundUrlError || error instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: 'Failed to update webhook' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const manager = getWebhookManager();
  const existing = await manager.get(id);
  if (!existing) return NextResponse.json({ ok: false, error: 'Webhook not found' }, { status: 404 });

  if (!(await manager.delete(id))) {
    return NextResponse.json({ ok: false, error: 'Failed to delete webhook' }, { status: 500 });
  }
  await recordAudit({
    actor_id: auth.id,
    action: 'webhook.delete',
    target_type: 'webhook',
    target_id: id,
    metadata: { name: existing.name },
  });
  return NextResponse.json({ ok: true, deleted: id });
}
