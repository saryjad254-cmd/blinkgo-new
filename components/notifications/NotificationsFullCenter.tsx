'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Bell from 'lucide-react/dist/esm/icons/bell';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Package from 'lucide-react/dist/esm/icons/package';
import Truck from 'lucide-react/dist/esm/icons/truck';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import Tag from 'lucide-react/dist/esm/icons/tag';
import Info from 'lucide-react/dist/esm/icons/info';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import CheckCheck from 'lucide-react/dist/esm/icons/check-check';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';
import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'order' | 'driver' | 'restaurant' | 'promo' | 'info' | 'success' | 'warning' | 'coupon' | 'system' | 'new_order_assigned';
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationsFullCenterProps {
  locale: 'de' | 'ar' | 'en';
  scope: 'customer' | 'driver' | 'restaurant';
}

const COPY: Record<'de' | 'ar' | 'en', {
  filterAll: string;
  filterUnread: string;
  filterOrder: string;
  filterPromo: string;
  filterSystem: string;
  markAll: string;
  loading: string;
  empty: string;
  emptyDesc: string;
  refresh: string;
  loadError: string;
  updateError: string;
}> = {
  de: {
    filterAll: 'Alle',
    filterUnread: 'Ungelesen',
    filterOrder: 'Bestellungen',
    filterPromo: 'Angebote',
    filterSystem: 'System',
    markAll: 'Alle als gelesen markieren',
    loading: 'Wird geladen…',
    empty: 'Keine Benachrichtigungen',
    emptyDesc: 'Sobald etwas passiert — Bestellungen, Aktionen, Updates — siehst du es hier.',
    refresh: 'Aktualisieren',
    loadError: 'Benachrichtigungen konnten nicht geladen werden.',
    updateError: 'Die Änderung konnte nicht gespeichert werden.',
  },
  ar: {
    filterAll: 'الكل',
    filterUnread: 'غير مقروء',
    filterOrder: 'الطلبات',
    filterPromo: 'العروض',
    filterSystem: 'النظام',
    markAll: 'تمييز الكل كمقروء',
    loading: 'جاري التحميل…',
    empty: 'لا توجد إشعارات',
    emptyDesc: 'بمجرد حدوث أي شيء — طلبات أو عروض أو تحديثات — ستراها هنا.',
    refresh: 'تحديث',
    loadError: 'تعذّر تحميل الإشعارات.',
    updateError: 'تعذّر حفظ التغيير.',
  },
  en: {
    filterAll: 'All',
    filterUnread: 'Unread',
    filterOrder: 'Orders',
    filterPromo: 'Offers',
    filterSystem: 'System',
    markAll: 'Mark all as read',
    loading: 'Loading…',
    empty: 'No notifications',
    emptyDesc: 'Once something happens — orders, offers, updates — you will see it here.',
    refresh: 'Refresh',
    loadError: 'Notifications could not be loaded.',
    updateError: 'The change could not be saved.',
  },
};

function notificationIcon(type: string) {
  switch (type) {
    case 'order': return Package;
    case 'driver': return Truck;
    case 'restaurant': return Sparkles;
    case 'promo':
    case 'coupon': return Tag;
    case 'info':
    case 'system': return Info;
    case 'success': return CheckCircle2;
    case 'warning': return AlertTriangle;
    default: return Bell;
  }
}

function timeAgo(iso: string, locale: 'de' | 'ar' | 'en'): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return locale === 'ar' ? 'الآن' : locale === 'de' ? 'gerade' : 'just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return locale === 'ar' ? `قبل ${m} دقيقة` : locale === 'de' ? `vor ${m} Min.` : `${m}m ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return locale === 'ar' ? `قبل ${h} ساعة` : locale === 'de' ? `vor ${h} Std.` : `${h}h ago`;
  }
  const days = Math.floor(diff / 86400);
  if (days < 7) {
    return locale === 'ar' ? `قبل ${days} يوم` : locale === 'de' ? `vor ${days} Tag${days === 1 ? '' : 'en'}` : `${days}d ago`;
  }
  return d.toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: 'short' });
}

function notificationLink(n: Notification, scope: NotificationsFullCenterProps['scope']): string | null {
  const orderId = typeof n.data?.order_id === 'string' ? n.data.order_id : null;
  const restaurantId = typeof n.data?.restaurant_id === 'string' ? n.data.restaurant_id : null;
  const couponId = typeof n.data?.coupon_id === 'string' ? n.data.coupon_id : null;
  if (orderId) return scope === 'restaurant' ? `/restaurant/orders/${orderId}` : scope === 'driver' ? `/driver/orders/${orderId}` : `/orders/${orderId}`;
  if (restaurantId) return `/restaurants/${restaurantId}`;
  if (couponId) return '/profile?tab=coupons';
  if (typeof n.data?.url === 'string' && n.data.url.startsWith('/') && !n.data.url.startsWith('//')) return n.data.url;
  return null;
}

