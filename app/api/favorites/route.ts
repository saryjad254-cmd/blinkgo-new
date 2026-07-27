/**
 * Favorites API
 * ─────────────
 * SECURITY: All favorites are scoped to the authenticated user. Rate limit,
 * audit, and auth enforced by withSecurity.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidUuid } from '@/lib/validation';
import { ok, withErrorHandling } from '@/lib/api/response';
import { withSecurity } from '@/lib/api/security';
import { secureRoute } from '@/lib/api/security-helpers';
import { ValidationError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return (await withSecurity(
    secureRoute('lenient', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx) => listFavorites(ctx.auth.user.id) as any,
  )(req)) as unknown as NextResponse;
}

async function listFavorites(userId: string) {
  return withErrorHandling(async () => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('favorites')
      .select('*, restaurants:restaurant_id(id, name, address, rating, image_url, cuisine, delivery_fee)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('favorites')) {
        return ok({ favorites: [] });
      }
      throw new Error('FETCH_FAILED');
    }
    return ok({ favorites: data || [] });
  });
}

export async function POST(req: NextRequest) {
  return (await withSecurity(
    secureRoute('moderate', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => addFavorite(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function addFavorite(userId: string, req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json().catch(() => ({}));
    const restaurantId = body.restaurant_id;
    if (!isValidUuid(restaurantId)) {
      throw new ValidationError('INVALID_RESTAURANT_ID');
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('favorites')
      .upsert(
        { user_id: userId, restaurant_id: restaurantId },
        { onConflict: 'user_id,restaurant_id' }
      )
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('favorites')) {
        return ok({ favorite: { user_id: userId, restaurant_id: restaurantId } });
      }
      throw new Error('SAVE_FAILED');
    }
    return ok({ favorite: data });
  });
}

export async function DELETE(req: NextRequest) {
  return (await withSecurity(
    secureRoute('moderate', ['customer', 'admin', 'super_admin', 'manager']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (ctx, r) => removeFavorite(ctx.auth.user.id, r as NextRequest) as any,
  )(req)) as unknown as NextResponse;
}

async function removeFavorite(userId: string, req: NextRequest) {
  return withErrorHandling(async () => {
    const body = await req.json().catch(() => ({}));
    const restaurantId = body.restaurant_id;
    if (!isValidUuid(restaurantId)) {
      throw new ValidationError('INVALID_RESTAURANT_ID');
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('restaurant_id', restaurantId);

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('favorites')) {
        return ok({});
      }
      throw new Error('DELETE_FAILED');
    }
    return ok({});
  });
}
