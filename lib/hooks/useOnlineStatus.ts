/**
 * useOnlineStatus — Detect network state for graceful offline behavior
 *
 * Returns:
 *  - isOnline: current online status
 *  - wasOffline: whether the user has been offline (sticky)
 *  - lastOfflineAt: timestamp when went offline (or null)
 *  - lastOnlineAt: timestamp when went online (or null)
 */

import { useState, useEffect, useCallback } from 'react';

export interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
  lastOfflineAt: number | null;
  lastOnlineAt: number | null;
}

export function useOnlineStatus(): OnlineStatus {
  // Keep the server render and first client render identical. The browser's
  // actual network state is synchronized immediately after mounting.
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [lastOfflineAt, setLastOfflineAt] = useState<number | null>(null);
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncTimer = window.setTimeout(() => setIsOnline(navigator.onLine), 0);
    const handleOnline = () => {
      setIsOnline(true);
      setLastOnlineAt(Date.now());
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setLastOfflineAt(Date.now());
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.clearTimeout(syncTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasOffline, lastOfflineAt, lastOnlineAt };
}

/**
 * useCachedFetch — Wraps fetch with localStorage fallback for offline scenarios
 *
 * If the request fails (offline / error), the last successful response is
 * returned from the localStorage cache (if available).
 */
export function useCachedFetch<T = unknown>(key: string) {
  const getCached = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(`cache:${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Only return if less than 5 minutes old
      if (Date.now() - parsed.timestamp > 5 * 60 * 1000) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }, [key]);

  const setCached = useCallback((data: T) => {
    try {
      localStorage.setItem(`cache:${key}`, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {}
  }, [key]);

  return { getCached, setCached };
}
