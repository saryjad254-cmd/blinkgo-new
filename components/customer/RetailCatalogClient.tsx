'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Search from 'lucide-react/dist/esm/icons/search';
import ShoppingCart from 'lucide-react/dist/esm/icons/shopping-cart';
import { PremiumProductCard } from '@/components/customer/PremiumProductCard';
import { ProductDetailModal, type ProductDetailData } from '@/components/customer/ProductDetailModal';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useCart } from '@/lib/cart-store';
import { cn } from '@/lib/cn';

export interface RetailCatalogProduct extends ProductDetailData {
  restaurant_id: string;
  seller_name: string;
  seller_min_order: number;
  seller_available: boolean;
  seller_latitude: number;
  seller_longitude: number;
  seller_delivery_radius_km: number;
}

const COPY = {
  de: { search: 'Produkte suchen', all: 'Alle', empty: 'Keine passenden Produkte gefunden.', clear: 'Filter zurücksetzen', results: 'Produkte', cart: 'Warenkorb', seller: 'Verkauft von', open: 'Produkt öffnen', sort: 'Sortieren', recommended: 'Empfohlen', priceLow: 'Preis aufsteigend', priceHigh: 'Preis absteigend', popular: 'Beliebteste', nearby: 'Lieferung an deinen Standort verfügbar', outside: 'Außerhalb des Liefergebiets', sellerPage: 'Zum Händler' },
  en: { search: 'Search products', all: 'All', empty: 'No matching products found.', clear: 'Clear filters', results: 'products', cart: 'Cart', seller: 'Sold by', open: 'Open product', sort: 'Sort', recommended: 'Recommended', priceLow: 'Price: low to high', priceHigh: 'Price: high to low', popular: 'Most popular', nearby: 'Delivery available to your location', outside: 'Outside delivery area', sellerPage: 'View seller' },
  ar: { search: 'ابحث عن منتج', all: 'الكل', empty: 'لا توجد منتجات مطابقة.', clear: 'مسح الفلاتر', results: 'منتج', cart: 'السلة', seller: 'يباع من', open: 'فتح المنتج', sort: 'الترتيب', recommended: 'مقترح', priceLow: 'السعر: من الأقل', priceHigh: 'السعر: من الأعلى', popular: 'الأكثر طلبًا', nearby: 'التوصيل متاح إلى موقعك', outside: 'خارج نطاق التوصيل', sellerPage: 'صفحة البائع' },
} as const;

const CATEGORY_LABELS: Record<string, Record<'de' | 'en' | 'ar', string>> = {
  Elektronik: { de: 'Elektronik', en: 'Electronics', ar: 'إلكترونيات' },
  Haushalt: { de: 'Haushalt', en: 'Household', ar: 'مستلزمات منزلية' },
  Lebensmittel: { de: 'Lebensmittel', en: 'Groceries', ar: 'مواد غذائية' },
  Pflege: { de: 'Pflege', en: 'Personal care', ar: 'عناية شخصية' },
  Wohnen: { de: 'Wohnen', en: 'Home', ar: 'المنزل' },
};

type SortMode = 'recommended' | 'price-low' | 'price-high' | 'popular';

