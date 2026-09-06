'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PageHeader,
  PortalCard,
  StatusPill,
  EmptyState,
} from '@/components/portal/PortalPrimitives';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Package from 'lucide-react/dist/esm/icons/package';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Clock from 'lucide-react/dist/esm/icons/clock';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import { computeEarnings } from '@/lib/services/driver-earnings';
import { cn } from '@/lib/cn';
import { formatAddress } from '@/lib/format-address';
import { useToast } from '@/components/ui/Toast';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';

const COPY = {
  de: {
    tagline: 'Fahrer-Portal', dashboard: 'Dashboard', availableOrders: 'Verfügbare Bestellungen', myOrders: 'Meine Bestellungen',
    earnings: 'Verdienst', history: 'Verlauf', documents: 'Dokumente', settings: 'Einstellungen', active: 'Aktiv', completed: 'Abgeschlossen',
    activeCount: 'aktiv', completedCount: 'abgeschlossen', noActive: 'Keine aktiven Bestellungen', noCompleted: 'Noch keine abgeschlossenen Bestellungen',
    noActiveBody: 'Sobald du eine Bestellung annimmst, erscheint sie hier.', noCompletedBody: 'Abgeschlossene Lieferungen werden hier angezeigt.',
    customer: 'Kunde', restaurant: 'Restaurant', details: 'Details', pickedUp: 'Abgeholt', delivered: 'Zugestellt', cancel: 'Stornieren',
    cancelConfirm: 'Bestellung wirklich stornieren?', actionFailed: 'Aktion fehlgeschlagen', cancelFailed: 'Stornierung fehlgeschlagen', networkError: 'Netzwerkfehler', findOrders: 'Verfügbare Bestellungen ansehen',
  },
  ar: {
    tagline: 'بوابة السائق', dashboard: 'الرئيسية', availableOrders: 'الطلبات المتاحة', myOrders: 'طلباتي',
    earnings: 'الأرباح', history: 'السجل', documents: 'المستندات', settings: 'الإعدادات', active: 'النشطة', completed: 'المكتملة',
    activeCount: 'نشطة', completedCount: 'مكتملة', noActive: 'لا توجد طلبات نشطة', noCompleted: 'لا توجد طلبات مكتملة بعد',
    noActiveBody: 'عند قبول طلب سيظهر هنا مباشرة.', noCompletedBody: 'ستظهر عمليات التوصيل المكتملة هنا.',
    customer: 'الزبون', restaurant: 'المطعم', details: 'التفاصيل', pickedUp: 'تم الاستلام', delivered: 'تم التوصيل', cancel: 'إلغاء',
    cancelConfirm: 'هل تريد إلغاء الطلب بالتأكيد؟', actionFailed: 'تعذر تنفيذ الإجراء', cancelFailed: 'تعذر إلغاء الطلب', networkError: 'خطأ في الاتصال', findOrders: 'عرض الطلبات المتاحة',
  },
  en: {
    tagline: 'Driver Portal', dashboard: 'Dashboard', availableOrders: 'Available orders', myOrders: 'My orders',
    earnings: 'Earnings', history: 'History', documents: 'Documents', settings: 'Settings', active: 'Active', completed: 'Completed',
    activeCount: 'active', completedCount: 'completed', noActive: 'No active orders', noCompleted: 'No completed orders yet',
    noActiveBody: 'An order will appear here as soon as you accept it.', noCompletedBody: 'Completed deliveries will appear here.',
    customer: 'Customer', restaurant: 'Restaurant', details: 'Details', pickedUp: 'Picked up', delivered: 'Delivered', cancel: 'Cancel',
    cancelConfirm: 'Cancel this order?', actionFailed: 'Action failed', cancelFailed: 'Cancellation failed', networkError: 'Network error', findOrders: 'View available orders',
  },
} satisfies Record<Locale, Record<string, string>>;

function formatEUR(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'en' ? 'en-DE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function statusLabel(s: string, locale: Locale): string {
  const map: Record<string, Record<Locale, string>> = {
    pending: { de: 'Neu', ar: 'جديد', en: 'New' },
    confirmed: { de: 'Bestätigt', ar: 'مؤكد', en: 'Confirmed' },
    preparing: { de: 'In Zubereitung', ar: 'قيد التحضير', en: 'Preparing' },
    ready: { de: 'Bereit', ar: 'جاهز', en: 'Ready' },
    picked_up: { de: 'Unterwegs', ar: 'في الطريق', en: 'On the way' },
    delivering: { de: 'In Zustellung', ar: 'جاري التوصيل', en: 'Delivering' },
    delivered: { de: 'Zugestellt', ar: 'تم التوصيل', en: 'Delivered' },
    cancelled: { de: 'Storniert', ar: 'ملغي', en: 'Cancelled' },
  };
  return map[s]?.[locale] || s;
}

interface DriverOrder {
  id: string;
  order_number?: string | null;
  status: string;
  total?: number | string | null;
  tip?: number | string | null;
  delivery_fee?: number | string | null;
  delivery_address?: unknown;
  accepted_at?: string | null;
  created_at: string;
  customer?: { name?: string | null } | { name?: string | null }[] | null;
  restaurants?: { name?: string | null } | { name?: string | null }[] | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export function DriverOrdersClient({ activeOrders, completedOrders }: { activeOrders: DriverOrder[]; completedOrders: DriverOrder[]; userName: string }) {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { error: toastError } = useToast();
  const [active] = useState(activeOrders);
  const [completed] = useState(completedOrders);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [busy, setBusy] = useState<string | null>(null);

  const updateStatus = useCallback(async (orderId: string, action: string) => {
    setBusy(`${action}-${orderId}`);
    try {
      const r = await fetch(`/api/driver/orders/${orderId}/${action}`, { method: 'POST' });
      if (r.ok) {
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        toastError(j.error?.message || copy.actionFailed);
      }
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.networkError);
    } finally {
      setBusy(null);
    }
  }, [copy.actionFailed, copy.networkError, router, toastError]);

