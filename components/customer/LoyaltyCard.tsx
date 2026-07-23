'use client';
import { motion, AnimatePresence } from 'framer-motion';

import { useState, useEffect } from 'react';
import { useT } from '@/lib/i18n/I18nProvider';

import { Award, TrendingUp, Gift, Star, Crown, Sparkles, History } from 'lucide-react';

interface LoyaltyBalance {
  user_id: string;
  balance: number;
  total_earned: number;
  total_redeemed: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

interface Transaction {
  id: string;
  amount: number;
  reason: string;
  description: string | null;
  created_at: string;
}

const TIER_ICONS = {
  bronze: Award,
  silver: Star,
  gold: Crown,
  platinum: Sparkles,
};

const TIER_COLORS = {
  bronze: 'from-brand-yellow-700 to-brand-yellow-900',
  silver: 'from-zinc-400 to-zinc-600',
  gold: 'from-golden-yellow to-brand-yellow-600',
  platinum: 'from-purple-500 to-pink-600',
};

const TIER_THRESHOLDS = { bronze: 0, silver: 500, gold: 2000, platinum: 5000 };
const NEXT_TIER = { bronze: 'silver', silver: 'gold', gold: 'platinum', platinum: 'platinum' } as const;

export function LoyaltyCard() {
  const t = useT();
  const [balance, setBalance] = useState<LoyaltyBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/loyalty')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setBalance(d.data.balance);
          setTransactions(d.data.transactions);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-6 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-4 h-16 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }
  if (!balance) return null;

  const tier = balance.tier;
  const TierIcon = TIER_ICONS[tier];
  const nextTier = NEXT_TIER[tier];
  const nextThreshold = TIER_THRESHOLDS[nextTier];
  const progress = Math.min(100, (balance.total_earned / nextThreshold) * 100);

  return (
    <div className="space-y-4">
      {/* Main card */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${TIER_COLORS[tier]} p-6 text-white shadow-xl`}>
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TierIcon className="h-6 w-6" />
              <span className="text-sm font-bold uppercase tracking-wider">
                {t.loyalty[tier]}
              </span>
            </div>
            <Award className="h-8 w-8 opacity-50" />
          </div>
          <div className="mt-6">
            <div className="text-sm opacity-80">{t.loyalty.balance}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-black">{balance.balance}</span>
              <span className="text-lg font-medium opacity-80">{t.loyalty.points}</span>
            </div>
          </div>
          {tier !== 'platinum' && (
            <div className="mt-6">
              <div className="mb-1 flex justify-between text-xs">
                <span className="opacity-80">{t.loyalty.progressTo} {t.loyalty[nextTier]}</span>
                <span className="font-bold">{balance.total_earned} / {nextThreshold}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <motion.div
                  className="h-full rounded-full bg-white"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* How to earn */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 flex items-center gap-2 font-bold text-ink-1 dark:text-zinc-100">
          <TrendingUp className="h-5 w-5 text-golden-yellow" />
          {t.loyalty.earnMore}
        </h3>
        <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-racing-red" />
            <span><b>1 {t.loyalty.points}</b> {t.loyalty.earnPerOrder}</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-racing-red" />
            <span><b>50 {t.loyalty.points}</b> {t.loyalty.onSignup}</span>
          </li>
          <li className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-racing-red" />
            <span><b>100 {t.loyalty.points}</b> {t.loyalty.onReferral}</span>
          </li>
        </ul>
      </div>

      {/* History */}
      {transactions.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-ink-1 dark:text-zinc-100">
            <History className="h-5 w-5 text-ink-2" />
            {t.loyalty.history}
          </h3>
          <ul className="space-y-2">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      tx.amount > 0
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    }`}
                  >
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink-1 dark:text-zinc-100">
                      {tx.description ?? tx.reason}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-sm font-bold ${
                    tx.amount > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {tx.amount > 0 ? '+' : ''}{tx.amount} {t.loyalty.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
