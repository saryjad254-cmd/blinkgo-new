/**
 * Smooth Position Tracker Hook
 * ────────────────────────────
 * React hook for smoothly tracking a moving position (e.g. driver).
 * Uses MarkerAnimator for buttery 60fps animation.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { MarkerAnimator } from './animation';
import { haversineDistance, type LatLng } from './distance';
import { bearing } from './route-engine';

export interface UseSmoothTrackerOptions {
  /** Initial position */
  initial: LatLng | null;
  /** Smoothing duration in ms (default 2000) */
  duration_ms?: number;
  /** Snap if distance > this (default 500m) - no animation */
  snap_threshold_m?: number;
}

export function useSmoothTracker(options: UseSmoothTrackerOptions) {
  const { initial, duration_ms = 2000, snap_threshold_m = 500 } = options;
  const [position, setPosition] = useState<LatLng | null>(initial);
  const [heading, setHeading] = useState<number | null>(null);
  const animatorRef = useRef<MarkerAnimator | null>(null);
  const lastUpdateRef = useRef<LatLng | null>(initial);
  const velocityRef = useRef<number>(0);

  useEffect(() => {
    const anim = new MarkerAnimator();
    animatorRef.current = anim;
    const unsub = anim.subscribe((p) => setPosition(p));
    return () => {
      unsub();
      anim.destroy();
    };
  }, []);

  const update = (next: LatLng) => {
    const anim = animatorRef.current;
    const last = lastUpdateRef.current;
    if (!anim || !last) {
      lastUpdateRef.current = next;
      setPosition(next);
      return;
    }

    const dist = haversineDistance(last, next);
    if (dist > snap_threshold_m) {
      // Too far — snap
      lastUpdateRef.current = next;
      setPosition(next);
      velocityRef.current = 0;
      return;
    }

    // Calculate heading
    if (dist > 5) {
      const h = bearing(last, next);
      setHeading(h);
    }

    // Estimate velocity (assuming updates every ~3s)
    velocityRef.current = dist / 3; // m/s
    lastUpdateRef.current = next;
    anim.setPosition(next.lat, next.lng, duration_ms);
  };

  const setImmediate = (p: LatLng) => {
    lastUpdateRef.current = p;
    setPosition(p);
  };

  return {
    position,
    heading,
    velocity_ms: velocityRef.current,
    update,
    setImmediate,
  };
}
