import { NextRequest, NextResponse } from 'next/server';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServiceClient();
    const { data, error } = await db.from('automation_rules').update({
      name: body.name,
      description: body.description,
      enabled: body.enabled,
      trigger: body.trigger,
      conditions: body.conditions,
      actions: body.actions,
      time_window_minutes: body.time_window_minutes,
      aggregate: body.aggregate,
      max_executions_per_hour: body.max_executions_per_hour,
      cooldown_minutes: body.cooldown_minutes,
      updated_at: new Date().toISOString(),
    }).eq('id', params.id).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    await recordAudit({ actor_id: auth.id, action: 'automation_rule.update', target_type: 'rule', target_id: params.id, metadata: { enabled: body.enabled } });
    return NextResponse.json({ ok: true, rule: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServiceClient();
    const { error } = await db.from('automation_rules').delete().eq('id', params.id);
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    await recordAudit({ actor_id: auth.id, action: 'automation_rule.delete', target_type: 'rule', target_id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
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
