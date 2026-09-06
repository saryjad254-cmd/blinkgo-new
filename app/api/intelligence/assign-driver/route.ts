/**
 * Smart Driver Assignment API — Phase 7H-C rewrite
 * ──────────────────────────────────────────────────
 * Returns ranked driver candidates for an order, using the REAL Supabase
 * schema (no more queries against `users` for driver-only fields).
 *
 * Source of truth:
 *   - users               (role, is_active, name)
 *   - drivers             (full_name, is_available, vehicle_type)
 *   - driver_status       (is_online, is_on_delivery, current_order_id,
 *                          latitude, longitude, updated_at)
 *   - driver_working_hours(day_of_week, start_time, end_time, is_enabled)
 *
 * Auto-dispatch eligibility (ALL must be true):
 *   1. role = 'driver' AND is_active = true
 *   2. driver row exists AND is_available = true
 *   3. driver_status.is_online = true
 *   4. driver_status.is_on_delivery = false
 *   5. driver_status.current_order_id IS NULL
 *   6. location is fresh (driver_status.updated_at within GPS_FRESH_MS)
 *   7. within working hours (driver_working_hours)
 *   8. coordinates pass validateLocation()
 *
 * Manual dispatch (admin) may bypass checks 5-7 and force a specific driver.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/data/clients';
import { scoreDrivers, type DriverCandidate } from '@/lib/intelligence/driver-assignment';
import {
  validateLocation,
  classifyLocationFreshness,
  isWithinWorkingHours,
  type WorkingHourRow,
} from '@/lib/driver/dispatch-policy';
import { ok, withErrorHandling } from '@/lib/api/response';
import { AuthenticationError, ValidationError } from '@/lib/errors';
import type { LatLng } from '@/lib/delivery-zone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RequestBody {
  order_id?: string;
  restaurant_id?: string;
  restaurant_lat?: number;
  restaurant_lng?: number;
  urgency?: number;
  /** When true, perform a manual assignment (admin) and actually mutate orders.driver_id. */
  manual_assign?: boolean;
  /** Required when manual_assign=true: the driver to force-assign. */
  driver_id?: string;
}

