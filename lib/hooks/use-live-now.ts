'use client';

import { useEffect, useState } from 'react';

/**
 * A render-safe wall clock for elapsed-time labels. The first client value is
 * scheduled after hydration, then refreshed at the requested cadence.
 */
export function useLiveNow(intervalMs = 30_000): number {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let active = true;
    const update = () => { if (active) setNowMs(Date.now()); };
    queueMicrotask(update);
    const timer = setInterval(update, Math.max(1_000, intervalMs));
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return nowMs;
}
