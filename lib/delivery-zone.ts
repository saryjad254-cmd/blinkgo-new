/**
 * BlinkGo Delivery Zone — Canonical Service
 * ──────────────────────────────────────────
 * Single source of truth for all delivery-zone validation, haversine
 * distance calculations, and distance formatting.
 *
 * Hard requirements (locked):
 *  - One zone: Wesseling, Germany ({ lat: 50.8233, lng: 6.9772 })
 *  - One radius: 15 km (15_000 m)
 *  - NO restaurant-specific radius, NO polygon DB tables, NO conflicting
 *    constants. Every entry point (frontend, checkout, order API, search,
 *    driver assignment, expansion requests) funnels through this file.
 *
 * Compatibility: legacy names (`DELIVERY_ZONE`, `haversineDistance`,
 * `formatDistance`, `LatLng`) are re-exported so existing imports keep
 * working while the old `lib/maps/distance.ts`, `lib/maps/zones.ts`,
 * and `lib/services/delivery-zone-service.ts` have been removed.
 */

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Wesseling Zentrum — the one and only service center for BlinkGo. */
export const BLINKGO_SERVICE_CENTER: LatLng = {
  lat: 50.8233,
  lng: 6.9772,
};

/** Canonical delivery radius in kilometres. */
export const BLINKGO_DELIVERY_RADIUS_KM = 15;

/** Canonical delivery radius in metres. */
export const BLINKGO_DELIVERY_RADIUS_M = 15_000;

/**
 * Full delivery-zone descriptor used by UI and APIs. Includes the
 * service center, radius, postal-code allowlist, and served-city
 * labels for "Coming soon" messaging.
 */
export const BLINKGO_DELIVERY_ZONE = {
  center: BLINKGO_SERVICE_CENTER,
  radiusKm: BLINKGO_DELIVERY_RADIUS_KM,
  /** Human-readable name (used in UI). */
  name: 'Wesseling & Umgebung',
  /**
   * Postal-code prefixes INSIDE the zone (in addition to the radius
   * check). Allows slightly out-of-circle areas that are commonly
   * delivered to (e.g. Brühl is ~17 km but in the same metro).
   */
  insidePostalCodes: [
    '50389', // Wesseling
    '50354', // Hürth
    '50321', // Brühl
    '53913', // Swisttal
    '53332', // Bornheim
    '50374', // Erftstadt (partial)
    '50997', // Köln-Meschenich (partial)
    '50968', // Köln-Bayenthal (partial)
  ],
  /** Cities (display) for "Coming Soon" messaging. */
  servedCities: [
    'Wesseling', 'Hürth', 'Brühl', 'Bornheim', 'Swisttal', 'Niederkassel',
  ],
} as const;

/**
 * Backward-compat alias used by older modules and tests that still
 * reference the old `DELIVERY_ZONE` constant.
 */
export const DELIVERY_ZONE = BLINKGO_DELIVERY_ZONE;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** A geographic point in WGS84 degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Result of a delivery-zone check. */
export type ZoneCheckResult =
  | { ok: true; distanceKm: number; method: 'radius' | 'postal_code' }
  | { ok: false; distanceKm: number; method: 'radius' | 'postal_code'; reason: 'out_of_zone' };

// ─────────────────────────────────────────────────────────────
// Haversine — distance calculations
// ─────────────────────────────────────────────────────────────

/** Earth radius used by the Haversine formula (in metres). */
const EARTH_RADIUS_M = 6_371_000;

