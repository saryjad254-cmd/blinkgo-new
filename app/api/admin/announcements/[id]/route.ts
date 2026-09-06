import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireApiRole } from '@/lib/auth-helper';
import { recordAudit } from '@/lib/audit/audit-trail';
import { parseAnnouncementInput } from '@/lib/admin/announcement-input';
import { safeErrorMessage } from '@/lib/api/safe-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Context) {
  const admin = await requireApiRole(['admin', 'super_admin']);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  try {
    const changes = parseAnnouncementInput(await req.json(), true);
    const db = createServiceClient();
    const { data, error } = await db.from('system_announcements').update(changes).eq('id', id).select().single();
    if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: 'Announcement not found' }, { status: 404 });
    await recordAudit({
      actor_id: admin.id,
      action: 'announcement.update',
      target_type: 'announcement',
      target_id: id,
      metadata: { fields: Object.keys(changes) },
    });
    return NextResponse.json({ ok: true, announcement: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, context: Context) {
  const admin = await requireApiRole(['admin', 'super_admin']);
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const db = createServiceClient();
  const { data, error } = await db.from('system_announcements').delete().eq('id', id).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'Announcement not found' }, { status: 404 });
  await recordAudit({ actor_id: admin.id, action: 'announcement.delete', target_type: 'announcement', target_id: id });
  return NextResponse.json({ ok: true, deleted: id });
}

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'PATCH, DELETE' } });
}
