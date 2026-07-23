'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Truck,
  Store,
  ShoppingBag,
  MapPin,
  RefreshCw,
  Users,
  Filter,
  Search,
  X,
  Loader2,
  Clock,
  Phone,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';
import { SmartMap } from '@/components/maps/SmartMap';
import { useRealtime } from '@/lib/realtime/use-realtime';
// useRealtime is imported from '@/lib/realtime/use-realtime'

const T = {
  de: {
    title: 'Live-Karte',
    subtitle: 'Echtzeit-Übersicht aller Fahrer, Restaurants und Bestellungen',
    drivers: 'Fahrer online',
    orders: 'Aktive Bestellungen',
    restaurants: 'Restaurants',
    refresh: 'Aktualisieren',
    liveTracking: 'Live-Tracking',
    lastUpdate: 'Letztes Update',
    points: 'Punkte',
    onlineNow: 'Jetzt online',
    onDelivery: 'In Lieferung',
    idle: 'Verfügbar',
    offline: 'Offline',
    filter: 'Filter',
    search: 'Suchen',
    all: 'Alle',
    driverStatus: 'Fahrer-Status',
    onDeliveryOnly: 'Nur in Lieferung',
    idleOnly: 'Nur verfügbar',
    detailTitle: 'Details',
    close: 'Schließen',
    call: 'Anrufen',
    viewOrder: 'Bestellung ansehen',
    minutesAgo: (m: number) => `vor ${m} Min`,
    lastFix: 'Letzte Position',
  },
  ar: {
    title: 'الخريطة المباشرة',
    subtitle: 'نظرة فورية على جميع السائقين والمطاعم والطلبات',
    drivers: 'السائقون المتصلون',
    orders: 'الطلبات النشطة',
    restaurants: 'المطاعم',
    refresh: 'تحديث',
    liveTracking: 'تتبع مباشر',
    lastUpdate: 'آخر تحديث',
    points: 'النقاط',
    onlineNow: 'متصل الآن',
    onDelivery: 'في التوصيل',
    idle: 'متاح',
    offline: 'غير متصل',
    filter: 'تصفية',
    search: 'بحث',
    all: 'الكل',
    driverStatus: 'حالة السائق',
    onDeliveryOnly: 'في التوصيل فقط',
    idleOnly: 'متاح فقط',
    detailTitle: 'التفاصيل',
    close: 'إغلاق',
    call: 'اتصال',
    viewOrder: 'عرض الطلب',
    minutesAgo: (m: number) => `قبل ${m} دقيقة`,
    lastFix: 'آخر موقع',
  },
  en: {
    title: 'Live Map',
    subtitle: 'Real-time overview of all drivers, restaurants and orders',
    drivers: 'Online drivers',
    orders: 'Active orders',
    restaurants: 'Restaurants',
    refresh: 'Refresh',
    liveTracking: 'Live tracking',
    lastUpdate: 'Last update',
    points: 'points',
    onlineNow: 'Online now',
    onDelivery: 'On delivery',
    idle: 'Available',
    offline: 'Offline',
    filter: 'Filter',
    search: 'Search',
    all: 'All',
    driverStatus: 'Driver status',
    onDeliveryOnly: 'On delivery only',
    idleOnly: 'Available only',
    detailTitle: 'Details',
    close: 'Close',
    call: 'Call',
    viewOrder: 'View order',
    minutesAgo: (m: number) => `${m}m ago`,
    lastFix: 'Last position',
  },
};

interface DriverMarker {
  id: string;
  name: string;
  phone?: string;
  last_login_at: string;
  last_location_at: string;
  is_online: boolean;
  is_on_delivery: boolean;
  current_order_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface OrderMarker {
  id: string;
  order_number: string;
  status: string;
  customer_lat: number;
  customer_lng: number;
  restaurant_lat?: number | null;
  restaurant_lng?: number | null;
  driver_id?: string | null;
  driver_latitude?: number | null;
  driver_longitude?: number | null;
  restaurants?: { name: string };
}

interface RestaurantMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

type Filter = 'all' | 'drivers' | 'orders' | 'restaurants';

export function AdminMapClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [data, setData] = useState<{
    drivers: DriverMarker[];
    activeOrders: OrderMarker[];
    restaurants: RestaurantMarker[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [driverStatus, setDriverStatus] = useState<'all' | 'online' | 'on_delivery' | 'idle'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<
    | { type: 'driver'; data: DriverMarker }
    | { type: 'order'; data: OrderMarker }
    | { type: 'restaurant'; data: RestaurantMarker }
    | null
  >(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/map', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.ok) {
        setData(json);
        setLastUpdate(new Date());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Smart polling: 8s when there are active drivers, 30s when idle
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, data?.drivers.length ? 8_000 : 30_000);
    return () => clearInterval(interval);
  }, [load, data?.drivers.length]);

