import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { secureRoute } from '@/lib/api/security-helpers';
import { withSecurity } from '@/lib/api/security';
import { ok } from '@/lib/api/response';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { groupOrderIsOpen, hashGroupInviteToken } from '@/lib/group-orders';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return (await withSecurity(
    secureRoute('moderate', ['customer']),
    async (ctx, request) => {
      const body = await (request as NextRequest).json().catch(() => ({}));
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      const displayName = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, 80) : '';
      if (token.length < 20 || !displayName) throw new ValidationError('INVALID_INVITE');
      const service = createServiceClient();
      const { data: group } = await service.from('group_orders').select('id,restaurant_id,host_user_id,status,expires_at').eq('invite_token_hash', hashGroupInviteToken(token)).maybeSingle();
      if (!group) throw new NotFoundError('Group order');
      if (!groupOrderIsOpen(group)) throw new ConflictError('GROUP_ORDER_CLOSED');
      const { data: existing } = await service.from('group_order_participants').select('id').eq('group_order_id', group.id).eq('user_id', ctx.auth.user.id).maybeSingle();
      if (!existing) {
        const { error } = await service.from('group_order_participants').insert({ group_order_id: group.id, user_id: ctx.auth.user.id, display_name: displayName, is_host: false });
        if (error) throw new Error('GROUP_JOIN_FAILED');
      }
      return ok({ group_id: group.id, redirect: `/group-order/${group.id}` });
    },
  )(req)) as unknown as NextResponse;
}
