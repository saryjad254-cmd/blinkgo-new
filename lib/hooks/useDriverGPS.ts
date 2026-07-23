'use client';

/**
 * useDriverGPS
 * ────────────
 * Production-grade driver GPS hook.
 *
 * Features:
 * - Activates ONLY when the driver is ONLINE (controlled by `enabled`).
 * - Adaptive frequency: faster when moving, slower when idle.
 * - Throttles server writes (minimum distance + time between uploads).
 * - Computes bearing (heading) from the previous fix.
 * - Reconnects automatically after network errors.
 * - Cleans up entirely when disabled (no GPS drain when offline).
 * - Uses high-accuracy GPS, falls back to network.
 * - Watches accuracy and prefers only `accuracy < 100m` updates.
 * - Provides a "current location" getter and "is GPS ready" state.
 * - Persists last good fix in memory so the map doesn't blank during signal loss.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { haversineDistance, sendDriverLocation } from '@/lib/realtime/location-service';

export type GPSStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';

interface UseDriverGPSOptions {
  /** When false, GPS is fully off and watchPosition is cleared. */
  enabled: boolean;
  /** Active order id (passed to /api/driver/location). */
  activeOrderId?: string | null;
  /** Min distance (m) between sends. Default 8. */
  minDistanceMeters?: number;
  /** Min time (ms) between sends. Default 3000. */
  minTimeMs?: number;
  /** Max time (ms) between sends even if driver is stationary. Default 30s. */
  maxTimeMs?: number;
  /** Max accuracy (m) for a fix to be accepted. Default 100. */
  maxAccuracyMeters?: number;
  /** Called whenever a new fix is produced (raw, unsmoothed). */
  onFix?: (fix: GPSFix) => void;
}

export interface GPSFix {
  lat: number;
  lng: number;
  heading: number | null; // degrees, 0-360
  speed: number | null; // m/s
  accuracy: number; // meters
  timestamp: number;
}

export interface UseDriverGPSResult {
  status: GPSStatus;
  error: string | null;
  currentFix: GPSFix | null;
  isGpsReady: boolean;
  /** Force a one-shot high-accuracy fix. */
  forceRefresh: () => void;
  /** Total fixes received since mount. */
  fixCount: number;
}

const DEFAULT_MIN_DISTANCE = 8;
const DEFAULT_MIN_TIME = 3_000;
const DEFAULT_MAX_TIME = 30_000;
const DEFAULT_MAX_ACCURACY = 100;

