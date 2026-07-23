/**
 * Server-side geocoding & routing service.
 *
 * Uses Google Maps Geocoding API for forward/reverse geocoding,
 * and the Directions API for route calculations. All calls happen
 * on the server so the API key never reaches the browser.
 *
 * Includes Nominatim fallback if the Google key is missing or quota exhausted.
 */

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY
  || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  || '';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const GOOGLE_DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';

const cache = new Map<string, { value: any; expires: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: any, ttl = CACHE_TTL_MS) {
  cache.set(key, { value, expires: Date.now() + ttl });
}

export interface GeocodedLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId?: string;
  components?: { type: string; value: string }[];
  source: 'google' | 'nominatim';
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;
  steps: {
    instruction: string;
    distanceMeters: number;
    durationSeconds: number;
  }[];
  source: 'google' | 'fallback';
}

/**
 * Forward-geocode an address to lat/lng.
 * Tries Google first, then Nominatim.
 */
export async function geocode(address: string): Promise<GeocodedLocation | null> {
  const trimmed = (address || '').trim();
  if (!trimmed) return null;

  const cacheKey = `geocode:${trimmed.toLowerCase()}`;
  const cached = cacheGet<GeocodedLocation>(cacheKey);
  if (cached) return cached;

  let result: GeocodedLocation | null = null;

  if (GOOGLE_KEY) {
    result = await geocodeGoogle(trimmed);
  }

  if (!result) {
    result = await geocodeNominatim(trimmed);
  }

  if (result) {
    cacheSet(cacheKey, result);
  }

  return result;
}

/**
 * Reverse-geocode lat/lng to a human-readable address.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedLocation | null> {
  const cacheKey = `reverse:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = cacheGet<GeocodedLocation>(cacheKey);
  if (cached) return cached;

  let result: GeocodedLocation | null = null;

  if (GOOGLE_KEY) {
    try {
      const url = `${GOOGLE_GEOCODE_URL}?latlng=${lat},${lng}&key=${GOOGLE_KEY}&language=de&region=de`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.status === 'OK' && data.results?.length) {
          const top = data.results[0];
          result = {
            lat,
            lng,
            formattedAddress: top.formatted_address,
            placeId: top.place_id,
            components: (top.address_components as any[]).map((c) => ({
              type: c.types?.[0] ?? '',
              value: c.long_name,
            })),
            source: 'google',
          };
        }
      }
    } catch (e) {
      // fall through to nominatim
    }
  }

  if (!result) {
    try {
      const url = `${NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=de&zoom=18&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BlinkGo/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && data.lat && data.lon) {
          result = {
            lat: Number(data.lat),
            lng: Number(data.lon),
            formattedAddress: data.display_name ?? '',
            components: data.address
              ? Object.entries(data.address).map(([type, value]) => ({ type, value: String(value) }))
              : [],
            source: 'nominatim',
          };
        }
      }
    } catch (e) {
      // give up
    }
  }

  if (result) {
    cacheSet(cacheKey, result);
  }

  return result;
}

/**
 * Get driving directions between two points.
 * Returns distance, duration, encoded polyline, and step-by-step instructions.
 * Falls back to Haversine distance + 30 km/h estimate if no API key.
 */
export async function getDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  options: { waypoints?: { lat: number; lng: number }[]; mode?: 'driving' | 'walking' | 'bicycling' } = {}
): Promise<RouteResult | null> {
  const cacheKey = `dir:${origin.lat},${origin.lng}-${destination.lat},${destination.lng}-${options.mode ?? 'driving'}`;
  const cached = cacheGet<RouteResult>(cacheKey);
  if (cached) return cached;

  if (!GOOGLE_KEY) {
    return haversineRoute(origin, destination);
  }

  try {
    const wp = options.waypoints?.length
      ? `&waypoints=${options.waypoints.map((p) => `${p.lat},${p.lng}`).join('|')}`
      : '';
    const mode = options.mode ?? 'driving';
    const url = `${GOOGLE_DIRECTIONS_URL}?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}${wp}&mode=${mode}&language=de&region=de&departure_time=now&traffic_model=best_guess&key=${GOOGLE_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return haversineRoute(origin, destination);
    }
    const data = (await res.json()) as any;
    if (data.status !== 'OK' || !data.routes?.length) {
      return haversineRoute(origin, destination);
    }
    const route = data.routes[0];
    const leg = route.legs[0];
    const result: RouteResult = {
      distanceMeters: leg.distance.value,
      durationSeconds: leg.duration_in_traffic?.value ?? leg.duration.value,
      polyline: route.overview_polyline.points,
      steps: (leg.steps as any[]).map((s) => ({
        instruction: s.html_instructions?.replace(/<[^>]+>/g, '') ?? '',
        distanceMeters: s.distance.value,
        durationSeconds: s.duration.value,
      })),
      source: 'google',
    };
    cacheSet(cacheKey, result);
    return result;
  } catch {
    return haversineRoute(origin, destination);
  }
}

/**
 * Distance matrix — for a single origin/destination pair, the
 * `getDirections` API is more cost-effective. This is for many-to-many.
 */
export async function getDistanceMatrix(
  origins: { lat: number; lng: number }[],
  destinations: { lat: number; lng: number }[]
): Promise<{ distanceMeters: number; durationSeconds: number }[][] | null> {
  if (!GOOGLE_KEY) return null;
  if (!origins.length || !destinations.length) return null;

  const cacheKey = `dm:${origins.length}x${destinations.length}`;
  const cached = cacheGet<{ distanceMeters: number; durationSeconds: number }[][]>(cacheKey);
  if (cached) return cached;

  const oStr = origins.map((p) => `${p.lat},${p.lng}`).join('|');
  const dStr = destinations.map((p) => `${p.lat},${p.lng}`).join('|');
  const url = `${GOOGLE_DISTANCE_MATRIX_URL}?origins=${oStr}&destinations=${dStr}&mode=driving&departure_time=now&traffic_model=best_guess&language=de&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data.status !== 'OK') return null;
    const matrix = (data.rows as any[]).map((row, i) =>
      (row.elements as any[]).map((el) => ({
        distanceMeters: el.distance?.value ?? 0,
        durationSeconds: el.duration_in_traffic?.value ?? el.duration?.value ?? 0,
      }))
    );
    cacheSet(cacheKey, matrix);
    return matrix;
  } catch {
    return null;
  }
}

