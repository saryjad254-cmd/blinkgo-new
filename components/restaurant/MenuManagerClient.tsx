'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Check from 'lucide-react/dist/esm/icons/check';
import ClipboardList from 'lucide-react/dist/esm/icons/clipboard-list';
import Edit2 from 'lucide-react/dist/esm/icons/edit-2';
import Filter from 'lucide-react/dist/esm/icons/filter';
import ImageIcon from 'lucide-react/dist/esm/icons/image';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Package from 'lucide-react/dist/esm/icons/package';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Search from 'lucide-react/dist/esm/icons/search';
import Star from 'lucide-react/dist/esm/icons/star';
import Tags from 'lucide-react/dist/esm/icons/tags';
import WifiOff from 'lucide-react/dist/esm/icons/wifi-off';
import X from 'lucide-react/dist/esm/icons/x';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { Locale } from '@/lib/i18n/server-translations';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/utils/haptics';
import { extractErrorMessage } from '@/lib/foundation/error-helper';

export type RestaurantMenuProduct = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  discount_price?: number | null;
  is_active?: boolean | null;
  is_available?: boolean | null;
  is_featured?: boolean | null;
  sold_count?: number | null;
  stock?: number | null;
  track_stock?: boolean | null;
  category?: string | null;
  image_urls?: string[] | null;
  preparation_time?: number | null;
  prep_time?: number | null;
  approval_status?: string | null;
  archived_at?: string | null;
};

type Props = {
  restaurantName: string;
  initialProducts: RestaurantMenuProduct[];
  categories: Array<{ id: string; name: string }>;
  pendingRequests: number;
  locale: Locale;
};

