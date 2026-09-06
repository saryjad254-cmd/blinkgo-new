/**
 * Driver Dispatch — Location Validation, GPS Freshness, Working Hours
 * ────────────────────────────────────────────────────────────────────
 * Server-authoritative helpers used by the auto-dispatch route and the
 * driver-side location route.
 *
 * Why this exists:
 *  - Browser-calculated distance is untrusted; we always validate coordinates
 *    on the server before using them for any decision.
 *  - Stale GPS data must not be treated as a "nearby driver" location.
 *  - Working hours are DB-driven (driver_working_hours) and we must check
 *    them against the current Berlin-local time, not the server UTC.
 *
 * No environment variables, no Supabase client — pure functions for testability.
 */

/** Maximum age (ms) for a location to be considered "fresh" for dispatch. */
export const GPS_FRESH_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum age (ms) for a location to be "usable" for ETA/distance. */
export const GPS_USABLE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Validate a latitude/longitude pair.
 *
 * Rejects:
 *  - non-numbers, NaN, Infinity
 *  - null / undefined
 *  - lat out of [-90, 90]
 *  - lng out of [-180, 180]
 *  - (0, 0) — the canonical "null island", almost always a bug for Berlin ops
 *
 * Returns either { ok: true, lat, lng } or { ok: false, reason }.
 */
export function validateLocation(
  lat: unknown,
  lng: unknown
): { ok: true; lat: number; lng: number } | { ok: false; reason: string } {
  if (lat == null || lng == null) {
    return { ok: false, reason: 'lat/lng is null' };
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { ok: false, reason: 'lat/lng not a number' };
  }
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, reason: 'lat/lng is NaN' };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'lat/lng is Infinity' };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, reason: 'lat out of range [-90, 90]' };
  }
  if (lng < -180 || lng > 180) {
    return { ok: false, reason: 'lng out of range [-180, 180]' };
  }
  if (lat === 0 && lng === 0) {
    return { ok: false, reason: 'lat/lng is (0,0) — null island rejected' };
  }
  return { ok: true, lat, lng };
}

/**
 * Classify a location's freshness.
 *
 *   - "fresh"   : updated within GPS_FRESH_MS  → safe for dispatch
 *   - "usable"  : updated within GPS_USABLE_MS → safe for ETA only, NOT dispatch
 *   - "stale"   : older than GPS_USABLE_MS     → exclude from auto-dispatch
 *   - "missing" : no timestamp at all          → exclude from auto-dispatch
 *
 * The `updatedAt` parameter is the value of `driver_status.updated_at`.
 * If undefined / null, returns "missing".
 */
export type LocationFreshness = 'fresh' | 'usable' | 'stale' | 'missing';

export function classifyLocationFreshness(updatedAt: string | null | undefined): {
  status: LocationFreshness;
  ageMs: number | null;
} {
  if (!updatedAt) {
    return { status: 'missing', ageMs: null };
  }
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) {
    return { status: 'missing', ageMs: null };
  }
  const age = Date.now() - t;
  if (age <= GPS_FRESH_MS) return { status: 'fresh', ageMs: age };
  if (age <= GPS_USABLE_MS) return { status: 'usable', ageMs: age };
  return { status: 'stale', ageMs: age };
}

/**
 * Whether a driver is eligible for auto-dispatch given their freshness.
 * Only "fresh" locations qualify; "usable" and below are excluded from
 * auto-dispatch but the driver's row is still returned (with a flag).
 */
export function isAutoDispatchable(freshness: LocationFreshness): boolean {
  return freshness === 'fresh';
}

/**
 * Working hours check.
 *
 * The DB stores `day_of_week` as 0-6 (0=Sunday).
 * `start_time` / `end_time` are `time` columns (HH:MM:SS).
 *
 * Policy:
 *  - If NO schedule is set (rows empty): the driver is allowed (don't lock
 *    out drivers who haven't set hours yet).
 *  - If a schedule IS set but the current day is not covered: the driver is
 *    BLOCKED. (Matches the strict behavior of the existing /api/driver/online
 *    route which uses 7-row schedules.)
 *  - If the day is covered but is_enabled=false: the driver is BLOCKED.
 *  - If the day is covered, enabled, and current time is within
 *    [start_time, end_time): the driver is ALLOWED.
 *  - End time is EXCLUSIVE (so 17:00:00 means "blocks at exactly 17:00").
 */
export interface WorkingHourRow {
  day_of_week: number;
  start_time: string; // HH:MM:SS
  end_time: string;
  is_enabled: boolean;
}

export function isWithinWorkingHours(
  rows: WorkingHourRow[],
  now: Date
): { within: boolean; matched: WorkingHourRow | null } {
  // Empty schedule = no constraint (let the driver work until they set hours).
  if (!rows || rows.length === 0) {
    return { within: true, matched: null };
  }
  const day = now.getDay(); // 0 = Sunday
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const nowTime = `${hh}:${mm}:${ss}`;

  // The current day MUST have an entry in the schedule.
  const todays = rows.filter((r) => r.day_of_week === day);
  if (todays.length === 0) {
    return { within: false, matched: null }; // day not covered → blocked
  }
  // The day must be enabled and the time must be within the window.
  for (const row of todays) {
    if (!row.is_enabled) continue;
    if (nowTime >= row.start_time && nowTime < row.end_time) {
      return { within: true, matched: row };
    }
  }
  return { within: false, matched: null };
}

/**
 * Distance in meters between two valid lat/lng pairs (Haversine).
 * Returns Infinity if either input is invalid.
 */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
