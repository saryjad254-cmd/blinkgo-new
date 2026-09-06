'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PageHeader,
  PortalCard,
  EmptyState,
} from '@/components/portal/PortalPrimitives';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Package from 'lucide-react/dist/esm/icons/package';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import Clock from 'lucide-react/dist/esm/icons/clock';
import { computeEarnings } from '@/lib/services/driver-earnings';
import { formatAddress } from '@/lib/format-address';
import { useToast } from '@/components/ui/Toast';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';

const COPY = {
  de: { title: 'Verfügbare Bestellungen', oneNearby: 'Bestellung in der Nähe', manyNearby: 'Bestellungen in der Nähe', refresh: 'Aktualisieren', activeTitle: 'Aktive Tour zuerst abschließen', activeBody: 'ist noch aktiv. Danach kannst du eine neue Tour annehmen.', openActive: 'Aktive Tour öffnen', empty: 'Keine verfügbaren Bestellungen', emptyBody: 'Neue Bestellungen erscheinen hier automatisch. Versuche es in wenigen Minuten erneut.', restaurant: 'Restaurant', navigation: 'In Navigation öffnen', earnings: 'Verdienst', ago: 'vor', minute: 'Min', tip: 'Trinkgeld', accept: 'Annehmen', unavailable: 'Bestellung nicht mehr verfügbar', network: 'Netzwerkfehler', offlineTitle: 'Du bist offline', offlineBody: 'Gehe auf der Fahrerkarte online, bevor du eine Bestellung annimmst.', goOnline: 'Zur Fahrerkarte', pickup: 'Abholung', route: 'Strecke', eta: 'Zeit', hourly: 'Pro Stunde', deliveryAreaHidden: 'Lieferadresse nach Annahme sichtbar' },
  ar: { title: 'الطلبات المتاحة', oneNearby: 'طلب قريب', manyNearby: 'طلبات قريبة', refresh: 'تحديث', activeTitle: 'أكمل التوصيلة النشطة أولاً', activeBody: 'ما زال نشطاً. بعد إكماله يمكنك قبول طلب جديد.', openActive: 'فتح التوصيلة النشطة', empty: 'لا توجد طلبات متاحة', emptyBody: 'ستظهر الطلبات الجديدة هنا تلقائياً. حاول مجدداً بعد قليل.', restaurant: 'المطعم', navigation: 'فتح في الملاحة', earnings: 'الأرباح', ago: 'منذ', minute: 'د', tip: 'بقشيش', accept: 'قبول الطلب', unavailable: 'لم يعد الطلب متاحاً', network: 'خطأ في الاتصال', offlineTitle: 'أنت غير متصل', offlineBody: 'فعّل حالة الاتصال من خريطة السائق قبل قبول أي طلب.', goOnline: 'الانتقال إلى خريطة السائق', pickup: 'إلى المطعم', route: 'المسار', eta: 'الوقت', hourly: 'بالساعة', deliveryAreaHidden: 'يظهر عنوان التسليم بعد قبول الطلب' },
  en: { title: 'Available orders', oneNearby: 'nearby order', manyNearby: 'nearby orders', refresh: 'Refresh', activeTitle: 'Complete your active delivery first', activeBody: 'is still active. You can accept a new order after completing it.', openActive: 'Open active delivery', empty: 'No available orders', emptyBody: 'New orders will appear here automatically. Try again in a few minutes.', restaurant: 'Restaurant', navigation: 'Open in navigation', earnings: 'Earnings', ago: 'ago', minute: 'min', tip: 'tip', accept: 'Accept order', unavailable: 'Order is no longer available', network: 'Network error', offlineTitle: 'You are offline', offlineBody: 'Go online from the driver map before accepting an order.', goOnline: 'Open driver map', pickup: 'Pickup', route: 'Route', eta: 'ETA', hourly: 'Per hour', deliveryAreaHidden: 'Delivery address appears after acceptance' },
} satisfies Record<Locale, Record<string, string>>;