  // Realtime: subscribe to orders + driver_status changes for instant updates
  useRealtime({
    channels: [
      {
        name: 'admin-orders',
        table: 'orders',
        event: '*',
        onChange: () => load(),
      },
    ],
  });

  // Build map markers
  const markers = useMemo(() => {
    const m: any[] = [];
    if (filter === 'all' || filter === 'drivers') {
      for (const d of data?.drivers ?? []) {
        if (d.latitude == null || d.longitude == null) continue;
        // Apply driver status filter
        if (driverStatus === 'on_delivery' && !d.is_on_delivery) continue;
        if (driverStatus === 'idle' && d.is_on_delivery) continue;
        m.push({
          id: `driver-${d.id}`,
          lat: d.latitude,
          lng: d.longitude,
          type: 'driver' as const,
          title: d.name,
          info: d.is_on_delivery ? t.onDelivery : t.idle,
          is_on_delivery: d.is_on_delivery,
          onClick: () => setSelected({ type: 'driver', data: d }),
        });
      }
    }
    if (filter === 'all' || filter === 'restaurants') {
      for (const r of data?.restaurants ?? []) {
        m.push({
          id: `restaurant-${r.id}`,
          lat: r.latitude,
          lng: r.longitude,
          type: 'restaurant' as const,
          title: r.name,
          onClick: () => setSelected({ type: 'restaurant', data: r }),
        });
      }
    }
    if (filter === 'all' || filter === 'orders') {
      for (const o of data?.activeOrders ?? []) {
        m.push({
          id: `order-${o.id}`,
          lat: o.customer_lat,
          lng: o.customer_lng,
          type: 'customer' as const, // use customer pin for delivery target
          title: `#${o.order_number}`,
          info: o.restaurants?.name ?? '',
          onClick: () => setSelected({ type: 'order', data: o }),
        });
        if (o.driver_latitude && o.driver_longitude) {
          m.push({
            id: `order-driver-${o.id}`,
            lat: o.driver_latitude,
            lng: o.driver_longitude,
            type: 'driver' as const,
            title: `#${o.order_number}`,
            is_on_delivery: true,
          });
        }
      }
    }
    return m;
  }, [data, filter, t]);

  // Map center: midpoint of all visible points
  const center = useMemo(() => {
    const points = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
    if (points.length === 0) return { lat: 50.7374, lng: 7.0982 };
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    return {
      lat: (Math.max(...lats) + Math.min(...lats)) / 2,
      lng: (Math.max(...lngs) + Math.min(...lngs)) / 2,
    };
  }, [markers]);

