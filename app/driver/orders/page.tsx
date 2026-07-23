/**
 * Driver Orders List
 * ───────────────────
 * Top-level page for the driver order workspace.
 *
 * Two primary surfaces:
 *   1. ACTIVE ORDERS — orders assigned to the driver right now
 *   2. AVAILABLE ORDERS — a dedicated BUTTON at the top that opens the
 *      dedicated /driver/orders/available screen (the result is no longer
 *      rendered at the bottom of this page).
 */
import Link from 'next/link';
import { ChevronRight, MapPin, Clock, Inbox, ArrowRight, ListChecks } from 'lucide-react';
import { requireRole } from '@/lib/rbac';
import { createServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyStateClient as EmptyState } from '@/components/shared/EmptyStateClient';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card } from '@/components/ui/Card';
import type { Order } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const T = {
  de: {
    title: 'Bestellungen',
    subtitle: 'Verfügbare und aktive Aufträge',
    activeTitle: 'Deine aktiven Bestellungen',
    availableTitle: 'Verfügbare Bestellungen',
    empty: 'Keine Bestellungen verfügbar',
    emptyDesc: 'Sobald Restaurants Bestellungen vorbereiten, erscheinen sie hier.',
    deliveryTo: 'Lieferung an',
    ready: 'Abholbereit',
    tapDetails: 'Tippen für Details',
    minutesAgo: 'Min',
    availableLabel: 'verfügbar',
    activeLabel: 'aktiv',
    goAvailable: 'Verfügbare Bestellungen ansehen',
    pickAvailable: 'Jetzt verfügbare Bestellungen auswählen',
    activeEmpty: 'Keine aktiven Bestellungen',
    activeEmptyDesc: 'Sobald Sie eine Bestellung annimmst, erscheint sie hier.',
    viewAvailableOrders: 'Verfügbare Bestellungen anzeigen',
    highestPayout: 'Höchster Verdienst',
    closest: 'Nächste',
    all: 'Alle',
  },
  ar: {
    title: 'الطلبات',
    subtitle: 'الطلبات المتاحة والنشطة',
    activeTitle: 'طلباتك النشطة',
    availableTitle: 'الطلبات المتاحة',
    empty: 'لا توجد طلبات متاحة',
    emptyDesc: 'بمجرد أن تجهز المطاعم الطلبات، ستظهر هنا.',
    deliveryTo: 'التوصيل إلى',
    ready: 'جاهز',
    tapDetails: 'اضغط للتفاصيل',
    minutesAgo: 'دقيقة',
    availableLabel: 'متاح',
    activeLabel: 'نشط',
    goAvailable: 'افتح الطلبات المتاحة',
    pickAvailable: 'اختر من الطلبات المتاحة الآن',
    activeEmpty: 'ما عندك طلبات نشطة',
    activeEmptyDesc: 'بمجرد ما تقبل طلب، بيظهر هنا.',
    viewAvailableOrders: 'عرض الطلبات المتاحة',
    highestPayout: 'الأعلى أجراً',
    closest: 'الأقرب',
    all: 'الكل',
  },
  en: {
    title: 'Orders',
    subtitle: 'Available and active orders',
    activeTitle: 'Your active orders',
    availableTitle: 'Available Orders',
    empty: 'No orders available',
    emptyDesc: 'When restaurants prepare orders, they will appear here.',
    deliveryTo: 'Delivery to',
    ready: 'Ready',
    tapDetails: 'Tap for details',
    minutesAgo: 'min',
    availableLabel: 'available',
    activeLabel: 'active',
    goAvailable: 'Open Available Orders',
    pickAvailable: 'Pick from available orders now',
    activeEmpty: 'No active orders',
    activeEmptyDesc: 'Once you accept an order, it will appear here.',
    viewAvailableOrders: 'View available orders',
    highestPayout: 'Highest payout',
    closest: 'Closest',
    all: 'All',
  },
};

async function getAvailableOrdersCount(): Promise<number> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('orders')
    .select(`*`, { count: 'exact', head: true })
    .eq('status', 'ready')
    .is('driver_id', null);
  if (error) return 0;
  return count ?? 0;
}

async function getDriverActiveOrders(): Promise<Order[]> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('orders')
    .select(`*, restaurants(name, address)`)
    .eq('driver_id', user.id)
    .in('status', ['assigned', 'picked_up', 'delivering'])
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as Order[];
}

