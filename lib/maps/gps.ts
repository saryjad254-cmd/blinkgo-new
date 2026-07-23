/**
 * GPS Reliability Utilities
 * ─────────────────────────
 * Robust GPS handling for delivery drivers:
 *  - Drift filter (Kalman-like smoothing)
 *  - Accuracy validation
 *  - Duplicate detection
 *  - Offline queue
 *  - Battery-aware update frequency
 */

import { haversineDistance, type LatLng } from './distance';

export interface RawGpsFix {
  lat: number;
  lng: number;
  accuracy?: number | null;   // meters
  speed?: number | null;       // m/s
  heading?: number | null;     // degrees 0-360
  altitude?: number | null;     // meters
  timestamp: number;             // ms epoch
}

export interface CleanGpsFix extends RawGpsFix {
  /** Whether the fix passed validation */
  valid: boolean;
  /** Reason if invalid */
  invalidReason?: string;
  /** Smoothed position (Kalman filter) */
  smoothedLat: number;
  smoothedLng: number;
}

const ACCURACY_THRESHOLD_M = 100; // Reject if accuracy > 100m
const MIN_DISTANCE_M = 3;         // Less than 3m is probably noise
const MAX_JUMP_M = 500;           // More than 500m jump in 5s = impossible (drift)

/**
 * Validate a GPS fix.
 * Returns a clean fix with validity flag and smoothed position.
 */
export function validateFix(
  raw: RawGpsFix,
  lastFix?: CleanGpsFix,
): CleanGpsFix {
  // Basic range checks
  if (raw.lat < -90 || raw.lat > 90 || raw.lng < -180 || raw.lng > 180) {
    return createInvalid(raw, 'Coordinates out of range');
  }

  // Reject very inaccurate fixes
  if (raw.accuracy && raw.accuracy > ACCURACY_THRESHOLD_M) {
    return createInvalid(raw, `Low accuracy: ${Math.round(raw.accuracy)}m`);
  }

  // Reject NaN / Infinity
  if (!isFinite(raw.lat) || !isFinite(raw.lng)) {
    return createInvalid(raw, 'NaN or Infinity coordinates');
  }

  // If we have a previous fix, check for impossible jumps
  if (lastFix && lastFix.valid) {
    const dist = haversineDistance(
      { lat: lastFix.smoothedLat, lng: lastFix.smoothedLng },
      { lat: raw.lat, lng: raw.lng },
    );
    const dt = (raw.timestamp - lastFix.timestamp) / 1000; // seconds

    // Reject impossible jumps
    if (dt > 0 && dt < 5 && dist > MAX_JUMP_M) {
      return createInvalid(raw, `Impossible jump: ${Math.round(dist)}m in ${dt.toFixed(1)}s`);
    }

    // Reject fixes that are too close (probably noise)
    if (dt > 0 && dist < MIN_DISTANCE_M) {
      // Still valid, but mark as duplicate
      return {
        ...raw,
        valid: true,
        invalidReason: 'duplicate',
        // Keep previous smoothed position
        smoothedLat: lastFix.smoothedLat,
        smoothedLng: lastFix.smoothedLng,
      };
    }
  }

  // Apply Kalman-like smoothing
  const smoothed = lastFix
    ? kalmanSmooth(
        { lat: lastFix.smoothedLat, lng: lastFix.smoothedLng },
        { lat: raw.lat, lng: raw.lng },
        raw.accuracy ?? 30,
      )
    : { lat: raw.lat, lng: raw.lng };

  return {
    ...raw,
    valid: true,
    smoothedLat: smoothed.lat,
    smoothedLng: smoothed.lng,
  };
}

function createInvalid(raw: RawGpsFix, reason: string): CleanGpsFix {
  return {
    ...raw,
    valid: false,
    invalidReason: reason,
    smoothedLat: raw.lat,
    smoothedLng: raw.lng,
  };
}

/**
 * Simple Kalman-like smoothing.
 * Higher accuracy = trust new fix more.
 */
