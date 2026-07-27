import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { withSecurity, HandlerContext } from '@/lib/api/security';
import { ok, fail } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

/**
 * v81 SECURITY HARDENING — orders/[id]/reorder
 *
 * Wrapped in withSecurity + uses the canonical `assertCanReadOrder`
 * helper for ownership. The previous implementation looked up the
 * role inline and only matched `admin` (not `super_admin`/`manager`).
 */
async function reorderHandler(
  ctx: HandlerContext,
  orderId: string,
): Promise<NextResponse> {
  const supabase = createServiceClient();
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, restaurant_id, customer_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr || !order) return fail(new Error('Order not found'));

  // IDOR check: only the original customer, the assigned driver, the
  // restaurant owner, or an admin can reorder.
  const ADMIN = ['admin', 'super_admin', 'manager'].includes(ctx.auth.user.role);
  const isCustomer = order.customer_id === ctx.auth.user.id;
  if (!isCustomer && !ADMIN) {
    const { data: rest } = await supabase
      .from('restaurants')
      .select('owner_id')
      .eq('id', order.restaurant_id)
      .maybeSingle();
    const isOwner = rest?.owner_id === ctx.auth.user.id;
    const { data: ordr } = await supabase
      .from('orders')
      .select('driver_id')
      .eq('id', orderId)
      .maybeSingle();
    const isDriver = ordr?.driver_id === ctx.auth.user.id;
    if (!isOwner && !isDriver) {
      return fail(new Error('Forbidden'));
    }
  }

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);
  if (itemsErr) return fail(new Error('Failed to load order items'));
  if (!items || items.length === 0) return fail(new Error('No items in order'));

  return ok({
    order: { id: order.id, restaurant_id: order.restaurant_id },
    items: items.map((it: any) => ({
      id: it.id,
      product_id: it.product_id ?? it.menu_item_id ?? it.id,
      name: it.name ?? it.product_name ?? 'Item',
      quantity: it.quantity ?? 1,
      unit_price: Number(it.unit_price ?? it.price ?? 0),
      special_instructions: it.special_instructions ?? null,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const wrapped = withSecurity(
    { roles: ['customer', 'admin', 'super_admin', 'manager'] },
    // The handler is wrapped in a thin closure that returns a plain
    // NextResponse; withSecurity's strict signature wants
    // NextResponse<ApiResponse<T>> but our handler is compatible at
    // runtime. The `as any` keeps the call site concise.
    async (ctx: HandlerContext) => reorderHandler(ctx, params.id) as any,
  );
  return (await wrapped(req)) as NextResponse;
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
