import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  // SECURITY: require auth and verify ownership before exposing order data
  const { createServerClient } = await import('@/lib/supabase/server');
  const sbAuth = createServerClient();
  const { data: { user } } = await sbAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const orderId = params.id;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Fetch the original order + items
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, restaurant_id, customer_id, restaurant_latitude, restaurant_longitude')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
    }

    // SECURITY: only the original customer (or admin) can reorder
    const { data: profile } = await sbAuth
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (order.customer_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsErr) {
      return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ ok: false, error: 'No items in order' }, { status: 400 });
    }

    // Return the items so the client can hydrate the cart store
    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        restaurant_id: order.restaurant_id,
      },
      items: items.map((it: any) => ({
        id: it.id,
        product_id: it.product_id ?? it.menu_item_id ?? it.id,
        name: it.name ?? it.product_name ?? 'Item',
        quantity: it.quantity ?? 1,
        unit_price: Number(it.unit_price ?? it.price ?? 0),
        special_instructions: it.special_instructions ?? null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