  const cancel = useCallback(async (orderId: string) => {
    if (!confirm(copy.cancelConfirm)) return;
    setBusy(`cancel-${orderId}`);
    try {
      const r = await fetch(`/api/driver/orders/${orderId}/cancel`, { method: 'POST' });
      if (r.ok) {
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        toastError(j.error?.message || copy.cancelFailed);
      }
    } catch (error) {
      toastError(error instanceof Error ? error.message : copy.networkError);
    } finally {
      setBusy(null);
    }
  }, [copy.cancelConfirm, copy.cancelFailed, copy.networkError, router, toastError]);

  const display = tab === 'active' ? active : completed;

  return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <PageHeader title={copy.myOrders} description={`${active.length} ${copy.activeCount} · ${completed.length} ${copy.completedCount}`} />

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-bg rounded-xl" role="tablist" aria-label={copy.myOrders}>
          <button
            type="button"
            role="tab"
            id="driver-orders-active-tab"
            aria-selected={tab === 'active'}
            aria-controls="driver-orders-panel"
            onClick={() => setTab('active')}
            className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors',
              tab === 'active' ? 'bg-surface shadow-sm' : 'text-text-muted hover:text-text-primary')}
          >
            {copy.active} ({active.length})
          </button>
          <button
            type="button"
            role="tab"
            id="driver-orders-completed-tab"
            aria-selected={tab === 'completed'}
            aria-controls="driver-orders-panel"
            onClick={() => setTab('completed')}
            className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors',
              tab === 'completed' ? 'bg-surface shadow-sm' : 'text-text-muted hover:text-text-primary')}
          >
            {copy.completed} ({completed.length})
          </button>
        </div>

        {/* List */}
        <div
          id="driver-orders-panel"
          role="tabpanel"
          aria-labelledby={tab === 'active' ? 'driver-orders-active-tab' : 'driver-orders-completed-tab'}
        >
        {display.length === 0 ? (
          <PortalCard>
            <EmptyState
              icon={tab === 'active' ? <Package className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />}
              title={tab === 'active' ? copy.noActive : copy.noCompleted}
              description={tab === 'active' ? copy.noActiveBody : copy.noCompletedBody}
              action={tab === 'active' ? (
                <Link href="/driver/orders/available" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-red px-5 text-sm font-extrabold text-white shadow-glow transition hover:bg-brand-hover">
                  {copy.findOrders}
                </Link>
              ) : undefined}
            />
          </PortalCard>
        ) : (
          <div className="space-y-3">
            {display.map((o) => {
              const earning = computeEarnings(o).total;
              const restaurant = firstRelation(o.restaurants);
              const customer = firstRelation(o.customer);
              return (
                <PortalCard key={o.id} padding="md">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-mono font-bold text-sm">#{o.order_number || o.id.slice(0, 8)}</p>
                        <StatusPill status={o.status} label={statusLabel(o.status, locale)} />
                      </div>
                      <p className="text-sm font-semibold">{restaurant?.name || copy.restaurant}</p>
                      {customer?.name && <p className="text-xs text-text-muted">{copy.customer}: {customer.name}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold text-status-success">{formatEUR(earning, locale)}</p>
                      <p className="text-[10px] text-text-muted">{copy.earnings}</p>
                    </div>
                  </div>

                  {o.delivery_address != null && (
                    <p className="text-xs text-text-muted line-clamp-2 mb-3 flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      {formatAddress(o.delivery_address)}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-xs text-text-muted mb-3">
                    <Clock className="w-3 h-3" />
                    {o.accepted_at ? new Date(o.accepted_at).toLocaleString(locale) : new Date(o.created_at).toLocaleString(locale)}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/driver/orders/${o.id}`}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-bg"
                    >
                      {copy.details}
                    </Link>
                    {o.status === 'ready' && (
                      <button
                        type="button"
                        onClick={() => updateStatus(o.id, 'pickup')}
                        disabled={busy === `pickup-${o.id}`}
                        className="px-3 py-1.5 rounded-lg bg-brand-red text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {busy === `pickup-${o.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : copy.pickedUp}
                      </button>
                    )}
                    {(o.status === 'picked_up' || o.status === 'delivering') && (
                      <button
                        type="button"
                        onClick={() => updateStatus(o.id, 'complete')}
                        disabled={busy === `complete-${o.id}`}
                        className="px-3 py-1.5 rounded-lg bg-status-success text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {busy === `complete-${o.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : copy.delivered}
                      </button>
                    )}
                    {(o.status === 'pending' || o.status === 'confirmed') && (
                      <button
                        type="button"
                        onClick={() => cancel(o.id)}
                        disabled={busy === `cancel-${o.id}`}
                        className="px-3 py-1.5 rounded-lg border border-status-error text-status-error text-xs font-semibold hover:bg-status-error/10 disabled:opacity-50"
                      >
                        {copy.cancel}
                      </button>
                    )}
                  </div>
                </PortalCard>
              );
            })}
          </div>
        )}
        </div>
      </div>
  );
}
