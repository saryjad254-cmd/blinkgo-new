'use client';

import { useCallback, useEffect, useState } from 'react';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Download from 'lucide-react/dist/esm/icons/download';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Store from 'lucide-react/dist/esm/icons/store';
import Truck from 'lucide-react/dist/esm/icons/truck';
import WalletCards from 'lucide-react/dist/esm/icons/wallet-cards';
import Landmark from 'lucide-react/dist/esm/icons/landmark';
import Undo2 from 'lucide-react/dist/esm/icons/undo-2';
import Scale from 'lucide-react/dist/esm/icons/scale';
import { AdminLayout, type AdminUser } from '@/components/admin/AdminLayout';
import { cn } from '@/lib/cn';

type Locale = 'de' | 'ar' | 'en';
type FinanceData = {
  period: { start: string; end: string; timezone: string };
  reconciliation: {
    order_count: number; gross_sales_cents: number; refunds_cents: number; net_collected_cents: number;
    restaurant_payable_cents: number; restaurant_paid_cents: number; restaurant_outstanding_cents: number; driver_payable_cents: number; driver_paid_cents: number;
    driver_outstanding_cents: number; platform_margin_cents: number; mismatch_cents: number;
    exceptions: Array<{ code: string; order_id: string; order_number: string; amount_cents: number }>;
  };
  ledger: { available: boolean; posted_orders: number; expected_orders: number; coverage_percent: number; unbalanced_journals: number; status: 'attention' | 'reconciled' };
  data_quality: { notes: string[] };
  series: Array<{ date: string; revenue_cents: number; orders: number }>;
  top_restaurants: Array<{ id: string; name: string; gross_sales_cents: number; orders: number }>;
  merchant_payouts: Array<{ id: string; restaurant_id: string; net_payout_cents: number; status: string; period_start: string; period_end: string; payment_reference?: string | null; restaurants?: { name?: string } | Array<{ name?: string }> }>;
};

const COPY = {
  de: {
    title: 'Finanzkontrolle', subtitle: 'Operative Geldflüsse und Abstimmung der letzten 30 Tage', refresh: 'Daten aktualisieren', export: 'CSV exportieren',
    gross: 'Bruttobestellwert', refunds: 'Erstattungen', merchant: 'Restaurant-Verbindlichkeiten', driver: 'Fahrer-Verbindlichkeiten', margin: 'Plattform-Restbetrag', mismatch: 'Abweichung',
    reconciled: 'Vollständig abgestimmt', attention: 'Abstimmung erforderlich', coverage: 'Buchungsabdeckung', posted: 'Bestellungen im Journal', unbalanced: 'Unausgeglichene Journale',
    chart: 'Bestellwert pro Tag', top: 'Restaurants nach Bestellwert', orders: 'Bestellungen', exceptions: 'Offene Ausnahmen', none: 'Keine offenen Ausnahmen', loading: 'Finanzdaten werden geladen …', error: 'Finanzdaten konnten nicht geladen werden.',
    settlements: 'Restaurant-Auszahlungen', createSettlement: 'Abrechnung erstellen', markPaid: 'Als bezahlt markieren', reference: 'Bankreferenz', pending: 'Noch keine Abrechnung', actionFailed: 'Aktion fehlgeschlagen', disclaimer: 'Operative Übersicht – keine Steuerrechnung und kein geprüfter Jahresabschluss.',
  },
  ar: {
    title: 'الرقابة المالية', subtitle: 'حركة الأموال التشغيلية والمصالحة لآخر 30 يومًا', refresh: 'تحديث البيانات', export: 'تصدير CSV',
    gross: 'إجمالي قيمة الطلبات', refunds: 'المبالغ المستردة', merchant: 'مستحقات المطاعم', driver: 'مستحقات السائقين', margin: 'رصيد المنصة', mismatch: 'فرق المصالحة',
    reconciled: 'المصالحة مكتملة', attention: 'المصالحة تحتاج متابعة', coverage: 'تغطية دفتر القيود', posted: 'الطلبات المسجلة في الدفتر', unbalanced: 'قيود غير متوازنة',
    chart: 'قيمة الطلبات اليومية', top: 'المطاعم حسب قيمة الطلبات', orders: 'طلبات', exceptions: 'الحالات المفتوحة', none: 'لا توجد حالات مفتوحة', loading: 'جارٍ تحميل البيانات المالية…', error: 'تعذر تحميل البيانات المالية.',
    settlements: 'تسويات المطاعم', createSettlement: 'إنشاء تسوية', markPaid: 'تحديد كمدفوع', reference: 'مرجع التحويل البنكي', pending: 'لا توجد تسويات بعد', actionFailed: 'فشلت العملية', disclaimer: 'ملخص تشغيلي — ليس فاتورة ضريبية ولا حسابات سنوية مدققة.',
  },
  en: {
    title: 'Financial control', subtitle: 'Operational money flows and reconciliation for the last 30 days', refresh: 'Refresh data', export: 'Export CSV',
    gross: 'Gross order value', refunds: 'Refunds', merchant: 'Restaurant payable', driver: 'Driver payable', margin: 'Platform remainder', mismatch: 'Reconciliation difference',
    reconciled: 'Fully reconciled', attention: 'Reconciliation needs attention', coverage: 'Ledger coverage', posted: 'Orders posted to ledger', unbalanced: 'Unbalanced journals',
    chart: 'Daily order value', top: 'Restaurants by order value', orders: 'orders', exceptions: 'Open exceptions', none: 'No open exceptions', loading: 'Loading financial data…', error: 'Financial data could not be loaded.',
    settlements: 'Restaurant settlements', createSettlement: 'Create settlement', markPaid: 'Mark paid', reference: 'Bank reference', pending: 'No settlements yet', actionFailed: 'Action failed', disclaimer: 'Operational overview — not a tax invoice or audited annual accounts.',
  },
} as const;

