import { createHash, randomBytes } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

export type GroupOrderStatus = 'open' | 'locked' | 'completed' | 'cancelled' | 'expired';

export function newGroupInviteToken() {
  return randomBytes(24).toString('base64url');
}

export function hashGroupInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function loadGroupForUser(groupId: string, userId: string) {
  const service = createServiceClient();
  const { data: participant } = await service
    .from('group_order_participants')
    .select('id,group_order_id,user_id,display_name,is_host,joined_at')
    .eq('group_order_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!participant) return null;

  const [{ data: group }, { data: participants }, { data: items }] = await Promise.all([
    service.from('group_orders').select('id,restaurant_id,host_user_id,status,expires_at,locked_at,completed_order_id,created_at,updated_at,restaurants:restaurant_id(id,name,address,logo_url,cover_url)').eq('id', groupId).maybeSingle(),
    service.from('group_order_participants').select('id,user_id,display_name,is_host,joined_at').eq('group_order_id', groupId).order('joined_at'),
    service.from('group_order_items').select('id,participant_id,product_id,config_key,configuration,product_name,unit_price,quantity,created_at,updated_at').eq('group_order_id', groupId).order('created_at'),
  ]);
  if (!group) return null;
  let completedOrder: null | { id: string; order_number: string; status: string; fulfillment_type: string; created_at: string } = null;
  if (group.completed_order_id) {
    const { data: order } = await service.from('orders').select('id,order_number,status,fulfillment_type,created_at').eq('id', group.completed_order_id).maybeSingle();
    completedOrder = order ?? null;
  }
  return { group, participant, participants: participants ?? [], items: items ?? [], completed_order: completedOrder };
}

export function groupOrderIsOpen(group: { status: string; expires_at: string }) {
  return group.status === 'open' && new Date(group.expires_at).getTime() > Date.now();
}
