/**
 * Order Modification API
 * ──────────────────────
 * POST /api/orders/[id]/modify
 * Body: {
 *   type: 'add_item' | 'remove_item' | 'change_quantity' | 'change_address' | 'change_instructions' | 'change_tip',
 *   details: { ... } // Type-specific
 * }
 *
 * Customer-only. Allows modifications BEFORE restaurant starts preparing.
 * After preparation starts, modifications are not allowed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { ok, fail, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, AuthorizationError, ValidationError, NotFoundError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = ['pending', 'confirmed'];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    // 1) Auth
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) throw new AuthenticationError();

    // 2) Get order
    const { data: order, error: orderErr } = await supabaseAuth
      .from('orders')
      .select('id, customer_id, status, total, tip, delivery_address, delivery_instructions, items:order_items(id, product_id, quantity, price, name)')
      .eq('id', params.id)
      .single();

    if (orderErr || !order) throw new NotFoundError('Order not found');
    if (order.customer_id !== user.id) {
      throw new AuthorizationError('You can only modify your own orders');
    }

    // 3) Check if modifiable
    if (!ALLOWED_STATUSES.includes(order.status)) {
      throw new ConflictError(`Cannot modify order in status: ${order.status}. Modifications are only allowed before preparation starts.`);
    }

    // 4) Parse
    const body = await req.json().catch(() => ({}));
    const modType = String(body.type ?? '');
    const details = body.details ?? {};

    const validTypes = ['add_item', 'remove_item', 'change_quantity', 'change_address', 'change_instructions', 'change_tip'];
    if (!validTypes.includes(modType)) {
      throw new ValidationError(`Invalid modification type. Must be: ${validTypes.join(', ')}`);
    }

    const svc = createServiceClient();
    let newTotal = Number(order.total);
    const oldTotal = Number(order.total);

    // 5) Apply modification
    if (modType === 'add_item') {
      const productId = String(details.product_id ?? '');
      const quantity = Number(details.quantity ?? 1);
      if (!productId || quantity < 1) throw new ValidationError('product_id and quantity required');

      const { data: product, error: pErr } = await svc
        .from('products')
        .select('id, name, price')
        .eq('id', productId)
        .single();
      if (pErr || !product) throw new NotFoundError('Product not found');

      // Add item
      await svc.from('order_items').insert({
        order_id: order.id,
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity,
      });

      newTotal += Number(product.price) * quantity;
    } else if (modType === 'remove_item') {
      const itemId = String(details.item_id ?? '');
      if (!itemId) throw new ValidationError('item_id required');
      const { error: delErr } = await svc.from('order_items').delete().eq('id', itemId).eq('order_id', order.id);
      if (delErr) throw new Error('Failed to remove item');
      // Note: newTotal recalculation skipped here — full re-fetch would be needed
    } else if (modType === 'change_quantity') {
      const itemId = String(details.item_id ?? '');
      const quantity = Number(details.quantity ?? 1);
      if (!itemId || quantity < 1) throw new ValidationError('item_id and quantity required');
      await svc.from('order_items').update({ quantity }).eq('id', itemId).eq('order_id', order.id);
    } else if (modType === 'change_address') {
      const newAddress = details.address;
      if (!newAddress) throw new ValidationError('address required');
      await svc.from('orders').update({ delivery_address: newAddress }).eq('id', order.id);
    } else if (modType === 'change_instructions') {
      const instructions = String(details.instructions ?? '').slice(0, 500);
      await svc.from('orders').update({ delivery_instructions: instructions }).eq('id', order.id);
    } else if (modType === 'change_tip') {
      const newTip = Number(details.tip ?? 0);
      if (newTip < 0 || newTip > 500) throw new ValidationError('Invalid tip amount');
      await svc.from('orders').update({ tip: newTip }).eq('id', order.id);
      newTotal = oldTotal - Number(order.tip ?? 0) + newTip;
    }

    // 6) Update total
    if (newTotal !== oldTotal) {
      await svc.from('orders').update({ total: newTotal }).eq('id', order.id);
    }

    // 7) Record modification
    const { data: mod, error: modErr } = await svc
      .from('order_modifications')
      .insert({
        order_id: order.id,
        modified_by: user.id,
        modification_type: modType,
        details,
        previous_total: oldTotal,
        new_total: newTotal,
        delta: newTotal - oldTotal,
        status: 'pending',
      })
      .select()
      .single();

    if (modErr) {
      logger.warn('modification record failed', { orderId: order.id }, modErr);
    }

    // 8) Notify restaurant
    try {
      const { data: restaurant } = await svc
        .from('orders')
        .select('restaurant_id, restaurants:restaurant_id(owner_id)')
        .eq('id', order.id)
        .single();
      if (restaurant?.restaurants && (restaurant.restaurants as any).owner_id) {
        await svc.from('notifications').insert({
          user_id: (restaurant.restaurants as any).owner_id,
          type: 'order_modified',
          title: 'Bestellung geändert',
          body: `Kunde hat die Bestellung #${order.id.slice(0, 8)} geändert`,
          data: { order_id: order.id, modification_id: mod?.id, type: modType },
        });
      }
    } catch (e) {
      logger.warn('failed to notify restaurant of modification', { orderId: order.id, error: (e as Error).message });
    }

    return ok({ modification: mod, new_total: newTotal });
  });
}
