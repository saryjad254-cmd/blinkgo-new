/**
 * Delivery Zone Service
 * ──────────────────────
 * Server-side check for whether a delivery destination is within a
 * restaurant's delivery zone. Tries the `delivery_zones` table first,
 * falls back to a configurable default radius (50 km).
 *
 * Used by the order creation endpoint to enforce geographic constraints
 * before accepting an order.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { haversineDistance, effectiveRadiusMeters, DEFAULT_MAX_DELIVERY_RADIUS_M, type LatLng } from '@/lib/maps/distance';
import { isInZone, type DeliveryZone } from '@/lib/maps/zones';
import { logger } from '@/lib/logging';

const DEFAULT_RADIUS_METERS = DEFAULT_MAX_DELIVERY_RADIUS_M; // re-exported rule — see lib/maps/distance.ts

export interface DeliveryCheckResult {
  ok: boolean;
  /** Distance in meters (only if no zone matched) */
  distanceM?: number;
  /** Limit in meters (only if no zone matched) */
  limitM?: number;
  /** Name of matched zone (if any) */
  zoneName?: string;
  /** Reason for rejection */
  reason?: 'NO_ZONE' | 'TOO_FAR';
  /** Error message for client */
  message?: string;
}

/**
 * Check if a delivery destination is within any active delivery zone
 * or within the default radius of the restaurant.
 */
export async function checkDeliveryDistance(
  restaurant: { id: string; latitude: number | null; longitude: number | null; delivery_radius_km?: number | null },
  customerLocation: { lat: number; lng: number }
): Promise<DeliveryCheckResult> {
  // No restaurant coordinates → can't check
  if (restaurant.latitude == null || restaurant.longitude == null) {
    return { ok: true };
  }

  const restaurantLoc: LatLng = {
    lat: Number(restaurant.latitude),
    lng: Number(restaurant.longitude),
  };

  // Try delivery zones (graceful if table doesn't exist)
  try {
    const svc = createServiceClient();
    const { data: zones } = await svc
      .from('delivery_zones')
      .select('id, name, radius_km, center_lat, center_lng, polygon, priority')
      .eq('is_active', true)
      .limit(50);

    if (zones && zones.length > 0) {
      // Map to DeliveryZone format
      const mapped: DeliveryZone[] = zones.map((z: any) => ({
        id: z.id,
        name: z.name,
        polygon: z.polygon,
        center: z.center_lat != null && z.center_lng != null
          ? { lat: Number(z.center_lat), lng: Number(z.center_lng) }
          : undefined,
        radius_km: z.radius_km != null ? Number(z.radius_km) : undefined,
        priority: z.priority ?? 0,
      }));

      // Find the best matching zone (highest priority wins)
      let bestMatch: DeliveryZone | null = null;
      for (const zone of mapped) {
        if (isInZone(customerLocation, zone)) {
          if (!bestMatch || (zone.priority ?? 0) > (bestMatch.priority ?? 0)) {
            bestMatch = zone;
          }
        }
      }

      if (bestMatch) {
        return { ok: true, zoneName: bestMatch.name };
      }

      // FIX (v83): NOT matching any zone must NOT veto the order.
      // Zones are ADDITIVE coverage (a zone match is an automatic accept),
      // never an exclusive gate: previously, any active zone anywhere in the
      // system caused customers outside ALL zones to be rejected — even when
      // they were well inside their own restaurant's delivery radius — and
      // the reported distance was measured to the nearest ZONE center
      // instead of to the restaurant. Fall through to the restaurant-radius
      // check below, which is the actual per-restaurant rule.
    }
  } catch (e) {
    // delivery_zones table missing or query failed - fall through to default
    logger.warn('Delivery zone check failed, using default radius', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Restaurant-radius rule (single source of truth): the restaurant's own
  // configured delivery_radius_km when set, else the platform fallback.
  const limitM = effectiveRadiusMeters(restaurant);
  const distanceM = haversineDistance(restaurantLoc, customerLocation);
  if (distanceM > limitM) {
    return {
      ok: false,
      reason: 'TOO_FAR',
      distanceM,
      limitM,
      message: `deliveryTooFar:${(distanceM / 1000).toFixed(1)}:${Math.round(limitM / 1000)}`,
    };
  }

  return { ok: true, distanceM };
}
