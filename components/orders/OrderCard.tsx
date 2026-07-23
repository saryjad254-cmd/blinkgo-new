'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, RefreshCw, Star, HelpCircle, ChevronRight, Store, Package } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useState } from 'react';

interface OrderCardProps {
  order: {
    id: string;
    order_number: string | null;
    status: string;
    total: number;
    created_at: string;
    restaurant: { id: string; name: string; cover_url?: string | null; cuisine?: string | null } | null;
    item_count: number;
    preview_name: string;
  };
  locale: 'de' | 'ar' | 'en';
}

const COPY = {
  de: {
    reorder: 'Erneut bestellen',
    rate: 'Bewerten',
    help: 'Hilfe',
    items: (n: number) => n === 1 ? '1 Artikel' : `${n} Artikel`,
    from: 'von',
    viewOrder: 'Bestellung ansehen',
    orderId: 'Bestellung',
  },
  ar: {
    reorder: 'إعادة الطلب',
    rate: 'تقييم',
    help: 'مساعدة',
    items: (n: number) => n === 1 ? 'عنصر واحد' : `${n} عناصر`,
    from: 'من',
    viewOrder: 'عرض الطلب',
    orderId: 'طلب',
  },
  en: {
    reorder: 'Reorder',
    rate: 'Rate',
    help: 'Help',
    items: (n: number) => n === 1 ? '1 item' : `${n} items`,
    from: 'from',
    viewOrder: 'View order',
    orderId: 'Order',
  },
};

function formatDate(iso: string, locale: 'de' | 'ar' | 'en'): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const localeMap = { de: 'de-DE', ar: 'ar', en: 'en-US' };
  if (isToday) {
    return locale === 'ar' ? `اليوم، ${d.toLocaleTimeString(localeMap[locale], { hour: '2-digit', minute: '2-digit' })}` :
           locale === 'de' ? `Heute, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` :
           `Today, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (isYesterday) {
    return locale === 'ar' ? `أمس، ${d.toLocaleTimeString(localeMap[locale], { hour: '2-digit', minute: '2-digit' })}` :
           locale === 'de' ? `Gestern, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` :
           `Yesterday, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString(localeMap[locale], { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPrice(total: number, locale: 'de' | 'ar' | 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar' : locale === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
  }).format(total);
}

export function OrderCard({ order, locale }: OrderCardProps) {
  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const [imageError, setImageError] = useState(false);

  const cover = order.restaurant?.cover_url;

  return (
    <article
      dir={dir}
      className="group relative card-glass overflow-hidden transition-all duration-300 ease-silk hover:border-edge-strong hover:shadow-speed-xl hover:-translate-y-0.5"
    >
      {/* Top accent line */}
      <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-brand-red-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-4 sm:p-5">
        <div className="flex gap-3 sm:gap-4">
          {/* Restaurant image */}
          <div className="relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-bg-elevated border border-edge">
            {cover && !imageError ? (
              <Image
                src={cover}
                alt={order.restaurant?.name || 'Restaurant'}
                fill
                sizes="80px"
                className="object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-red-500/20 to-brand-yellow-500/20">
                <Store className="w-7 h-7 text-brand-red-500/60" strokeWidth={1.5} />
              </div>
            )}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-base sm:text-lg font-extrabold text-text truncate">
                {order.restaurant?.name || (locale === 'ar' ? 'مطعم' : locale === 'en' ? 'Restaurant' : 'Restaurant')}
              </h3>
              <span className="text-base sm:text-lg font-black text-text flex-shrink-0">
                {formatPrice(order.total, locale)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
              <Clock className="w-3.5 h-3.5" strokeWidth={2} />
              <span>{formatDate(order.created_at, locale)}</span>
              {order.item_count > 0 && (
                <>
                  <span className="w-1 h-1 rounded-full bg-text-muted/50" />
                  <span className="inline-flex items-center gap-1">
                    <Package className="w-3 h-3" strokeWidth={2} />
                    {t.items(order.item_count)}
                  </span>
                </>
              )}
            </div>

            {order.preview_name && (
              <p className="text-sm text-text-secondary line-clamp-1 mb-2">
                {order.preview_name}
              </p>
            )}

            {/* Status + order id */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={order.status} />
              {order.order_number && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  {t.orderId} #{order.order_number}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="mt-4 pt-4 border-t border-edge flex items-center gap-1.5 sm:gap-2">
          <Link
            href={`/orders/${order.id}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-xs font-bold text-text-secondary hover:text-text transition-all"
          >
            {t.viewOrder}
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" strokeWidth={2.5} />
          </Link>
          {order.restaurant?.id && (
            <button
              type="button"
              onClick={() => {
                // Reorder: navigate to restaurant page
                if (typeof window !== 'undefined') {
                  window.location.href = `/restaurants/${order.restaurant!.id}`;
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-xs font-bold text-text-secondary hover:text-text transition-all"
              title={t.reorder}
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="hidden sm:inline">{t.reorder}</span>
            </button>
          )}
          <Link
            href={`/orders/${order.id}#rate`}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-xs font-bold text-text-secondary hover:text-text transition-all"
            title={t.rate}
          >
            <Star className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">{t.rate}</span>
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-bg-elevated/60 hover:bg-bg-elevated border border-edge hover:border-edge-strong text-xs font-bold text-text-secondary hover:text-text transition-all"
            title={t.help}
          >
            <HelpCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">{t.help}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