const COPY = {
  de: {
    eyebrow: 'BLINKGO · MENÜMANAGER', title: 'Speisekarte', subtitle: 'Preise, Verfügbarkeit, Bestand und Zubereitungszeit zentral steuern.', request: 'Produkt beantragen', requests: 'Anfragen', pendingRequests: 'In Prüfung', total: 'Produkte', available: 'Bestellbar', lowStock: 'Niedriger Bestand', outOfStock: 'Ausverkauft', search: 'Produkt suchen', filters: 'Filter', allCategories: 'Alle Kategorien', allAvailability: 'Alle Zustände', availableOnly: 'Bestellbar', unavailableOnly: 'Pausiert', allStock: 'Alle Bestände', inStock: 'Auf Lager', low: 'Niedrig', out: 'Leer', results: (shown: number, all: number) => `${shown} von ${all} Produkten`, empty: 'Keine passenden Produkte', emptyBody: 'Passe Suche oder Filter an oder beantrage ein neues Produkt.', clear: 'Filter zurücksetzen', sold: 'verkauft', stock: 'Bestand', prep: 'Zubereitung', minutes: 'Min.', featured: 'Empfohlen', platformDisabled: 'Von BlinkGo deaktiviert', edit: 'Betriebsdaten bearbeiten', selected: 'ausgewählt', selectAll: 'Alle auswählen', deselectAll: 'Auswahl aufheben', activate: 'Aktivieren', deactivate: 'Pausieren', prices: 'Preise ändern', cancel: 'Abbrechen', apply: 'Anwenden', priceTitle: 'Preise gesammelt ändern', percent: 'Prozent', fixed: 'Fester Betrag', affects: 'Produkte betroffen', confirmBulk: 'Änderung für die ausgewählten Produkte übernehmen?', saved: 'Speisekarte aktualisiert.', failed: 'Änderung konnte nicht gespeichert werden.', offline: 'Offline – Produkte bleiben sichtbar, Änderungen sind gesperrt.', noImage: 'Kein Bild',
  },
  ar: {
    eyebrow: 'BLINKGO · إدارة القائمة', title: 'قائمة الطعام', subtitle: 'تحكم بالأسعار والتوفر والمخزون ووقت التحضير من مكان واحد.', request: 'طلب منتج جديد', requests: 'الطلبات', pendingRequests: 'قيد المراجعة', total: 'المنتجات', available: 'متاح للطلب', lowStock: 'مخزون منخفض', outOfStock: 'نفد المخزون', search: 'ابحث عن منتج', filters: 'الفلاتر', allCategories: 'كل الفئات', allAvailability: 'كل الحالات', availableOnly: 'متاح', unavailableOnly: 'متوقف', allStock: 'كل المخزون', inStock: 'متوفر', low: 'منخفض', out: 'فارغ', results: (shown: number, all: number) => `${shown} من أصل ${all} منتج`, empty: 'لا توجد منتجات مطابقة', emptyBody: 'غيّر البحث أو الفلاتر أو أرسل طلب منتج جديد.', clear: 'إعادة ضبط الفلاتر', sold: 'مباع', stock: 'المخزون', prep: 'التحضير', minutes: 'د', featured: 'مقترح', platformDisabled: 'معطّل من BlinkGo', edit: 'تعديل بيانات التشغيل', selected: 'محدد', selectAll: 'تحديد الكل', deselectAll: 'إلغاء التحديد', activate: 'تفعيل', deactivate: 'إيقاف', prices: 'تعديل الأسعار', cancel: 'إلغاء', apply: 'تطبيق', priceTitle: 'تعديل جماعي للأسعار', percent: 'نسبة مئوية', fixed: 'قيمة ثابتة', affects: 'منتجات ستتأثر', confirmBulk: 'هل تريد تطبيق التغيير على المنتجات المحددة؟', saved: 'تم تحديث القائمة.', failed: 'تعذر حفظ التغيير.', offline: 'لا يوجد اتصال — المنتجات ظاهرة والتعديلات متوقفة.', noImage: 'لا توجد صورة',
  },
  en: {
    eyebrow: 'BLINKGO · MENU MANAGER', title: 'Menu', subtitle: 'Control prices, availability, stock and preparation time in one place.', request: 'Request product', requests: 'Requests', pendingRequests: 'Under review', total: 'Products', available: 'Orderable', lowStock: 'Low stock', outOfStock: 'Out of stock', search: 'Search product', filters: 'Filters', allCategories: 'All categories', allAvailability: 'All states', availableOnly: 'Available', unavailableOnly: 'Paused', allStock: 'All stock', inStock: 'In stock', low: 'Low', out: 'Out', results: (shown: number, all: number) => `${shown} of ${all} products`, empty: 'No matching products', emptyBody: 'Adjust search or filters, or request a new product.', clear: 'Reset filters', sold: 'sold', stock: 'Stock', prep: 'Preparation', minutes: 'min', featured: 'Featured', platformDisabled: 'Disabled by BlinkGo', edit: 'Edit operations data', selected: 'selected', selectAll: 'Select all', deselectAll: 'Deselect all', activate: 'Activate', deactivate: 'Pause', prices: 'Change prices', cancel: 'Cancel', apply: 'Apply', priceTitle: 'Bulk price update', percent: 'Percent', fixed: 'Fixed amount', affects: 'products affected', confirmBulk: 'Apply this change to the selected products?', saved: 'Menu updated.', failed: 'The change could not be saved.', offline: 'Offline – products remain visible and changes are locked.', noImage: 'No image',
  },
} as const;

type AvailabilityFilter = 'all' | 'available' | 'unavailable';
type StockFilter = 'all' | 'in' | 'low' | 'out';
type BulkAction = 'activate' | 'deactivate' | 'price' | null;

function currency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function ProductImage({ product, fallback }: { product: RestaurantMenuProduct; fallback: string }) {
  const [failed, setFailed] = useState(false);
  const url = product.image_urls?.[0];
  return <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black/30">{url && !failed ? <Image src={url} alt={product.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" unoptimized loading="eager" onError={() => setFailed(true)} /> : <div className="grid h-full place-items-center text-zinc-700"><div className="text-center"><ImageIcon className="mx-auto h-7 w-7" /><span className="mt-1 block text-[10px] font-bold">{fallback}</span></div></div>}</div>;
}

