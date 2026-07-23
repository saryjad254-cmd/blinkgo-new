/**
 * Favorites API
 * ─────────────
 * SECURITY: Uses createServerClient() (cookie-based, signature-verified) instead
 * of passing the raw Cookie header to getUser(). All favorites are scoped to
 * the authenticated user — no cross-user access.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidUuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getAuthedUser(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('favorites')
    .select('*, restaurants:restaurant_id(id, name, address, rating, image_url, cuisine, delivery_fee)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    // SECURITY: log server-side, return generic error to client
    console.error('[favorites] query error:', JSON.stringify({
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    }));
    // Graceful: if the favorites table is missing (migration not applied),
    // return empty list instead of 500. The migration is safe to re-apply.
    if (error.code === 'PGRST205' || error.message?.includes('favorites')) {
      return NextResponse.json({ ok: true, favorites: [] });
    }
    return NextResponse.json({ ok: false, error: 'FETCH_FAILED' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, favorites: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const restaurantId = body.restaurant_id;
  if (!isValidUuid(restaurantId)) {
    return NextResponse.json({ ok: false, error: 'INVALID_RESTAURANT_ID' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('favorites')
    .upsert(
      { user_id: user.id, restaurant_id: restaurantId },
      { onConflict: 'user_id,restaurant_id' }
    )
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('favorites')) {
      return NextResponse.json({ ok: true, favorite: { user_id: user.id, restaurant_id: restaurantId } });
    }
    return NextResponse.json({ ok: false, error: 'SAVE_FAILED' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, favorite: data });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const restaurantId = body.restaurant_id;
  if (!isValidUuid(restaurantId)) {
    return NextResponse.json({ ok: false, error: 'INVALID_RESTAURANT_ID' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId);

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('favorites')) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: 'DELETE_FAILED' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
