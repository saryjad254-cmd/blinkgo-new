'use client';

import { useEffect } from 'react';
import { useCart } from '@/lib/cart-store';

/**
 * CartHydrator — ensures the cart store is hydrated from localStorage.
 *
 * Two paths:
 *  1. zustand's `persist` middleware handles automatic hydration (and runs
 *     the schema migration from older versions on first load).
 *  2. This component additionally forces a re-hydration on mount, after
 *     migrations have run, so subscribers see the canonical schema (v3
 *     with `config_key`, `configuration`, `config_summary`).
 */
export function CartHydrator() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // `useCart.persist.rehydrate()` is the supported API to re-run
      // hydration explicitly. This re-applies the version migration.
      const persistApi = useCart.persist;
      if (persistApi && typeof persistApi.rehydrate === 'function') {
        void persistApi.rehydrate();
      }
    } catch {
      // ignore
    }
  }, []);
  return null;
}