const money = (value: number, locale: Locale) => new Intl.NumberFormat(locale === 'ar' ? 'ar-DE' : locale === 'de' ? 'de-DE' : 'en-DE', { style: 'currency', currency: 'EUR' }).format(value / 100);

export function AdminFinanceClient({ user, locale = 'de' }: { user: AdminUser; locale?: Locale }) {
  const t = COPY[locale];
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const response = await fetch('/api/admin/finance', { cache: 'no-store' });
      const payload = await response.json();
      // The localized UI owns the public error message. Do not surface a
      // database/provider message returned by this privileged endpoint.
      if (!response.ok || !payload.ok) throw new Error('finance_failed');
      setData(payload);
    } catch { setError(true); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ['metric', 'amount_cents', 'currency'],
      ['gross_order_value', data.reconciliation.gross_sales_cents, 'EUR'],
      ['refunds', data.reconciliation.refunds_cents, 'EUR'],
      ['net_collected', data.reconciliation.net_collected_cents, 'EUR'],
      ['restaurant_payable', data.reconciliation.restaurant_payable_cents, 'EUR'],
      ['restaurant_outstanding', data.reconciliation.restaurant_outstanding_cents, 'EUR'],
      ['driver_payable', data.reconciliation.driver_payable_cents, 'EUR'],
      ['platform_remainder', data.reconciliation.platform_margin_cents, 'EUR'],
      ['mismatch', data.reconciliation.mismatch_cents, 'EUR'],
    ];
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = href; anchor.download = `blinkgo-finance-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(href);
  };

  const createSettlement = async (restaurantId: string) => {
    if (!data) return;
    setActionId(`create:${restaurantId}`);
    try {
      const response = await fetch('/api/admin/merchant-payouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ restaurant_id: restaurantId, period_start: data.period.start.slice(0, 10), period_end: data.period.end.slice(0, 10) }) });
      if (!response.ok) throw new Error('create_failed');
      await load();
    } catch { setError(true); } finally { setActionId(null); }
  };

  const markSettlementPaid = async (payoutId: string) => {
    const paymentReference = references[payoutId]?.trim();
    if (!paymentReference) return;
    setActionId(`paid:${payoutId}`);
    try {
      const response = await fetch(`/api/admin/merchant-payouts?id=${encodeURIComponent(payoutId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'paid', payment_reference: paymentReference }) });
      if (!response.ok) throw new Error('pay_failed');
      await load();
    } catch { setError(true); } finally { setActionId(null); }
  };

  return (
    <AdminLayout user={user} locale={locale}>
      <main className="space-y-5" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl sm:text-3xl font-black text-white">{t.title}</h1><p className="mt-1 text-sm text-text-secondary">{t.subtitle}</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={exportCsv} disabled={!data} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-edge bg-ink-700 px-4 text-sm font-bold text-white disabled:opacity-40"><Download className="size-4" />{t.export}</button>
            <button type="button" onClick={() => void load()} disabled={loading} aria-label={t.refresh} title={t.refresh} className="grid size-11 place-items-center rounded-xl bg-brand-red-600 text-white disabled:opacity-50"><RefreshCw className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')} /></button>
          </div>
        </header>

        {error && <div role="alert" className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm font-bold text-red-200">{t.error}</div>}
        {loading && !data && <div role="status" className="rounded-2xl border border-edge bg-surface-elevated p-8 text-center text-text-secondary">{t.loading}</div>}

        {data && <>
          <section className={cn('rounded-2xl border p-4 sm:p-5', data.ledger.status === 'reconciled' ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-amber-400/50 bg-amber-400/10')}>
            <div className="flex flex-wrap items-center gap-3">
              {data.ledger.status === 'reconciled' ? <CheckCircle2 className="size-6 text-emerald-400" /> : <AlertTriangle className="size-6 text-amber-300" />}
              <div className="flex-1"><h2 className="font-black text-white">{data.ledger.status === 'reconciled' ? t.reconciled : t.attention}</h2><p className="text-xs text-text-secondary">{t.coverage}: {data.ledger.coverage_percent}%</p></div>
              <div className="grid grid-cols-2 gap-5 text-sm"><div><span className="block text-xs text-text-muted">{t.posted}</span><strong className="text-white">{data.ledger.posted_orders}/{data.ledger.expected_orders}</strong></div><div><span className="block text-xs text-text-muted">{t.unbalanced}</span><strong className={data.ledger.unbalanced_journals ? 'text-red-300' : 'text-emerald-300'}>{data.ledger.unbalanced_journals}</strong></div></div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <Metric icon={WalletCards} label={t.gross} value={money(data.reconciliation.gross_sales_cents, locale)} />
            <Metric icon={Undo2} label={t.refunds} value={money(data.reconciliation.refunds_cents, locale)} tone="text-red-300" />
            <Metric icon={Store} label={t.merchant} value={money(data.reconciliation.restaurant_outstanding_cents, locale)} />
            <Metric icon={Truck} label={t.driver} value={money(data.reconciliation.driver_payable_cents, locale)} />
            <Metric icon={Landmark} label={t.margin} value={money(data.reconciliation.platform_margin_cents, locale)} tone="text-brand-yellow-400" />
            <Metric icon={Scale} label={t.mismatch} value={money(data.reconciliation.mismatch_cents, locale)} tone={data.reconciliation.mismatch_cents === 0 ? 'text-emerald-300' : 'text-red-300'} />
          </section>

          <section className="rounded-2xl border border-edge bg-surface-elevated p-5"><h2 className="mb-4 text-sm font-extrabold uppercase tracking-wider text-text-secondary">{t.chart}</h2><RevenueChart series={data.series} locale={locale} /></section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-edge bg-surface-elevated"><h2 className="border-b border-edge px-5 py-4 text-sm font-extrabold uppercase tracking-wider text-text-secondary">{t.top}</h2><div className="divide-y divide-edge">{data.top_restaurants.map((restaurant, index) => <div key={restaurant.id} className="flex items-center gap-3 p-4"><span className="grid size-8 place-items-center rounded-lg bg-brand-red-600 text-xs font-black text-white">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-white">{restaurant.name}</p><p className="text-xs text-text-muted">{restaurant.orders} {t.orders}</p></div><strong className="text-emerald-300">{money(restaurant.gross_sales_cents, locale)}</strong></div>)}</div></section>
            <section className="overflow-hidden rounded-2xl border border-edge bg-surface-elevated"><h2 className="border-b border-edge px-5 py-4 text-sm font-extrabold uppercase tracking-wider text-text-secondary">{t.exceptions}</h2><div className="divide-y divide-edge">{data.reconciliation.exceptions.length === 0 ? <p className="p-8 text-center text-sm text-text-muted">{t.none}</p> : data.reconciliation.exceptions.map((item) => <div key={`${item.code}-${item.order_id}`} className="flex items-center gap-3 p-4"><AlertTriangle className="size-4 shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white">{item.code.replaceAll('_', ' ')}</p><p className="text-xs text-text-muted">#{item.order_number}</p></div><strong className="text-amber-200">{money(item.amount_cents, locale)}</strong></div>)}</div></section>
          </div>
          <section className="overflow-hidden rounded-2xl border border-edge bg-surface-elevated">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4"><h2 className="text-sm font-extrabold uppercase tracking-wider text-text-secondary">{t.settlements}</h2><div className="flex flex-wrap gap-2">{data.top_restaurants.slice(0, 4).map((restaurant) => <button key={restaurant.id} type="button" disabled={actionId !== null} onClick={() => void createSettlement(restaurant.id)} className="min-h-11 rounded-xl border border-edge bg-ink-700 px-3 text-xs font-bold text-white disabled:opacity-40">{actionId === `create:${restaurant.id}` ? '…' : `${t.createSettlement}: ${restaurant.name}`}</button>)}</div></div>
            <div className="divide-y divide-edge">{data.merchant_payouts.length === 0 ? <p className="p-8 text-center text-sm text-text-muted">{t.pending}</p> : data.merchant_payouts.map((payout) => {
              const relation = Array.isArray(payout.restaurants) ? payout.restaurants[0] : payout.restaurants;
              return <div key={payout.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-center"><div><p className="font-bold text-white">{relation?.name ?? payout.restaurant_id}</p><p className="text-xs text-text-muted">{payout.period_start} — {payout.period_end} · {payout.status}</p></div><strong className="text-emerald-300">{money(Number(payout.net_payout_cents), locale)}</strong>{payout.status === 'paid' ? <span className="text-xs font-bold text-emerald-300">{payout.payment_reference}</span> : <div className="flex gap-2"><label className="sr-only" htmlFor={`reference-${payout.id}`}>{t.reference}</label><input id={`reference-${payout.id}`} value={references[payout.id] ?? ''} onChange={(event) => setReferences((current) => ({ ...current, [payout.id]: event.target.value }))} placeholder={t.reference} className="min-h-11 min-w-0 rounded-xl border border-edge bg-ink-900 px-3 text-sm text-white placeholder:text-text-muted" /><button type="button" disabled={!references[payout.id]?.trim() || actionId !== null} onClick={() => void markSettlementPaid(payout.id)} className="min-h-11 whitespace-nowrap rounded-xl bg-brand-red-600 px-3 text-xs font-black text-white disabled:opacity-40">{actionId === `paid:${payout.id}` ? '…' : t.markPaid}</button></div>}</div>;
            })}</div>
          </section>
          <p className="text-center text-xs text-text-muted">{t.disclaimer}</p>
        </>}
      </main>
    </AdminLayout>
  );
}

function Metric({ icon: Icon, label, value, tone = 'text-white' }: { icon: typeof WalletCards; label: string; value: string; tone?: string }) {
  return <article className="rounded-2xl border border-edge bg-surface-elevated p-4"><Icon className="mb-3 size-5 text-brand-red-400" /><strong className={cn('block text-lg font-black tabular-nums', tone)}>{value}</strong><span className="mt-1 block text-[10px] font-extrabold uppercase tracking-wider text-text-muted">{label}</span></article>;
}

function RevenueChart({ series, locale }: { series: FinanceData['series']; locale: Locale }) {
  const max = Math.max(1, ...series.map((item) => item.revenue_cents));
  return <div><div className="flex h-48 items-end gap-1" dir="ltr">{series.map((item) => <div key={item.date} className="group relative flex h-full flex-1 items-end"><div className="w-full rounded-t bg-gradient-to-t from-brand-red-700 to-brand-yellow-500" style={{ height: `${Math.max(1, item.revenue_cents / max * 100)}%` }} title={`${item.date}: ${money(item.revenue_cents, locale)}`} /></div>)}</div><div className="mt-2 flex justify-between text-[10px] text-text-muted" dir="ltr"><span>{series[0]?.date}</span><span>{series.at(-1)?.date}</span></div></div>;
}
