'use client';

/**
 * Intelligent route prefetching — predict where the user will go next and warm those bundles.
 *  - On hover/focus of internal links, prefetch the route (Next.js handles the bundling)
 *  - On idle, prefetch common destinations
 *  - After action completion (e.g. login), prefetch the role's main page
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const COMMON_ROUTES = ['/search', '/cart', '/profile', '/orders', '/admin', '/restaurant/dashboard', '/driver/dashboard'];

/** Prefetch on hover/focus of internal links. Use with `data-prefetch` attribute or auto. */
export function usePrefetchOnHover() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const t = (e.target as HTMLElement)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!t) return;
      const url = t.getAttribute('href');
      if (!url || !url.startsWith('/') || url.startsWith('//')) return;
      // Use link rel="prefetch" if present
      if (t.dataset.prefetch !== 'off') {
        const existing = document.head.querySelector(`link[rel="prefetch"][href="${url}"]`);
        if (!existing) {
          const l = document.createElement('link');
          l.rel = 'prefetch';
          l.as = 'document';
          l.href = url;
          document.head.appendChild(l);
        }
      }
    };
    document.addEventListener('mouseover', handler, { passive: true });
    document.addEventListener('focusin', handler, { passive: true });
    return () => {
      document.removeEventListener('mouseover', handler);
      document.removeEventListener('focusin', handler);
    };
  }, []);
}

/** Prefetch a specific list of routes on idle (one-time). */
export function usePrefetchOnIdle(routes: string[] = COMMON_ROUTES) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('requestIdleCallback' in window)) {
      const t = setTimeout(() => prefetchRoutes(routes), 1500);
      return () => clearTimeout(t);
    }
    const id = (window as any).requestIdleCallback(() => prefetchRoutes(routes), { timeout: 2000 });
    return () => (window as any).cancelIdleCallback?.(id);
  }, [routes.join(',')]);
}

function prefetchRoutes(routes: string[]) {
  if (typeof document === 'undefined') return;
  routes.forEach((url) => {
    if (document.head.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.as = 'document';
    l.href = url;
    document.head.appendChild(l);
  });
}

/** Call router.prefetch imperatively before a navigation. */
export function useImperativePrefetch() {
  const router = useRouter();
  return useRef((href: string) => {
    try { router.prefetch(href); } catch {}
  }).current;
}
