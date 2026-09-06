'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeCartKey, serverDeriveKey, canonicalizeConfig, configsEqual, type CartLineConfiguration } from './cart-key';
import { EMPTY_DELIVERY_PREFERENCES, sanitizeDeliveryPreferences, type DeliveryPreferences } from './delivery-preferences';

/**
 * Cart identity model — v3 (Phase 7C.1)
 *
 * A cart line is identified by a *configuration* (modifiers, notes, spice,
 * cooking, variants, add-ons), NOT just by product_id. Two lines with the
 * same product but different configurations are distinct lines.
 *
 * The canonical key is `r:<rid>:p:<pid>:<hash>` where the hash is FNV-1a
 * over the canonical JSON of the configuration. See `./cart-key.ts`.
 *
 * When the server validates an add, it returns an authoritative key which
 * the client stores on the line. All subsequent operations (merge,
 * remove, setQuantity) key on the canonical key, not the raw product_id.
 */

export interface CartItem {
  /** Stable canonical key (server-issued). Primary dedup key. */
  config_key: string;
  /** Restaurant reference (denormalized for fast filtering). */
  restaurant_id: string;
  restaurant_name: string;
  restaurant_lat?: number;
  restaurant_lng?: number;
  restaurant_min_order?: number;
  /** Product reference. */
  product_id: string;
  product_name: string;
  product_price: number;
  image_url: string | null;
  /** Full configuration that produced this line. */
  configuration: CartLineConfiguration;
  /** Human-readable summary of the configuration (size, extras, notes). */
  config_summary: string;
  quantity: number;
  /** Server-issued timestamp when the key was minted (ISO). */
  server_key_issued_at?: string;
}

/**
 * Strongly-typed delivery address stored in the cart.
 * lat/lng/postal_code are required for delivery zone validation
 * (see `@/lib/delivery-zone` for the canonical check).
 */
export interface CartDeliveryAddress {
  address: string;
  id?: string;
  label?: string;
  street?: string;
  house_number?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  lat: number;
  lng: number;
  notes?: string;
  [k: string]: unknown;
}

/** Minimal payload required to insert a new line. */
export interface CartItemInput {
  product_id: string;
  product_name: string;
  product_price: number;
  image_url: string | null;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_lat?: number;
  restaurant_lng?: number;
  restaurant_min_order?: number;
  configuration?: CartLineConfiguration;
  /**
   * If supplied (typically by the server after /api/cart/validate), this
   * overrides the locally-computed key. Otherwise the store derives it.
   */
  config_key?: string;
  /** Optional pre-rendered summary, otherwise the store will produce one. */
  config_summary?: string;
  /** When the server issued the key (ISO). */
  server_key_issued_at?: string;
  /** Set only when this line came from a server-locked group order. */
  group_order_id?: string | null;
}

interface CartState {
  items: CartItem[];
  /** Group provenance is cleared by every normal cart add. */
  group_order_id: string | null;
  fulfillment_type: 'delivery' | 'pickup';
  delivery_address: CartDeliveryAddress | null;
  delivery_preferences: DeliveryPreferences;
  notes: string;
  tip: number;
  payment_method: 'cash' | 'stripe';
  /** ISO timestamp selected in cart; null means ASAP. */
  scheduled_for: string | null;
  /** Server-validated coupon carried into the checkout draft. */
  coupon_code: string | null;

  /**
   * Add or merge an item. Two items merge ONLY if their canonical key is
   * identical (which implies same product, same restaurant, same
   * configuration).
   *
   * If a different restaurant is in the cart, the new item REPLACES the
   * cart (single-restaurant model).
   */
  add: (item: CartItemInput, qty?: number) => void;

  /**
   * Remove a line by its canonical config_key. Returns true if a line was
   * removed.
   */
  remove: (configKey: string) => boolean;

  /**
   * Set the quantity of a line by its canonical key. If qty <= 0, the line
   * is removed.
   */
  setQuantity: (configKey: string, qty: number) => void;

  /**
   * Update an existing line's configuration (e.g. user edits notes). The
   * key is re-derived; if it collides with another line, the two merge.
   */
  updateConfiguration: (
    oldConfigKey: string,
    newConfiguration: CartLineConfiguration,
    newUnitPrice: number,
  ) => void;

  /** Set the customer's out-of-stock instruction without changing price. */
  setSubstitutionPreference: (
    configKey: string,
    preference: 'best_match' | 'contact_me' | 'refund_item',
  ) => void;

  clear: () => void;
  setFulfillmentType: (type: 'delivery' | 'pickup') => void;
  setAddress: (address: CartDeliveryAddress) => void;
  setDeliveryPreferences: (preferences: Partial<DeliveryPreferences>) => void;
  setNotes: (notes: string) => void;
  setTip: (tip: number) => void;
  setPaymentMethod: (method: 'cash' | 'stripe') => void;
  setScheduledFor: (scheduledFor: string | null) => void;
  setCouponCode: (couponCode: string | null) => void;

