import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';

export const dynamic = 'force-dynamic';

type RestaurantIntakeState = { id: string; is_active?: boolean | null; is_paused?: boolean | null };

async function ownedRestaurant(userId: string): Promise<{ data: RestaurantIntakeState | null; error: unknown }> {
  const { service, restaurantId } = await resolveOwnedRestaurant(userId);
  if (!restaurantId) return { data: null, error: null };
  const result = await service
    .from('restaurants')
    .select('id, is_active, is_paused')
    .eq('id', restaurantId)
    .maybeSingle();
  return { data: result.data as RestaurantIntakeState | null, error: result.error };
}

export async function POST(request: NextRequest) {
  const user = await requireApiRole('restaurant');
  if (!user) return NextResponse.json({ ok: false, error: { message: 'Unauthorized' } }, { status: 403 });

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || typeof (body as { paused?: unknown }).paused !== 'boolean') {
      return NextResponse.json({ ok: false, error: { message: 'paused must be a boolean' } }, { status: 400 });
    }
    const paused = (body as { paused: boolean }).paused;
    const current = await ownedRestaurant(user.id);
    if (current.error) throw current.error;
    if (!current.data) return NextResponse.json({ ok: false, error: { message: 'Restaurant not found' } }, { status: 404 });
    if (!paused && current.data.is_active === false) {
      return NextResponse.json({ ok: false, error: { message: 'Restaurant is disabled by platform operations' } }, { status: 409 });
    }

    const updates = paused
      ? { is_paused: true, busy_mode: false, busy_mode_until: null, updated_at: new Date().toISOString() }
      : { is_paused: false, updated_at: new Date().toISOString() };
    const { data, error } = await createServiceClient()
      .from('restaurants')
      .update(updates)
      .eq('id', current.data.id)
      .select('is_paused')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, paused: data?.is_paused ?? paused });
  } catch (error) {
    console.error('[restaurant/pause] update failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: { message: 'Could not update order intake' } }, { status: 500 });
  }
}

export async function GET() {
  const user = await requireApiRole('restaurant');
  if (!user) return NextResponse.json({ ok: false, error: { message: 'Unauthorized' } }, { status: 403 });
  try {
    const result = await ownedRestaurant(user.id);
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ ok: false, error: { message: 'Restaurant not found' } }, { status: 404 });
    return NextResponse.json({ ok: true, paused: Boolean(result.data.is_paused), isActive: result.data.is_active !== false });
  } catch (error) {
    console.error('[restaurant/pause] read failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: { message: 'Could not read order intake' } }, { status: 500 });
  }
}
