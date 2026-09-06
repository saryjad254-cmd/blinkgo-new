import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { secureRoute } from '@/lib/api/security-helpers';
import { withSecurity } from '@/lib/api/security';
import { created, ok } from '@/lib/api/response';
import { ValidationError } from '@/lib/errors';
import { isValidUuid } from '@/lib/validation';
import { hashGroupInviteToken, newGroupInviteToken } from '@/lib/group-orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return (await withSecurity(
    secureRoute('moderate', ['customer']),
    async (ctx, request) => {
      const body = await (request as NextRequest).json().catch(() => ({}));
      if (!isValidUuid(body.restaurant_id)) throw new ValidationError('INVALID_RESTAURANT_ID');
      const service = createServiceClient();
      const { data: restaurant } = await service.from('restaurants').select('id,name,is_active,is_paused,is_hidden').eq('id', body.restaurant_id).maybeSingle();
      if (!restaurant || restaurant.is_active === false || restaurant.is_paused === true || restaurant.is_hidden === true) throw new ValidationError('RESTAURANT_UNAVAILABLE');

      const token = newGroupInviteToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const { data: group, error } = await service.from('group_orders').insert({ restaurant_id: restaurant.id, host_user_id: ctx.auth.user.id, invite_token_hash: hashGroupInviteToken(token), status: 'open', expires_at: expiresAt }).select('id,restaurant_id,host_user_id,status,expires_at,created_at').single();
      if (error || !group) throw new Error('GROUP_CREATE_FAILED');
      const { error: participantError } = await service.from('group_order_participants').insert({ group_order_id: group.id, user_id: ctx.auth.user.id, display_name: ctx.auth.user.name || 'Host', is_host: true });
      if (participantError) {
        await service.from('group_orders').delete().eq('id', group.id);
        throw new Error('GROUP_HOST_CREATE_FAILED');
      }
      return created({ group, invite_token: token, invite_path: `/group-order/join/${token}` });
    },
  )(req)) as unknown as NextResponse;
}

export async function GET(req: NextRequest) {
  return (await withSecurity(
    secureRoute('lenient', ['customer']),
    async (ctx) => {
      const service = createServiceClient();
      const { data: memberships } = await service.from('group_order_participants').select('group_order_id').eq('user_id', ctx.auth.user.id);
      const ids = (memberships ?? []).map((row) => row.group_order_id);
      if (!ids.length) return ok({ groups: [] });
      const { data } = await service.from('group_orders').select('id,restaurant_id,host_user_id,status,expires_at,created_at,restaurants:restaurant_id(id,name)').in('id', ids).order('created_at', { ascending: false });
      return ok({ groups: data ?? [] });
    },
  )(req)) as unknown as NextResponse;
}
