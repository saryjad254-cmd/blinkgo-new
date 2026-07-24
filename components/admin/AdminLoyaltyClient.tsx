'use client';

import { useT } from '@/lib/i18n/I18nProvider';
import { Award, TrendingUp, Coins, Users } from 'lucide-react';
import { AdminLayout, type AdminUser } from './AdminLayout';
import type { Locale } from '@/lib/i18n/server-translations';

interface AdminLoyaltyClientProps {
  balances: any[];
  transactions: any[];
  stats: {
    totalPoints: number;
    totalEarned: number;
    totalRedeemed: number;
    tierBreakdown: { bronze: number; silver: number; gold: number; platinum: number };
  };
  user: AdminUser;
  locale?: Locale;
}

export function AdminLoyaltyClient({ balances, transactions, stats, user, locale }: AdminLoyaltyClientProps) {
  const t = useT();
  const isAr = locale === 'ar';

  const statCards = [
    { label: t.loyalty.balance, value: stats.totalPoints, icon: Coins, color: 'from-golden-yellow to-brand-yellow-600' },
    { label: t.loyalty.earned, value: stats.totalEarned, icon: TrendingUp, color: 'from-emerald-500 to-emerald-700' },
    { label: t.loyalty.redeemed, value: stats.totalRedeemed, icon: Award, color: 'from-racing-red to-racing-red/70' },
    { label: 'Members', value: balances.length, icon: Users, color: 'from-purple-500 to-purple-700' },
  ];

  return (
    <AdminLayout user={user} locale={locale}>
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-3xl font-black text-ink-1 dark:text-zinc-100">{t.admin.loyalty}</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} text-white`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-2 text-xs text-zinc-500">{c.label}</div>
              <div className="text-2xl font-black text-ink-1 dark:text-zinc-100">{c.value.toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-US' : 'de-DE')}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 font-bold text-ink-1 dark:text-zinc-100">{t.loyalty.tier} breakdown</h3>
        <div className="grid grid-cols-4 gap-3">
          {(['bronze', 'silver', 'gold', 'platinum'] as const).map((tier) => (
            <div key={tier} className="rounded-xl bg-zinc-50 p-3 text-center dark:bg-zinc-800/50">
              <div className="text-2xl">{tier === 'bronze' ? '🥉' : tier === 'silver' ? '🥈' : tier === 'gold' ? '🥇' : '💎'}</div>
              <div className="mt-1 text-sm font-bold">{t.loyalty[tier]}</div>
              <div className="text-xs text-zinc-500">{stats.tierBreakdown[tier]} {t.loyalty.points}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="border-b border-zinc-200 p-4 font-bold dark:border-zinc-800">{t.loyalty.history}</h3>
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-start dark:border-zinc-800">
            <tr>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">User</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Amount</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Reason</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">Description</th>
              <th className="p-4 font-semibold text-zinc-600 dark:text-zinc-400">When</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-500">{t.loyalty.noHistory}</td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <td className="p-4">{tx.users?.name ?? '—'}</td>
                  <td className={`p-4 font-bold ${tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </td>
                  <td className="p-4 text-zinc-600 dark:text-zinc-400">{tx.reason}</td>
                  <td className="p-4 text-zinc-500">{tx.description}</td>
                  <td className="p-4 text-xs text-zinc-500">{new Date(tx.created_at).toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-US' : 'de-DE')}</td>
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
