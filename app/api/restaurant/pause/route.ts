import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/restaurant/pause
 * Body: { paused: boolean }
 * Pause / resume accepting new orders. While paused, customers cannot order from this restaurant.
 */
export async function POST(request: NextRequest) {
  const user = await requireApiRole('restaurant');
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const paused: boolean = !!body.paused;

    const svc = createServiceClient();
    let { data: restaurant } = await svc
      .from('restaurants')
      .select('id, owner_id, is_paused')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!restaurant) {
      // Fallback: column may not exist yet
      const fallback = await svc
        .from('restaurants')
        .select('id, owner_id')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (!fallback.data) {
        return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
      }
      restaurant = { ...fallback.data, is_paused: false } as any;
    }

    if (!restaurant) {
      return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
    }

    let data, error;
    try {
      const result = await svc
        .from('restaurants')
        .update({ is_paused: paused, updated_at: new Date().toISOString() })
        .eq('id', restaurant.id)
        .select('is_paused')
        .single();
      data = result.data;
      error = result.error;
    } catch (e: any) {
      error = { message: e?.message };
    }

    if (error) {
      return NextResponse.json({
        ok: true,
        paused,
        storage: 'pending_migration',
      });
    }

    return NextResponse.json({
      ok: true,
      paused: data?.is_paused ?? paused,
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
      .select('id, is_paused')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!restaurant) {
      const fallback = await svc
        .from('restaurants')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (!fallback.data) {
        return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
      }
      restaurant = { ...fallback.data, is_paused: false } as any;
    }
    return NextResponse.json({ ok: true, paused: !!(restaurant as any).is_paused });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 500 });
  }
}
