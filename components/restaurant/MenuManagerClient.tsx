'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Edit2, Search, X, Check, AlertTriangle, Filter, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { DeleteProductButton } from '@/components/restaurant/DeleteProductButton';
import { ToggleAvailability } from '@/components/restaurant/ToggleAvailability';
import { Card } from '@/components/ui/Card';
import { formatEUR } from '@/lib/format';
import { useRouter } from 'next/navigation';
import de from '@/lib/i18n/locales/de';
import ar from '@/lib/i18n/locales/ar';
import en from '@/lib/i18n/locales/en';
import type { Locale } from '@/lib/i18n/server-translations';
import { hideOnError } from '@/lib/images';

const T: Record<Locale, typeof de> = { de, ar: ar as unknown as typeof de, en: en as unknown as typeof de };

interface Product {
  id: string;
  name: string;
  price: number;
  discount_price: number | null;
  is_available: boolean;
  is_featured: boolean;
  sold_count: number;
  stock: number | null;
  track_stock: boolean;
  category: string | null;
  image_urls: string[] | null;
}

interface Category {
  id: string;
  name: string;
}

interface MenuManagerClientProps {
  initialProducts: Product[];
  categories: Category[];
  locale: Locale;
  restaurantId: string;
}

export function MenuManagerClient({ initialProducts, categories, locale, restaurantId }: MenuManagerClientProps) {
  const t = T[locale];
  const tOps = (t as any).restaurantOps;
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStock, setFilterStock] = useState<'all' | 'low' | 'out' | 'ok'>('all');
  const [filterAvail, setFilterAvail] = useState<'all' | 'available' | 'unavailable'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<'none' | 'activate' | 'deactivate' | 'price'>('none');
  const [bulkPriceChange, setBulkPriceChange] = useState<{ type: 'percent' | 'fixed'; value: number }>({ type: 'percent', value: 0 });
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory !== 'all' && p.category !== filterCategory) return false;
      if (filterStock === 'low' && (!p.track_stock || (p.stock ?? 999) > 5)) return false;
      if (filterStock === 'out' && (p.stock ?? 0) > 0) return false;
      if (filterStock === 'ok' && p.track_stock && (p.stock ?? 999) <= 5) return false;
      if (filterAvail === 'available' && !p.is_available) return false;
      if (filterAvail === 'unavailable' && p.is_available) return false;
      return true;
    });
  }, [products, search, filterCategory, filterStock, filterAvail]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  const handleBulkAction = async () => {
    if (selected.size === 0) return;
    const body: any = { productIds: Array.from(selected) };
    if (bulkModal === 'activate') body.is_available = true;
    if (bulkModal === 'deactivate') body.is_available = false;
    if (bulkModal === 'price') body.priceChange = bulkPriceChange;
    const res = await fetch('/api/products/manage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.products) {
        setProducts((prev) => prev.map((p) => {
          const updated = data.products.find((u: any) => u.id === p.id);
          return updated ? { ...p, ...updated } : p;
        }));
      }
      setSelected(new Set());
      setBulkModal('none');
      router.refresh();
    }
  };

  const lowStockCount = products.filter((p) => p.track_stock && (p.stock ?? 999) <= 5 && (p.stock ?? 0) > 0).length;
  const outOfStockCount = products.filter((p) => p.track_stock && (p.stock ?? 0) <= 0).length;

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card !p-3 text-center">
          <p className="text-2xl font-extrabold text-white tabular-nums">{products.length}</p>
          <p className="text-[10px] text-text-muted mt-1">{locale === 'ar' ? 'إجمالي' : locale === 'de' ? 'Gesamt' : 'Total'}</p>
        </div>
        <div className={`card !p-3 text-center ${lowStockCount > 0 ? 'ring-1 ring-brand-yellow-500/40' : ''}`}>
          <p className="text-2xl font-extrabold text-brand-yellow-400 tabular-nums">{lowStockCount}</p>
          <p className="text-[10px] text-text-muted mt-1">{tOps?.lowStock ?? 'Low stock'}</p>
        </div>
        <div className={`card !p-3 text-center ${outOfStockCount > 0 ? 'ring-1 ring-red-500/40' : ''}`}>
          <p className="text-2xl font-extrabold text-red-500 tabular-nums">{outOfStockCount}</p>
          <p className="text-[10px] text-text-muted mt-1">{tOps?.outOfStock ?? 'Out of stock'}</p>
        </div>
      </div>

      {/* Search + filters */}
      <Card>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={locale === 'ar' ? 'بحث عن منتج...' : locale === 'de' ? 'Produkt suchen...' : 'Search product...'}
                className="w-full h-12 ps-10 pe-3 rounded-xl bg-surface-tertiary text-white text-sm border border-transparent focus:border-brand-500 outline-none touch-manipulation"
              />
            </div>
            <button
              onClick={() => setShowFilters((s) => !s)}
              className="h-12 w-12 rounded-xl bg-surface-tertiary hover:bg-surface-elevated text-white flex items-center justify-center touch-manipulation"
              aria-label="Filters"
            >
              <Filter className="w-4 h-4" />
              {showFilters ? <ChevronUp className="w-3 h-3 absolute -mt-3" /> : <ChevronDown className="w-3 h-3 absolute -mt-3" />}
            </button>
          </div>
          {showFilters && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="h-12 rounded-xl bg-surface-tertiary text-white text-sm px-3 touch-manipulation"
              >
                <option value="all">{locale === 'ar' ? 'كل الفئات' : locale === 'de' ? 'Alle Kategorien' : 'All categories'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value as any)}
                className="h-12 rounded-xl bg-surface-tertiary text-white text-sm px-3 touch-manipulation"
              >
                <option value="all">{locale === 'ar' ? 'كل المخزون' : locale === 'de' ? 'Alle Bestände' : 'All stock'}</option>
                <option value="ok">{tOps?.inStock ?? 'In stock'}</option>
                <option value="low">{tOps?.lowStock ?? 'Low stock'}</option>
                <option value="out">{tOps?.outOfStock ?? 'Out of stock'}</option>
              </select>
              <select
                value={filterAvail}
                onChange={(e) => setFilterAvail(e.target.value as any)}
                className="h-12 rounded-xl bg-surface-tertiary text-white text-sm px-3 col-span-2 touch-manipulation"
              >
                <option value="all">{locale === 'ar' ? 'الكل' : locale === 'de' ? 'Alle' : 'All'}</option>
                <option value="available">{locale === 'ar' ? 'متاح' : locale === 'de' ? 'Verfügbar' : 'Available'}</option>
                <option value="unavailable">{locale === 'ar' ? 'غير متاح' : locale === 'de' ? 'Nicht verfügbar' : 'Unavailable'}</option>
              </select>
            </div>
          )}
        </div>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <Card className="bg-brand-gradient-soft">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-white">
              {selected.size} {locale === 'ar' ? 'محدد' : locale === 'de' ? 'ausgewählt' : 'selected'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setBulkModal('activate')}
                className="h-10 px-3 rounded-lg bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 touch-manipulation"
              >
                <Check className="w-3 h-3" />
                {tOps?.bulkActivate ?? 'Activate'}
              </button>
              <button
                onClick={() => setBulkModal('deactivate')}
                className="h-10 px-3 rounded-lg bg-brand-yellow-500 text-white text-xs font-bold flex items-center gap-1 touch-manipulation"
              >
                <X className="w-3 h-3" />
                {tOps?.bulkDeactivate ?? 'Deactivate'}
              </button>
              <button
                onClick={() => setBulkModal('price')}
                className="h-10 px-3 rounded-lg bg-cyan-500 text-white text-xs font-bold flex items-center gap-1 touch-manipulation"
              >
                {tOps?.bulkUpdatePrice ?? 'Update prices'}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="h-10 w-10 rounded-lg bg-surface-tertiary text-white flex items-center justify-center touch-manipulation"
                aria-label="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Select all */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-end">
          <button
            onClick={toggleSelectAll}
            className="text-xs text-text-muted hover:text-white font-bold"
          >
            {selected.size === filtered.length
              ? (locale === 'ar' ? 'إلغاء تحديد الكل' : locale === 'de' ? 'Alle abwählen' : 'Deselect all')
              : (locale === 'ar' ? 'تحديد الكل' : locale === 'de' ? 'Alle auswählen' : 'Select all')}
          </button>
        </div>
      )}

      {/* Products list */}
      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <Package className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted text-sm">
              {locale === 'ar' ? 'لا توجد نتائج' : locale === 'de' ? 'Keine Ergebnisse' : 'No results'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const price = Number(p.discount_price ?? p.price);
            const hasDiscount = p.discount_price != null;
            const isLow = p.track_stock && (p.stock ?? 999) <= 5 && (p.stock ?? 0) > 0;
            const isOut = p.track_stock && (p.stock ?? 0) <= 0;
            return (
              <div
                key={p.id}
                className={`card flex items-center gap-3 !p-3 ${isOut ? 'opacity-60' : ''} ${isLow ? 'ring-1 ring-brand-yellow-500/30' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  className="w-5 h-5 rounded accent-brand-500"
                />
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-bg-elevated flex-shrink-0">
                  {(p.image_urls?.[0] || (p as any).image_url) ? (
                    <img src={(p.image_urls?.[0] || (p as any).image_url)!} onError={hideOnError} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-text truncate text-sm">{p.name}</h3>
                    {p.is_featured && <span className="text-[10px] text-brand-yellow-400">⭐</span>}
                    {isOut && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">{tOps?.outOfStock ?? 'OUT'}</span>}
                    {isLow && !isOut && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-yellow-500/20 text-brand-yellow-400 font-bold">{p.stock}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold text-brand">{formatEUR(price)}</span>
                    {hasDiscount && <span className="text-[10px] text-text-muted line-through">{formatEUR(Number(p.price))}</span>}
                    {p.sold_count > 0 && <span className="text-[10px] text-text-muted">· {p.sold_count} sold</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <ToggleAvailability productId={p.id} initial={p.is_available ?? true} />
                  <Link
                    href={`/restaurant/menu/${p.id}/edit`}
                    className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg touch-manipulation"
                    aria-label="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Link>
                  <DeleteProductButton productId={p.id} productName={p.name} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk price modal */}
      {bulkModal === 'price' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setBulkModal('none')}>
          <div className="bg-surface-elevated rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-white mb-4">
              {tOps?.bulkUpdatePrice ?? 'Update prices'}
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setBulkPriceChange({ ...bulkPriceChange, type: 'percent' })}
                  className={`flex-1 h-12 rounded-xl font-bold ${bulkPriceChange.type === 'percent' ? 'bg-brand-gradient text-white' : 'bg-surface-tertiary text-text-secondary'}`}
                >
                  %
                </button>
                <button
                  onClick={() => setBulkPriceChange({ ...bulkPriceChange, type: 'fixed' })}
                  className={`flex-1 h-12 rounded-xl font-bold ${bulkPriceChange.type === 'fixed' ? 'bg-brand-gradient text-white' : 'bg-surface-tertiary text-text-secondary'}`}
                >
                  €
                </button>
              </div>
              <input
                type="number"
                value={bulkPriceChange.value}
                onChange={(e) => setBulkPriceChange({ ...bulkPriceChange, value: Number(e.target.value) })}
                placeholder={bulkPriceChange.type === 'percent' ? '+10 or -15' : '+0.50 or -0.30'}
                className="w-full h-14 rounded-xl bg-surface-tertiary text-white text-2xl font-bold text-center outline-none touch-manipulation"
              />
              <p className="text-xs text-text-muted text-center">
                {locale === 'ar' ? `${selected.size} منتج` : locale === 'de' ? `Gilt für ${selected.size} Produkte` : `Affects ${selected.size} products`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => setBulkModal('none')} className="h-12 rounded-xl bg-surface-tertiary text-white font-bold touch-manipulation">
                {t.common.cancel}
              </button>
              <button onClick={handleBulkAction} className="h-12 rounded-xl bg-brand-gradient text-white font-bold touch-manipulation">
                {t.common.save ?? 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal !== 'none' && bulkModal !== 'price' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setBulkModal('none')}>
          <div className="bg-surface-elevated rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-white mb-2">
              {bulkModal === 'activate' ? (tOps?.bulkActivate ?? 'Activate') : (tOps?.bulkDeactivate ?? 'Deactivate')}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {tOps?.confirmBulk ?? 'Confirm?'} ({selected.size} {locale === 'ar' ? 'منتج' : locale === 'de' ? 'Produkte' : 'products'})
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setBulkModal('none')} className="h-12 rounded-xl bg-surface-tertiary text-white font-bold touch-manipulation">
                {t.common.cancel}
              </button>
              <button onClick={handleBulkAction} className={`h-12 rounded-xl text-white font-bold touch-manipulation ${bulkModal === 'activate' ? 'bg-emerald-gradient' : 'bg-gradient-to-r from-brand-yellow-500 to-brand-red-500'}`}>
                {t.common.save ?? 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
