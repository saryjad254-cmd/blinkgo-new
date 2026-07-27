'use client';

import { useEffect } from 'react';
import { useCart } from '@/lib/cart-store';

/**
 * CartHydrator — ensures the cart store is hydrated from localStorage
 * before the cart page renders. With skipHydration:false in the store
 * config, zustand rehydrates automatically, but we still read+setState
 * for an extra guarantee.
 */
export function CartHydrator() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('blinkgo-cart');
      if (raw) {
        const parsed = JSON.parse(raw);
        useCart.setState({
          items: parsed?.state?.items ?? [],
          delivery_address: parsed?.state?.delivery_address ?? null,
          notes: parsed?.state?.notes ?? '',
          tip: Number(parsed?.state?.tip ?? 0),
        });
      }
    } catch {
      // ignore
    }
  }, []);
  return null;
}
