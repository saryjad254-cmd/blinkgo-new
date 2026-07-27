/**
 * useWindowSize
 * ─────────────
 * Subscribe to window resize events with debouncing.
 */
'use client';

import { useEffect, useState } from 'react';

export interface WindowSize {
  width: number;
  height: number;
}

export function useWindowSize(): WindowSize {
  const [size, setSize] = useState<WindowSize>({ width: 1200, height: 800 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    const onResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(update, 100);
    };

    update();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return size;
}
