/**
 * useIntersectionObserver
 * ──────────────────────
 * Detects when an element enters the viewport.
 * Useful for lazy loading, infinite scroll, animations on view.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

export interface IntersectionOptions {
  threshold?: number | number[];
  rootMargin?: string;
  root?: Element | null;
  /** Stop observing after first intersection */
  once?: boolean;
}

export function useIntersectionObserver<T extends Element = HTMLDivElement>(
  options: IntersectionOptions = {}
): [React.RefObject<T>, boolean] {
  const { threshold = 0, rootMargin = '0px', root = null, once = false } = options;
  const ref = useRef<T>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsIntersecting(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        setIsIntersecting(visible);
        if (visible && once) observer.disconnect();
      },
      { threshold, rootMargin, root }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, root, once]);

  return [ref, isIntersecting];
}
