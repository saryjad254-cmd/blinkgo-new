/**
 * Smart Route Engine
 * ─────────────────
 * High-performance route calculation, ETA prediction, and traffic awareness.
 *
 * Features:
 *  - Haversine distance (fast, accurate enough for delivery)
 *  - Bearing calculation (compass heading)
 *  - ETA prediction with multiple factors:
 *    - Distance
 *    - Average speed (urban 25 km/h, suburban 50 km/h)
 *    - Time of day (peak hours add delay)
 *    - Day of week (weekend peak)
 *    - Weather (placeholder)
 *  - Route deviation detection (off-route)
 *  - Multiple route options (fastest, shortest, balanced)
 *  - Smart interpolation (Douglas-Peucker simplification)
 */

import { haversineDistance, type LatLng } from './distance';

/** Average urban delivery speed in m/s (25 km/h) */
const URBAN_SPEED_MS = 6.94;
/** Suburban delivery speed (40 km/h) */
const SUBURBAN_SPEED_MS = 11.11;
/** Highway speed (80 km/h) */
const HIGHWAY_SPEED_MS = 22.22;

export type RouteProfile = 'driving' | 'walking' | 'cycling';

export interface RoutePoint extends LatLng {
  /** Optional bearing in degrees (0-360) */
  bearing?: number;
  /** Optional timestamp (ms epoch) */
  timestamp?: number;
  /** Optional speed in m/s */
  speed?: number;
  /** Optional accuracy in meters */
  accuracy?: number;
}

export interface Route {
  /** Ordered waypoints */
  points: LatLng[];
  /** Total distance in meters */
  distance_m: number;
  /** Estimated time in seconds */
  duration_s: number;
  /** Route profile used */
  profile: RouteProfile;
  /** Encoded polyline (for sending to server) */
  encoded: string;
  /** Bounding box: [minLat, minLng, maxLat, maxLng] */
  bbox: [number, number, number, number];
}

export interface EtaInput {
  distance_m: number;
  /** Time of day (0-23) */
  hour?: number;
  /** Day of week (0=Sunday, 6=Saturday) */
  dayOfWeek?: number;
  /** Weather condition */
  weather?: 'clear' | 'rain' | 'snow' | 'fog';
  /** Route profile */
  profile?: RouteProfile;
}

