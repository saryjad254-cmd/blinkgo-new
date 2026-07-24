'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, Search, RefreshCw, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';
import Link from 'next/link';
import { formatCurrency } from '@/lib/i18n/format';

const T = {
  de: {
    title: 'Bestellungen',
    subtitle: 'Alle Bestellungen in Echtzeit verwalten',
    orderNumber: 'Bestellung',
    restaurant: 'Restaurant',
    customer: 'Kunde',
    total: 'Gesamt',
    status: 'Status',
    created: 'Erstellt',
    actions: 'Aktionen',
    search: 'Bestellung oder Restaurant suchen...',
    all: 'Alle',
    pending: 'Wartend',
    confirmed: 'Bestätigt',
    preparing: 'In Vorbereitung',
    ready: 'Bereit',
    picked_up: 'Unterwegs',
    delivered: 'Zugestellt',
    cancelled: 'Storniert',
    details: 'Details',
    noOrders: 'Keine Bestellungen',
  },
  ar: {
    title: 'الطلبات',
    subtitle: 'إدارة جميع الطلبات في الوقت الفعلي',
    orderNumber: 'الطلب',
    restaurant: 'المطعم',
    customer: 'العميل',
    total: 'الإجمالي',
    status: 'الحالة',
    created: 'تاريخ الطلب',
    actions: 'الإجراءات',
    search: 'ابحث عن طلب أو مطعم...',
    all: 'الكل',
    pending: 'قيد الانتظار',
    confirmed: 'مؤكد',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    picked_up: 'قيد التوصيل',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
    details: 'التفاصيل',
    noOrders: 'لا توجد طلبات',
  },
  en: {
    title: 'Orders',
    subtitle: 'Manage all orders in real time',
    orderNumber: 'Order',
    restaurant: 'Restaurant',
    customer: 'Customer',
    total: 'Total',
    status: 'Status',
    created: 'Created',
    actions: 'Actions',
    search: 'Search order or restaurant...',
    all: 'All',
    pending: 'Pending',
    confirmed: 'Confirmed',
    preparing: 'Preparing',
    ready: 'Ready',
    picked_up: 'Picked up',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    details: 'Details',
    noOrders: 'No orders',
  },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  confirmed: 'bg-blue-500/15 text-blue-400',
  preparing: 'bg-brand-yellow-500/15 text-brand-yellow-400',
  ready: 'bg-violet-500/15 text-violet-400',
  picked_up: 'bg-cyan-500/15 text-cyan-400',
  delivered: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-red-500/15 text-red-400',
};

const STATUS_KEYS = ['all', 'pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'];

export function AdminOrdersClient({
  user,
  locale = 'de',
}: {
  user: AdminUser;
  locale?: 'de' | 'ar' | 'en';
}) {
  const t = T[locale] ?? T.de;
  const isAr = locale === 'ar';
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/orders', window.location.origin);
      url.searchParams.set('limit', '100');
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      if (search) url.searchParams.set('q', search);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (res.ok && data.ok) setOrders(data.orders);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchOrders, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <AdminLayout user={user} locale={locale}>
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1>
            <p className="text-sm text-text-secondary mt-0.5">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-700 border border-edge text-sm font-bold text-text-secondary hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </header>

        {/* Status filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {STATUS_KEYS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'flex-shrink-0 h-9 px-4 rounded-full text-xs font-extrabold uppercase tracking-wider transition-colors',
                statusFilter === s
                  ? 'bg-brand-gradient text-white'
                  : 'bg-ink-700 text-text-secondary hover:text-white',
              )}
            >
              {s === 'all' ? t.all : t[s as keyof typeof t] ?? s}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.search}
          className="w-full h-10 px-4 rounded-xl bg-ink-700 border border-edge text-text placeholder:text-text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          dir="ltr"
        />

        <div className="rounded-2xl bg-surface-elevated border border-edge overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-text-muted text-sm">...</div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">{t.noOrders}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-700/40">
                  <tr>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.orderNumber}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.restaurant}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.customer}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.total}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.status}</th>
                    <th className="px-4 py-3 text-start text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{t.created}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-extrabold text-white">#{o.order_number}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px] truncate">
                        {o.restaurants?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px] truncate">
                        {o.customer?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-extrabold text-white tabular-nums">
                        {formatCurrency(Number(o.total), locale)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider',
                            STATUS_COLORS[o.status] ?? 'bg-ink-700 text-text-secondary',
                          )}
                        >
                          {t[o.status as keyof typeof t] ?? o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted tabular-nums">
                        {new Date(o.created_at).toLocaleString(
                          locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE',
                          { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
