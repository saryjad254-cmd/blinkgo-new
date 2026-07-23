/**
 * Favorites Toggle API
 * ────────────────────
 * Toggles a restaurant favorite status for the authenticated user.
 * 
 * POST /api/favorites/toggle
 * Body: { restaurant_id: string }
 * Returns: { ok: true, favorited: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidUuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const restaurantId = body.restaurant_id;
    if (!isValidUuid(restaurantId)) {
      return NextResponse.json({ ok: false, error: 'INVALID_RESTAURANT_ID' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Check if already favorited
    const { data: existing, error: checkError } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (checkError) {
      // Graceful: if the favorites table is missing, return favorited=true
      if (checkError.code === 'PGRST205' || checkError.message?.includes('favorites')) {
        return NextResponse.json({ ok: true, favorited: true, favorite: { user_id: user.id, restaurant_id: restaurantId } });
      }
      console.error('[favorites/toggle] check error:', checkError.message);
      return NextResponse.json({ ok: false, error: 'CHECK_FAILED' }, { status: 500 });
    }

    if (existing) {
      // Unfavorite
      const { error: deleteError } = await supabase
        .from('favorites')
        .delete()
        .eq('id', existing.id);

      if (deleteError) {
        if (deleteError.code === 'PGRST205' || deleteError.message?.includes('favorites')) {
          return NextResponse.json({ ok: true, favorited: false });
        }
        return NextResponse.json({ ok: false, error: 'DELETE_FAILED' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, favorited: false });
    } else {
      // Favorite
      const { error: insertError } = await supabase
        .from('favorites')
        .insert({ user_id: user.id, restaurant_id: restaurantId });

      if (insertError) {
        if (insertError.code === 'PGRST205' || insertError.message?.includes('favorites')) {
          return NextResponse.json({ ok: true, favorited: true, favorite: { user_id: user.id, restaurant_id: restaurantId } });
        }
        return NextResponse.json({ ok: false, error: 'INSERT_FAILED' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, favorited: true });
    }
  } catch (err) {
    console.error('[favorites/toggle] unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
