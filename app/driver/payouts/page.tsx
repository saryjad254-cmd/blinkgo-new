'use client';

import { useState, useEffect } from 'react';
import { Wallet, CheckCircle2, Clock, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatEUR } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  base_payout: number;
  tips_total: number;
  bonuses_total: number;
  gross_payout: number;
  net_payout: number;
  delivery_count: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  paid_at: string | null;
  payment_reference?: string;
  created_at: string;
}

const STATUS_CONFIG = {
  pending:    { color: 'bg-warning/15 text-warning border-warning/30',  de: 'Ausstehend',   ar: 'معلقة',     en: 'Pending' },
  processing: { color: 'bg-info/15 text-info border-info/30',          de: 'In Bearbeitung', ar: 'قيد المعالجة', en: 'Processing' },
  paid:       { color: 'bg-success/15 text-success border-success/30',  de: 'Bezahlt',      ar: 'مدفوعة',    en: 'Paid' },
  failed:     { color: 'bg-danger/15 text-danger border-danger/30',      de: 'Fehlgeschlagen', ar: 'فشلت',     en: 'Failed' },
  cancelled:  { color: 'bg-surface-light text-text-muted border-edge',   de: 'Storniert',    ar: 'ملغاة',     en: 'Cancelled' },
};

const COPY = {
  de: { title: 'Auszahlungen', total: 'Gesamt', pending: 'Ausstehend', paid: 'Bezahlt', deliveries: 'Lieferungen', period: 'Zeitraum', reference: 'Referenz' },
  ar: { title: 'المدفوعات', total: 'الإجمالي', pending: 'معلقة', paid: 'مدفوعة', deliveries: 'التوصيلات', period: 'الفترة', reference: 'المرجع' },
  en: { title: 'Payouts', total: 'Total', pending: 'Pending', paid: 'Paid', deliveries: 'Deliveries', period: 'Period', reference: 'Reference' },
};

export default function DriverPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');

  useEffect(() => {
    const cookieLocale = document.cookie
      .split('; ')
      .find((c) => c.startsWith('blinkgo-locale='))
      ?.split('=')[1] as 'de' | 'ar' | 'en' | undefined;
    if (cookieLocale) setLocale(cookieLocale);
    load();
  }, []);

  const load = async () => {
    try {
      const res = await fetch('/api/driver/payouts');
      const json = await res.json();
      if (json.ok) setPayouts(json.data.payouts ?? []);
    } catch {}
    setLoading(false);
  };

  const copy = COPY[locale];

  const total = payouts.reduce((sum, p) => sum + Number(p.net_payout ?? 0), 0);
  const pending = payouts.filter((p) => p.status === 'pending' || p.status === 'processing');
  const pendingTotal = pending.reduce((sum, p) => sum + Number(p.net_payout ?? 0), 0);
  const paidTotal = payouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.net_payout ?? 0), 0);

  return (
    <>
      <PageHeader title={copy.title} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <Card variant="glass" padding="md">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="w-3.5 h-3.5 text-brand-red-500" />
              <span className="text-2xs text-text-muted font-bold uppercase tracking-wider">{copy.total}</span>
            </div>
            <p className="text-xl font-black text-text tabular-nums">{formatEUR(total)}</p>
          </Card>
          <Card variant="glass" padding="md">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-warning" />
              <span className="text-2xs text-text-muted font-bold uppercase tracking-wider">{copy.pending}</span>
            </div>
            <p className="text-xl font-black text-text tabular-nums">{formatEUR(pendingTotal)}</p>
          </Card>
          <Card variant="glass" padding="md">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              <span className="text-2xs text-text-muted font-bold uppercase tracking-wider">{copy.paid}</span>
            </div>
            <p className="text-xl font-black text-text tabular-nums">{formatEUR(paidTotal)}</p>
          </Card>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-bg-elevated animate-pulse" />
            ))}
          </div>
        ) : payouts.length === 0 ? (
          <EmptyState
            icon="Wallet"
            title="No payouts yet"
            description="Your weekly payouts will appear here after your first week of deliveries"
          />
        ) : (
          payouts.map((p) => {
            const status = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG];
            return (
              <Card key={p.id} variant="glass" padding="md">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        {new Date(p.period_start).toLocaleDateString(locale)}
                        {' – '}
                        {new Date(p.period_end).toLocaleDateString(locale)}
                      </span>
                    </div>
                    <p className="text-2xl font-black text-text tabular-nums">{formatEUR(Number(p.net_payout ?? 0))}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {p.delivery_count} {copy.deliveries}
                    </p>
                  </div>
                  <span className={cn('h-6 px-2.5 inline-flex items-center rounded-full text-2xs font-bold border', status?.color)}>
                    {status?.de}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-edge">
                  <div>
                    <p className="text-2xs text-text-muted">{locale === 'ar' ? 'الأساس' : locale === 'en' ? 'Base' : 'Basis'}</p>
                    <p className="text-xs font-bold text-text tabular-nums">{formatEUR(Number(p.base_payout ?? 0))}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-text-muted">{locale === 'ar' ? 'البقشيش' : locale === 'en' ? 'Tips' : 'Trinkgeld'}</p>
                    <p className="text-xs font-bold text-text tabular-nums">{formatEUR(Number(p.tips_total ?? 0))}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-text-muted">{locale === 'ar' ? 'المكافآت' : locale === 'en' ? 'Bonuses' : 'Boni'}</p>
                    <p className="text-xs font-bold text-text tabular-nums">{formatEUR(Number(p.bonuses_total ?? 0))}</p>
                  </div>
                </div>

                {p.paid_at && p.payment_reference && (
                  <div className="mt-2 pt-2 border-t border-edge text-2xs text-text-muted">
                    {copy.reference}: <span className="font-mono">{p.payment_reference}</span>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
