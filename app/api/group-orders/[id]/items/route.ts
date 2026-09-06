import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { secureRoute } from '@/lib/api/security-helpers';
import { withSecurity } from '@/lib/api/security';
import { ok } from '@/lib/api/response';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { isValidUuid } from '@/lib/validation';
import { groupOrderIsOpen, loadGroupForUser } from '@/lib/group-orders';
import type { CartLineConfiguration } from '@/lib/cart-key';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return (await withSecurity(
    secureRoute('moderate', ['customer']),
    async (ctx, request) => {
      const { id } = await params;
      const body = await (request as NextRequest).json().catch(() => ({}));
      if (!isValidUuid(id) || !isValidUuid(body.product_id)) throw new ValidationError('INVALID_ITEM');
      const quantity = Number(body.quantity ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new ValidationError('INVALID_QUANTITY');
      const access = await loadGroupForUser(id, ctx.auth.user.id);
      if (!access) throw new NotFoundError('Group order');
      if (!groupOrderIsOpen(access.group)) throw new ConflictError('GROUP_ORDER_LOCKED');

      const service = createServiceClient();
      const { data: product } = await service.from('products').select('id,restaurant_id,name,is_available,is_active').eq('id', body.product_id).eq('restaurant_id', access.group.restaurant_id).maybeSingle();
      if (!product || product.is_available === false || product.is_active === false) throw new ValidationError('PRODUCT_UNAVAILABLE');
      const requestedConfiguration = (body.configuration ?? {}) as CartLineConfiguration;
      const validationResponse = await fetch(new URL('/api/cart/validate', request.url), { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') || '' }, body: JSON.stringify({ restaurant_id: access.group.restaurant_id, items: [{ product_id: product.id, quantity, ...requestedConfiguration }] }) });
      const validation = await validationResponse.json().catch(() => ({}));
      const line = validation.lines?.[0];
      if (!validationResponse.ok || validation.ok !== true || !line?.config_key) throw new ValidationError('INVALID_PRODUCT_CONFIGURATION');
      const configuration = line.configuration as CartLineConfiguration;
      const configKey = String(line.config_key);
      const unitPrice = Number(line.unit_price);
      const { data: existing } = await service.from('group_order_items').select('id,quantity').eq('participant_id', access.participant.id).eq('config_key', configKey).maybeSingle();
      if (existing) {
        const nextQuantity = Math.min(99, Number(existing.quantity) + quantity);
        const { data, error } = await service.from('group_order_items').update({ quantity: nextQuantity, unit_price: unitPrice, product_name: product.name, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('participant_id', access.participant.id).select().single();
        if (error) throw new Error('GROUP_ITEM_UPDATE_FAILED');
        return ok({ item: data });
      }
      const { data, error } = await service.from('group_order_items').insert({ group_order_id: id, participant_id: access.participant.id, product_id: product.id, config_key: configKey, configuration, product_name: product.name, unit_price: unitPrice, quantity }).select().single();
      if (error) throw new Error('GROUP_ITEM_CREATE_FAILED');
      return ok({ item: data });
    },
  )(req)) as unknown as NextResponse;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return (await withSecurity(secureRoute('moderate', ['customer']), async (ctx, request) => {
    const { id } = await params;
    const body = await (request as NextRequest).json().catch(() => ({}));
    const quantity = Number(body.quantity);
    if (!isValidUuid(id) || !isValidUuid(body.item_id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new ValidationError('INVALID_ITEM');
    const access = await loadGroupForUser(id, ctx.auth.user.id);
    if (!access) throw new NotFoundError('Group order');
    if (!groupOrderIsOpen(access.group)) throw new ConflictError('GROUP_ORDER_LOCKED');
    const service = createServiceClient();
    const { data, error } = await service.from('group_order_items').update({ quantity, updated_at: new Date().toISOString() }).eq('id', body.item_id).eq('participant_id', access.participant.id).select().maybeSingle();
    if (error || !data) throw new NotFoundError('Group order item');
    return ok({ item: data });
  })(req)) as unknown as NextResponse;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return (await withSecurity(secureRoute('moderate', ['customer']), async (ctx, request) => {
    const { id } = await params;
    const body = await (request as NextRequest).json().catch(() => ({}));
    if (!isValidUuid(id) || !isValidUuid(body.item_id)) throw new ValidationError('INVALID_ITEM');
    const access = await loadGroupForUser(id, ctx.auth.user.id);
    if (!access) throw new NotFoundError('Group order');
    if (!groupOrderIsOpen(access.group)) throw new ConflictError('GROUP_ORDER_LOCKED');
    const service = createServiceClient();
    const { data } = await service.from('group_order_items').delete().eq('id', body.item_id).eq('participant_id', access.participant.id).select('id').maybeSingle();
    if (!data) throw new NotFoundError('Group order item');
    return ok({ removed: true });
  })(req)) as unknown as NextResponse;
}
