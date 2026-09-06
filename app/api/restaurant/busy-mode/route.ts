import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveOwnedRestaurant } from '@/lib/services/restaurant-context';

export const dynamic = 'force-dynamic';

type RestaurantBusyState = {
  id: string;
  is_active?: boolean | null;
  is_paused?: boolean | null;
  busy_mode?: boolean | null;
  busy_mode_until?: string | null;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Restaurant busy mode failed';
}

async function ownedRestaurant(userId: string): Promise<{ data: RestaurantBusyState | null; error: unknown }> {
  const { service, restaurantId } = await resolveOwnedRestaurant(userId);
  if (!restaurantId) return { data: null, error: null };
  const result = await service
    .from('restaurants')
    .select('id, is_active, is_paused, busy_mode, busy_mode_until')
    .eq('id', restaurantId)
    .maybeSingle();
  return { data: result.data as RestaurantBusyState | null, error: result.error };
}

export async function POST(request: NextRequest) {
  const user = await requireApiRole('restaurant');
  if (!user) return NextResponse.json({ ok: false, error: { message: 'Unauthorized' } }, { status: 403 });

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || typeof (body as { busy?: unknown }).busy !== 'boolean') {
      return NextResponse.json({ ok: false, error: { message: 'busy must be a boolean' } }, { status: 400 });
    }
    const busy = (body as { busy: boolean }).busy;
    const rawMinutes = Number((body as { minutes?: unknown }).minutes ?? 15);
    if (!Number.isFinite(rawMinutes)) return NextResponse.json({ ok: false, error: { message: 'minutes must be numeric' } }, { status: 400 });
    const minutes = Math.max(1, Math.min(480, Math.round(rawMinutes)));

    const current = await ownedRestaurant(user.id);
    if (current.error) throw current.error;
    if (!current.data) return NextResponse.json({ ok: false, error: { message: 'Restaurant not found' } }, { status: 404 });
    if (busy && (current.data.is_active === false || current.data.is_paused === true)) {
      return NextResponse.json({ ok: false, error: { message: 'Open the restaurant before enabling busy mode' } }, { status: 409 });
    }

    const until = busy ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    const { data, error } = await createServiceClient()
      .from('restaurants')
      .update({ busy_mode: busy, busy_mode_until: until, updated_at: new Date().toISOString() })
      .eq('id', current.data.id)
      .select('busy_mode, busy_mode_until')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, busyMode: data?.busy_mode ?? busy, busyModeUntil: data?.busy_mode_until ?? until });
  } catch (error) {
    console.error('[restaurant/busy-mode] update failed', messageOf(error));
    return NextResponse.json({ ok: false, error: { message: 'Could not update busy mode' } }, { status: 500 });
  }
}

export async function GET() {
  const user = await requireApiRole('restaurant');
  if (!user) return NextResponse.json({ ok: false, error: { message: 'Unauthorized' } }, { status: 403 });

  try {
    const result = await ownedRestaurant(user.id);
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ ok: false, error: { message: 'Restaurant not found' } }, { status: 404 });
    return NextResponse.json({
      ok: true,
      busyMode: Boolean(result.data.busy_mode),
      busyModeUntil: result.data.busy_mode_until ?? null,
      isPaused: Boolean(result.data.is_paused),
    });
  } catch (error) {
    console.error('[restaurant/busy-mode] read failed', messageOf(error));
    return NextResponse.json({ ok: false, error: { message: 'Could not read busy mode' } }, { status: 500 });
  }
}