function detectLocale(): 'de' | 'ar' | 'en' {
  // Read the dedicated locale cookie only — never scan the whole cookie header
  // for substrings (Supabase auth tokens can contain 'ar'/'en' by accident).
  const c = cookies().get('blinkgo-locale')?.value;
  if (c === 'ar') return 'ar';
  if (c === 'en') return 'en';
  return 'de';
}

function getMinutesAgo(dateStr: string, locale: 'de' | 'ar' | 'en'): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diff < 1) return locale === 'ar' ? 'الآن' : locale === 'en' ? 'Just now' : 'Gerade eben';
  return `${diff} ${locale === 'ar' ? 'دقيقة' : locale === 'en' ? 'min' : 'Min'}`;
}

export default async function DriverOrdersPage() {
  await requireRole('driver');
  const [availableCount, active] = await Promise.all([
    getAvailableOrdersCount(),
    getDriverActiveOrders(),
  ]);

  const locale = detectLocale();
  const t = T[locale];
  const Ihnen = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={`${availableCount} ${t.availableLabel} • ${active.length} ${t.activeLabel}`}
      />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6" dir={Ihnen}>
        {/* DEDICATED AVAILABLE ORDERS BUTTON — the primary entry point */}
        <Link
          href="/driver/orders/available"
          aria-label={t.goAvailable}
          className="block group animate-slide-up"
        >
          <Card hover className="overflow-hidden border-2 border-emerald-500/50 hover:border-emerald-500 transition-all bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10">
            <div className="flex items-center gap-4 p-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/30 group-hover:scale-105 transition-transform">
                <Inbox className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0 text-start">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="font-extrabold text-white text-lg">
                    {t.availableTitle}
                  </h2>
                  <span className={cn(
                    'inline-flex items-center gap-1 text-sm font-extrabold px-2.5 py-0.5 rounded-full tabular-nums',
                    availableCount > 0
                      ? 'bg-success text-white animate-pulse'
                      : 'bg-white/10 text-text-muted',
                  )}>
                    {availableCount}
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  {t.pickAvailable}
                </p>
              </div>
              <ArrowRight className={`w-6 h-6 text-emerald-500 flex-shrink-0 group-hover:translate-x-1 transition-transform ${locale === 'ar' ? 'rotate-180 group-hover:-translate-x-1' : ''}`} />
            </div>
          </Card>
        </Link>

        {/* ACTIVE ORDERS SECTION */}
        <section className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-brand-red-500" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">
              {t.activeTitle}
            </h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-red-500/15 text-brand-red-500">
              {active.length}
            </span>
          </div>

          {active.length > 0 ? (
            <div className="space-y-3">
              {active.map((order) => (
                <ActiveOrderCard key={order.id} order={order} locale={locale} t={t} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<ListChecks className="w-8 h-8" />}
                title={t.activeEmpty}
                description={t.activeEmptyDesc}
              />
            </Card>
          )}
        </section>
      </div>
    </>
  );
}

function ActiveOrderCard({ order, locale, t }: { order: Order; locale: 'de' | 'ar' | 'en'; t: any }) {
  const minutesAgo = getMinutesAgo(order.created_at, locale);

  return (
    <Link href={`/driver/orders/${order.id}`}>
      <Card hover className="overflow-hidden border-2 border-brand-red-500/30 hover:border-brand-red-500/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-text-secondary font-mono" dir="ltr">
            #{order.order_number}
          </span>
          <StatusBadge status={order.status} size="sm" pulse />
        </div>
        <h3 className="font-bold text-white text-lg">
          {order.restaurants?.name ?? (locale === 'ar' ? 'مطعم' : locale === 'en' ? 'Restaurant' : 'Restaurant')}
        </h3>
        <p className="text-sm text-text-secondary mt-1 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{order.restaurants?.address}</span>
        </p>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-edge-light">
          <span className="text-xs text-text-secondary">{t.tapDetails}</span>
          <ChevronRight className={`w-4 h-4 text-brand-red-500 ${locale === 'ar' ? 'rotate-180' : ''}`} />
        </div>
      </Card>
    </Link>
  );
}

// Used by helper to satisfy clsx
function cn(...args: any[]): string {
  return args.filter(Boolean).join(' ');
}
