/**
 * Driver Location Update
 * ──────────────────────
 * Updates:
 *   1. driver_status.latitude/longitude/updated_at (used by auto-dispatch)
 *   2. auth.users.user_metadata.last_location_*  (used by customer tracking fallback)
 *   3. orders.driver_latitude/longitude/bearing for the active order
 *   4. order_tracking_events (one row per location fix during active delivery)
 *
 * Rate-limited: max 240 requests/min per driver (4 per second headroom)
 * IMPORTANT: Does NOT change is_online state.
 * Use /api/driver/online for that.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logging';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    let userId: string | null = null;

    // Cookie-based session first
    try {
      cookies();
      const serverSupabase = createServerClient();
      const { data } = await serverSupabase.auth.getUser();
      if (data?.user?.id) userId = data.user.id;
    } catch {
      // fall through to bearer
    }

    // Bearer fallback
    if (!userId) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const supabase = createServiceClient();
        const token = authHeader.slice(7);
        const { data } = await supabase.auth.getUser(token);
        userId = data.user?.id ?? null;
      }
    }

    if (!userId) throw new AuthenticationError();

    // SECURITY: Verify the caller is actually a driver (not a customer spoofing a request).
    const { data: callerProfile } = await createServiceClient()
      .from('users')
      .select('role, is_active')
      .eq('id', userId)
      .single();
    if (!callerProfile) throw new AuthenticationError();
    if (callerProfile.is_active === false) {
      return NextResponse.json({ ok: false, error: 'ACCOUNT_DISABLED' }, { status: 403 });
    }
    if (
      callerProfile.role !== 'driver' &&
      callerProfile.role !== 'admin' &&
      callerProfile.role !== 'super_admin'
    ) {
      return NextResponse.json({ ok: false, error: 'DRIVER_ONLY' }, { status: 403 });
    }

    // Rate limit per driver (id-derived)
    const limited = rateLimit(
      { limit: 240, windowSec: 60, name: `driver-location:${userId}` },
      req
    );
    if (limited) {
      // Throttle: still 200 but with throttled:true so client backs off
      return ok({ throttled: true });
    }

    const body = await req.json().catch(() => ({}));
    const { latitude, longitude, heading, speed, accuracy, active_order_id } = body;
    // is_online is intentionally NOT accepted - online state can only be changed via /api/driver/online

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new ValidationError('Invalid coordinates');
    }

    // Reject obviously bad coordinates
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new ValidationError('Coordinates out of range');
    }

    const supabase = createServiceClient();

    // 1) Update driver_status (the table used by auto-dispatch)
    try {
      await supabase
        .from('driver_status')
        .upsert(
          {
            driver_id: userId,
            latitude,
            longitude,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'driver_id' }
        );
    } catch (e) {
      logger.warn('driver_status upsert failed (non-fatal)', { userId }, e);
    }

    // 2) Update last location in user_metadata (cheap lookup, no admin required for the common path)
    //    This is the customer tracking fallback. NOT used to gate dispatch.
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const existingMeta = userData?.user?.user_metadata || {};
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingMeta,
          last_location_lat: latitude,
          last_location_lng: longitude,
          last_location_at: new Date().toISOString(),
          // KEEP existing is_online - don't override
        },
      });
    } catch (e) {
      logger.warn('user_metadata location update failed (non-fatal)', { userId }, e);
    }

    // 3) If driver has an active order, update order's location columns + tracking event
    if (active_order_id) {
      try {
        // SECURITY: only update if THIS driver is the assigned driver (no cross-driver spoofing)
        await supabase
          .from('orders')
          .update({
            driver_latitude: latitude,
            driver_longitude: longitude,
            driver_bearing: heading ?? null,
            driver_speed: speed ?? null,
            driver_accuracy: accuracy ?? null,
            last_location_update: new Date().toISOString(),
          })
          .eq('id', active_order_id)
          .eq('driver_id', userId);
      } catch (e) {
        logger.warn('order location update failed (non-fatal)', { orderId: active_order_id }, e);
      }

      // 4) Insert tracking event. Throttle to avoid log bloat: only record
      //    if the driver has moved > 25m since the last event for this order.
      try {
        const { data: lastEvt } = await supabase
          .from('order_tracking_events')
          .select('latitude, longitude, created_at')
          .eq('order_id', active_order_id)
          .eq('event_type', 'location_update')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        let shouldInsert = true;
        if (lastEvt?.latitude != null && lastEvt?.longitude != null) {
          const R = 6_371_000;
          const dLat = ((latitude - lastEvt.latitude) * Math.PI) / 180;
          const dLng = ((longitude - lastEvt.longitude) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lastEvt.latitude * Math.PI) / 180) *
              Math.cos((latitude * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          // 25m threshold OR 30s passed
          const ageMs = lastEvt.created_at ? Date.now() - new Date(lastEvt.created_at).getTime() : Infinity;
          if (dist < 25 && ageMs < 30_000) shouldInsert = false;
        }
        if (shouldInsert) {
          await supabase.from('order_tracking_events').insert({
            order_id: active_order_id,
            driver_id: userId,
            event_type: 'location_update',
            latitude,
            longitude,
            metadata: { heading, speed, accuracy },
          });
        }
      } catch {
        // table might not exist - non-fatal
      }
    }

    return ok({ throttled: false });
  });
}

/**
 * GET /api/driver/location
 * Returns the current driver's last known location.
 * Used by the driver dashboard on mount.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    let userId: string | null = null;
    try {
      cookies();
      const serverSupabase = createServerClient();
      const { data } = await serverSupabase.auth.getUser();
      if (data?.user?.id) userId = data.user.id;
    } catch {
      // ignore
    }
    if (!userId) throw new AuthenticationError();

    const supabase = createServiceClient();
    // Read from driver_status (preferred) and user_metadata (fallback)
    let lat: number | null = null;
    let lng: number | null = null;
    let updatedAt: string | null = null;
    try {
      const { data: ds } = await supabase
        .from('driver_status')
        .select('latitude, longitude, updated_at, is_online, is_on_delivery, current_order_id')
        .eq('driver_id', userId)
        .maybeSingle();
      if (ds && ds.latitude != null && ds.longitude != null) {
        lat = Number(ds.latitude);
        lng = Number(ds.longitude);
        updatedAt = ds.updated_at;
      }
    } catch {
      // ignore
    }
    if (lat == null || lng == null) {
      try {
        const { data: u } = await supabase.auth.admin.getUserById(userId);
        const meta = u?.user?.user_metadata || {};
        if (meta.last_location_lat != null && meta.last_location_lng != null) {
          lat = Number(meta.last_location_lat);
          lng = Number(meta.last_location_lng);
          updatedAt = meta.last_location_at ?? null;
        }
      } catch {
        // ignore
      }
    }
    return ok({ location: lat != null && lng != null ? { lat, lng, updated_at: updatedAt } : null });
  });
}
