import { NextRequest, NextResponse } from 'next/server';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { isAutomationRuleId, parseAutomationRuleInput, validateAutomationOutboundUrls } from '@/lib/admin/automation-rule-input';
import { UnsafeOutboundUrlError } from '@/lib/security/outbound-url';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!isAutomationRuleId(params.id)) return NextResponse.json({ ok: false, error: 'Invalid rule id' }, { status: 400 });
  try {
    const input = parseAutomationRuleInput(await req.json(), 'update');
    await validateAutomationOutboundUrls(input);
    const db = createServiceClient();
    const { data, error } = await db.from('automation_rules').update({
      ...input,
      updated_at: new Date().toISOString(),
    }).eq('id', params.id).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: 'Rule not found' }, { status: 404 });
    await recordAudit({ actor_id: auth.id, action: 'automation_rule.update', target_type: 'rule', target_id: params.id, metadata: { fields: Object.keys(input) } });
    return NextResponse.json({ ok: true, rule: data });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof UnsafeOutboundUrlError || error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!isAutomationRuleId(params.id)) return NextResponse.json({ ok: false, error: 'Invalid rule id' }, { status: 400 });
  try {
    const db = createServiceClient();
    const { error } = await db.from('automation_rules').delete().eq('id', params.id);
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    await recordAudit({ actor_id: auth.id, action: 'automation_rule.delete', target_type: 'rule', target_id: params.id });
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
    headers: { Allow: 'PATCH, DELETE' },
  });
}