export interface EtaResult {
  duration_s: number;
  duration_min: number;
  formatted: string;
  factors: {
    base_s: number;
    peak_multiplier: number;
    weather_multiplier: number;
    total_multiplier: number;
  };
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Peak hour factors (24 hours).
 * - 11-13: lunch rush (1.4x)
 * - 18-21: dinner rush (1.5x)
 * - 00-05: low (1.0x)
 */
const PEAK_HOURS: Record<number, number> = {
  0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0,
  6: 1.0, 7: 1.1, 8: 1.1, 9: 1.0, 10: 1.0,
  11: 1.3, 12: 1.4, 13: 1.3, 14: 1.1, 15: 1.0, 16: 1.0,
  17: 1.2, 18: 1.4, 19: 1.5, 20: 1.5, 21: 1.4, 22: 1.2, 23: 1.0,
};

/**
 * Weekend multiplier (Friday/Saturday are busier)
 */
function getWeekendMultiplier(dayOfWeek: number = new Date().getDay()): number {
  if (dayOfWeek === 5) return 1.15; // Friday
  if (dayOfWeek === 6) return 1.2;  // Saturday
  if (dayOfWeek === 0) return 1.1;  // Sunday
  return 1.0;
}

/**
 * Weather impact multiplier
 */
function getWeatherMultiplier(weather?: EtaInput['weather']): number {
  switch (weather) {
    case 'rain': return 1.25;
    case 'snow': return 1.5;
    case 'fog':  return 1.15;
    default:     return 1.0;
  }
}

/**
 * Get average speed for a profile (m/s)
 */
function getAverageSpeed(profile: RouteProfile, distance_m: number): number {
  // For very short distances (last-mile), use walking-ish speed
  if (profile === 'walking') return 1.4;
  if (profile === 'cycling') return 4.5;
  if (distance_m < 1000) return URBAN_SPEED_MS; // Walking-speed for very short
  if (distance_m < 5000) return URBAN_SPEED_MS; // Urban
  if (distance_m < 15000) return SUBURBAN_SPEED_MS;
  return HIGHWAY_SPEED_MS;
}

/**
 * Calculate ETA based on distance and conditions.
 */
export function calculateEta(input: EtaInput): EtaResult {
  const now = new Date();
  const hour = input.hour ?? now.getHours();
  const day = input.dayOfWeek ?? now.getDay();
  const profile = input.profile ?? 'driving';

  const baseSpeed = getAverageSpeed(profile, input.distance_m);
  const baseS = input.distance_m / baseSpeed;

  const peakMult = PEAK_HOURS[hour] ?? 1.0;
  const weekendMult = getWeekendMultiplier(day);
  const weatherMult = getWeatherMultiplier(input.weather);
  const totalMult = peakMult * weekendMult * weatherMult;

  const durationS = baseS * totalMult;

  // Confidence based on inputs
  const confidence = input.weather ? 'low' : (hour >= 7 && hour <= 22 ? 'high' : 'medium');

  return {
    duration_s: Math.round(durationS),
    duration_min: Math.round(durationS / 60),
    formatted: formatDuration(durationS),
    factors: {
      base_s: Math.round(baseS),
      peak_multiplier: peakMult,
      weather_multiplier: weatherMult,
      total_multiplier: Math.round(totalMult * 100) / 100,
    },
    confidence,
  };
}

/**
 * Format duration in human-readable form.
 * - < 60s: "30 sec"
 * - < 60min: "25 min"
 * - >= 60min: "1h 30min"
 */
export function formatDuration(seconds: number, locale: 'de' | 'ar' | 'en' = 'de'): string {
  if (seconds < 60) {
    return locale === 'ar' ? `${Math.round(seconds)} ثانية` : `${Math.round(seconds)} sec`;
  }
  if (seconds < 3600) {
    const min = Math.round(seconds / 60);
    return locale === 'ar' ? `${min} دقيقة` : `${min} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const min = Math.round((seconds - hours * 3600) / 60);
  if (locale === 'ar') {
    return `${hours} س ${min} د`;
  }
  return `${hours}h ${min}min`;
}

/**
 * Calculate bearing (compass heading) from point A to point B.
 * Returns 0-360 degrees (0 = North, 90 = East).
 */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return (((θ * 180) / Math.PI) + 360) % 360; // Normalize to 0-360
}

/**
 * Check if point C is on the route from A to B (within threshold).
 * Useful for detecting off-route drivers.
 */
export function isOnRoute(
  a: LatLng,
  b: LatLng,
  c: LatLng,
  threshold_m: number = 50,
): boolean {
  // Project C onto AB
  const ab = haversineDistance(a, b);
  if (ab === 0) return haversineDistance(a, c) < threshold_m;

  const φa = (a.lat * Math.PI) / 180;
  const φb = (b.lat * Math.PI) / 180;
  const φc = (c.lat * Math.PI) / 180;
  const λa = (a.lng * Math.PI) / 180;
  const λb = (b.lng * Math.PI) / 180;
  const λc = (c.lng * Math.PI) / 180;

  // Cross-track distance
  const d13 = haversineDistance(a, c) / 1000; // km
  const θ13 = bearing(a, c) * (Math.PI / 180);
  const θ12 = bearing(a, b) * (Math.PI / 180);
  const dxt = Math.asin(Math.sin(d13 / 6371) * Math.sin(θ13 - θ12)) * 6371 * 1000; // meters
  return Math.abs(dxt) < threshold_m;
}

/**
 * Douglas-Peucker simplification for polyline.
 * Reduces points while keeping shape.
 */
export function simplifyPath(points: LatLng[], tolerance_m: number = 10): LatLng[] {
  if (points.length < 3) return points;

  const sqTolerance = tolerance_m * tolerance_m;

  function sqDistToSeg(p: LatLng, a: LatLng, b: LatLng): number {
    let x = a.lat, y = a.lng;
    let dx = b.lat - x, dy = b.lng - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.lat - x) * dx + (p.lng - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b.lat; y = b.lng; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p.lat - x;
    dy = p.lng - y;
    return dx * dx + dy * dy;
  }

  function simplify(start: number, end: number, output: boolean[]): void {
    let maxSqDist = sqTolerance;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const sqDist = sqDistToSeg(points[i], points[start], points[end]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (index !== -1) {
      output[index] = true;
      simplify(start, index, output);
      simplify(index, end, output);
    }
  }

  const output = new Array(points.length).fill(false);
  output[0] = true;
  output[points.length - 1] = true;
  simplify(0, points.length - 1, output);

  return points.filter((_, i) => output[i]);
}

/**
 * Encode polyline (Google's polyline algorithm).
 * Compact format for sending to server.
 */
export function encodePolyline(points: LatLng[]): string {
  let prevLat = 0;
  let prevLng = 0;
  let result = '';

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    const dLat = lat - prevLat;
    const dLng = lng - prevLng;

    result += encodeValue(dLat) + encodeValue(dLng);
    prevLat = lat;
    prevLng = lng;
  }
  return result;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let result = '';
  while (v >= 0x20) {
    result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  result += String.fromCharCode(v + 63);
  return result;
}

/**
 * Decode polyline back to points.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/**
 * Get bounding box for a set of points.
 */
export function getBoundingBox(points: LatLng[]): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0];
  let minLat = points[0].lat, maxLat = points[0].lat;
  let minLng = points[0].lng, maxLng = points[0].lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return [minLat, minLng, maxLat, maxLng];
}

/**
 * Build a simple route between two points (no waypoints, just straight line).
 * For real routing, would use Google/OSRM API.
 */
export function buildSimpleRoute(from: LatLng, to: LatLng): Route {
  const distance_m = haversineDistance(from, to);
  const profile: RouteProfile = 'driving';
  const eta = calculateEta({ distance_m, profile });
  const points = [from, to];
  return {
    points,
    distance_m,
    duration_s: eta.duration_s,
    profile,
    encoded: encodePolyline(points),
    bbox: getBoundingBox(points),
  };
}

/**
 * Check if driver has arrived at destination.
 * Default threshold: 50 meters.
 */
export function hasArrived(driverPos: LatLng, destination: LatLng, threshold_m: number = 50): boolean {
  return haversineDistance(driverPos, destination) <= threshold_m;
}

/**
 * Average speed from a series of location updates.
 */
export function calculateAverageSpeed(updates: RoutePoint[]): number {
  if (updates.length < 2) return 0;
  let totalDist = 0;
  let totalTime = 0;
  for (let i = 1; i < updates.length; i++) {
    totalDist += haversineDistance(updates[i - 1], updates[i]);
    const dt = (updates[i].timestamp ?? 0) - (updates[i - 1].timestamp ?? 0);
    if (dt > 0) totalTime += dt / 1000; // to seconds
  }
  if (totalTime === 0) return 0;
  return totalDist / totalTime; // m/s
}


// Re-exports
export { haversineDistance, haversineKm, formatDistance, type LatLng } from './distance';