function kalmanSmooth(
  prev: LatLng,
  current: LatLng,
  accuracy: number,
): LatLng {
  // Confidence in new fix (0-1, higher = more confident)
  const confidence = Math.max(0, Math.min(1, 1 - accuracy / 100));
  // Smoothing factor: more smoothing when accuracy is low
  const alpha = confidence * 0.7; // up to 0.7 weight to new

  return {
    lat: prev.lat * (1 - alpha) + current.lat * alpha,
    lng: prev.lng * (1 - alpha) + current.lng * alpha,
  };
}

/**
 * Smart update frequency based on speed and accuracy.
 * - Fast-moving driver: send more often
 * - Stationary: send less often
 * - Low accuracy: send more often
 * - High accuracy: can send less often
 */
export interface UpdateFrequency {
  /** Recommended interval in ms */
  intervalMs: number;
  /** Whether to send this fix */
  shouldSend: boolean;
  reason: string;
}

export function getUpdateInterval(
  speed: number | null | undefined,  // m/s
  accuracy: number | null | undefined, // meters
  batteryLevel?: number, // 0-1
): UpdateFrequency {
  // Default: 5 seconds
  let intervalMs = 5000;
  let reason = 'default';

  // Speed-based: faster = more updates
  if (speed != null) {
    if (speed > 15) { intervalMs = 2000; reason = 'high speed'; }       // > 54 km/h
    else if (speed > 5) { intervalMs = 3000; reason = 'medium speed'; } // > 18 km/h
    else if (speed < 0.5) { intervalMs = 15000; reason = 'stationary'; }
  }

  // Accuracy-based: low accuracy = more updates
  if (accuracy != null) {
    if (accuracy > 50) intervalMs = Math.min(intervalMs, 2000);
    else if (accuracy < 10) intervalMs = Math.max(intervalMs, 10000);
  }

  // Battery-based: low battery = fewer updates
  if (batteryLevel != null && batteryLevel < 0.2) {
    intervalMs = Math.max(intervalMs, 15000);
    reason += ' + low battery';
  }

  return {
    intervalMs,
    shouldSend: true,
    reason,
  };
}

/**
 * GPS update queue — for offline scenarios.
 */
export class GpsQueue {
  private queue: RawGpsFix[] = [];
  private flushing = false;
  private maxSize = 100;

  enqueue(fix: RawGpsFix) {
    this.queue.push(fix);
    if (this.queue.length > this.maxSize) {
      // Drop oldest
      this.queue.shift();
    }
  }

  size(): number {
    return this.queue.length;
  }

  /**
   * Flush queue by calling sender for each item.
   * If sender returns false (network error), keep the item.
   */
  async flush(sender: (fix: RawGpsFix) => Promise<boolean>): Promise<{ sent: number; kept: number }> {
    if (this.flushing) return { sent: 0, kept: this.queue.length };
    this.flushing = true;
    let sent = 0;
    let kept = 0;
    const newQueue: RawGpsFix[] = [];
    for (const fix of this.queue) {
      try {
        const ok = await sender(fix);
        if (ok) sent++;
        else newQueue.push(fix);
      } catch {
        newQueue.push(fix);
      }
    }
    this.queue = newQueue;
    this.flushing = false;
    return { sent, kept: newQueue.length };
  }

  clear() {
    this.queue = [];
  }
}

/**
 * Format speed for display.
 */
export function formatSpeed(mps: number, locale: 'de' | 'ar' | 'en' = 'de'): string {
  const kmh = mps * 3.6;
  if (locale === 'ar') return `${kmh.toFixed(0)} كم/س`;
  return `${kmh.toFixed(0)} km/h`;
}

/**
 * Format accuracy for display.
 */
export function formatAccuracy(meters: number, locale: 'de' | 'ar' | 'en' = 'de'): string {
  if (meters < 1000) {
    return locale === 'ar' ? `±${Math.round(meters)} م` : `±${Math.round(meters)} m`;
  }
  return locale === 'ar' ? `±${(meters / 1000).toFixed(1)} كم` : `±${(meters / 1000).toFixed(1)} km`;
}