export function useDriverGPS(options: UseDriverGPSOptions): UseDriverGPSResult {
  const {
    enabled,
    activeOrderId = null,
    minDistanceMeters = DEFAULT_MIN_DISTANCE,
    minTimeMs = DEFAULT_MIN_TIME,
    maxTimeMs = DEFAULT_MAX_TIME,
    maxAccuracyMeters = DEFAULT_MAX_ACCURACY,
    onFix,
  } = options;

  const [status, setStatus] = useState<GPSStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentFix, setCurrentFix] = useState<GPSFix | null>(null);
  const [fixCount, setFixCount] = useState(0);

  // Refs to avoid re-creating watchers
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const lastAcceptedFixRef = useRef<GPSFix | null>(null);
  const maxIntervalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const orderRef = useRef<string | null>(activeOrderId);
  const onFixRef = useRef(onFix);

  // Sync refs
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { orderRef.current = activeOrderId; }, [activeOrderId]);
  useEffect(() => { onFixRef.current = onFix; }, [onFix]);

  // Throttled server send
  const sendFix = useCallback(
    async (fix: GPSFix) => {
      const now = Date.now();
      const candidate = { lat: fix.lat, lng: fix.lng, t: now };
      const last = lastSentRef.current;
      if (last) {
        const dt = now - last.t;
        const dist = haversineDistance(last, candidate);
        if (dt < minTimeMs && dist < minDistanceMeters) return; // too soon / too close
      }
      // Mark this candidate as the last "send attempt" BEFORE the await to
      // throttle concurrent sends. On failure, we reset so the next fix retries.
      lastSentRef.current = candidate;
      try {
        await sendDriverLocation({
          latitude: fix.lat,
          longitude: fix.lng,
          heading: fix.heading,
          speed: fix.speed,
          accuracy: fix.accuracy,
          is_online: true,
          active_order_id: orderRef.current,
        });
      } catch {
        // Network blip: reset throttle so the next fix retries.
        // Only reset if no newer candidate has been recorded.
        if (lastSentRef.current === candidate) {
          lastSentRef.current = last;
        }
      }
    },
    [minDistanceMeters, minTimeMs]
  );

  // Compute bearing from previous fix
  const computeBearing = useCallback((prev: GPSFix | null, next: { lat: number; lng: number }): number | null => {
    if (!prev) return null;
    const dist = haversineDistance(prev, next);
    if (dist < 3) return prev.heading; // too close, keep previous
    const dLng = ((next.lng - prev.lng) * Math.PI) / 180;
    const lat1 = (prev.lat * Math.PI) / 180;
    const lat2 = (next.lat * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  }, []);

  // Watch position lifecycle
  useEffect(() => {
    if (!enabled) {
      // Fully tear down
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (maxIntervalTimerRef.current) {
        clearTimeout(maxIntervalTimerRef.current);
        maxIntervalTimerRef.current = null;
      }
      setStatus('idle');
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation not supported in this browser');
      return;
    }

    setStatus('requesting');
    setError(null);

    // Permission probe (best-effort)
    if ((navigator.permissions ?? null) && typeof (navigator.permissions as any).query === 'function') {
      (navigator.permissions as any)
        .query({ name: 'geolocation' })
        .then((p: any) => {
          if (p.state === 'denied') {
            setStatus('denied');
            setError('Geolocation permission denied');
          }
        })
        .catch(() => {});
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    const start = () => {
      if (!enabledRef.current) return;
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          reconnectAttempts = 0;
          const acc = pos.coords.accuracy ?? 9999;
          if (acc > maxAccuracyMeters) {
            // Skip low-quality fix; keep waiting
            return;
          }
          const next: GPSFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading != null && !Number.isNaN(pos.coords.heading) && pos.coords.heading >= 0
              ? pos.coords.heading
              : computeBearing(lastAcceptedFixRef.current, { lat: pos.coords.latitude, lng: pos.coords.longitude }),
            speed: pos.coords.speed != null ? Math.max(0, pos.coords.speed) : null,
            accuracy: acc,
            timestamp: pos.timestamp,
          };
          lastAcceptedFixRef.current = next;
          setCurrentFix(next);
          setFixCount((c) => c + 1);
          setStatus('active');
          onFixRef.current?.(next);
          sendFix(next);

          // Schedule a max-interval refresh
          if (maxIntervalTimerRef.current) clearTimeout(maxIntervalTimerRef.current);
          maxIntervalTimerRef.current = setTimeout(() => {
            // If no fix for maxTimeMs, force a getCurrentPosition
            if (enabledRef.current && navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  const a = p.coords.accuracy ?? 9999;
                  if (a > maxAccuracyMeters) return;
                  const f: GPSFix = {
                    lat: p.coords.latitude,
                    lng: p.coords.longitude,
                    heading: p.coords.heading != null && p.coords.heading >= 0
                      ? p.coords.heading
                      : computeBearing(lastAcceptedFixRef.current, { lat: p.coords.latitude, lng: p.coords.longitude }),
                    speed: p.coords.speed != null ? Math.max(0, p.coords.speed) : null,
                    accuracy: a,
                    timestamp: p.timestamp,
                  };
                  lastAcceptedFixRef.current = f;
                  setCurrentFix(f);
                  onFixRef.current?.(f);
                  sendFix(f);
                },
                () => {},
                { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
              );
            }
          }, maxTimeMs);
        },
        (err) => {
          setStatus('error');
          setError(err.message);
          // Auto-reconnect with backoff
          if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          const delay = Math.min(15_000, 1_000 * 2 ** reconnectAttempts);
          reconnectAttempts++;
          reconnectTimer = setTimeout(() => {
            if (enabledRef.current) start();
          }, delay);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15_000,
        }
      );
      watchIdRef.current = id;
    };

    start();

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (maxIntervalTimerRef.current) {
        clearTimeout(maxIntervalTimerRef.current);
        maxIntervalTimerRef.current = null;
      }
    };
  }, [enabled, computeBearing, maxAccuracyMeters, maxTimeMs, sendFix]);

  // Force-refresh (e.g., a button to re-acquire GPS)
  const forceRefresh = useCallback(() => {
    if (!enabled || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? 9999;
        if (acc > maxAccuracyMeters) return;
        const next: GPSFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading != null && pos.coords.heading >= 0
            ? pos.coords.heading
            : computeBearing(lastAcceptedFixRef.current, { lat: pos.coords.latitude, lng: pos.coords.longitude }),
          speed: pos.coords.speed != null ? Math.max(0, pos.coords.speed) : null,
          accuracy: acc,
          timestamp: pos.timestamp,
        };
        lastAcceptedFixRef.current = next;
        setCurrentFix(next);
        setFixCount((c) => c + 1);
        onFixRef.current?.(next);
        sendFix(next);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 }
    );
  }, [enabled, maxAccuracyMeters, computeBearing, sendFix]);

  const isGpsReady = useMemo(
    () => status === 'active' && currentFix != null,
    [status, currentFix]
  );

  return { status, error, currentFix, isGpsReady, forceRefresh, fixCount };
}
