'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { useState } from 'react';
import Check from 'lucide-react/dist/esm/icons/check';
import Clock from 'lucide-react/dist/esm/icons/clock';
import X from 'lucide-react/dist/esm/icons/x';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Banknote from 'lucide-react/dist/esm/icons/banknote';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { Locale } from '@/lib/i18n/server-translations';
import { formatEUR } from '@/lib/format';

interface AdminRefund {
  id: string;
  stripe_refund_id: string | null;
  order_id: string;
  amount: number;
  refunded_amount: number;
  currency: string;
  status: 'requested' | 'validating' | 'submitted' | 'pending' | 'succeeded' | 'failed' | 'canceled' | 'requires_review';
  reason: string;
  failure_reason: string | null;
  requested_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  orders: {
    order_number: string;
    total: number;
    customer_id: string;
    users: { name: string; email: string } | null;
  } | null;
}

export function AdminRefundsClient({
  refunds: initial,
  user,
  locale,
}: {
  refunds: AdminRefund[];
  user: AdminUser;
  locale?: Locale;
}) {
  const t = useT();
  const isAr = locale === 'ar';
  const [refunds] = useState<AdminRefund[]>(initial);
  const [filter, setFilter] = useState<'all' | 'pending' | 'succeeded' | 'failed'>('all');

  const filtered = refunds.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return ['requested', 'validating', 'submitted', 'pending', 'requires_review'].includes(r.status);
    if (filter === 'succeeded') return r.status === 'succeeded';
    if (filter === 'failed') return r.status === 'failed' || r.status === 'canceled';
    return true;
  });

  const statusColor = (s: string): string => {
    if (s === 'succeeded') return 'bg-emerald-100 text-emerald-700';
    if (s === 'failed') return 'bg-red-100 text-red-700';
    if (s === 'canceled') return 'bg-zinc-200 text-zinc-600';
    if (s === 'pending' || s === 'submitted' || s === 'validating' || s === 'requested') return 'bg-brand-yellow-100 text-brand-yellow-700';
    if (s === 'requires_review') return 'bg-amber-100 text-amber-700';
    return 'bg-zinc-200 text-zinc-600';
  };

  const statusIcon = (s: string) => {
    if (s === 'succeeded') return <Check className="mr-1 inline h-3 w-3" />;
    if (s === 'failed' || s === 'canceled') return <X className="mr-1 inline h-3 w-3" />;
    if (s === 'requires_review') return <AlertTriangle className="mr-1 inline h-3 w-3" />;
    return <Clock className="mr-1 inline h-3 w-3" />;
  };

  return (
    <AdminLayout user={user} locale={locale}>
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-ink-1 dark:text-zinc-100">{t.admin.refunds}</h1>
        <div className="flex gap-2 text-xs">
          {(['all', 'pending', 'succeeded', 'failed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 font-semibold ${
                filter === f ? 'bg-racing-red text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left dark:border-zinc-800">
            <tr>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Order</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Customer</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Amount</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Reason</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Status</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Stripe ID</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">
                  <div className="flex flex-col items-center gap-2">
                    <Banknote className="w-8 h-8 text-zinc-400" />
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                      {locale === 'ar' ? 'لا توجد طلبات استرداد' : locale === 'en' ? 'No refund requests' : 'Keine Rückerstattungsanfragen'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="p-4 font-mono text-xs">#{r.orders?.order_number?.slice(0, 8) ?? '—'}</td>
                  <td className="p-4">{r.orders?.users?.name ?? '—'}</td>
                  <td className="p-4 font-bold">
                    {formatEUR(Number(r.amount))}
                    {r.refunded_amount !== r.amount && Number(r.refunded_amount) > 0 && (
                      <div className="text-xs font-normal text-emerald-600">
                        refunded: {formatEUR(Number(r.refunded_amount))}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-zinc-600 dark:text-zinc-400">{r.reason ?? '—'}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusColor(r.status)}`}>
                      {statusIcon(r.status)}
                      {r.status}
                    </span>
                    {r.failure_reason && (
                      <div className="text-xs text-red-600 mt-1">{r.failure_reason}</div>
                    )}
                  </td>
                  <td className="p-4 font-mono text-xs text-zinc-500">
                    {r.stripe_refund_id ? `re_${r.stripe_refund_id.slice(-8)}` : '—'}
                  </td>
                  <td className="p-4 text-xs text-zinc-500">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-zinc-500">
        {locale === 'ar' ? 'لإصدار استرداد جديد، افتح تفاصيل الطلب.' : locale === 'en' ? 'To issue a new refund, open the order details.' : 'Um eine neue Rückerstattung auszustellen, öffnen Sie die Bestelldetails.'}
      </div>
    </div>
    </AdminLayout>
  );
}
