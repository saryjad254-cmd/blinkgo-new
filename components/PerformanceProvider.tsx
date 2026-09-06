'use client';

/**
 * PerformanceProvider — globally enables:
 *  - Hover/focus prefetching
 *  - Idle prefetch of common routes
 *  - Cache management on user logout
 */

import { useCallback } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { usePrefetchOnHover, usePrefetchOnIdle } from '@/lib/perf/use-prefetch';

interface WebVitalMetric {
  id: string;
  name: string;
  value: number;
  delta: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  navigationType?: string;
}

function privacySafeRoute(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
      if (/^\d{4,}$/.test(segment)) return ':id';
      if (segment.length > 48) return ':id';
      return segment;
    })
    .join('/') || '/';
}

export function PerformanceProvider() {
  usePrefetchOnHover();
  usePrefetchOnIdle();

  const reportWebVital = useCallback((metric: WebVitalMetric) => {
    const enabled = process.env.NODE_ENV === 'production'
      || process.env.NEXT_PUBLIC_ENABLE_WEB_VITALS === 'true';
    if (!enabled || typeof window === 'undefined') return;

    const body = JSON.stringify({
      id: metric.id.slice(0, 128),
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      route: privacySafeRoute(window.location.pathname),
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/observability/web-vitals', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/observability/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  useReportWebVitals(reportWebVital);

  return null;
}
