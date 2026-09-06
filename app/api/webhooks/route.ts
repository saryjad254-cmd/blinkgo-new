import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { getWebhookManager } from '@/lib/integrations/webhooks/manager';
import { recordAudit } from '@/lib/audit/audit-trail';
import { UnsafeOutboundUrlError, validateWebhookUrl } from '@/lib/security/outbound-url';
import { parseWebhookInput } from '@/lib/admin/webhook-input';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
    const body = (await req.json()) as Record<string, unknown>;
    const input = parseWebhookInput(body, 'create');
    if (typeof body.url !== 'string') throw new ValidationError('Webhook URL is required');
    const webhookUrl = await validateWebhookUrl(body.url);
    const manager = getWebhookManager();
    const created = await manager.create({
      name: input.name!,
      url: webhookUrl,
      secret: input.secret!,
      events: input.events!,
      enabled: input.enabled ?? true,
      description: input.description ?? undefined,
    });
    if (!created) return NextResponse.json({ ok: false, error: 'Failed to create' }, { status: 500 });
    await recordAudit({ actor_id: auth.id, action: 'webhook.create', target_type: 'webhook', target_id: created.id, metadata: { name: input.name, url: webhookUrl } });
    return NextResponse.json({ ok: true, webhook: { ...created, secret: '***' + created.secret.slice(-4) } });
  } catch (e) {
    if (e instanceof UnsafeOutboundUrlError || e instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