export function MenuManagerClient({ restaurantName, initialProducts, categories, pendingRequests, locale }: Props) {
  const router = useRouter();
  const copy = COPY[locale];
  const network = useOnlineStatus();
  const { success, error: toastError } = useToast();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [category, setCategory] = useState('all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [priceChange, setPriceChange] = useState({ type: 'percent' as 'percent' | 'fixed', value: 0 });
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => {
    let available = 0; let low = 0; let out = 0;
    for (const product of products) {
      if (product.is_active !== false && product.is_available !== false) available += 1;
      if (product.track_stock && Number(product.stock ?? 0) <= 0) out += 1;
      else if (product.track_stock && Number(product.stock ?? 0) <= 5) low += 1;
    }
    return { available, low, out };
  }, [products]);

  const categoryNames = useMemo(() => {
    const values = new Set(categories.map((item) => item.name));
    for (const product of products) if (product.category) values.add(product.category);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [categories, products]);

  const filtered = useMemo(() => products.filter((product) => {
    if (deferredSearch && !`${product.name} ${product.description ?? ''} ${product.category ?? ''}`.toLowerCase().includes(deferredSearch)) return false;
    if (category !== 'all' && product.category !== category) return false;
    if (availability === 'available' && (product.is_available === false || product.is_active === false)) return false;
    if (availability === 'unavailable' && product.is_available !== false && product.is_active !== false) return false;
    const stock = Number(product.stock ?? 0);
    if (stockFilter === 'out' && (!product.track_stock || stock > 0)) return false;
    if (stockFilter === 'low' && (!product.track_stock || stock <= 0 || stock > 5)) return false;
    if (stockFilter === 'in' && product.track_stock && stock <= 5) return false;
    return true;
  }), [availability, category, deferredSearch, products, stockFilter]);

  const clearFilters = () => { setSearch(''); setCategory('all'); setAvailability('all'); setStockFilter('all'); };
  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected((current) => current.size === filtered.length ? new Set() : new Set(filtered.filter((product) => product.is_active !== false).map((product) => product.id)));

  const patchProducts = async (body: Record<string, unknown>, key: string) => {
    if (!network.isOnline || busy) return false;
    setBusy(key);
    try {
      const response = await fetch('/api/products/manage', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(extractErrorMessage(payload, copy.failed));
      const changed = (payload.products ?? (payload.product ? [payload.product] : [])) as RestaurantMenuProduct[];
      if (changed.length) {
        const byId = new Map(changed.map((product) => [product.id, product]));
        setProducts((current) => current.map((product) => byId.has(product.id) ? { ...product, ...byId.get(product.id) } : product));
      }
      haptic('success'); success(copy.saved); router.refresh();
      return true;
    } catch (cause) { toastError(cause instanceof Error ? cause.message : copy.failed); return false; }
    finally { setBusy(null); }
  };

  const toggleAvailability = async (product: RestaurantMenuProduct) => {
    if (product.is_active === false) return;
    const next = product.is_available === false;
    setProducts((current) => current.map((item) => item.id === product.id ? { ...item, is_available: next } : item));
    const saved = await patchProducts({ id: product.id, is_available: next }, `toggle-${product.id}`);
    if (!saved) setProducts((current) => current.map((item) => item.id === product.id ? { ...item, is_available: product.is_available } : item));
  };

  const applyBulk = async () => {
    if (!bulkAction || selected.size === 0) return;
    const body: Record<string, unknown> = { productIds: Array.from(selected) };
    if (bulkAction === 'activate') body.is_available = true;
    if (bulkAction === 'deactivate') body.is_available = false;
    if (bulkAction === 'price') body.priceChange = priceChange;
    const saved = await patchProducts(body, 'bulk');
    if (saved) { setSelected(new Set()); setBulkAction(null); }
  };

  return (
    <section data-testid="restaurant-menu-center" className="min-h-[calc(100vh-7rem)] bg-[#09090b] px-3 py-4 text-white sm:px-6 lg:px-8 lg:py-7" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,0,.18),transparent_36%),linear-gradient(145deg,#17171b,#0d0d10)] p-4 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[11px] font-black tracking-[0.2em] text-[#ff3029]">{copy.eyebrow}</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{copy.title}</h1><p className="mt-1 text-sm text-zinc-400">{restaurantName} · {copy.subtitle}</p></div><div className="flex flex-wrap gap-2"><Link href="/restaurant/menu/requests" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-black hover:bg-white/[0.08]"><ClipboardList className="h-4 w-4" />{copy.requests}{pendingRequests > 0 ? <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] text-black">{pendingRequests}</span> : null}</Link><Link href="/restaurant/menu/requests/new" data-testid="restaurant-menu-request-new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e10600] px-4 text-sm font-black hover:bg-[#ff1e17]"><Plus className="h-4 w-4" />{copy.request}</Link></div></div>
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">{[
            { label: copy.total, value: products.length, tone: 'text-white' }, { label: copy.available, value: counts.available, tone: 'text-emerald-300' }, { label: copy.lowStock, value: counts.low, tone: 'text-amber-300' }, { label: copy.outOfStock, value: counts.out, tone: 'text-red-300' }, { label: copy.pendingRequests, value: pendingRequests, tone: 'text-sky-300' },
          ].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-xs font-bold text-zinc-500">{item.label}</p><strong className={cn('mt-1 block text-2xl font-black tabular-nums', item.tone)}>{item.value}</strong></div>)}</div>
        </header>

        {!network.isOnline ? <div role="alert" data-testid="restaurant-menu-offline" className="flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-black text-red-100"><WifiOff className="h-5 w-5 shrink-0" />{copy.offline}</div> : null}

        <div className="rounded-[24px] border border-white/10 bg-[#121216] p-3 sm:p-4">
          <div className="flex gap-2"><label className="relative flex-1"><span className="sr-only">{copy.search}</span><Search className={cn('absolute top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500', locale === 'ar' ? 'right-4' : 'left-4')} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="restaurant-menu-search" placeholder={copy.search} className={cn('min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-[#e10600]', locale === 'ar' ? 'pr-12 pl-4' : 'pl-12 pr-4')} /></label><button type="button" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} data-testid="restaurant-menu-filter-toggle" className={cn('grid min-h-12 min-w-12 place-items-center rounded-2xl border', showFilters ? 'border-[#e10600] bg-red-500/10 text-[#ff3029]' : 'border-white/10 bg-white/[0.03] text-zinc-400')} aria-label={copy.filters}><Filter className="h-5 w-5" /></button></div>
          {showFilters ? <div className="mt-3 grid gap-2 sm:grid-cols-3"><select value={category} onChange={(event) => setCategory(event.target.value)} data-testid="restaurant-menu-category-filter" className="min-h-12 rounded-xl border border-white/10 bg-[#1a1a1f] px-3 text-sm"><option value="all">{copy.allCategories}</option>{categoryNames.map((name) => <option key={name} value={name}>{name}</option>)}</select><select value={availability} onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)} data-testid="restaurant-menu-availability-filter" className="min-h-12 rounded-xl border border-white/10 bg-[#1a1a1f] px-3 text-sm"><option value="all">{copy.allAvailability}</option><option value="available">{copy.availableOnly}</option><option value="unavailable">{copy.unavailableOnly}</option></select><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)} data-testid="restaurant-menu-stock-filter" className="min-h-12 rounded-xl border border-white/10 bg-[#1a1a1f] px-3 text-sm"><option value="all">{copy.allStock}</option><option value="in">{copy.inStock}</option><option value="low">{copy.low}</option><option value="out">{copy.out}</option></select></div> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-1"><p className="text-sm font-bold text-zinc-400">{copy.results(filtered.length, products.length)}</p><div className="flex items-center gap-2">{search || category !== 'all' || availability !== 'all' || stockFilter !== 'all' ? <button type="button" onClick={clearFilters} className="min-h-11 rounded-xl px-3 text-xs font-black text-[#ff3029] hover:bg-red-500/10">{copy.clear}</button> : null}{filtered.length ? <button type="button" onClick={toggleAll} className="min-h-11 rounded-xl px-3 text-xs font-black text-zinc-400 hover:bg-white/[0.05] hover:text-white">{selected.size === filtered.filter((product) => product.is_active !== false).length && selected.size > 0 ? copy.deselectAll : copy.selectAll}</button> : null}</div></div>

        {selected.size > 0 ? <div data-testid="restaurant-menu-bulk-bar" className="sticky top-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e10600]/30 bg-[#1b1012]/95 p-3 shadow-xl backdrop-blur"><strong className="text-sm">{selected.size} {copy.selected}</strong><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setBulkAction('activate')} disabled={!network.isOnline} className="min-h-11 rounded-xl bg-emerald-500 px-3 text-xs font-black text-black disabled:opacity-45"><Check className="me-1 inline h-4 w-4" />{copy.activate}</button><button type="button" onClick={() => setBulkAction('deactivate')} disabled={!network.isOnline} className="min-h-11 rounded-xl bg-amber-400 px-3 text-xs font-black text-black disabled:opacity-45"><X className="me-1 inline h-4 w-4" />{copy.deactivate}</button><button type="button" onClick={() => setBulkAction('price')} disabled={!network.isOnline} className="min-h-11 rounded-xl bg-sky-500 px-3 text-xs font-black text-black disabled:opacity-45">{copy.prices}</button><button type="button" onClick={() => setSelected(new Set())} aria-label={copy.deselectAll} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10"><X className="h-4 w-4" /></button></div></div> : null}

        {filtered.length === 0 ? <div className="grid min-h-72 place-items-center rounded-[28px] border border-dashed border-white/10 bg-[#111115] p-6 text-center"><div><Package className="mx-auto h-10 w-10 text-zinc-700" /><h2 className="mt-3 text-lg font-black">{copy.empty}</h2><p className="mt-1 max-w-md text-sm text-zinc-500">{copy.emptyBody}</p><button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#e10600] px-4 text-sm font-black">{copy.clear}</button></div></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((product) => {
          const stock = Number(product.stock ?? 0); const isOut = product.track_stock && stock <= 0; const isLow = product.track_stock && stock > 0 && stock <= 5; const effectivePrice = Number(product.discount_price ?? product.price); const disabledByPlatform = product.is_active === false; const isAvailable = !disabledByPlatform && product.is_available !== false;
          return <article key={product.id} data-testid="restaurant-menu-product" data-product-id={product.id} className={cn('rounded-[24px] border bg-[#121216] p-3 shadow-xl shadow-black/15', isOut ? 'border-red-400/30' : isLow ? 'border-amber-400/30' : 'border-white/10', !isAvailable && 'opacity-75')}>
            <div className="relative"><ProductImage product={product} fallback={copy.noImage} /><label className="absolute start-2 top-2 grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-xl border border-white/15 bg-black/75 backdrop-blur" aria-label={`${copy.selectAll}: ${product.name}`}><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} disabled={disabledByPlatform} className="h-5 w-5 accent-[#e10600]" /></label>{product.is_featured ? <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#ffca0a] px-2 py-1 text-[10px] font-black text-black"><Star className="h-3 w-3 fill-current" />{copy.featured}</span> : null}</div>
            <div className="p-2 pt-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-base font-black">{product.name}</h2><p className="mt-0.5 truncate text-xs text-zinc-600">{product.category || '—'}</p></div><div className="shrink-0 text-end"><strong className="block text-base font-black text-[#ffca0a]">{currency(effectivePrice, locale)}</strong>{product.discount_price != null ? <span className="text-[10px] text-zinc-600 line-through">{currency(Number(product.price), locale)}</span> : null}</div></div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px]"><div className="rounded-xl bg-white/[0.035] p-2"><span className="block text-zinc-600">{copy.stock}</span><strong className={cn('mt-1 block', isOut ? 'text-red-300' : isLow ? 'text-amber-300' : 'text-zinc-200')}>{product.track_stock ? stock : '∞'}</strong></div><div className="rounded-xl bg-white/[0.035] p-2"><span className="block text-zinc-600">{copy.prep}</span><strong className="mt-1 block text-zinc-200">{product.preparation_time ?? product.prep_time ?? 15} {copy.minutes}</strong></div><div className="rounded-xl bg-white/[0.035] p-2"><span className="block text-zinc-600">{copy.sold}</span><strong className="mt-1 block text-zinc-200">{product.sold_count ?? 0}</strong></div></div>
              {disabledByPlatform ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-black text-red-300"><AlertTriangle className="h-4 w-4" />{copy.platformDisabled}</div> : null}
              <div className="mt-3 flex gap-2"><button type="button" onClick={() => toggleAvailability(product)} disabled={!network.isOnline || Boolean(busy) || disabledByPlatform} data-testid="restaurant-menu-availability-toggle" aria-pressed={isAvailable} className={cn('inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black disabled:opacity-45', isAvailable ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-zinc-400')}>{busy === `toggle-${product.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className={cn('h-2.5 w-2.5 rounded-full', isAvailable ? 'bg-emerald-400' : 'bg-zinc-600')} />}{isAvailable ? copy.availableOnly : copy.unavailableOnly}</button><Link href={`/restaurant/menu/${product.id}/edit`} data-testid="restaurant-menu-edit" aria-label={`${copy.edit}: ${product.name}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/[0.08]"><Edit2 className="h-4 w-4" /></Link></div>
            </div>
          </article>;
        })}</div>}

        {bulkAction ? <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setBulkAction(null); }}><div role="dialog" aria-modal="true" aria-labelledby="menu-bulk-title" className="w-full max-w-md rounded-[24px] border border-white/10 bg-[#17171b] p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><h2 id="menu-bulk-title" className="text-lg font-black">{bulkAction === 'price' ? copy.priceTitle : bulkAction === 'activate' ? copy.activate : copy.deactivate}</h2><button type="button" onClick={() => setBulkAction(null)} aria-label={copy.cancel} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10"><X className="h-4 w-4" /></button></div>{bulkAction === 'price' ? <div className="mt-4 space-y-3"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setPriceChange((value) => ({ ...value, type: 'percent' }))} className={cn('min-h-11 rounded-xl font-black', priceChange.type === 'percent' ? 'bg-[#e10600]' : 'bg-white/[0.05]')}>{copy.percent} %</button><button type="button" onClick={() => setPriceChange((value) => ({ ...value, type: 'fixed' }))} className={cn('min-h-11 rounded-xl font-black', priceChange.type === 'fixed' ? 'bg-[#e10600]' : 'bg-white/[0.05]')}>{copy.fixed} €</button></div><label className="block"><span className="sr-only">{copy.prices}</span><input type="number" step="0.01" value={priceChange.value} onChange={(event) => setPriceChange((value) => ({ ...value, value: Number(event.target.value) }))} data-testid="restaurant-menu-price-change" className="min-h-14 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center text-2xl font-black outline-none focus:border-[#e10600]" /></label><p className="text-center text-sm text-zinc-500">{selected.size} {copy.affects}</p></div> : <p className="mt-4 text-sm text-zinc-400">{copy.confirmBulk}</p>}<div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setBulkAction(null)} className="min-h-12 rounded-xl border border-white/10 font-black">{copy.cancel}</button><button type="button" onClick={applyBulk} disabled={busy === 'bulk' || !network.isOnline} data-testid="restaurant-menu-bulk-apply" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e10600] font-black disabled:opacity-45">{busy === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin" /> : bulkAction === 'activate' ? <Check className="h-4 w-4" /> : bulkAction === 'deactivate' ? <X className="h-4 w-4" /> : <Tags className="h-4 w-4" />}{copy.apply}</button></div></div></div> : null}
      </div>
    </section>
  );
}
