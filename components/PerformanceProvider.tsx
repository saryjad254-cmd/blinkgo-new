'use client';

/**
 * PerformanceProvider — globally enables:
 *  - Hover/focus prefetching
 *  - Idle prefetch of common routes
 *  - Service worker registration (push notifications)
 *  - Cache management on user logout
 */

import { useEffect } from 'react';
import { usePrefetchOnHover, usePrefetchOnIdle } from '@/lib/perf/use-prefetch';

export function PerformanceProvider() {
  usePrefetchOnHover();
  usePrefetchOnIdle();

  // Register service worker once
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return; // skip in dev
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // ignore
    });
  }, []);

  return null;
}