function haversineCore(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  // 2 * R * asin(sqrt(a)) — equivalent and slightly more numerically
  // stable than atan2(sqrt(x), sqrt(1 - x)). Both are valid.
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Distance in metres between two points (LatLng). */
export function haversineMeters(a: LatLng, b: LatLng): number;
/** Distance in metres between two points (raw lat/lng). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number;
export function haversineMeters(
  a: number | LatLng,
  b: number | LatLng,
  c?: number,
  d?: number,
): number {
  if (typeof a === 'number' && typeof b === 'number' && c !== undefined && d !== undefined) {
    return haversineCore(a, b, c, d);
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return haversineCore(a.lat, a.lng, b.lat, b.lng);
  }
  throw new Error('haversineMeters: invalid arguments');
}

/** Distance in kilometres between two points (LatLng). */
export function haversineKm(a: LatLng, b: LatLng): number;
/** Distance in kilometres between two points (raw lat/lng). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number;
export function haversineKm(
  a: number | LatLng,
  b: number | LatLng,
  c?: number,
  d?: number,
): number {
  if (typeof a === 'number' && typeof b === 'number' && c !== undefined && d !== undefined) {
    return haversineCore(a, b, c, d) / 1000;
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return haversineCore(a.lat, a.lng, b.lat, b.lng) / 1000;
  }
  throw new Error('haversineKm: invalid arguments');
}

/**
 * Backward-compat alias. Older code imported `haversineDistance` from
 * `lib/maps/distance`; the new canonical name is `haversineMeters`.
 */
export const haversineDistance = haversineMeters;

// ─────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────

/**
 * Format a distance in metres into a human-readable label.
 * - < 1 km: "850 m" (or "850 م" for Arabic)
 * - >= 1 km: "5.2 km" (or "5.2 كم" for Arabic)
 */
export function formatDistance(
  meters: number,
  locale: 'ar' | 'de' | 'en' = 'de',
): string {
  if (meters < 1000) {
    return locale === 'ar' ? `${Math.round(meters)} م` : `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  if (locale === 'ar') {
    return `${km.toFixed(1)} كم`;
  }
  return `${km.toFixed(1)} km`;
}

// ─────────────────────────────────────────────────────────────
// Zone check
// ─────────────────────────────────────────────────────────────

/**
 * Check whether a coordinate is inside the BlinkGo delivery zone.
 * Returns the distance (km) regardless of outcome, so the UI can show
 * "you're X km outside the zone" copy.
 *
 * Two call shapes are supported:
 *   checkDeliveryZone(lat, lng, postalCode?)
 *   checkDeliveryZone(point: LatLng, postalCode?)
 */
export function checkDeliveryZone(
  lat: number,
  lng: number,
  postalCode?: string | null,
): ZoneCheckResult;
export function checkDeliveryZone(
  point: LatLng,
  postalCode?: string | null,
): ZoneCheckResult;
export function checkDeliveryZone(
  a: number | LatLng,
  b: number | string | null | undefined,
  c?: string | null,
): ZoneCheckResult {
  let lat: number;
  let lng: number;
  let postalCode: string | null | undefined;

  if (typeof a === 'number') {
    lat = a;
    lng = b as number;
    postalCode = c;
  } else {
    lat = a.lat;
    lng = a.lng;
    postalCode = typeof b === 'string' ? b : null;
  }

  if (!isFinite(lat) || !isFinite(lng)) {
    // Treat invalid coordinates as out-of-zone, with distance 0
    return { ok: false, distanceKm: 0, method: 'radius', reason: 'out_of_zone' };
  }

  const distanceKm = haversineKm(
    BLINKGO_DELIVERY_ZONE.center.lat,
    BLINKGO_DELIVERY_ZONE.center.lng,
    lat,
    lng,
  );

  // Postal-code allowlist short-circuits the radius check.
  if (
    postalCode &&
    BLINKGO_DELIVERY_ZONE.insidePostalCodes.some((p) => postalCode.startsWith(p))
  ) {
    return { ok: true, distanceKm, method: 'postal_code' };
  }

  if (distanceKm <= BLINKGO_DELIVERY_ZONE.radiusKm) {
    return { ok: true, distanceKm, method: 'radius' };
  }
  return { ok: false, distanceKm, method: 'radius', reason: 'out_of_zone' };
}

/**
 * Boolean convenience wrapper around `checkDeliveryZone`.
 * Returns `true` if the address is inside the BlinkGo delivery zone.
 */
export function isInDeliveryZone(
  lat: number,
  lng: number,
  postalCode?: string | null,
): boolean;
export function isInDeliveryZone(
  point: LatLng,
  postalCode?: string | null,
): boolean;
export function isInDeliveryZone(
  a: number | LatLng,
  b?: number | string | null,
  c?: string | null,
): boolean {
  let result: ZoneCheckResult;
  if (typeof a === 'number') {
    result = checkDeliveryZone(a, b as number, c);
  } else {
    result = checkDeliveryZone(a, typeof b === 'string' ? b : null);
  }
  return result.ok;
}
