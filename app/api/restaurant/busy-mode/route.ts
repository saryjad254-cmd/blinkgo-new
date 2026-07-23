import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/restaurant/busy-mode
 * Body: { busy: boolean, minutes?: number }
 * Toggle busy mode for the current restaurant.
 */
export async function POST(request: NextRequest) {
  const user = await requireApiRole('restaurant');
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED', code: 'NOT_RESTAURANT' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const busy: boolean = !!body.busy;
    const minutes: number = Math.max(1, Math.min(480, Number(body.minutes ?? 15)));

    const svc = createServiceClient();
    const { data: restaurant } = await svc
      .from('restaurants')
      .select('id, owner_id')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!restaurant) {
      return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
    }

    const until = busy ? new Date(Date.now() + minutes * 60_000).toISOString() : null;

    let columnExists = true;
    try {
      const { error: probeErr } = await svc
        .from('restaurants')
        .select('busy_mode')
        .eq('id', restaurant.id)
        .limit(1);
      if (probeErr && probeErr.message?.includes('column')) columnExists = false;
    } catch {
      columnExists = false;
    }
    if (!columnExists) {
      return NextResponse.json({
        ok: true,
        busyMode: busy,
        busyModeUntil: until,
        storage: 'pending_migration',
      });
    }

    const { data, error } = await svc
      .from('restaurants')
      .update({
        busy_mode: busy,
        busy_mode_until: until,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurant.id)
      .select('busy_mode, busy_mode_until')
      .single();

    if (error) {
      return NextResponse.json({
        ok: true,
        busyMode: busy,
        busyModeUntil: until,
        storage: 'pending_migration',
      });
    }

    return NextResponse.json({
      ok: true,
      busyMode: data?.busy_mode ?? busy,
      busyModeUntil: data?.busy_mode_until ?? until,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 500 });
  }
}

export async function GET() {
  const user = await requireApiRole('restaurant');
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }
  try {
    const svc = createServiceClient();
    let { data: restaurant } = await svc
      .from('restaurants')
      .select('id, busy_mode, busy_mode_until, is_paused')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!restaurant) {
      const fallback = await svc
        .from('restaurants')
        .select('id, is_paused')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (!fallback.data) {
        return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
      }
      restaurant = { ...fallback.data, busy_mode: false, busy_mode_until: null } as any;
    }
    return NextResponse.json({
      ok: true,
      busyMode: !!(restaurant as any).busy_mode,
      busyModeUntil: (restaurant as any).busy_mode_until,
      isPaused: !!(restaurant as any).is_paused,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 500 });
  }
}
