// Delivery Zone
// ───────────
// BlinkGo delivers from a single zone centered on Wesseling, Germany.
// The current radius is 15 km. Addresses outside this zone are rejected
// at every entry point (frontend, backend, checkout, order creation,
// restaurant search, driver assignment, admin).

export const DELIVERY_ZONE = {
  // Wesseling Zentrum (City center)
  center: {
    lat: 50.8233,
    lng: 6.9772,
  },
  // Radius in km
  radiusKm: 15,
  // Human-readable name (used in UI)
  name: 'Wesseling & Umgebung',
  // Postal-code prefixes that are INSIDE the zone (in addition to the
  // 15 km radius check). Allows slightly out-of-circle areas that are
  // commonly delivered to (e.g. Brühl is ~17km but in the same metro).
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
  // Cities (display) for "Coming Soon" messaging
  servedCities: [
    'Wesseling', 'Hürth', 'Brühl', 'Bornheim', 'Swisttal', 'Niederkassel',
  ],
};

/**
 * Great-circle distance in km (Haversine).
 * Inputs are in degrees.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // km
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type ZoneCheckResult =
  | { ok: true; distanceKm: number; method: 'radius' | 'postal_code' }
  | { ok: false; distanceKm: number; method: 'radius' | 'postal_code'; reason: 'out_of_zone' };

/**
 * Check whether a coordinate is inside the delivery zone.
 * Returns the distance (km) regardless of outcome, so the UI can show
 * "you're X km outside the zone" copy.
 */
export function checkDeliveryZone(
  lat: number,
  lng: number,
  postalCode?: string | null,
): ZoneCheckResult {
  const distanceKm = haversineKm(
    DELIVERY_ZONE.center.lat,
    DELIVERY_ZONE.center.lng,
    lat,
    lng,
  );
  if (
    postalCode &&
    DELIVERY_ZONE.insidePostalCodes.some((p) => postalCode.startsWith(p))
  ) {
    return { ok: true, distanceKm, method: 'postal_code' };
  }
  if (distanceKm <= DELIVERY_ZONE.radiusKm) {
    return { ok: true, distanceKm, method: 'radius' };
  }
  return { ok: false, distanceKm, method: 'radius', reason: 'out_of_zone' };
}