  // Filter search
  const filteredLists = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (s: string) => !q || s.toLowerCase().includes(q);
    return {
      drivers: (data?.drivers ?? []).filter(
        (d) => matches(d.name) || (d.phone && matches(d.phone))
      ),
      orders: (data?.activeOrders ?? []).filter(
        (o) => matches(o.order_number) || matches(o.restaurants?.name ?? '')
      ),
      restaurants: (data?.restaurants ?? []).filter((r) => matches(r.name)),
    };
  }, [data, search]);

  const drivers = filteredLists.drivers;
  const orders = filteredLists.orders;
  const restaurants = filteredLists.restaurants;

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
            <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
            {lastUpdate && (
              <p className="text-[10px] text-text-muted mt-0.5">
                {t.lastUpdate}: {lastUpdate.toLocaleTimeString(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-700 border border-edge text-sm font-bold text-text-secondary hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {t.refresh}
          </button>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-3 gap-3">
          <StatCard icon={Truck} label={t.drivers} value={data?.drivers.length ?? 0} color="text-emerald-400" />
          <StatCard icon={ShoppingBag} label={t.orders} value={data?.activeOrders.length ?? 0} color="text-brand-500" />
          <StatCard icon={Store} label={t.restaurants} value={data?.restaurants.length ?? 0} color="text-brand-yellow-400" />
        </section>

        {/* Filters + search */}
        <section className="rounded-2xl bg-surface-elevated border border-edge p-3 flex flex-wrap items-center gap-2">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
            {t.all}
          </FilterPill>
          <FilterPill active={filter === 'drivers'} onClick={() => setFilter('drivers')} icon={Truck}>
            {t.drivers}
          </FilterPill>
          <FilterPill active={filter === 'orders'} onClick={() => setFilter('orders')} icon={ShoppingBag}>
            {t.orders}
          </FilterPill>
          <FilterPill active={filter === 'restaurants'} onClick={() => setFilter('restaurants')} icon={Store}>
            {t.restaurants}
          </FilterPill>
          {(filter === 'all' || filter === 'drivers') && (
            <select
              value={driverStatus}
              onChange={(e) => setDriverStatus(e.target.value as any)}
              className="h-9 px-3 rounded-pill bg-ink-800 border border-edge text-xs text-white focus:outline-none focus:border-brand-500"
            >
              <option value="all">{t.driverStatus}: {t.all}</option>
              <option value="on_delivery">{t.onDelivery}</option>
              <option value="idle">{t.idle}</option>
            </select>
          )}
          <div className="flex-1 min-w-0" />
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              className="w-full h-9 ps-9 pe-3 rounded-pill bg-ink-800 border border-edge text-sm text-white placeholder:text-text-muted focus:border-brand-500 focus:outline-none"
            />
          </div>
        </section>

        {/* Map */}
        <section className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          <div className="aspect-[16/10] sm:aspect-[16/9] relative">
            <SmartMap center={center} zoom={12} markers={markers} height="100%" />

            {/* Legend overlay */}
            <div className="absolute top-3 start-3 bg-ink-900/95 backdrop-blur rounded-xl p-3 space-y-1.5 border border-edge shadow-lg">
              <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider mb-1">
                {t.liveTracking}
              </p>
              <LegendItem color="bg-emerald-500" icon={Truck} label={t.onlineNow} count={data?.drivers.length ?? 0} />
              <LegendItem color="bg-brand-yellow-500" icon={Truck} label={t.onDelivery} count={data?.drivers.filter((d) => d.is_on_delivery).length ?? 0} />
              <LegendItem color="bg-brand-500" icon={ShoppingBag} label={t.orders} count={data?.activeOrders.length ?? 0} />
              <LegendItem color="bg-cyan-500" icon={Store} label={t.restaurants} count={data?.restaurants.length ?? 0} />
            </div>

            {/* Selected detail card */}
            {selected && (
              <div className="absolute bottom-3 end-3 sm:end-auto sm:start-3 sm:bottom-3 w-72 max-w-[calc(100%-1.5rem)] rounded-2xl bg-ink-900/95 backdrop-blur border border-edge shadow-2xl">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge">
                  <h3 className="text-sm font-extrabold text-white">{t.detailTitle}</h3>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="p-1 -m-1 text-text-muted hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {selected.type === 'driver' && (
                  <div className="p-4 space-y-2 text-sm">
                    <p className="font-extrabold text-white">{selected.data.name}</p>
                    <p className="text-xs text-text-muted flex items-center gap-1.5">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        selected.data.is_on_delivery ? 'bg-brand-yellow-500' : 'bg-emerald-500'
                      )} />
                      {selected.data.is_on_delivery ? t.onDelivery : t.idle}
                    </p>
                    {selected.data.phone && (
                      <a
                        href={`tel:${selected.data.phone}`}
                        className="inline-flex items-center gap-1.5 text-xs text-brand-500 font-bold hover:underline"
                      >
                        <Phone className="w-3 h-3" />
                        <span dir="ltr">{selected.data.phone}</span>
                      </a>
                    )}
                    {selected.data.current_order_id && (
                      <a
                        href={`/admin/orders/${selected.data.current_order_id}`}
                        className="block text-xs text-cyan-400 font-bold hover:underline"
                      >
                        {t.viewOrder}: {selected.data.current_order_id.slice(0, 8)}…
                      </a>
                    )}
                  </div>
                )}
                {selected.type === 'order' && (
                  <div className="p-4 space-y-2 text-sm">
                    <p className="font-extrabold text-white">#{selected.data.order_number}</p>
                    <p className="text-xs text-text-muted">{selected.data.restaurants?.name}</p>
                    <p className="text-xs text-text-secondary capitalize">{selected.data.status}</p>
                    <a
                      href={`/admin/orders/${selected.data.id}`}
                      className="block text-xs text-cyan-400 font-bold hover:underline"
                    >
                      {t.viewOrder}
                    </a>
                  </div>
                )}
                {selected.type === 'restaurant' && (
                  <div className="p-4 space-y-1.5 text-sm">
                    <p className="font-extrabold text-white">{selected.data.name}</p>
                    <p className="text-xs text-text-muted tabular-nums" dir="ltr">
                      {selected.data.latitude.toFixed(4)}, {selected.data.longitude.toFixed(4)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Lists */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ListCard
            icon={Truck}
            title={t.drivers}
            count={drivers.length}
            emptyText="—"
            items={drivers.map((d) => ({
              id: d.id,
              title: d.name,
              sub: d.is_on_delivery ? t.onDelivery : t.idle,
              extra: d.last_location_at ? new Date(d.last_location_at).toLocaleTimeString(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
            }))}
            color="text-emerald-400"
            onClick={(id) => {
              const d = drivers.find((x) => x.id === id);
              if (d) setSelected({ type: 'driver', data: d });
            }}
          />
          <ListCard
            icon={ShoppingBag}
            title={t.orders}
            count={orders.length}
            emptyText="—"
            items={orders.map((o) => ({
              id: o.id,
              title: `#${o.order_number}`,
              sub: o.restaurants?.name ?? '—',
              extra: o.status,
            }))}
            color="text-brand-500"
            onClick={(id) => {
              const o = orders.find((x) => x.id === id);
              if (o) setSelected({ type: 'order', data: o });
            }}
          />
          <ListCard
            icon={Store}
            title={t.restaurants}
            count={restaurants.length}
            emptyText="—"
            items={restaurants.map((r) => ({
              id: r.id,
              title: r.name,
              sub: `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`,
              extra: '',
            }))}
            color="text-brand-yellow-400"
            onClick={(id) => {
              const r = restaurants.find((x) => x.id === id);
              if (r) setSelected({ type: 'restaurant', data: r });
            }}
          />
        </section>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge p-4">
      <Icon className={cn('w-5 h-5 mb-2', color)} />
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-text-muted font-extrabold uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-pill text-xs font-bold transition-all',
        active
          ? 'bg-brand-gradient text-white shadow-glow'
          : 'bg-ink-700 border border-edge text-text-secondary hover:text-white'
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

function LegendItem({
  color,
  icon: Icon,
  label,
  count,
}: {
  color: string;
  icon: any;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={cn('w-2.5 h-2.5 rounded-full', color)} />
      <Icon className="w-3 h-3 text-text-secondary" />
      <span className="font-bold text-text-secondary">{label}</span>
      <span className="ms-auto font-black text-white tabular-nums">{count}</span>
    </div>
  );
}

function ListCard({
  icon: Icon,
  title,
  count,
  items,
  color,
  onClick,
  emptyText,
}: {
  icon: any;
  title: string;
  count: number;
  items: { id: string; title: string; sub: string; extra?: string }[];
  color: string;
  onClick?: (id: string) => void;
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
      <header className="px-4 py-3 border-b border-edge flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', color)} />
          <h2 className="text-sm font-extrabold text-white">{title}</h2>
        </div>
        <span className="text-xs font-black text-text-muted tabular-nums">{count}</span>
      </header>
      <div className="max-h-[260px] overflow-y-auto divide-y divide-edge">
        {items.length === 0 ? (
          <p className="p-4 text-center text-xs text-text-muted">{emptyText}</p>
        ) : (
          items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onClick?.(it.id)}
              className="w-full text-start px-4 py-2.5 hover:bg-ink-700/50 transition-colors"
            >
              <p className="text-xs font-extrabold text-white truncate">{it.title}</p>
              <p className="text-[10px] text-text-muted truncate" dir="ltr">{it.sub}</p>
              {it.extra && (
                <p className="text-[10px] text-text-secondary truncate">{it.extra}</p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// (helper import above is sufficient)
