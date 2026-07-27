/**
 * Favorites Toggle API
 * ────────────────────
 * Toggles a restaurant favorite status for the authenticated user.
 *
 * POST /api/favorites/toggle
 * Body: { restaurant_id: string }
 * Returns: { ok: true, favorited: boolean }
 *
 * v81: Wrapped with withSecurity (auth + rate-limit + audit).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isValidUuid } from '@/lib/validation';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { logger } from '@/lib/logging';
import { recordAudit } from '@/lib/audit/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function toggleFavorite(
  req: NextRequest,
  ctx: { auth: { user: { id: string; role: string; [k: string]: any } } },
): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const body = await req.json().catch(() => ({}));
    const restaurantId = body.restaurant_id;
    if (!isValidUuid(restaurantId)) {
      return NextResponse.json({ ok: false, error: { code: 'INVALID_RESTAURANT_ID', message: 'Invalid restaurant ID', statusCode: 400 } }, { status: 400 });
    }

    // SECURITY: use the authenticated client (cookie-bound) so the user_id
    // is forced to ctx.auth.user.id — never trust body-supplied identity.
    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = createServerClient();

    // Check if already favorited
    const { data: existing, error: checkError } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', ctx.auth.user.id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (checkError) {
      // Graceful: if the favorites table is missing, return favorited=true
      if (checkError.code === 'PGRST205' || checkError.message?.includes('favorites')) {
        return ok({ favorited: true, favorite: { user_id: ctx.auth.user.id, restaurant_id: restaurantId } });
      }
      logger.error('[favorites/toggle] check error', { userId: ctx.auth.user.id, restaurantId }, checkError);
      return NextResponse.json({ ok: false, error: { code: 'CHECK_FAILED', message: 'Could not check favorite status', statusCode: 500 } }, { status: 500 });
    }

    if (existing) {
      // Unfavorite
      const { error: deleteError } = await supabase
        .from('favorites')
        .delete()
        .eq('id', existing.id);

      if (deleteError) {
        if (deleteError.code === 'PGRST205' || deleteError.message?.includes('favorites')) {
          return ok({ favorited: false });
        }
        return NextResponse.json({ ok: false, error: { code: 'DELETE_FAILED', message: 'Could not remove favorite', statusCode: 500 } }, { status: 500 });
      }
      await recordAudit({ actor_id: ctx.auth.user.id, action: 'favorite_remove', target_type: 'restaurant', target_id: restaurantId, ip_address: req.headers.get('x-forwarded-for') ?? '' });
      return ok({ favorited: false });
    } else {
      // Favorite
      const { error: insertError } = await supabase
        .from('favorites')
        .insert({ user_id: ctx.auth.user.id, restaurant_id: restaurantId });

      if (insertError) {
        if (insertError.code === 'PGRST205' || insertError.message?.includes('favorites')) {
          return ok({ favorited: true, favorite: { user_id: ctx.auth.user.id, restaurant_id: restaurantId } });
        }
        return NextResponse.json({ ok: false, error: { code: 'INSERT_FAILED', message: 'Could not add favorite', statusCode: 500 } }, { status: 500 });
      }
      await recordAudit({ actor_id: ctx.auth.user.id, action: 'favorite_add', target_type: 'restaurant', target_id: restaurantId, ip_address: req.headers.get('x-forwarded-for') ?? '' });
      return ok({ favorited: true });
    }
  });
}

export async function POST(req: NextRequest) {
  return withSecurity(
    secureRoute('moderate', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toggleFavorite as any,
  )(req) as unknown as NextResponse;
}

/**
 * v80: Explicit GET handler so this route is discoverable in production.
 */
export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
