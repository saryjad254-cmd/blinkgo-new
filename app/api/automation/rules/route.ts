import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { recordAudit } from '@/lib/audit/audit-trail';
import { defaultRules } from '@/lib/integrations/automation/defaults';
import { safeErrorMessage } from '@/lib/api/safe-error';
import { parseAutomationRuleInput, validateAutomationOutboundUrls } from '@/lib/admin/automation-rule-input';
import { UnsafeOutboundUrlError } from '@/lib/security/outbound-url';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
  } catch {
    return NextResponse.json({ ok: true, rules: defaultRules, source: 'defaults' });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin']);
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const input = parseAutomationRuleInput(await req.json(), 'create');
    await validateAutomationOutboundUrls(input);
    const db = createServiceClient();
    const { data, error } = await db.from('automation_rules').insert({
      ...input,
    }).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    await recordAudit({ actor_id: auth.id, action: 'automation_rule.create', target_type: 'rule', target_id: data.id, metadata: { name: input.name } });
    return NextResponse.json({ ok: true, rule: data }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof UnsafeOutboundUrlError || e instanceof SyntaxError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}
