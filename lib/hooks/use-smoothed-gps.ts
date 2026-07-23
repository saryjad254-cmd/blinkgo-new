'use client';

/**
 * useSmoothedGPS — smooths noisy GPS signals with exponential moving average.
 *
 * Drivers in dense urban areas or near tall buildings get jittery GPS.
 * This hook:
 * - Smooths lat/lng using a velocity-aware EMA filter
 * - Detects and discards outliers (jumps > 50m that aren't supported by speed)
 * - Rejects low-quality fixes (accuracy > threshold)
 * - Maintains a "previous fix" buffer for Kalman-style prediction
 * - Reports the underlying accuracy to UI for confidence indication
 *
 * The output is suitable for both map rendering and route ETA calculations.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { haversineDistance, type LatLng } from '@/lib/maps/distance';

export interface SmoothedFix {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
  /** Confidence score 0-1: 1 = very confident, 0 = very uncertain. */
  confidence: number;
  /** Whether this fix was interpolated from previous (signal lost briefly). */
  isInterpolated: boolean;
  /** Time since last real fix, in ms. */
  timeSinceLastRealFix: number;
}

interface UseSmoothedGPSOptions {
  /** When false, smoothing is paused. */
  enabled: boolean;
  /** Smoothing factor 0-1. Higher = more reactive, lower = smoother. Default 0.4. */
  alpha?: number;
  /** Reject fixes further than this from prediction (m). Default 80. */
  outlierThresholdMeters?: number;
  /** Minimum accuracy (worst) to accept a fix in meters. Default 100. */
  maxAccuracyMeters?: number;
  /** Interval at which to predict position if no fix arrives. Default 4000. */
  predictionIntervalMs?: number;
  /** Called for each smoothed fix (real or interpolated). */
  onFix?: (fix: SmoothedFix) => void;
}

interface UseSmoothedGPSResult {
  current: SmoothedFix | null;
  status: 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';
  error: string | null;
  totalFixes: number;
  rejectedFixes: number;
}

const DEFAULT_ALPHA = 0.4;
const DEFAULT_OUTLIER_M = 80;
const DEFAULT_MAX_ACCURACY = 100;
const DEFAULT_PREDICTION_MS = 4000;

