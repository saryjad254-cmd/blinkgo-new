'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Bell, Check, X, Loader2, Inbox, Package, Truck, CheckCircle2,
  AlertTriangle, Sparkles, Tag, Info, RefreshCw, CheckCheck
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'order' | 'driver' | 'restaurant' | 'promo' | 'info' | 'success' | 'warning' | 'coupon' | 'system';
  data: any;
  read_at: string | null;
  created_at: string;
}

interface NotificationsFullCenterProps {
  locale: 'de' | 'ar' | 'en';
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

function notificationLink(n: Notification): string | null {
  if (n.data?.order_id) return `/orders/${n.data.order_id}`;
  if (n.data?.restaurant_id) return `/restaurants/${n.data.restaurant_id}`;
  if (n.data?.coupon_id) return '/profile?tab=coupons';
  if (n.data?.url) return n.data.url;
  return null;
}

export function NotificationsFullCenter({ locale }: NotificationsFullCenterProps) {
  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'order' | 'promo' | 'system'>('all');
  const [busy, setBusy] = useState<string | 'all' | null>(null);
  const [realtimeChannel, setRealtimeChannel] = useState<any>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        // Graceful: if table missing, show empty state
        if (error.code === 'PGRST205' || error.code === '42P01') {
          setItems([]);
        } else {
          console.warn('[notifications] fetch error:', error.message);
        }
      } else {
        setItems((data || []) as Notification[]);
      }
    } catch (e) {
      console.warn('[notifications] fetch threw:', e);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let channel: any = null;
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
            (payload: any) => {
              if (payload?.new) {
                setItems((prev) => [payload.new as Notification, ...prev]);
              }
            }
          )
          .subscribe();
        setRealtimeChannel(channel);
      } catch (e) {
        // realtime may not be enabled; that's fine
      }
    })();
    return () => {
      mounted = false;
      if (channel) channel.unsubscribe();
    };
  }, [supabase]);

  const markAsRead = useCallback(async (id: string) => {
    if (!supabase) return;
    setBusy(id);
    // Optimistic update
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    try {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    } catch (e) {
      console.warn('[notifications] markAsRead failed:', e);
    } finally {
      setBusy(null);
    }
  }, [supabase]);

  const markAllAsRead = useCallback(async () => {
    if (!supabase) return;
    setBusy('all');
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => n.read_at ? n : { ...n, read_at: now }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', user.id)
        .is('read_at', null);
    } catch (e) {
      console.warn('[notifications] markAllAsRead failed:', e);
    } finally {
      setBusy(null);
    }
  }, [supabase]);

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
    <div dir={dir} className="space-y-4">
      {/* Header bar */}
      <div className="card-glass p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 overflow-x-auto">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex-shrink-0',
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
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-xs font-bold text-text-secondary hover:text-text transition-all disabled:opacity-50"
          >
            {busy === 'all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            {t.markAll}
          </button>
        )}
        <button
          type="button"
          onClick={fetchNotifications}
          disabled={loading}
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-text-secondary hover:text-text transition-all disabled:opacity-50"
          title={t.refresh}
          aria-label={t.refresh}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

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
            const href = notificationLink(n);
            const Wrapper: any = href ? Link : 'div';
            const wrapperProps: any = href ? { href } : {};
            return (
              <Wrapper
                key={n.id}
                {...wrapperProps}
                className={cn(
                  'group relative card-glass p-4 flex items-start gap-3 transition-all duration-200 ease-silk',
                  href && 'hover:border-edge-strong hover:-translate-y-0.5 cursor-pointer',
                  !n.read_at && 'border-l-2 border-l-brand-red-500'
                )}
                onClick={() => {
                  if (!n.read_at) markAsRead(n.id);
                }}
              >
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
                    {n.title}
                  </p>
                  <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{n.body}</p>
                  <p className="text-[10px] text-text-muted mt-1.5 font-bold uppercase tracking-wider">
                    {timeAgo(n.created_at, locale)}
                  </p>
                </div>
              </Wrapper>
            );
          })}
        </div>
      )}
    </div>
  );
}