type RestaurantRelation = {
  latitude: number | null;
  longitude: number | null;
  owner_id: string | null;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async () => {
    const server = await createServerClient();
    const { data: { user } } = await server.auth.getUser();
    if (!user) throw new AuthenticationError();

    const body: RequestBody = await req.json().catch(() => ({}));
    let restaurantLoc: LatLng;

    // 1) Authorization
    const { data: callerProfile } = await server
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    const callerRole = callerProfile?.role ?? 'customer';
    const isAdmin = callerRole === 'admin' || callerRole === 'super_admin';

    if (body.order_id) {
      // Only the order's restaurant owner or an admin may request suggestions.
      const { data: order } = await server
        .from('orders')
        .select('restaurant_id, driver_id, status, restaurant:restaurant_id(latitude, longitude, owner_id)')
        .eq('id', body.order_id)
        .single();
      const rest = relation(order?.restaurant as RestaurantRelation | RestaurantRelation[] | null);
      if (rest?.latitude == null || rest.longitude == null) {
        throw new ValidationError('Restaurant location missing');
      }
      const isRestaurantOwner = rest.owner_id === user.id;
      if (!isRestaurantOwner && !isAdmin) {
        throw new ValidationError('Not authorized for this order');
      }
      restaurantLoc = { lat: Number(rest.latitude), lng: Number(rest.longitude) };
    } else {
      if (
        body.restaurant_id == null ||
        body.restaurant_lat == null ||
        body.restaurant_lng == null
      ) {
        throw new ValidationError('restaurant_id + coordinates required');
      }
      const v = validateLocation(body.restaurant_lat, body.restaurant_lng);
      if (!v.ok) throw new ValidationError(`restaurant coords invalid: ${v.reason}`);
      restaurantLoc = { lat: v.lat, lng: v.lng };
    }

    // 2) Load candidate drivers — REAL schema.
    //    We must use the service role to read driver_status (RLS hides it
    //    from non-admin, non-self callers — which is the whole point).
    const admin = createServiceClient();
    const { data: statusRows, error: dsErr } = await admin
      .from('driver_status')
      .select('driver_id, is_online, is_on_delivery, current_order_id, latitude, longitude, bearing, speed, updated_at')
      .eq('is_online', true)
      .is('is_on_delivery', false)
      .is('current_order_id', null);
    if (dsErr) throw dsErr;
    const candidateIds = (statusRows ?? []).map((r) => r.driver_id);
    if (candidateIds.length === 0) {
      return ok({ candidates: [], count: 0 });
    }

    // 3) Load user + driver rows for those candidates
    const [{ data: users }, { data: driverRows }] = await Promise.all([
      admin
        .from('users')
        .select('id, name, is_active')
        .in('id', candidateIds)
        .eq('role', 'driver')
        .eq('is_active', true),
      admin
        .from('drivers')
        .select('id, full_name, is_available, vehicle_type')
        .in('id', candidateIds)
        .eq('is_available', true),
    ]);

    const userById = new Map((users ?? []).map((u) => [u.id, u]));
    const driverById = new Map((driverRows ?? []).map((d) => [d.id, d]));

    // 4) Working hours — single query
    const { data: whRows } = await admin
      .from('driver_working_hours')
      .select('driver_id, day_of_week, start_time, end_time, is_enabled')
      .in('driver_id', candidateIds);
    const whByDriver = new Map<string, WorkingHourRow[]>();
    for (const r of whRows ?? []) {
      const arr = whByDriver.get(r.driver_id) ?? [];
      arr.push({
        day_of_week: r.day_of_week,
        start_time: r.start_time,
        end_time: r.end_time,
        is_enabled: r.is_enabled,
      });
      whByDriver.set(r.driver_id, arr);
    }

    // 5) Build candidates
    const now = new Date();
    const candidates: DriverCandidate[] = [];
    const diagnostics: Array<{ driver_id: string; reason: string }> = [];

    for (const s of statusRows ?? []) {
      const u = userById.get(s.driver_id);
      const d = driverById.get(s.driver_id);
      if (!u || !d) {
        diagnostics.push({ driver_id: s.driver_id, reason: 'missing user or driver row' });
        continue;
      }
      const loc = validateLocation(s.latitude, s.longitude);
      if (!loc.ok) {
        diagnostics.push({ driver_id: s.driver_id, reason: `bad coords: ${loc.reason}` });
        continue;
      }
      const fresh = classifyLocationFreshness(s.updated_at);
      if (fresh.status !== 'fresh') {
        diagnostics.push({ driver_id: s.driver_id, reason: `not fresh: ${fresh.status} (age ${fresh.ageMs}ms)` });
        continue;
      }
      const wh = isWithinWorkingHours(whByDriver.get(s.driver_id) ?? [], now);
      if (!wh.within) {
        diagnostics.push({ driver_id: s.driver_id, reason: 'outside working hours' });
        continue;
      }
      candidates.push({
        id: s.driver_id,
        name: d.full_name ?? u.name ?? 'Driver',
        currentLocation: { lat: loc.lat, lng: loc.lng },
        activeOrderCount: 0,
        minutesSinceLastDelivery: 999,
        headingTowardRestaurant: false,
        acceptanceRate: 0.95,
        rating: 5,
        speedFactor: 1,
      });
    }

    // 6) Score + rank
    const scored = scoreDrivers(candidates, {
      restaurantLocation: restaurantLoc,
      orderPlacedAt: now,
      urgency: body.urgency ?? 0.5,
    }).slice(0, 10);

    // 7) Optional manual assignment
    if (body.manual_assign && body.order_id && body.driver_id) {
      if (!isAdmin) throw new ValidationError('manual_assign requires admin role');
      const [{ data: targetUser }, { data: targetDriver }] = await Promise.all([
        admin.from('users').select('id').eq('id', body.driver_id).eq('role', 'driver').eq('is_active', true).maybeSingle(),
        admin.from('drivers').select('id').eq('id', body.driver_id).maybeSingle(),
      ]);
      if (!targetUser || !targetDriver) throw new ValidationError('Target driver is invalid or inactive');
      // Atomic single-claim
      const { data: updated, error: claimErr } = await admin
        .from('orders')
        .update({
          driver_id: body.driver_id,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', body.order_id)
        .eq('fulfillment_type', 'delivery')
        .is('driver_id', null)
        .in('status', ['confirmed', 'preparing', 'ready'])
        .select()
        .single();
      if (claimErr) throw claimErr;
      if (!updated) {
        return ok({ candidates: scored, manual_assign: { ok: false, reason: 'order already has a driver or wrong status' } });
      }
      // Update driver_status.current_order_id
      await admin
        .from('driver_status')
        .update({ current_order_id: body.order_id })
        .eq('driver_id', body.driver_id)
        .is('current_order_id', null);
      return ok({
        candidates: scored,
        manual_assign: { ok: true, order: updated },
      });
    }

    return ok({
      candidates: scored,
      total_candidates: candidates.length,
      rejected: diagnostics,
    });
  });
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
