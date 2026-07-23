'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { useState } from 'react';
import { RotateCcw, Check, Clock } from 'lucide-react';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { Locale } from '@/lib/i18n/server-translations';
import { formatCurrency } from '@/lib/i18n/format';

export function AdminRefundsClient({
  refunds: initial,
  user,
  locale,
}: {
  refunds: any[];
  user: AdminUser;
  locale?: Locale;
}) {
  const t = useT();
  const isAr = locale === 'ar';
  const [refunds, setRefunds] = useState(initial);

  const process = async (id: string) => {
    const res = await fetch(`/api/admin/refunds?id=${id}&action=process`, { method: 'POST' });
    if (res.ok) {
      setRefunds((r) => r.map((ref) => ref.id === id ? { ...ref, status: 'completed', processed_at: new Date().toISOString() } : ref));
    }
  };

  return (
    <AdminLayout user={user} locale={locale}>
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-3xl font-black text-ink-1 dark:text-zinc-100">{t.admin.refunds}</h1>

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-start dark:border-zinc-800">
            <tr>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Order</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Customer</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Amount</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Reason</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Status</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Created</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {refunds.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">No refund requests</td>
              </tr>
            ) : (
              refunds.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="p-4 font-mono text-xs">#{r.orders?.order_number?.slice(0, 8)}</td>
                  <td className="p-4">{r.orders?.users?.name ?? '—'}</td>
                  <td className="p-4 font-bold">{formatCurrency(Number(r.amount), locale)}</td>
                  <td className="p-4 text-zinc-600 dark:text-zinc-400">{r.reason}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'pending' ? 'bg-brand-yellow-100 text-brand-yellow-700' :
                      'bg-zinc-200 text-zinc-600'
                    }`}>
                      {r.status === 'pending' && <Clock className="me-1 inline h-3 w-3" />}
                      {r.status === 'completed' && <Check className="me-1 inline h-3 w-3" />}
                      {r.status}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-US' : 'de-DE')}</td>
                  <td className="p-4">
                    {r.status === 'pending' && (
                      <button
                        onClick={() => process(r.id)}
                        className="flex items-center gap-1 rounded-lg bg-racing-red px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Process
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </AdminLayout>
  );
}
