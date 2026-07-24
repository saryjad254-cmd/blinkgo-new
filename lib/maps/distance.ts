/**
 * Geographic distance calculations.
 * 
 * Uses the Haversine formula to compute great-circle distance between
 * two lat/lng points. Same model used by DoorDash, Uber Eats, Lieferando
 * for delivery radius validation.
 */

const EARTH_RADIUS_M = 6_371_000; // meters

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Haversine distance in meters between two points.
 * Returns distance in meters.
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_M * c;
}

/**
 * Haversine distance in kilometers (for human-readable display).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  return haversineDistance(a, b) / 1000;
}

/**
 * Format distance in a human-readable way.
 * - < 1 km: "850 m"
 * - >= 1 km: "5.2 km"
 */
export function formatDistance(meters: number, locale: 'ar' | 'de' | 'en' = 'de'): string {
  if (meters < 1000) {
    return locale === 'ar' ? `${Math.round(meters)} م` : `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  if (locale === 'ar') {
    return `${km.toFixed(1)} كم`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Default delivery radius: 5 km (typical for European food delivery).
 * Restaurants can override via their `delivery_radius` setting.
 */
export const DEFAULT_DELIVERY_RADIUS_M = 5_000;

/**
 * Platform fallback for the MAXIMUM delivery distance when a restaurant has
 * no own `delivery_radius_km` configured. Must match the server-side order
 * validation (lib/services/delivery-zone-service.ts) — client and server
 * use this same rule via effectiveRadiusMeters().
 */
export const DEFAULT_MAX_DELIVERY_RADIUS_M = 50_000;

/**
 * Single source of truth for the per-restaurant delivery limit (meters):
 * the restaurant's own `delivery_radius_km` when configured (> 0),
 * otherwise the platform fallback.
 */
/**
 * Is this a usable geographic coordinate?
 *
 * ROOT CAUSE THIS GUARDS (Phase 8.3): the cart only checked `!= null`, so a
 * restaurant row that was never geocoded — latitude/longitude stored as 0, or
 * null coerced to 0 — passed the guard and produced a distance of ~5688 km to
 * any German address. Every valid delivery address was then rejected with
 * "zu weit vom Restaurant entfernt", regardless of the configured radius.
 *
 * 0/0 ("Null Island") is treated as MISSING data rather than a real location.
 */
export function isValidCoord(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;            // ungeocoded placeholder
  if (la < -90 || la > 90) return false;
  if (ln < -180 || ln > 180) return false;
  return true;
}

export function effectiveRadiusMeters(restaurant: { delivery_radius_km?: number | null } | null | undefined): number {
  const km = Number(restaurant?.delivery_radius_km);
  return Number.isFinite(km) && km > 0 ? km * 1000 : DEFAULT_MAX_DELIVERY_RADIUS_M;
}
