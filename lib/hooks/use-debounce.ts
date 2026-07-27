/**
 * useDebounce
 * ──────────
 * Debounce a value with a delay.
 * Useful for search inputs to avoid fetching on every keystroke.
 */
'use client';

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
