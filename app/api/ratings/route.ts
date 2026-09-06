import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/foundation/logger';

export const runtime = 'nodejs';
export const dynamic = "force-dynamic";

// F3 fix: use the canonical service-role client (sb_secret_* compatible).
function getAdmin() {
  return createServiceClient();
}

/**
 * v81 SECURITY: was previously passing the raw `Cookie` request header
 * to `supabase.auth.getUser()` on the service-role client. The
 * service-role client treats the argument as a Bearer JWT; the cookie
 * string is not a JWT and the call always returned null — meaning the
 * route was effectively unauthenticated. Now uses the cookie-aware
 * server client, which actually validates the session JWT signature.
 */
async function getUser() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
  const { order_id, restaurant_rating, driver_rating, food_rating, comment } = body as Record<string, unknown>;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof order_id !== 'string' || !UUID_RE.test(order_id)) {
    return NextResponse.json({ ok: false, error: 'Valid order_id required' }, { status: 400 });
  }

  // v81 SECURITY: whitelist and clamp the rating fields. A client could
  // otherwise send `restaurant_rating: 9999` or a non-integer; the DB
  // CHECK may or may not catch it depending on the migration.
  const clamp = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return Math.max(1, Math.min(5, Math.round(v)));
  };
  const safeRestaurant = clamp(restaurant_rating);
  const safeDriver = clamp(driver_rating);
  const safeFood = clamp(food_rating);
  const safeComment = typeof comment === 'string' ? comment.slice(0, 1000) : null;
  if (safeRestaurant === null && safeDriver === null && safeFood === null) {
    return NextResponse.json({ ok: false, error: 'At least one valid rating is required' }, { status: 400 });
  }

  const supabase = getAdmin();

  // Get order to validate ownership
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, customer_id, restaurant_id, driver_id, status')
    .eq('id', order_id)
    .maybeSingle();

  if (orderError) {
    logger.error('ratings.order_lookup_failed', { order_id, user_id: user.id }, orderError);
    return NextResponse.json({ ok: false, error: 'Unable to verify order' }, { status: 500 });
  }

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
      restaurant_rating: safeRestaurant,
      driver_rating: safeDriver,
      food_rating: safeFood,
      comment: safeComment,
    }, { onConflict: 'order_id' })
    .select()
    .single();

  if (error) {
    logger.error('ratings.upsert_failed', { order_id, user_id: user.id }, error);
    return NextResponse.json({ ok: false, error: 'Unable to save rating' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rating: data });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const restaurant_id = searchParams.get('restaurant_id');

  // v81 SECURITY: validate UUIDs on the search params. Without this an
  // attacker could inject arbitrary PostgREST filter syntax into the
  // .eq() call (defense in depth — .eq() is parameterised but UUID
  // validation is the belt-and-braces posture).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (restaurant_id && !UUID_RE.test(restaurant_id)) {
    return NextResponse.json({ ok: true, ratings: [] });
  }
  if (!restaurant_id) {
    return NextResponse.json({ ok: false, error: 'restaurant_id required' }, { status: 400 });
  }

  const supabase = getAdmin();
  const query = supabase
    .from('ratings')
    .select('id,restaurant_rating,food_rating,comment,created_at,customer:customer_id(name,avatar_url)')
    .eq('restaurant_id', restaurant_id);

  const { data } = await query.order('created_at', { ascending: false }).limit(50);
  return NextResponse.json({ ok: true, ratings: data || [] });
}
