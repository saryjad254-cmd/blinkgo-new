'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { motion } from 'framer-motion';
import { CreditCard, ArrowDownToLine, ArrowUpFromLine, Receipt, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { Locale } from '@/lib/i18n/server-translations';
import { formatCurrency } from '@/lib/i18n/format';

interface PaymentHistoryClientProps {
  payments: any[];
  refunds: any[];
  locale?: Locale;
}

export function PaymentHistoryClient({ payments, refunds, locale }: PaymentHistoryClientProps) {
  const t = useT();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2">
        <Receipt className="h-6 w-6 text-ink-2" />
        <h1 className="text-2xl font-black text-ink-1 dark:text-zinc-100">
          {t.payment.history}
        </h1>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <CreditCard className="mx-auto h-12 w-12 text-zinc-300" />
          <h3 className="mt-3 font-bold text-zinc-500">{t.payment.noHistory}</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    p.status === 'completed' || p.status === 'succeeded'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : p.status === 'failed' || p.status === 'cancelled'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                      : 'bg-brand-yellow-100 text-brand-yellow-700 dark:bg-brand-yellow-900/40 dark:text-brand-yellow-300'
                  }`}>
                    {p.status === 'completed' || p.status === 'succeeded' ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : p.status === 'failed' ? (
                      <XCircle className="h-5 w-5" />
                    ) : (
                      <Clock className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-ink-1 dark:text-zinc-100">
                      {p.amount ? `${formatCurrency(Number(p.amount), locale)}` : '—'}
                    </div>
                    <div className="text-xs text-zinc-500">
                      #{p.orders?.order_number?.slice(0, 8) ?? '—'} · {new Date(p.created_at).toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en' : 'de')}
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-sm font-semibold capitalize text-zinc-700 dark:text-zinc-300">
                    {p.method ?? p.payment_method ?? 'card'}
                  </div>
                  <div className="text-xs text-zinc-500">{p.status}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Refunds */}
      {refunds.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink-1 dark:text-zinc-100">
            <ArrowDownToLine className="h-5 w-5 text-emerald-500" />
            {t.payment.refund}
          </h2>
          <div className="space-y-2">
            {refunds.map((r) => (
              <div key={r.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(Number(r.amount), locale)}
                  </span>
                  <span className="text-xs text-emerald-600">{r.status}</span>
                </div>
                <div className="text-xs text-zinc-500">
                  #{r.orders?.order_number?.slice(0, 8) ?? '—'} · {new Date(r.created_at).toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-US' : 'de-DE')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
