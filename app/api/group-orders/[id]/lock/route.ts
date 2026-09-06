import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { secureRoute } from '@/lib/api/security-helpers';
import { withSecurity } from '@/lib/api/security';
import { ok } from '@/lib/api/response';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { isValidUuid } from '@/lib/validation';
import { loadGroupForUser } from '@/lib/group-orders';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return (await withSecurity(secureRoute('moderate', ['customer']), async (ctx) => {
    const { id } = await params;
    if (!isValidUuid(id)) throw new NotFoundError('Group order');
    const access = await loadGroupForUser(id, ctx.auth.user.id);
    if (!access || !access.participant.is_host || access.group.host_user_id !== ctx.auth.user.id) throw new NotFoundError('Group order');
    if (access.group.status !== 'open') throw new ConflictError('GROUP_ORDER_NOT_OPEN');
    if (!access.items.length) throw new ConflictError('GROUP_ORDER_EMPTY');
    const service = createServiceClient();
    const lockedAt = new Date().toISOString();
    const { data, error } = await service.from('group_orders').update({ status: 'locked', locked_at: lockedAt, updated_at: lockedAt }).eq('id', id).eq('host_user_id', ctx.auth.user.id).eq('status', 'open').select('id,status,locked_at').maybeSingle();
    if (error || !data) throw new ConflictError('GROUP_ORDER_CHANGED');
    return ok({ group: data });
  })(req)) as unknown as NextResponse;
}
