'use client';

import { memo, useCallback, useState } from 'react';
import { Plus, Minus, Check } from 'lucide-react';
import { useCart } from '@/lib/cart-store';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { Product, Restaurant } from '@/lib/types';

interface Props {
  product: Product;
  restaurant: Restaurant;
}

/**
 * AddToCartButton — premium, locale-aware button.
 *
 * Performance: wrapped in `React.memo` so each product row does not re-render
 * when the cart changes (zustand selector handles the relevant slice).
 *
 * i18n: every label is locale-aware so a German cookie never leaks into the
 * Arabic UI (or vice versa).
 */
export const AddToCartButton = memo(function AddToCartButton({ product, restaurant }: Props) {
  const { locale } = useI18n();
  const { toast } = useToast();
  const [animating, setAnimating] = useState(false);
  const add = useCart((s) => s.add);
  const setQuantity = useCart((s) => s.setQuantity);
  const cartQty = useCart((s) =>
    s.items.find((i) => i.product_id === product.id)?.quantity ?? 0
  );

  const labels = {
    unavailable:
      locale === 'ar' ? 'غير متاح' : locale === 'en' ? 'Unavailable' : 'Nicht verfügbar',
    addedToast:
      locale === 'ar' ? 'أضيف للسلة 🛒' : locale === 'en' ? 'Added to cart 🛒' : 'Zum Warenkorb hinzugefügt 🛒',
    added:
      locale === 'ar' ? 'أضيف' : locale === 'en' ? 'Added' : 'Hinzugefügt',
    add:
      locale === 'ar' ? 'أضف' : locale === 'en' ? 'Add' : 'Hinzufügen',
    decrement:
      locale === 'ar' ? 'إنقاص' : locale === 'en' ? 'Decrease' : 'Verringern',
    increment:
      locale === 'ar' ? 'زيادة' : locale === 'en' ? 'Increase' : 'Erhöhen',
  };

  const handleAdd = useCallback(() => {
    add({
      product_id: product.id,
      product_name: product.name,
      product_price: product.price,
      image_url: product.image_urls?.[0] ?? null,
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name,
      restaurant_lat: restaurant.latitude,
      restaurant_lng: restaurant.longitude,
      restaurant_min_order: restaurant.min_order_amount,
      restaurant_delivery_radius_km: (restaurant as any).delivery_radius_km ?? null,
    });
    toast({ type: 'success', message: labels.addedToast });
    setAnimating(true);
    // Slightly shorter animation; visual cue is the color/scale change
    const id = setTimeout(() => setAnimating(false), 500);
    return () => clearTimeout(id);
  }, [add, toast, labels.addedToast, product.id, product.name, product.price, product.image_urls, restaurant.id, restaurant.name, restaurant.latitude, restaurant.longitude, restaurant.min_order_amount]);

  const handleIncrement = useCallback(() => {
    add({
      product_id: product.id,
      product_name: product.name,
      product_price: product.price,
      image_url: product.image_urls?.[0] ?? null,
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name,
      restaurant_lat: restaurant.latitude,
      restaurant_lng: restaurant.longitude,
      restaurant_min_order: restaurant.min_order_amount,
      restaurant_delivery_radius_km: (restaurant as any).delivery_radius_km ?? null,
    });
  }, [add, product.id, product.name, product.price, product.image_urls, restaurant.id, restaurant.name, restaurant.latitude, restaurant.longitude, restaurant.min_order_amount]);

  const handleDecrement = useCallback(() => {
    setQuantity(product.id, Math.max(0, cartQty - 1));
  }, [setQuantity, product.id, cartQty]);

  if (!product.is_available) {
    return (
      <button
        disabled
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm bg-surface-elevated text-text-muted text-sm font-bold cursor-not-allowed border border-edge-light"
      >
        {labels.unavailable}
      </button>
    );
  }

  if (cartQty === 0) {
    return (
      <button
        onClick={handleAdd}
        className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-sm bg-speed-gradient text-white text-sm font-bold shadow-speed hover:shadow-speed-lg hover:-translate-y-0.5 active:scale-95 transition-all duration-150 ${
          animating ? 'animate-pulse-once scale-105' : ''
        }`}
      >
        {animating ? (
          <>
            <Check className="w-4 h-4" />
            <span>{labels.added}</span>
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            <span>{labels.add}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 bg-speed-gradient text-white rounded-sm overflow-hidden shadow-speed-glow">
      <button
        onClick={handleDecrement}
        className="p-2 hover:bg-black/20 active:scale-90 transition-all"
        aria-label={labels.decrement}
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="font-bold px-3 min-w-[36px] text-center tabular-nums">
        {cartQty}
      </span>
      <button
        onClick={handleIncrement}
        className="p-2 hover:bg-black/20 active:scale-90 transition-all"
        aria-label={labels.increment}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
});