export function useSmoothedGPS(options: UseSmoothedGPSOptions): UseSmoothedGPSResult {
  const {
    enabled,
    alpha = DEFAULT_ALPHA,
    outlierThresholdMeters = DEFAULT_OUTLIER_M,
    maxAccuracyMeters = DEFAULT_MAX_ACCURACY,
    predictionIntervalMs = DEFAULT_PREDICTION_MS,
    onFix,
  } = options;

  const [current, setCurrent] = useState<SmoothedFix | null>(null);
  const [status, setStatus] = useState<UseSmoothedGPSResult['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [totalFixes, setTotalFixes] = useState(0);
  const [rejectedFixes, setRejectedFixes] = useState(0);

  const smoothedRef = useRef<{ lat: number; lng: number; timestamp: number; speed: number | null; heading: number | null } | null>(null);
  const lastRealFixRef = useRef<{ lat: number; lng: number; timestamp: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const predictTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFixRef = useRef(onFix);
  useEffect(() => { onFixRef.current = onFix; }, [onFix]);

  const computeBearing = useCallback((from: LatLng, to: LatLng): number => {
    const dLng = ((to.lng - from.lng) * Math.PI) / 180;
    const lat1 = (from.lat * Math.PI) / 180;
    const lat2 = (to.lat * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }, []);

  const emitFix = useCallback((fix: SmoothedFix) => {
    setCurrent(fix);
    onFixRef.current?.(fix);
  }, []);

  const ingestFix = useCallback(
    (rawLat: number, rawLng: number, accuracy: number, speed: number | null, heading: number | null, timestamp: number, isReal: boolean) => {
      // Reject low-accuracy fixes (only for real fixes, not predictions)
      if (isReal && accuracy > maxAccuracyMeters) {
        setRejectedFixes((c) => c + 1);
        return;
      }

      const prev = smoothedRef.current;
      const lastReal = lastRealFixRef.current;
      const candidate: LatLng = { lat: rawLat, lng: rawLng };

      // Outlier detection
      if (isReal && lastReal) {
        const dt = (timestamp - lastReal.timestamp) / 1000;
        const dist = haversineDistance(lastReal, candidate);
        // If the driver "moved" more than 50m/s (180 km/h), it's a GPS jump
        if (dt > 0 && dist / dt > 50) {
          setRejectedFixes((c) => c + 1);
          return;
        }
        // Outlier threshold
        if (dist > outlierThresholdMeters && dt < 5) {
          setRejectedFixes((c) => c + 1);
          return;
        }
      }

      let smoothedLat: number;
      let smoothedLng: number;
      let smoothedSpeed: number | null;
      let smoothedHeading: number | null;

      if (prev) {
        // Exponential moving average
        smoothedLat = prev.lat * (1 - alpha) + rawLat * alpha;
        smoothedLng = prev.lng * (1 - alpha) + rawLng * alpha;
        // Speed: prefer raw if available, else keep previous
        smoothedSpeed = speed != null && speed >= 0 ? speed : prev.speed;
        // Heading: prefer device, else compute from previous
        smoothedHeading = heading != null && heading >= 0
          ? heading
          : computeBearing({ lat: prev.lat, lng: prev.lng }, candidate);
      } else {
        smoothedLat = rawLat;
        smoothedLng = rawLng;
        smoothedSpeed = speed != null && speed >= 0 ? speed : null;
        smoothedHeading = heading != null && heading >= 0 ? heading : null;
      }

      smoothedRef.current = {
        lat: smoothedLat,
        lng: smoothedLng,
        timestamp,
        speed: smoothedSpeed,
        heading: smoothedHeading,
      };

      if (isReal) {
        lastRealFixRef.current = { lat: smoothedLat, lng: smoothedLng, timestamp };
      }

      // Confidence: higher accuracy (lower m) = higher confidence
      const confidence = Math.max(0, Math.min(1, 1 - accuracy / 100));
      const timeSinceLastRealFix = lastRealFixRef.current
        ? timestamp - lastRealFixRef.current.timestamp
        : 0;

      const fix: SmoothedFix = {
        lat: smoothedLat,
        lng: smoothedLng,
        accuracy,
        speed: smoothedSpeed,
        heading: smoothedHeading,
        timestamp,
        confidence,
        isInterpolated: !isReal,
        timeSinceLastRealFix,
      };

      if (isReal) setTotalFixes((c) => c + 1);
      emitFix(fix);
    },
    [alpha, maxAccuracyMeters, outlierThresholdMeters, computeBearing, emitFix]
  );

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (predictTimerRef.current) {
        clearInterval(predictTimerRef.current);
        predictTimerRef.current = null;
      }
      setStatus('idle');
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation not supported');
      return;
    }

    setStatus('requesting');
    setError(null);

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? 9999;
        const speed = pos.coords.speed != null ? Math.max(0, pos.coords.speed) : null;
        const heading = pos.coords.heading != null && pos.coords.heading >= 0
          ? pos.coords.heading
          : null;
        ingestFix(
          pos.coords.latitude,
          pos.coords.longitude,
          acc,
          speed,
          heading,
          pos.timestamp,
          true
        );
        setStatus('active');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        setError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 15000 }
    );
    watchIdRef.current = id;

    // Predict position periodically if no real fix arrives
    predictTimerRef.current = setInterval(() => {
      const last = smoothedRef.current;
      if (!last || last.speed == null || last.speed < 0.5) return;
      // Predict ~4s ahead using last known speed and heading
      const dt = predictionIntervalMs / 1000;
      const distM = last.speed * dt;
      // Convert m to lat/lng delta
      const dLat = (distM * Math.cos(((last.heading ?? 0) * Math.PI) / 180)) / 111_320;
      const dLng = (distM * Math.sin(((last.heading ?? 0) * Math.PI) / 180)) /
        (111_320 * Math.cos((last.lat * Math.PI) / 180));
      ingestFix(
        last.lat + dLat,
        last.lng + dLng,
        30, // Assumed moderate accuracy for prediction
        last.speed,
        last.heading,
        Date.now(),
        false
      );
    }, predictionIntervalMs);

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (predictTimerRef.current) {
        clearInterval(predictTimerRef.current);
        predictTimerRef.current = null;
      }
    };
  }, [enabled, ingestFix, predictionIntervalMs]);

  return { current, status, error, totalFixes, rejectedFixes };
}
