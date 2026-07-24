'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { Users, CheckCircle2, Clock, TrendingUp, Gift } from 'lucide-react';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { Locale } from '@/lib/i18n/server-translations';
import { formatCurrency } from '@/lib/i18n/format';

interface AdminReferralsClientProps {
  referrals: any[];
  stats: {
    totalReferrals: number;
    completed: number;
    pending: number;
    conversionRate: number;
    totalRewards: number;
  };
  user: AdminUser;
  locale?: Locale;
}

export function AdminReferralsClient({ referrals, stats, user, locale }: AdminReferralsClientProps) {
  const t = useT();
  const isAr = locale === 'ar';

  const statCards = [
    { label: t.admin.activeReferrals, value: stats.totalReferrals, icon: Users, color: 'from-racing-red to-racing-red/70' },
    { label: t.admin.conversionRate, value: `${stats.conversionRate.toFixed(1)}%`, icon: TrendingUp, color: 'from-emerald-500 to-emerald-700' },
    { label: t.referral.completed, value: stats.completed, icon: CheckCircle2, color: 'from-golden-yellow to-brand-yellow-600' },
    { label: t.referral.pending, value: stats.pending, icon: Clock, color: 'from-purple-500 to-purple-700' },
  ];

  return (
    <AdminLayout user={user} locale={locale}>
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-3xl font-black text-ink-1 dark:text-zinc-100">{t.admin.referrals}</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} text-white`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-2 text-xs text-zinc-500">{c.label}</div>
              <div className="text-2xl font-black text-ink-1 dark:text-zinc-100">{c.value}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center gap-2">
          <Gift className="h-5 w-5 text-golden-yellow" />
          <span className="font-semibold text-ink-1 dark:text-zinc-100">
            {t.admin.totalRewards}: {formatCurrency(stats.totalRewards, locale)}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-start dark:border-zinc-800">
            <tr>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Referrer</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Referee</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Code</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Status</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Created</th>
            </tr>
          </thead>
          <tbody>
            {referrals.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-500">{t.referral.noReferrals}</td>
              </tr>
            ) : (
              referrals.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="p-4">{r.users?.name ?? '—'}</td>
                  <td className="p-4 text-zinc-600 dark:text-zinc-400">{r.referee_email}</td>
                  <td className="p-4 font-mono text-racing-red">{r.code}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      r.status === 'rewarded' || r.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : r.status === 'signed_up'
                        ? 'bg-brand-yellow-100 text-brand-yellow-700'
                        : 'bg-zinc-200 text-zinc-600'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-US' : 'de-DE')}</td>
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