  itemCount: () => number;
  subtotal: () => number;

  /** Find a line by its canonical key. */
  findByKey: (configKey: string) => CartItem | undefined;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      group_order_id: null,
      fulfillment_type: 'delivery',
      delivery_address: null,
      delivery_preferences: { ...EMPTY_DELIVERY_PREFERENCES },
      notes: '',
      tip: 0,
      payment_method: 'cash',
      scheduled_for: null,
      coupon_code: null,

      add: (item, qty = 1) =>
        set((state) => {
          const currentItems = Array.isArray(state.items) ? state.items : [];
          // Resolve the canonical key. The server's key wins (it's the
          // authoritative one); otherwise we derive it locally.
          const configKey =
            item.config_key ||
            computeCartKey(item.restaurant_id, item.product_id, item.configuration || null);

          // Single-restaurant model: if the new line's restaurant is
          // different from any existing line, REPLACE the cart. The
          // customer is committing to that restaurant.
          if (currentItems.length > 0 && currentItems[0].restaurant_id !== item.restaurant_id) {
            const fresh: CartItem = {
              config_key: configKey,
              restaurant_id: item.restaurant_id,
              restaurant_name: item.restaurant_name,
              restaurant_lat: item.restaurant_lat,
              restaurant_lng: item.restaurant_lng,
              restaurant_min_order: item.restaurant_min_order,
              product_id: item.product_id,
              product_name: item.product_name,
              product_price: item.product_price,
              image_url: item.image_url,
              configuration: canonicalizeConfig(item.configuration || null) || {},
              config_summary: item.config_summary || '',
              quantity: qty,
              server_key_issued_at: item.server_key_issued_at,
            };
            return { items: [fresh], group_order_id: item.group_order_id ?? null, scheduled_for: null, coupon_code: null };
          }

          // Otherwise look for an existing line with the same key.
          const existing = currentItems.find((i) => i.config_key === configKey);
          if (existing) {
            // Merge: same key → sum quantities, keep the most recent price.
            return {
              items: currentItems.map((i) =>
                i.config_key === configKey
                  ? { ...i, quantity: i.quantity + qty, product_price: item.product_price, server_key_issued_at: item.server_key_issued_at ?? i.server_key_issued_at }
                  : i,
              ),
              group_order_id: item.group_order_id ?? null,
            };
          }

          // New configuration → new line.
          const fresh: CartItem = {
            config_key: configKey,
            restaurant_id: item.restaurant_id,
            restaurant_name: item.restaurant_name,
            restaurant_lat: item.restaurant_lat,
            restaurant_lng: item.restaurant_lng,
            restaurant_min_order: item.restaurant_min_order,
            product_id: item.product_id,
            product_name: item.product_name,
            product_price: item.product_price,
            image_url: item.image_url,
            configuration: canonicalizeConfig(item.configuration || null) || {},
            config_summary: item.config_summary || '',
            quantity: qty,
            server_key_issued_at: item.server_key_issued_at,
          };
          return { items: [...currentItems, fresh], group_order_id: item.group_order_id ?? null };
        }),

      remove: (configKey) => {
        let removed = false;
        set((state) => {
          const before = (state.items ?? []).length;
          const items = (state.items ?? []).filter((i) => {
            if (i.config_key === configKey) {
              removed = true;
              return false;
            }
            return true;
          });
          return { items };
        });
        return removed;
      },

