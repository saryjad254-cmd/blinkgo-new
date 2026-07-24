'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Bell, Check, X, Loader2, Inbox, Package, Truck, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { useT, safeT } from '@/lib/i18n/I18nProvider';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'order' | 'driver' | 'restaurant' | 'promo' | 'info' | 'success' | 'warning';
  data: any;
  read_at: string | null;
  created_at: string;
}

interface NotificationsBellProps {
  /** When true, shows full-page list instead of dropdown */
  variant?: 'dropdown' | 'page';
  /** Locale for time formatting */
  locale?: 'de' | 'ar' | 'en';
}

/**
 * NotificationsBell
 * ──────────────────
 * World-class in-app notification center.
 *
 * - Bell icon with unread badge (pulsing dot)
 * - Dropdown with the latest 10 notifications
 * - Mark-as-read on click
 * - "Mark all read" action
 * - Real-time updates via Supabase realtime
 * - Different icons per type (order / driver / promo / info)
 * - Full-page mode for /notifications route
 */
export function NotificationsBell({ variant = 'dropdown', locale: localeProp }: NotificationsBellProps) {
  const t = useT();
  const loc = (localeProp ?? 'de') as 'de' | 'ar' | 'en';

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 3-locale labels
  const labels = {
    title: loc === 'ar' ? 'الإشعارات' : loc === 'en' ? 'Notifications' : 'Benachrichtigungen',
    empty: loc === 'ar' ? 'لا توجد إشعارات' : loc === 'en' ? 'No notifications' : 'Keine Benachrichtigungen',
    emptyDesc:
      loc === 'ar' ? 'سنعلمك عند وصول طلب جديد'
        : loc === 'en' ? 'We will let you know when something happens'
        : 'Wir benachrichtigen dich wenn etwas passiert',
    markAll: loc === 'ar' ? 'تمييز الكل كمقروء' : loc === 'en' ? 'Mark all as read' : 'Alle als gelesen markieren',
    new: loc === 'ar' ? 'جديد' : loc === 'en' ? 'New' : 'Neu',
    justNow: loc === 'ar' ? 'الآن' : loc === 'en' ? 'Just now' : 'Gerade eben',
    minutesAgo: (n: number) =>
      loc === 'ar' ? `قبل ${n} د` : loc === 'en' ? `${n}m ago` : `vor ${n} Min.`,
    hoursAgo: (n: number) =>
      loc === 'ar' ? `قبل ${n} س` : loc === 'en' ? `${n}h ago` : `vor ${n} Std.`,
    daysAgo: (n: number) =>
      loc === 'ar' ? `قبل ${n} يوم` : loc === 'en' ? `${n}d ago` : `vor ${n} Tg.`,
    viewAll: loc === 'ar' ? 'عرض الكل' : loc === 'en' ? 'View all' : 'Alle anzeigen',
    open: loc === 'ar' ? 'فتح' : loc === 'en' ? 'Open' : 'Öffnen',
  };

  // Fetch initial notifications
  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        // Table might not have RLS, just set empty
        setNotifications([]);
        return;
      }
      setNotifications((data ?? []) as Notification[]);
    } catch (e) {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to realtime updates (optional — fallback to polling if it fails)
  useEffect(() => {
    if (!userId) return;
    const supabase = createBrowserClient();
    let channel: any = null;
    try {
      channel = supabase
        .channel(`notifications-changes-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload: any) => {
            setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 20));
          },
        )
        .subscribe();
    } catch (err) {
      // Realtime may not be enabled for this table; ignore silently
      console.warn('Realtime subscription failed, will use polling:', err);
    }

    // Polling fallback every 30s in case realtime is unavailable
    const pollInterval = setInterval(() => {
      fetchNotifications();
    }, 30000);

    return () => {
      clearInterval(pollInterval);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [userId, fetchNotifications]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Mark as read
  const markAsRead = useCallback(
    async (id: string) => {
      try {
        const supabase = createBrowserClient();
        await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', id)
          .is('read_at', null);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
        );
      } catch {
        // ignore
      }
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      const unread = notifications.filter((n) => !n.read_at).map((n) => n.id);
      if (unread.length === 0) return;
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
      );
    } catch {
      // ignore
    }
  }, [notifications]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read_at).length, [notifications]);

  // ── Page variant ──
  if (variant === 'page') {
    return (
      <div className="space-y-4" dir={loc === 'ar' ? 'rtl' : 'ltr'}>
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-brand-red-500" />
            {labels.title}
          </h1>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="h-9 px-3 rounded-xl bg-surface border border-edge text-text-secondary hover:text-white hover:border-brand-red-500/60 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              {labels.markAll}
            </button>
          )}
        </header>

        {loading ? (
          <div className="rounded-2xl bg-surface-elevated border border-edge p-12 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-brand-red-500" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl bg-surface-elevated border border-edge p-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-surface mx-auto flex items-center justify-center text-text-muted">
              <Inbox className="w-8 h-8" />
            </div>
            <p className="text-base font-extrabold text-white">{labels.empty}</p>
            <p className="text-sm text-text-secondary">{labels.emptyDesc}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <NotificationCard
                key={n.id}
                n={n}
                locale={loc}
                labels={labels}
                onClick={() => markAsRead(n.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Dropdown variant ──
  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={labels.title}
        className={cn(
          'relative w-10 h-10 rounded-full flex items-center justify-center',
          'bg-surface-elevated border border-edge text-text-secondary',
          'hover:text-white hover:border-brand-red-500/60',
          'active:scale-95 transition-all',
        )}
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full',
              'bg-brand-red-500 text-white text-[10px] font-extrabold',
              'flex items-center justify-center',
              'ring-2 ring-bg',
              'animate-[pulse_2s_ease-in-out_infinite]',
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute mt-2 w-[calc(100vw-2rem)] max-w-md',
            loc === 'ar' ? 'left-0' : 'right-0',
            'rounded-2xl bg-bg border border-edge shadow-speed-xl',
            'overflow-hidden z-modal',
            'animate-[fadeIn_150ms_ease-out]',
          )}
        >
          {/* Header */}
          <header className="px-4 py-3 border-b border-edge flex items-center justify-between bg-gradient-to-b from-surface-elevated to-bg">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active flex items-center justify-center shadow-glow">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">{labels.title}</h3>
                {unreadCount > 0 && (
                  <p className="text-[10px] text-brand-red-500 font-bold">
                    {unreadCount} {loc === 'ar' ? 'غير مقروءة' : loc === 'en' ? 'unread' : 'ungelesen'}
                  </p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[10px] font-bold text-brand-red-500 hover:text-brand-red-400 transition-colors px-2 py-1 rounded-md hover:bg-surface"
              >
                {labels.markAll}
              </button>
            )}
          </header>

          {/* List */}
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-brand-red-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-surface mx-auto flex items-center justify-center text-text-muted">
                  <Inbox className="w-6 h-6" />
                </div>
                <p className="text-sm font-extrabold text-white">{labels.empty}</p>
                <p className="text-xs text-text-secondary">{labels.emptyDesc}</p>
              </div>
            ) : (
              <ul className="divide-y divide-edge">
                {notifications.slice(0, 8).map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    locale={loc}
                    labels={labels}
                    onClick={() => markAsRead(n.id)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <footer className="px-4 py-2.5 border-t border-edge bg-surface-elevated text-center">
              <a
                href="/notifications"
                className="text-[10px] font-extrabold text-text-secondary hover:text-white uppercase tracking-wider"
              >
                {labels.viewAll} →
              </a>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

interface NotificationItemProps {
  n: Notification;
  locale: 'de' | 'ar' | 'en';
  labels: any;
  onClick: () => void;
  onNavigate: () => void;
}

function NotificationItem({ n, locale, labels, onClick, onNavigate }: NotificationItemProps) {
  const icon = useMemo(() => notificationIcon(n.type), [n.type]);
  const accent = useMemo(() => notificationAccent(n.type), [n.type]);
  const isUnread = !n.read_at;

  const target = useMemo(() => {
    if (n.data?.order_id) return `/orders/${n.data.order_id}`;
    if (n.data?.restaurant_id) return `/restaurant/menu/${n.data.restaurant_id}`;
    return null;
  }, [n.data]);

  const Wrapper: any = target ? 'a' : 'div';
  const wrapperProps: any = target
    ? { href: target, onClick: () => { onClick(); onNavigate(); } }
    : { onClick };

  return (
    <li>
      <Wrapper
        {...wrapperProps}
        className={cn(
          'flex items-start gap-3 p-3 hover:bg-surface-elevated transition-colors cursor-pointer',
          isUnread && 'bg-brand-red-500/[0.04]',
        )}
      >
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0',
            accent,
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-sm font-bold text-text leading-tight', isUnread && 'text-white')}>
              {n.title}
            </p>
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-brand-red-500 flex-shrink-0 mt-1.5 animate-pulse" />
            )}
          </div>
          <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">{n.body}</p>
          <p className="text-[10px] text-text-muted mt-1.5 font-medium uppercase tracking-wider">
            {timeAgo(n.created_at, locale, labels)}
          </p>
        </div>
      </Wrapper>
    </li>
  );
}

function NotificationCard({
  n,
  locale,
  labels,
  onClick,
}: {
  n: Notification;
  locale: 'de' | 'ar' | 'en';
  labels: any;
  onClick: () => void;
}) {
  const icon = notificationIcon(n.type);
  const accent = notificationAccent(n.type);
  const isUnread = !n.read_at;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full rounded-2xl bg-surface-elevated border p-4 text-start',
        'hover:border-edge-strong transition-all',
        isUnread ? 'border-brand-red-500/40 shadow-glow' : 'border-edge',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0',
            accent,
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-extrabold text-white">{n.title}</p>
            {isUnread && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-red-500 text-white text-[9px] font-extrabold uppercase tracking-wider">
                {labels.new}
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">{n.body}</p>
          <p className="text-[10px] text-text-muted mt-2 font-medium uppercase tracking-wider">
            {timeAgo(n.created_at, locale, labels)}
          </p>
        </div>
      </div>
    </button>
  );
}

function notificationIcon(type: string) {
  switch (type) {
    case 'order':
      return <Package className="w-4 h-4" />;
    case 'driver':
      return <Truck className="w-4 h-4" />;
    case 'success':
      return <CheckCircle2 className="w-4 h-4" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4" />;
    case 'promo':
      return <Sparkles className="w-4 h-4" />;
    default:
      return <Bell className="w-4 h-4" />;
  }
}

function notificationAccent(type: string) {
  switch (type) {
    case 'order':
      return 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active';
    case 'driver':
      return 'bg-live-gradient';
    case 'success':
      return 'bg-tip-gradient';
    case 'warning':
      return 'bg-danger';
    case 'promo':
      return 'bg-premium-gradient';
    default:
      return 'bg-info';
  }
}

function timeAgo(iso: string, locale: 'de' | 'ar' | 'en', labels: any): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return labels.justNow;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return labels.minutesAgo(min);
  const h = Math.floor(min / 60);
  if (h < 24) return labels.hoursAgo(h);
  const d = Math.floor(h / 24);
  return labels.daysAgo(d);
}
