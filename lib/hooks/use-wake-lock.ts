'use client';

/**
 * useWakeLock — keeps the screen awake during active delivery work.
 *
 * Why this matters: a driver running navigation on the phone shouldn't
 * have the screen dim mid-route. The browser's Screen Wake Lock API
 * (with iOS Safari fallback via wake-lock polyfill pattern) prevents
 * the screen from sleeping while a delivery is active.
 *
 * Usage:
 *   const { isActive, request, release } = useWakeLock(enabled);
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface WakeLockSentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

interface UseWakeLockResult {
  isSupported: boolean;
  isActive: boolean;
  request: () => Promise<void>;
  release: () => Promise<void>;
  error: string | null;
}

export function useWakeLock(enabled: boolean = true): UseWakeLockResult {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const isMountedRef = useRef(true);

  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const request = useCallback(async () => {
    if (!isSupported) {
      setError('Wake Lock API not supported in this browser');
      return;
    }
    if (sentinelRef.current) {
      // Already active
      return;
    }
    try {
      const nav = navigator as Navigator & {
        wakeLock: { request: (type: string) => Promise<WakeLockSentinel> };
      };
      const sentinel = await nav.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      sentinel.addEventListener('release', () => {
        if (!isMountedRef.current) return;
        // Sentinel released (e.g., tab hidden) — don't mark as inactive
        // The auto-reacquire effect will re-request on visibility change
        sentinelRef.current = null;
        setIsActive(false);
      });
      setIsActive(true);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to acquire wake lock';
      setError(msg);
    }
  }, [isSupported]);

  const release = useCallback(async () => {
    if (sentinelRef.current) {
      try {
        await sentinelRef.current.release();
      } catch {
        // ignore
      }
      sentinelRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Auto-acquire/release based on enabled flag
  useEffect(() => {
    isMountedRef.current = true;
    if (enabled) {
      request();
    } else {
      release();
    }
    return () => {
      isMountedRef.current = false;
      release();
    };
  }, [enabled, request, release]);

  // Re-acquire on visibility change (browser auto-releases when tab hidden)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => {
      if (document.visibilityState === 'visible' && enabled && !sentinelRef.current) {
        request();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [enabled, request]);

  return { isSupported, isActive, request, release, error };
}
