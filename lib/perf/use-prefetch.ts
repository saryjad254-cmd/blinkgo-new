'use client';

/**
 * Intelligent route prefetching — predict where the user will go next and warm those bundles.
 *  - On hover/focus of internal links, prefetch the route (Next.js handles the bundling)
 *  - On idle, prefetch common destinations
 *  - After action completion (e.g. login), prefetch the role's main page
 */

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getIdlePrefetchRoutes, isSafePrefetchHref } from './prefetch-policy';

/** Prefetch on hover/focus of internal links. Use with `data-prefetch` attribute or auto. */
export function usePrefetchOnHover() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const t = (e.target as HTMLElement)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!t) return;
      const url = t.getAttribute('href');
      if (!url || !isSafePrefetchHref(url) || t.dataset.prefetch === 'off') return;
      router.prefetch(url);
    };
    document.addEventListener('mouseover', handler, { passive: true });
    document.addEventListener('focusin', handler, { passive: true });
    return () => {
      document.removeEventListener('mouseover', handler);
      document.removeEventListener('focusin', handler);
    };
  }, [router]);
}

/** Prefetch a specific list of routes on idle (one-time). */
export function usePrefetchOnIdle(routes?: readonly string[]) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const selectedRoutes = routes ?? getIdlePrefetchRoutes(pathname);
  const routesKey = selectedRoutes.join(',');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentRoutes = routesKey ? routesKey.split(',') : [];
    if (currentRoutes.length === 0) return;
    if (!('requestIdleCallback' in window)) {
      const t = setTimeout(() => currentRoutes.forEach((url) => router.prefetch(url)), 1500);
      return () => clearTimeout(t);
    }
    const idleWindow = window as typeof window & {
      requestIdleCallback: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const id = idleWindow.requestIdleCallback(() => currentRoutes.forEach((url) => router.prefetch(url)), { timeout: 2000 });
    return () => idleWindow.cancelIdleCallback?.(id);
  }, [router, routesKey]);
}

/** Call router.prefetch imperatively before a navigation. */
export function useImperativePrefetch() {
  const router = useRouter();
  return useCallback((href: string) => {
    try { router.prefetch(href); } catch {}
  }, [router]);
}