function localizedNotification(n: Notification, locale: NotificationsFullCenterProps['locale']): { title: string; body: string } {
  const subtype = typeof n.data?.subtype === 'string' ? n.data.subtype : '';
  const source = `${n.title} ${n.body}`;
  const orderNumber = source.match(/#([A-Z0-9-]+)/i)?.[1];
  const suffix = orderNumber ? ` #${orderNumber}` : '';
  const copy = {
    de: {
      assigned: { title: 'Neue Bestellung', body: `Eine neue Lieferung wurde dir zugewiesen${suffix}.` },
      ready: { title: 'Bestellung abholbereit', body: 'Die Bestellung kann jetzt im Restaurant abgeholt werden.' },
      pickedUp: { title: 'Bestellung abgeholt', body: 'Die Lieferung ist jetzt auf dem Weg zum Kunden.' },
      nearby: { title: 'Auf dem Weg zum Kunden', body: 'Folge der Navigation bis zur Lieferadresse.' },
      delivered: { title: 'Lieferung abgeschlossen', body: 'Die Bestellung wurde erfolgreich zugestellt.' },
      cancelled: { title: 'Bestellung storniert', body: 'Diese Bestellung wurde storniert. Öffne sie für weitere Details.' },
    },
    ar: {
      assigned: { title: 'طلب توصيل جديد', body: `تم تعيين طلب توصيل جديد لك${suffix}.` },
      ready: { title: 'الطلب جاهز للاستلام', body: 'أصبح بإمكانك استلام الطلب من المطعم الآن.' },
      pickedUp: { title: 'تم استلام الطلب', body: 'الطلب الآن في طريقه إلى الزبون.' },
      nearby: { title: 'في الطريق إلى الزبون', body: 'اتبع الملاحة حتى عنوان التسليم.' },
      delivered: { title: 'اكتمل التوصيل', body: 'تم تسليم الطلب بنجاح.' },
      cancelled: { title: 'تم إلغاء الطلب', body: 'أُلغي هذا الطلب. افتحه للاطلاع على التفاصيل.' },
    },
    en: {
      assigned: { title: 'New delivery assigned', body: `A new delivery has been assigned to you${suffix}.` },
      ready: { title: 'Order ready for pickup', body: 'The order is ready to collect from the restaurant.' },
      pickedUp: { title: 'Order picked up', body: 'The delivery is now on its way to the customer.' },
      nearby: { title: 'Heading to the customer', body: 'Follow navigation to the delivery address.' },
      delivered: { title: 'Delivery complete', body: 'The order was delivered successfully.' },
      cancelled: { title: 'Order cancelled', body: 'This order was cancelled. Open it for more details.' },
    },
  }[locale];

  if (subtype === 'new_order_assigned' || n.type === 'new_order_assigned') return copy.assigned;
  if (subtype === 'picked_up') return copy.pickedUp;
  if (subtype === 'nearby') return copy.nearby;
  if (subtype === 'delivered') return copy.delivered;
  if (subtype === 'order_cancelled') return copy.cancelled;
  if (subtype === 'order_accepted' && /ready|abhol|جاهز/i.test(source)) return copy.ready;
  return { title: n.title, body: n.body };
}

export function NotificationsFullCenter({ locale, scope }: NotificationsFullCenterProps) {
  const router = useRouter();
  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'order' | 'promo' | 'system'>('all');
  const [busy, setBusy] = useState<string | 'all' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (!response.ok) throw new Error('notification request failed');
      const payload = await response.json();
      setItems((payload?.data?.notifications ?? payload?.notifications ?? []) as Notification[]);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [t.loadError]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void fetchNotifications(); });
    return () => { cancelled = true; };
  }, [fetchNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let channel: RealtimeChannel | null = null;
    (async () => {
      try {
        // We need the user id first; get it from auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mounted) return;
        channel = supabase
          .channel(`notifications:${user.id}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
            (payload: RealtimePostgresInsertPayload<Notification>) => {
              if (payload?.new) {
                setItems((prev) => [payload.new as Notification, ...prev]);
              }
            }
          )
          .subscribe();
      } catch {
        // realtime may not be enabled; that's fine
      }
    })();
    return () => {
      mounted = false;
      if (channel) channel.unsubscribe();
    };
  }, [supabase]);

  const markAsRead = useCallback(async (id: string) => {
    setBusy(id);
    setError(null);
    const previous = items;
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error('notification update failed');
    } catch {
      setItems(previous);
      setError(t.updateError);
    } finally {
      setBusy(null);
    }
  }, [items, t.updateError]);

  const markAllAsRead = useCallback(async () => {
    setBusy('all');
    setError(null);
    const previous = items;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => n.read_at ? n : { ...n, read_at: now }));
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      });
      if (!response.ok) throw new Error('notifications update failed');
    } catch {
      setItems(previous);
      setError(t.updateError);
    } finally {
      setBusy(null);
    }
  }, [items, t.updateError]);

  // Filter
  const filtered = items.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read_at;
    if (filter === 'order') return n.type === 'order' || n.type === 'driver' || n.type === 'restaurant';
    if (filter === 'promo') return n.type === 'promo' || n.type === 'coupon';
    if (filter === 'system') return n.type === 'info' || n.type === 'system' || n.type === 'success' || n.type === 'warning';
    return true;
  });

  const unreadCount = items.filter((n) => !n.read_at).length;

  const filterTabs: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all', label: t.filterAll, count: items.length },
    { key: 'unread', label: t.filterUnread, count: unreadCount },
    { key: 'order', label: t.filterOrder, count: items.filter((n) => n.type === 'order' || n.type === 'driver' || n.type === 'restaurant').length },
    { key: 'promo', label: t.filterPromo, count: items.filter((n) => n.type === 'promo' || n.type === 'coupon').length },
    { key: 'system', label: t.filterSystem, count: items.filter((n) => n.type === 'info' || n.type === 'system' || n.type === 'success' || n.type === 'warning').length },
  ];

  return (
    <div data-testid="notifications-list-center" dir={dir} className="space-y-4">
      {/* Header bar */}
      <div className="card-glass p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 overflow-x-auto">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                aria-pressed={filter === tab.key}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  filter === tab.key
                    ? 'bg-gradient-to-r from-brand-red-500/15 to-brand-yellow-500/10 text-brand border border-brand-red-500/30'
                    : 'bg-bg-elevated/40 text-text-secondary hover:text-text border border-edge hover:border-edge-strong'
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold',
                    filter === tab.key
                      ? 'bg-brand-red-500 text-white'
                      : 'bg-bg text-text-muted'
                  )}>
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2">
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={busy === 'all'}
            className="inline-flex items-center gap-1.5 px-3 h-11 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-xs font-bold text-text-secondary hover:text-text transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {busy === 'all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            {t.markAll}
          </button>
        )}
        <button
          type="button"
          onClick={fetchNotifications}
          disabled={loading}
          className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-text-secondary hover:text-text transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          title={t.refresh}
          aria-label={t.refresh}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-danger/25 bg-danger/5 p-3 text-sm text-danger" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void fetchNotifications()} className="min-h-11 shrink-0 rounded-xl border border-danger/30 px-3 font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-danger">
            {t.refresh}
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="card-glass p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 text-brand-red-500 animate-spin" />
          <p className="text-sm text-text-secondary">{t.loading}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-glass p-10 sm:p-12 text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-brand-red-500/15 blur-xl" />
            <div className="relative w-full h-full rounded-full bg-brand-red-500/5 border-2 border-brand-red-500/20 flex items-center justify-center">
              <Bell className="w-10 h-10 text-brand-red-500/60" strokeWidth={1.5} />
            </div>
          </div>
          <h3 className="text-lg font-extrabold text-text mb-1">{t.empty}</h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto leading-relaxed">{t.emptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const Icon = notificationIcon(n.type);
            const href = notificationLink(n, scope);
            const localized = localizedNotification(n, locale);
            const className = cn(
              'group relative card-glass w-full p-4 flex items-start gap-3 text-start transition-all duration-200 ease-silk [content-visibility:auto] [contain-intrinsic-size:96px]',
              'hover:border-edge-strong hover:-translate-y-0.5 cursor-pointer',
              !n.read_at && 'border-l-2 border-l-brand-red-500'
            );
            const content = <>
                {/* Unread dot */}
                {!n.read_at && (
                  <div className="absolute top-3 end-3 w-2 h-2 rounded-full bg-brand-red-500 shadow-[0_0_8px_rgba(220,38,38,0.6)]" />
                )}

                {/* Icon */}
                <div className={cn(
                  'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
                  n.type === 'order' || n.type === 'driver' ? 'bg-brand-red-500/15 text-brand-red-500' :
                  n.type === 'promo' || n.type === 'coupon' ? 'bg-brand-yellow-500/15 text-brand-yellow-500' :
                  n.type === 'success' ? 'bg-success/15 text-success' :
                  n.type === 'warning' ? 'bg-warning/15 text-warning' :
                  'bg-bg-elevated text-text-secondary'
                )}>
                  <Icon className="w-5 h-5" strokeWidth={2} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 pe-4">
                  <p className={cn('text-sm leading-snug mb-0.5 line-clamp-1', !n.read_at ? 'font-extrabold text-text' : 'font-bold text-text-secondary')}>
                    {localized.title}
                  </p>
                  <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{localized.body}</p>
                  <p className="text-[10px] text-text-muted mt-1.5 font-bold uppercase tracking-wider">
                    {timeAgo(n.created_at, locale)}
                  </p>
                </div>
              </>;
            if (href) {
              return (
                <Link
                  key={n.id}
                  href={href}
                  className={className}
                  aria-busy={busy === n.id}
                  onClick={async (event) => {
                    event.preventDefault();
                    if (!n.read_at) await markAsRead(n.id);
                    router.push(href);
                  }}
                >
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={n.id}
                type="button"
                className={className}
                aria-busy={busy === n.id}
                onClick={() => { if (!n.read_at) void markAsRead(n.id); }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