function formatEUR(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

interface AvailableOrder {
  id: string;
  order_number?: string | null;
  delivery_fee?: number | string | null;
  tip?: number | string | null;
  created_at: string;
  delivery_area?: string | null;
  customer_latitude?: number | string | null;
  customer_longitude?: number | string | null;
  restaurant_latitude?: number | string | null;
  restaurant_longitude?: number | string | null;
  restaurants?: { name?: string | null; address?: unknown; latitude?: number | string | null; longitude?: number | string | null } | { name?: string | null; address?: unknown; latitude?: number | string | null; longitude?: number | string | null }[] | null;
  driver_offer?: {
    pickupDistanceKm: number | null;
    routeDistanceKm: number | null;
    etaMinutes: number | null;
    earningsPerHour: number | null;
  } | null;
}

export function AvailableOrdersClient({ initialOrders, activeOrder, isOnline }: { initialOrders: AvailableOrder[]; activeOrder?: { id: string; order_number?: string | null; status?: string } | null; isOnline: boolean; userName: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { error: toastError } = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [referenceTime] = useState(() => Date.now());

  const refresh = useCallback(() => {
    startRefresh(async () => {
      router.refresh();
    });
  }, [router]);

  const accept = useCallback(async (orderId: string) => {
    setBusy(orderId);
    try {
      const r = await fetch(`/api/driver/orders/${orderId}/accept`, { method: 'POST' });
      if (r.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        toastError(j.error?.message || copy.unavailable);
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      }
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.network);
    } finally {
      setBusy(null);
    }
  }, [copy.network, copy.unavailable, router, toastError]);

  return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <PageHeader
          title={copy.title}
          description={`${orders.length} ${orders.length === 1 ? copy.oneNearby : copy.manyNearby}`}
          actions={
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg border border-border text-sm font-semibold hover:border-brand-red disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {copy.refresh}
            </button>
          }
        />

        {activeOrder && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-brand-yellow-500/30 bg-brand-yellow-500/10 p-4 sm:flex-row sm:items-center" role="status">
            <AlertCircle className="h-5 w-5 shrink-0 text-brand-yellow-500" />
            <div className="flex-1">
              <p className="font-extrabold text-text">{copy.activeTitle}</p>
              <p className="text-xs text-text-secondary">#{activeOrder.order_number || activeOrder.id.slice(0, 8)} {copy.activeBody}</p>
            </div>
            <Link href={`/driver/orders/${activeOrder.id}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-yellow-500 px-4 text-sm font-extrabold text-black">{copy.openActive}</Link>
          </div>
        )}

        {!isOnline && !activeOrder && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-status-warning/35 bg-status-warning/10 p-4 sm:flex-row sm:items-center" role="status">
            <AlertCircle className="h-5 w-5 shrink-0 text-status-warning" />
            <div className="flex-1">
              <p className="font-extrabold text-text">{copy.offlineTitle}</p>
              <p className="text-xs text-text-secondary">{copy.offlineBody}</p>
            </div>
            <Link href="/driver/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-status-warning px-4 text-sm font-extrabold text-black">{copy.goOnline}</Link>
          </div>
        )}

        {orders.length === 0 ? (
          <PortalCard>
            <EmptyState
              icon={<Package className="w-8 h-8" />}
              title={copy.empty}
              description={copy.emptyBody}
            />
          </PortalCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {orders.map((o) => {
              const earning = computeEarnings(o).total;
              const ageMs = referenceTime - new Date(o.created_at).getTime();
              const ageMin = Math.floor(ageMs / 60000);
              const restaurant = Array.isArray(o.restaurants) ? o.restaurants[0] : o.restaurants;
              return (
                <PortalCard key={o.id} padding="md" className="border-l-4 border-l-brand-red">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs text-text-muted font-mono">#{o.order_number || o.id.slice(0, 6)}</p>
                      <p className="font-bold">{restaurant?.name || copy.restaurant}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-extrabold text-status-success">{formatEUR(earning, locale)}</p>
                      <p className="text-[10px] text-text-muted">{copy.earnings}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-text-muted mb-3">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-status-success" />
                      <span className="line-clamp-1">{formatAddress(restaurant?.address, restaurant?.name || copy.navigation)}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-brand-red" />
                      <span className="line-clamp-1">{o.delivery_area || copy.deliveryAreaHidden}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {copy.ago} {ageMin} {copy.minute}
                      </span>
                      {Number(o.tip || 0) > 0 && (
                        <span className="text-status-success font-semibold">
                          + {formatEUR(Number(o.tip), locale)} {copy.tip}
                        </span>
                      )}
                    </div>
                  </div>

                  {o.driver_offer && (
                    <dl className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-bg p-2.5 text-center sm:grid-cols-4">
                      <OfferMetric label={copy.pickup} value={o.driver_offer.pickupDistanceKm == null ? '—' : `${o.driver_offer.pickupDistanceKm.toFixed(1)} km`} />
                      <OfferMetric label={copy.route} value={o.driver_offer.routeDistanceKm == null ? '—' : `${o.driver_offer.routeDistanceKm.toFixed(1)} km`} />
                      <OfferMetric label={copy.eta} value={o.driver_offer.etaMinutes == null ? '—' : `${o.driver_offer.etaMinutes} ${copy.minute}`} />
                      <OfferMetric label={copy.hourly} value={o.driver_offer.earningsPerHour == null ? '—' : `${formatEUR(o.driver_offer.earningsPerHour, locale)}/h`} />
                    </dl>
                  )}

                  <button
                    type="button"
                    onClick={() => accept(o.id)}
                    disabled={busy === o.id || Boolean(activeOrder) || !isOnline}
                    className="w-full min-h-11 px-3 py-2 rounded-lg bg-brand-red text-white font-bold text-sm hover:bg-brand-red/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === o.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : copy.accept}
                  </button>
                </PortalCard>
              );
            })}
          </div>
        )}
      </div>
  );
}

function OfferMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-xs font-extrabold text-text" dir="ltr">{value}</dd>
    </div>
  );
}