/**
 * Places Autocomplete suggestions for an address.
 * Returns up to 5 predictions.
 */
export interface PlacePrediction {
  description: string;
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export async function autocomplete(input: string, options: { sessionToken?: string } = {}): Promise<PlacePrediction[]> {
  const trimmed = (input || '').trim();
  if (!trimmed || trimmed.length < 3) return [];

  const cacheKey = `ac:${trimmed.toLowerCase()}`;
  const cached = cacheGet<PlacePrediction[]>(cacheKey);
  if (cached) return cached;

  if (GOOGLE_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(trimmed)}&types=address&components=country:de&language=de&key=${GOOGLE_KEY}${options.sessionToken ? `&sessiontoken=${options.sessionToken}` : ''}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
          const out: PlacePrediction[] = (data.predictions ?? []).map((p: any) => {
            const main = p.structured_formatting?.main_text ?? p.description;
            const secondary = p.structured_formatting?.secondary_text ?? '';
            return {
              description: p.description,
              placeId: p.place_id,
              mainText: main,
              secondaryText: secondary,
            };
          });
          cacheSet(cacheKey, out);
          return out;
        }
      }
    } catch {
      // fall through
    }
  }

  // Nominatim fallback
  try {
    const url = `${NOMINATIM_URL}/search?format=json&countrycodes=de&limit=5&addressdetails=1&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BlinkGo/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const out: PlacePrediction[] = (data ?? []).map((p: any) => ({
        description: p.display_name,
        placeId: String(p.place_id ?? `${p.lat},${p.lon}`),
        mainText: p.display_name.split(',')[0]?.trim() ?? p.display_name,
        secondaryText: p.display_name.split(',').slice(1).join(',').trim(),
      }));
      cacheSet(cacheKey, out);
      return out;
    }
  } catch {
    // give up
  }

  return [];
}

// ─────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────

async function geocodeGoogle(address: string): Promise<GeocodedLocation | null> {
  try {
    const url = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}&language=de&region=de&components=country:DE`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data.status !== 'OK' || !data.results?.length) return null;
    const top = data.results[0];
    return {
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
      formattedAddress: top.formatted_address,
      placeId: top.place_id,
      components: (top.address_components as any[]).map((c) => ({
        type: c.types?.[0] ?? '',
        value: c.long_name,
      })),
      source: 'google',
    };
  } catch {
    return null;
  }
}

async function geocodeNominatim(address: string): Promise<GeocodedLocation | null> {
  try {
    const url = `${NOMINATIM_URL}/search?format=json&countrycodes=de&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BlinkGo/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data?.length) return null;
    const top = data[0];
    return {
      lat: Number(top.lat),
      lng: Number(top.lon),
      formattedAddress: top.display_name,
      placeId: String(top.place_id ?? `${top.lat},${top.lon}`),
      components: top.address
        ? Object.entries(top.address).map(([type, value]) => ({ type, value: String(value) }))
        : [],
      source: 'nominatim',
    };
  } catch {
    return null;
  }
}

function haversineRoute(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): RouteResult {
  const R = 6371000;
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((origin.lat * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // 30 km/h city average
  const durSec = (distMeters / 1000) * (3600 / 30);
  return {
    distanceMeters: distMeters,
    durationSeconds: durSec,
    polyline: '',
    steps: [],
    source: 'fallback',
  };
}

export function isGeocodingConfigured(): boolean {
  return Boolean(GOOGLE_KEY);
}
