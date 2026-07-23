'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Clock, ChevronRight, Bell, BellRing, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { useT } from '@/lib/i18n/I18nProvider';
import { createBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

export interface AvailableOrder {
  id: string;
  order_number: string;
  total: number;
  created_at: string;
  status: string;
  customer_id: string;
  customer_name?: string;
  delivery_address?: any;
  item_count?: number;
  item_summary?: string;
  /** ms since order was placed */
  age_ms?: number;
}

interface Props {
  order: AvailableOrder;
  /** When true, this is a freshly-arrived order (e.g. < 1 min old) — animate */
  isFresh?: boolean;
  /** When true, this is the top-of-list hero card */
  isHero?: boolean;
  /** Locale for time formatting */
  locale?: 'de' | 'ar' | 'en';
  /** Whether to enable new-order sound notification (preference) */
  soundEnabled?: boolean;
  /** Index in list (0 = top) */
  index?: number;
}

/**
 * AcceptOrderCard
 * ───────────────
 * Hero CTA card for accepting an incoming order.
 *
 * - **Large** (16+ px text, 16+ px padding, 16+ px rounded)
 * - **Prominent** (brand-gradient bg + ring + glow)
 * - **Animated** (pulse dot for fresh orders, slide-in for new arrivals)
 * - **Always-CTA** (the Accept button is the only primary action, never
 *   hidden by other UI)
 * - **One-tap** (single click = 250ms animated confirmation)
 * - **Modern icon** (Sparkles + Check + Chevron)
 * - **Touch feedback** (active:scale-[0.97] + haptic via state)
 */
export function AcceptOrderCard({
  order,
  isFresh,
  isHero = true,
  locale = 'de',
  soundEnabled: initialSound,
  index = 0,
}: Props) {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);
  const [justDeclined, setJustDeclined] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(initialSound ?? true);

  // Localized labels
  const labels = {
    title: locale === 'ar' ? 'طلب جديد' : locale === 'en' ? 'New order' : 'Neue Bestellung',
    subtitle:
      locale === 'ar'
        ? 'قبول الطلب خلال 60 ثانية للحصول على أفضل تقييم'
        : locale === 'en'
        ? 'Accept within 60 seconds for the best rating'
        : 'Innerhalb 60 Sek. annehmen für beste Bewertung',
    freshBadge: locale === 'ar' ? 'جديد' : locale === 'en' ? 'NEW' : 'NEU',
    accept: locale === 'ar' ? 'قبول الطلب' : locale === 'en' ? 'Accept order' : 'Bestellung annehmen',
    acceptSubtitle:
      locale === 'ar'
        ? 'ابدأ التحضير فوراً'
        : locale === 'en'
        ? 'Start preparing right away'
        : 'Sofort mit der Zubereitung beginnen',
    decline: locale === 'ar' ? 'رفض' : locale === 'en' ? 'Decline' : 'Ablehnen',
    declineSubtitle:
      locale === 'ar'
        ? 'إبلاغ الزبون'
        : locale === 'en'
        ? 'Notify customer'
        : 'Kunden benachrichtigen',
    orderLabel: locale === 'ar' ? 'الطلب' : locale === 'en' ? 'Order' : 'Bestellung',
    items: locale === 'ar' ? 'العناصر' : locale === 'en' ? 'items' : 'Artikel',
    total: locale === 'ar' ? 'الإجمالي' : locale === 'en' ? 'Total' : 'Gesamt',
    justNow: locale === 'ar' ? 'الآن' : locale === 'en' ? 'Just now' : 'Gerade eben',
    minutesAgo: (n: number) =>
      locale === 'ar'
        ? `قبل ${n} ${n === 1 ? 'دقيقة' : 'دقائق'}`
        : locale === 'en'
        ? `${n} min ago`
        : `vor ${n} Min.`,
    soundOn: locale === 'ar' ? 'تشغيل الصوت' : locale === 'en' ? 'Sound on' : 'Sound an',
    soundOff: locale === 'ar' ? 'إيقاف الصوت' : locale === 'en' ? 'Sound off' : 'Sound aus',
    acceptedToast:
      locale === 'ar' ? 'تم القبول! جاري التوجيه...' : locale === 'en' ? 'Accepted! Redirecting...' : 'Angenommen! Weiterleitung...',
    declinedToast:
      locale === 'ar' ? 'تم الرفض' : locale === 'en' ? 'Declined' : 'Abgelehnt',
  };

  // Calculate age
  const ageMs = order.age_ms ?? (Date.now() - new Date(order.created_at).getTime());
  const ageMin = Math.max(0, Math.floor(ageMs / 60000));
  const ageText =
    ageMin < 1
      ? labels.justNow
      : ageMin < 60
      ? labels.minutesAgo(ageMin)
      : `${Math.floor(ageMin / 60)}h`;

  // Handlers
  const handleAccept = useCallback(async () => {
    if (loading) return;
    setLoading('accept');
    setError(null);
    setJustAccepted(true);

    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'confirmed',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // 600ms success state → navigate
      setTimeout(() => router.push(`/restaurant/orders/${order.id}`), 700);
    } catch (e: any) {
      setJustAccepted(false);
      setError(e.message ?? 'Failed to accept');
      setLoading(null);
    }
  }, [loading, order.id, router]);

  const handleDecline = useCallback(async () => {
    if (loading) return;
    setLoading('decline');
    setError(null);
    setJustDeclined(true);

    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      setTimeout(() => {
        // Refresh list
        router.refresh();
      }, 700);
    } catch (e: any) {
      setJustDeclined(false);
      setError(e.message ?? 'Failed to decline');
      setLoading(null);
    }
  }, [loading, order.id, router]);

  // Pulse animation state for fresh orders
  const showFreshBadge = isFresh || ageMin < 1;

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-3xl border-2',
        'transition-all duration-300 ease-silk',
        // Fresh = brand-500 border + pulse ring
        showFreshBadge && 'border-brand-red-500/60 shadow-glow animate-[pulse_2s_ease-in-out_infinite]',
        !showFreshBadge && 'border-edge hover:border-edge-strong',
        // Hero vs list item
        isHero ? 'p-5 sm:p-6' : 'p-4',
        // Accepted/Declined state
        justAccepted && 'ring-2 ring-emerald-500/60 bg-emerald-500/5',
        justDeclined && 'opacity-60 scale-[0.98]',
      )}
      dir="ltr" // card itself is LTR for data
    >
      {/* Animated shine on hover */}
      <div
        className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-silk bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
        aria-hidden
      />

      {/* Background radial */}
      <div
        className="pointer-events-none absolute -top-20 -end-20 w-64 h-64 rounded-full bg-brand-red-500/20 blur-3xl opacity-60"
        aria-hidden
      />

      {/* Top row: order # + new badge + sound toggle */}
      <div className="relative flex items-center gap-3 mb-3">
        {/* Live pulse dot for new orders */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center',
              'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active shadow-glow',
              showFreshBadge && 'animate-[pulse_2s_ease-in-out_infinite]',
            )}
          >
            <BellRing className="w-5 h-5 text-white" />
          </div>
          {showFreshBadge && (
            <span
              className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-bg animate-pulse"
              aria-hidden
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-red-500">
              {labels.title}
            </span>
            {showFreshBadge && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-red-500 text-white text-[9px] font-extrabold uppercase tracking-wider">
                {labels.freshBadge}
              </span>
            )}
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
            #{order.order_number}
          </h3>
          <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {ageText} · {order.item_count ?? '—'} {labels.items}
          </p>
        </div>

        {/* Sound toggle */}
        {soundEnabled !== undefined && (
          <button
            type="button"
            onClick={() => setSoundEnabled((s) => !s)}
            className={cn(
              'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
              'bg-surface border border-edge text-text-muted',
              'hover:border-brand-red-500/60 hover:text-white',
              'active:scale-95 transition-all',
            )}
            aria-label={soundEnabled ? labels.soundOff : labels.soundOn}
            title={soundEnabled ? labels.soundOff : labels.soundOn}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Order summary */}
      {order.item_summary && (
        <p className="relative text-sm text-text-secondary mb-3 leading-relaxed line-clamp-2" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          {order.item_summary}
        </p>
      )}

      {/* Price + customer */}
      <div className="relative flex items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">
            {labels.total}
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">
            {order.total.toFixed(2)} <span className="text-base text-text-muted">€</span>
          </p>
        </div>
        {order.customer_name && (
          <div className="text-end">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">
              {locale === 'ar' ? 'الزبون' : locale === 'en' ? 'Customer' : 'Kunde'}
            </p>
            <p className="text-sm font-extrabold text-text truncate max-w-[160px]">
              {order.customer_name}
            </p>
          </div>
        )}
      </div>

      {/* CTA: Accept + Decline (only shown when not already actioned) */}
      {!justAccepted && !justDeclined && (
        <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5">
          {/* Accept — primary, large, animated */}
          <button
            type="button"
            onClick={handleAccept}
            disabled={loading !== null}
            aria-busy={loading === 'accept'}
            className={cn(
              'group/accept relative overflow-hidden',
              'h-16 sm:h-18 px-5 rounded-2xl',
              'bg-tip-gradient text-white',
              'shadow-glow-success hover:shadow-[0_12px_36px_-4px_rgba(16,185,129,0.7)]',
              'flex items-center justify-center gap-3',
              'font-extrabold text-base sm:text-lg',
              'active:scale-[0.97] hover:-translate-y-0.5',
              'transition-all duration-200 ease-silk',
              'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0',
            )}
          >
            <div className="flex items-center gap-3">
              {loading === 'accept' ? (
                <Sparkles className="w-5 h-5 animate-spin" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center group-hover/accept:scale-110 transition-transform">
                  <Check className="w-4 h-4 text-white" strokeWidth={3.5} />
                </div>
              )}
              <div className="flex flex-col items-start leading-tight">
                <span>{labels.accept}</span>
                <span className="text-[10px] font-medium opacity-80 hidden sm:inline">
                  {labels.acceptSubtitle}
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 rtl:rotate-180 group-hover/accept:translate-x-0.5 rtl:group-hover/accept:-translate-x-0.5 transition-transform" />
          </button>

          {/* Decline — secondary, smaller, red gradient */}
          <button
            type="button"
            onClick={handleDecline}
            disabled={loading !== null}
            aria-busy={loading === 'decline'}
            className={cn(
              'h-16 sm:h-18 sm:w-18 px-4 rounded-2xl',
              'bg-danger/15 text-danger border border-danger/30',
              'hover:bg-danger/25 hover:border-danger/50',
              'flex items-center justify-center gap-2',
              'font-bold text-sm',
              'active:scale-[0.97]',
              'transition-all duration-200 ease-silk',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
            aria-label={labels.decline}
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">{labels.decline}</span>
          </button>
        </div>
      )}

      {/* Success state — Accept */}
      {justAccepted && (
        <div className="relative h-16 rounded-2xl bg-tip-gradient text-white flex items-center justify-center gap-3 shadow-glow-success animate-[fadeIn_200ms_ease-out]">
          <Check className="w-6 h-6" strokeWidth={3.5} />
          <span className="font-extrabold text-base">{labels.acceptedToast}</span>
        </div>
      )}

      {/* Declined state */}
      {justDeclined && (
        <div className="relative h-16 rounded-2xl bg-danger/15 text-danger border border-danger/30 flex items-center justify-center gap-3 animate-[fadeIn_200ms_ease-out]">
          <X className="w-5 h-5" />
          <span className="font-bold text-sm">{labels.declinedToast}</span>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-danger font-medium">{error}</p>
      )}
    </article>
  );
}

/**
 * AcceptOrderList — renders an array of available orders,
 * with the top one as a hero card and the rest as compact cards.
 */
interface ListProps {
  orders: AvailableOrder[];
  locale?: 'de' | 'ar' | 'en';
  onEmpty?: () => React.ReactNode;
}

export function AcceptOrderList({ orders, locale = 'de', onEmpty }: ListProps) {
  if (orders.length === 0) {
    return onEmpty ? <>{onEmpty()}</> : null;
  }

  return (
    <div className="space-y-3">
      {orders.map((order, idx) => (
        <AcceptOrderCard
          key={order.id}
          order={order}
          isHero={idx === 0}
          isFresh={idx < 2 && (order.age_ms ?? 0) < 120000}
          index={idx}
          locale={locale}
        />
      ))}
    </div>
  );
}
