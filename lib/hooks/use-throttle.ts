/**
 * useThrottle
 * ───────────
 * Throttle a value/callback. Useful for scroll/resize handlers.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

export function useThrottle<T>(value: T, interval: number = 200): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdate.current;
    const delay = lastUpdate.current === 0 || elapsed >= interval ? 0 : interval - elapsed;
    const timer = setTimeout(() => {
      lastUpdate.current = Date.now();
      setThrottled(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, interval]);

  return throttled;
}
