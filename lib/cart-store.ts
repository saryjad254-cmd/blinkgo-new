'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  product_id: string;
  product_name: string;
  product_price: number;
  image_url: string | null;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_lat?: number;
  restaurant_lng?: number;
  restaurant_min_order?: number;
  restaurant_delivery_radius_km?: number | null;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  delivery_address: Record<string, any> | null;
  notes: string;
  tip: number;

  add: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, qty: number) => void;
  clear: () => void;
  setAddress: (address: Record<string, any>) => void;
  setNotes: (notes: string) => void;
  setTip: (tip: number) => void;

  itemCount: () => number;
  subtotal: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      delivery_address: null,
      notes: '',
      tip: 0,

      add: (item, qty = 1) =>
        set((state) => {
          const currentItems = state.items ?? [];
          if (
            currentItems.length > 0 &&
            currentItems[0].restaurant_id !== item.restaurant_id
          ) {
            return { items: [{ ...item, quantity: qty }] };
          }
          const existing = currentItems.find((i) => i.product_id === item.product_id);
          if (existing) {
            return {
              items: currentItems.map((i) =>
                i.product_id === item.product_id ? { ...i, quantity: i.quantity + qty } : i
              ),
            };
          }
          return { items: [...currentItems, { ...item, quantity: qty }] };
        }),

      remove: (productId) =>
        set((state) => ({
          items: (state.items ?? []).filter((i) => i.product_id !== productId),
        })),

      setQuantity: (productId, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? (state.items ?? []).filter((i) => i.product_id !== productId)
              : (state.items ?? []).map((i) =>
                  i.product_id === productId ? { ...i, quantity: qty } : i
                ),
        })),

      clear: () => set({ items: [], notes: '', tip: 0 }),

      setAddress: (address) => set({ delivery_address: address }),
      setNotes: (notes) => set({ notes }),
      setTip: (tip) => set({ tip }),

      itemCount: () => (get().items ?? []).reduce((s, i) => s + i.quantity, 0),
      subtotal: () => (get().items ?? []).reduce((s, i) => s + i.product_price * i.quantity, 0),
    }),
    {
      name: 'blinkgo-cart',
      version: 1,
      // CartHydrator explicitly rehydrates from localStorage on mount and calls setState
      // so subscribers re-render. (skipHydration: true on zustand would not trigger re-render
      //  automatically on certain builds.)
      skipHydration: true,
      migrate: (state: any) => ({
        items: state?.items ?? [],
        delivery_address: state?.delivery_address ?? null,
        notes: state?.notes ?? '',
        tip: state?.tip ?? 0,
      }),
    }
  )
);