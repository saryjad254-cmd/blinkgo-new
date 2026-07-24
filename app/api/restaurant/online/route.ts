import { NextRequest, NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth-helper';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/restaurant/online
 * Body: { is_online: boolean }
 *
 * Canonical operational availability for a restaurant.
 *
 * AVAILABILITY MODEL (four distinct, independent concepts)
 * -------------------------------------------------------
 *   is_active  → ACCOUNT/LISTING state. Admin-controlled. A deactivated
 *                restaurant is hidden from customers entirely. NOT operational
 *                availability and deliberately not reused here: an owner
 *                toggling "offline" for the evening must not deactivate their
 *                account.
 *   is_online  → OPERATIONAL state, owner-controlled (this route). Offline =
 *                temporarily not accepting orders, still a valid listing.
 *   is_paused  → SHORT pause (see /api/restaurant/pause).
 *   busy_mode  → Accepting orders but with extended prep times
 *                (see /api/restaurant/busy-mode).
 *
 * The dashboard previously READ `is_active` while the toggle attempted to write
 * `is_online` to a route that did not exist, so the control always reverted.
 *
 * FORWARD COMPATIBILITY
 * ---------------------
 * `restaurants.is_online` is added by deploy/supabase/47-restaurant-is-online.sql.
 * Until that migration is applied the column may be missing; in that case
 * PostgREST answers 42703/PGRST204 and this route reports `persisted: false`
 * instead of failing, so the UI can surface an honest message rather than
 * silently reverting. The error is always logged — never swallowed.
 */
export async function POST(request: NextRequest) {
  const user = await requireApiRole('restaurant');
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }
  if (typeof body?.is_online !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'is_online (boolean) required' }, { status: 400 });
  }
  const isOnline: boolean = body.is_online;

  const svc = createServiceClient();
  const { data: restaurant, error: lookupErr } = await svc
    .from('restaurants')
    .select('id, owner_id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (lookupErr) {
    logger.error('Restaurant online: lookup failed', { message: lookupErr.message, code: (lookupErr as any).code });
    return NextResponse.json({ ok: false, error: 'LOOKUP_FAILED' }, { status: 500 });
  }
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: 'NO_RESTAURANT' }, { status: 404 });
  }

  const { data, error } = await svc
    .from('restaurants')
    .update({ is_online: isOnline, updated_at: new Date().toISOString() })
    .eq('id', restaurant.id)
    .select('is_online')
    .maybeSingle();

  if (error) {
    const missingColumn =
      (error as any).code === '42703' ||
      (error as any).code === 'PGRST204' ||
      /is_online/.test(error.message ?? '');
    logger.error('Restaurant online: update failed', {
      code: (error as any).code,
      message: error.message,
      missingColumn,
    });
    return NextResponse.json(
      {
        ok: false,
        persisted: false,
        error: missingColumn ? 'COLUMN_MISSING' : 'UPDATE_FAILED',
        hint: missingColumn ? 'Apply deploy/supabase/47-restaurant-is-online.sql' : undefined,
      },
      { status: missingColumn ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true, persisted: true, isOnline: data?.is_online ?? isOnline });
}

/** GET /api/restaurant/online → current operational state. */
export async function GET() {
  const user = await requireApiRole('restaurant');
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('restaurants')
    .select('id, is_online, is_active, is_paused')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (error) {
    logger.error('Restaurant online: read failed', { code: (error as any).code, message: error.message });
    return NextResponse.json({ ok: false, error: 'READ_FAILED' }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    isOnline: (data as any)?.is_online ?? true,
    isActive: (data as any)?.is_active ?? true,
    isPaused: (data as any)?.is_paused ?? false,
  });
}