      setQuantity: (configKey, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? (state.items ?? []).filter((i) => i.config_key !== configKey)
              : (state.items ?? []).map((i) =>
                  i.config_key === configKey ? { ...i, quantity: qty } : i,
                ),
        })),

      updateConfiguration: (oldConfigKey, newConfiguration, newUnitPrice) =>
        set((state) => {
          const currentItems = Array.isArray(state.items) ? state.items : [];
          const target = currentItems.find((i) => i.config_key === oldConfigKey);
          if (!target) return state;

          const newKey = computeCartKey(
            target.restaurant_id,
            target.product_id,
            newConfiguration,
          );

          // Same key → just update the in-place line (notes etc.).
          if (newKey === oldConfigKey) {
            return {
              items: currentItems.map((i) =>
                i.config_key === oldConfigKey
                  ? {
                      ...i,
                      configuration: canonicalizeConfig(newConfiguration) || {},
                      product_price: newUnitPrice,
                    }
                  : i,
              ),
            };
          }

          // Different key → drop the old line, merge into the new one if it
          // exists; otherwise add a fresh line.
          const other = currentItems.find((i) => i.config_key === newKey);
          if (other) {
            return {
              items: currentItems
                .filter((i) => i.config_key !== oldConfigKey)
                .map((i) =>
                  i.config_key === newKey
                    ? { ...i, quantity: i.quantity + target.quantity, product_price: newUnitPrice }
                    : i,
                ),
            };
          }

          return {
            items: currentItems.map((i) =>
              i.config_key === oldConfigKey
                ? {
                    ...i,
                    config_key: newKey,
                    configuration: canonicalizeConfig(newConfiguration) || {},
                    product_price: newUnitPrice,
                  }
                : i,
            ),
          };
        }),

      setSubstitutionPreference: (configKey, preference) =>
        set((state) => ({
          items: (state.items ?? []).map((item) => {
            if (item.config_key !== configKey) return item;
            const configuration = canonicalizeConfig({
              ...item.configuration,
              substitution_preference: preference,
            }) as CartLineConfiguration;
            return {
              ...item,
              configuration,
              config_key: computeCartKey(item.restaurant_id, item.product_id, configuration),
            };
          }),
        })),

      clear: () => set({ items: [], group_order_id: null, fulfillment_type: 'delivery', delivery_preferences: { ...EMPTY_DELIVERY_PREFERENCES }, notes: '', tip: 0, scheduled_for: null, coupon_code: null }),

      setFulfillmentType: (fulfillment_type) => set({ fulfillment_type }),
      setAddress: (address) => set({ delivery_address: address }),
      setDeliveryPreferences: (preferences) => set((state) => ({ delivery_preferences: sanitizeDeliveryPreferences({ ...state.delivery_preferences, ...preferences }) })),
      setNotes: (notes) => set({ notes }),
      setTip: (tip) => set({ tip }),
      setPaymentMethod: (payment_method) => set({ payment_method }),
      setScheduledFor: (scheduled_for) => set({ scheduled_for }),
      setCouponCode: (coupon_code) => set({ coupon_code }),

      itemCount: () => (get().items ?? []).reduce((s, i) => s + i.quantity, 0),
      subtotal: () =>
        (get().items ?? []).reduce((s, i) => s + i.product_price * i.quantity, 0),

      findByKey: (configKey) => (get().items ?? []).find((i) => i.config_key === configKey),
    }),
    {
      name: 'blinkgo-cart',
      // v3: added `config_key` to every line + `configuration` + `config_summary`.
      // Older payloads are migrated to ensure no field is missing.
      version: 7,
      skipHydration: true,
      migrate: (state: any, fromVersion: number) => {
        if (!state || typeof state !== 'object') {
          return {
            items: [],
            group_order_id: null,
            fulfillment_type: 'delivery',
            delivery_address: null,
            delivery_preferences: { ...EMPTY_DELIVERY_PREFERENCES },
            notes: '',
            tip: 0,
            payment_method: 'cash',
            scheduled_for: null,
            coupon_code: null,
          };
        }
        const items = Array.isArray(state.items) ? state.items : [];
        const migrated = items.map((it: any) => {
          // Backfill config_key & configuration from legacy product_id-only lines.
          const configuration = canonicalizeConfig({
            selected_modifiers: it.selected_modifiers,
            modifier_quantities: it.modifier_quantities,
            notes: it.notes || it.special_instructions || it.line_notes,
            cooking_preference: it.cooking_preference,
            spice_level: it.spice_level,
            variants: it.variants,
            add_ons: it.add_ons,
            special_instructions: it.special_instructions,
            substitution_preference: ['best_match', 'contact_me', 'refund_item'].includes(it.substitution_preference)
              ? it.substitution_preference
              : undefined,
          }) || {};
          const config_key =
            it.config_key ||
            computeCartKey(
              it.restaurant_id,
              it.product_id,
              configuration,
            );
          return {
            ...it,
            config_key,
            configuration,
            config_summary: it.config_summary || '',
            quantity: Number(it.quantity) || 1,
            product_price: Number(it.product_price) || 0,
          };
        });
        return {
          items: migrated,
          group_order_id: typeof state.group_order_id === 'string' ? state.group_order_id : null,
          fulfillment_type: state.fulfillment_type === 'pickup' ? 'pickup' : 'delivery',
          delivery_address: state.delivery_address ?? null,
          delivery_preferences: sanitizeDeliveryPreferences({
            ...(state.delivery_preferences ?? {}),
            instructions: state.delivery_preferences?.instructions ?? state.notes ?? '',
          }),
          notes: state.notes ?? '',
          tip: Number(state.tip ?? 0),
          payment_method: state.payment_method === 'stripe' ? 'stripe' : 'cash',
          scheduled_for: typeof state.scheduled_for === 'string' ? state.scheduled_for : null,
          coupon_code: typeof state.coupon_code === 'string' ? state.coupon_code : null,
        };
      },
    }
  )
);

// ── Server-side canonical re-derivation helper ────────────────────────
// Re-exports so consumers can use a single import for both sides.
export { computeCartKey, serverDeriveKey, canonicalizeConfig, configsEqual };
export type { CartLineConfiguration };
