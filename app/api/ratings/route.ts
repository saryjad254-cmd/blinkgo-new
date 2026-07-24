import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

function getAdmin() {
  return createServiceClient();
}

async function getUser(req: NextRequest) {
  const supabase = getAdmin();
  const cookieHeader = req.headers.get('cookie') ?? '';
  const { data: { user } } = await supabase.auth.getUser(cookieHeader);
  return user;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  
  const { order_id, restaurant_rating, driver_rating, food_rating, comment } = await req.json();
  
  if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 });
  
  const supabase = getAdmin();
  
  // Get order to validate ownership
  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, restaurant_id, driver_id, status')
    .eq('id', order_id)
    .single();
  
  if (!order || order.customer_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'Order not found or not yours' }, { status: 403 });
  }
  
  if (order.status !== 'delivered') {
    return NextResponse.json({ ok: false, error: 'Only delivered orders can be rated' }, { status: 400 });
  }
  
  const { data, error } = await supabase
    .from('ratings')
    .upsert({
      order_id,
      customer_id: user.id,
      restaurant_id: order.restaurant_id,
      driver_id: order.driver_id,
      restaurant_rating,
      driver_rating,
      food_rating,
      comment,
    }, { onConflict: 'order_id' })
    .select()
    .single();
  
  return NextResponse.json({ ok: !error, rating: data, error: error?.message });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const restaurant_id = searchParams.get('restaurant_id');
  const driver_id = searchParams.get('driver_id');
  
  const supabase = getAdmin();
  let query = supabase.from('ratings').select('*, customer:customer_id(name, avatar_url)');
  
  if (restaurant_id) query = query.eq('restaurant_id', restaurant_id);
  if (driver_id) query = query.eq('driver_id', driver_id);
  
  const { data } = await query.order('created_at', { ascending: false }).limit(50);
  return NextResponse.json({ ok: true, ratings: data || [] });
}
