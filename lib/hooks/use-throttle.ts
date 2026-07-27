/**
 * useThrottle
 * ───────────
 * Throttle a value/callback. Useful for scroll/resize handlers.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

export function useThrottle<T>(value: T, interval: number = 200): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdate.current;
    if (elapsed >= interval) {
      lastUpdate.current = now;
      setThrottled(value);
    } else {
      const t = setTimeout(() => {
        lastUpdate.current = Date.now();
        setThrottled(value);
      }, interval - elapsed);
      return () => clearTimeout(t);
    }
  }, [value, interval]);

  return throttled;
}