function isSortMode(value: string | null): value is SortMode {
  return value === 'recommended' || value === 'price-low' || value === 'price-high' || value === 'popular';
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

export function RetailCatalogClient({ products }: { products: RetailCatalogProduct[] }) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsString = params.toString();
  const initialSort = params.get('sort');
  const itemCount = useCart((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [selected, setSelected] = useState<RetailCatalogProduct | null>(null);
  const [sort, setSort] = useState<SortMode>(isSortMode(initialSort) ? initialSort : 'recommended');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('blinkgo-last-location') || 'null');
        if (stored && typeof stored.lat === 'number' && typeof stored.lng === 'number') setLocation(stored);
      } catch {
        // A broken local preference must never block catalog browsing.
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(paramsString);
      if (query.trim()) next.set('q', query.trim());
      else next.delete('q');
      if (category) next.set('category', category);
      else next.delete('category');
      if (sort !== 'recommended') next.set('sort', sort);
      else next.delete('sort');
      if (next.toString() !== paramsString) {
        router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [category, paramsString, pathname, query, router, sort]);

  const canDeliver = (product: RetailCatalogProduct) => {
    if (!product.seller_available) return false;
    if (!location || !product.seller_delivery_radius_km || !product.seller_latitude || !product.seller_longitude) return true;
    return distanceKm(location.lat, location.lng, product.seller_latitude, product.seller_longitude) <= product.seller_delivery_radius_km;
  };

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort(), [products]);
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    const filtered = products.filter((product) => {
      if (category && product.category !== category) return false;
      if (!normalizedQuery) return true;
      return `${product.name} ${product.description} ${product.category} ${product.seller_name}`.toLocaleLowerCase(locale).includes(normalizedQuery);
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'price-low') return (a.discount_price ?? a.price) - (b.discount_price ?? b.price);
      if (sort === 'price-high') return (b.discount_price ?? b.price) - (a.discount_price ?? a.price);
      if (sort === 'popular') return (b.sold_count ?? 0) - (a.sold_count ?? 0);
      return Number(b.is_featured) - Number(a.is_featured) || (b.sold_count ?? 0) - (a.sold_count ?? 0);
    });
  }, [category, locale, products, query, sort]);

  const clearFilters = () => {
    setQuery('');
    setCategory('');
    setSort('recommended');
  };

  return (
    <>
      <div className="sticky top-16 z-20 border-b border-edge-light bg-bg/90 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{copy.search}</span>
            <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="h-12 w-full rounded-2xl border border-edge-light bg-surface-1 ps-11 pe-4 text-sm font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
          </label>
          <label className="sr-only" htmlFor="retail-sort">{copy.sort}</label>
          <select id="retail-sort" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-12 max-w-36 rounded-2xl border border-edge-light bg-surface-1 px-3 text-xs font-extrabold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 sm:max-w-none">
            <option value="recommended">{copy.recommended}</option>
            <option value="popular">{copy.popular}</option>
            <option value="price-low">{copy.priceLow}</option>
            <option value="price-high">{copy.priceHigh}</option>
          </select>
          <Link href="/cart" aria-label={`${copy.cart}: ${itemCount}`} className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-speed-gradient text-white shadow-glow">
            <ShoppingCart className="size-5" aria-hidden />
            {itemCount > 0 && <span className="absolute -end-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-brand-yellow px-1 text-[10px] font-black text-black">{itemCount > 99 ? '99+' : itemCount}</span>}
          </Link>
        </div>
        <div className="mx-auto mt-3 flex max-w-7xl gap-2 overflow-x-auto px-4 pb-1 sm:px-6 lg:px-8" role="tablist" aria-label={copy.search}>
          <button type="button" role="tab" aria-selected={!category} onClick={() => setCategory('')} className={cn('min-h-11 shrink-0 rounded-xl px-4 text-sm font-extrabold', !category ? 'bg-brand-red text-white' : 'border border-edge-light bg-surface-1 text-text-secondary')}>{copy.all}</button>
          {categories.map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} onClick={() => setCategory(item)} className={cn('min-h-11 shrink-0 rounded-xl px-4 text-sm font-extrabold', category === item ? 'bg-brand-red text-white' : 'border border-edge-light bg-surface-1 text-text-secondary')}>{CATEGORY_LABELS[item]?.[locale] ?? item}</button>)}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-4 text-sm font-bold text-text-secondary" role="status" aria-live="polite">{visible.length} {copy.results}</p>
        {visible.length === 0 ? (
          <div className="rounded-3xl border border-edge-light bg-surface-1 px-6 py-14 text-center">
            <p className="text-sm font-semibold text-text-secondary">{copy.empty}</p>
            <button type="button" onClick={clearFilters} className="mt-5 min-h-11 rounded-xl bg-brand px-5 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow">{copy.clear}</button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" role="list">
            {visible.map((product, index) => (
              <li key={product.id} className="[content-visibility:auto] [contain-intrinsic-size:360px]">
                <div className="rounded-2xl focus-within:ring-2 focus-within:ring-brand/30">
                  <PremiumProductCard {...product} discountPrice={product.discount_price ?? undefined} imageUrls={product.image_urls} soldCount={product.sold_count} prepMinutes={product.prep_time_min} badges={product.is_featured ? ['bestseller'] : []} priority={index < 4} onAddToCart={() => setSelected(product)} />
                  <div className="mt-1 px-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/restaurants/${product.restaurant_id}`} className="min-h-11 min-w-0 flex-1 truncate rounded-xl py-3 text-[11px] font-bold text-text-muted hover:text-brand" aria-label={`${copy.sellerPage}: ${product.seller_name}`}>{copy.seller}: {product.seller_name}</Link>
                      <button type="button" onClick={() => setSelected(product)} className="min-h-11 rounded-xl px-3 text-xs font-black text-brand hover:bg-brand/10" aria-label={`${copy.open}: ${product.name}`}>{copy.open}</button>
                    </div>
                    <p className={cn('flex items-center gap-1 pb-2 text-[11px] font-bold', canDeliver(product) ? 'text-emerald-500' : 'text-amber-500')}><MapPin className="size-3" aria-hidden />{canDeliver(product) ? copy.nearby : copy.outside}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProductDetailModal open={Boolean(selected)} onClose={() => setSelected(null)} product={selected} restaurantId={selected?.restaurant_id ?? ''} restaurantName={selected?.seller_name ?? ''} restaurantMinOrder={selected?.seller_min_order ?? 0} restaurantState={{ status: selected && canDeliver(selected) ? 'open' : 'paused', isAvailable: Boolean(selected && canDeliver(selected)) }} merchantKind="retail" />
    </>
  );
}
