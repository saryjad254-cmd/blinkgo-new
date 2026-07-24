import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { defaultRules } from '@/lib/integrations/automation/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServiceClient();
    const { data, error } = await db.from('automation_rules').select('*').order('created_at', { ascending: false });
    if (error || !data) {
      // Return defaults
      return NextResponse.json({ ok: true, rules: defaultRules, source: 'defaults' });
    }
    return NextResponse.json({ ok: true, rules: data, source: 'db' });
  } catch (e) {
    return NextResponse.json({ ok: true, rules: defaultRules, source: 'defaults' });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServiceClient();
    const { data, error } = await db.from('automation_rules').insert({
      name: body.name,
      description: body.description,
      enabled: body.enabled ?? true,
      trigger: body.trigger,
      conditions: body.conditions || [],
      time_window_minutes: body.time_window_minutes,
      aggregate: body.aggregate,
      actions: body.actions || [],
      max_executions_per_hour: body.max_executions_per_hour,
      cooldown_minutes: body.cooldown_minutes,
    }).select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await recordAudit({ actor_id: auth.id, action: 'automation_rule.create', target_type: 'rule', target_id: data.id, metadata: { name: body.name } });
    return NextResponse.json({ ok: true, rule: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
