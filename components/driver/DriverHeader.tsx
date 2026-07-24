'use client';

import { useState, useTransition } from 'react';
import {
  User as UserIcon,
  Power,
  PowerOff,
  TrendingUp,
  Truck,
  Clock,
  CheckCircle2,
  Wallet,
  Bell,
  ChevronRight,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { formatEUR } from '@/lib/format';
import { OnlineToggle } from './OnlineToggle';

export interface DriverHeaderProps {
  driverName: string;
  driverPhoto?: string | null;
  isOnline: boolean;
  todayEarnings: number;
  todayDeliveries: number;
  weekEarnings: number;
  rating?: number;
  totalDeliveries: number;
  locale: 'de' | 'ar' | 'en';
  onToggleOnline?: (next: boolean) => Promise<void> | void;
}

const LOCALE_LABELS = {
  de: {
    welcome: (name: string) => `Hallo ${name}`,
    online: 'Online',
    offline: 'Offline',
    goOnline: 'Jetzt online gehen',
    goOffline: 'Offline gehen',
    today: 'Heute',
    week: 'Woche',
    deliveries: 'Lieferungen',
    earnings: 'Verdienst',
    avg: 'Ø Bewertung',
    viewProfile: 'Profil ansehen',
    history: 'Verlauf',
    earnings2: 'Verdienst',
  },
  ar: {
    welcome: (name: string) => `أهلاً ${name}`,
    online: 'متصل',
    offline: 'غير متصل',
    goOnline: 'انتقل إلى متصل',
    goOffline: 'انتقل إلى غير متصل',
    today: 'اليوم',
    week: 'الأسبوع',
    deliveries: 'التوصيلات',
    earnings: 'الأرباح',
    avg: 'متوسط التقييم',
    viewProfile: 'عرض الملف الشخصي',
    history: 'السجل',
    earnings2: 'الأرباح',
  },
  en: {
    welcome: (name: string) => `Hey ${name}`,
    online: 'Online',
    offline: 'Offline',
    goOnline: 'Go online',
    goOffline: 'Go offline',
    today: 'Today',
    week: 'Week',
    deliveries: 'Deliveries',
    earnings: 'Earnings',
    avg: 'Avg rating',
    viewProfile: 'View profile',
    history: 'History',
    earnings2: 'Earnings',
  },
} as const;

export function DriverHeader({
  driverName,
  driverPhoto,
  isOnline,
  todayEarnings,
  todayDeliveries,
  weekEarnings,
  rating = 5.0,
  totalDeliveries,
  locale,
  onToggleOnline,
}: DriverHeaderProps) {
  const t = LOCALE_LABELS[locale] ?? LOCALE_LABELS.de;
  const [pending, startTransition] = useTransition();
  const [optimisticOnline, setOptimisticOnline] = useState(isOnline);

  const handleToggle = (next: boolean) => {
    setOptimisticOnline(next);
    startTransition(async () => {
      try {
        await onToggleOnline?.(next);
      } catch (e) {
        setOptimisticOnline(!next); // revert
      }
    });
  };

  const initials = driverName
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isRtl = locale === 'ar';

  return (
    <header
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'relative overflow-hidden rounded-3xl sm:rounded-[2rem] p-5 sm:p-7',
        'border transition-all duration-500',
        optimisticOnline
          ? 'bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-cyan-700/10 border-emerald-500/30'
          : 'bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900 border-edge',
      )}
    >
      {/* Decorative blur circles */}
      <div
        className={cn(
          'absolute -top-12 -end-12 w-48 h-48 rounded-full blur-3xl transition-opacity',
          optimisticOnline ? 'bg-emerald-500/20 opacity-100' : 'bg-ink-700/30 opacity-50',
        )}
        aria-hidden
      />
      <div
        className={cn(
          'absolute -bottom-12 -start-12 w-48 h-48 rounded-full blur-3xl transition-opacity',
          optimisticOnline ? 'bg-cyan-500/15 opacity-100' : 'bg-ink-700/20 opacity-50',
        )}
        aria-hidden
      />

      <div className="relative space-y-5">
        {/* Top row: profile + online toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              <div
                className={cn(
                  'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-extrabold text-xl shadow-glow',
                  optimisticOnline
                    ? 'bg-gradient-to-br from-emerald-500 to-cyan-600 text-white'
                    : 'bg-gradient-to-br from-ink-600 to-ink-800 text-text-secondary',
                )}
              >
                {driverPhoto ? (
                  <img
                    src={driverPhoto}
                    alt={driverName}
                    className="w-full h-full object-cover rounded-2xl"
                  />
                ) : (
                  initials
                )}
              </div>
              {/* Status pulse */}
              <span
                className={cn(
                  'absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full border-2 border-bg-elevated',
                  optimisticOnline ? 'bg-emerald-500' : 'bg-text-muted',
                )}
                aria-hidden
              >
                {optimisticOnline && (
                  <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping-soft opacity-75" />
                )}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-muted font-bold uppercase tracking-wider truncate">
                {t.welcome(driverName)}
              </p>
              <h1 className="text-lg sm:text-xl font-extrabold text-white truncate">
                {optimisticOnline ? (
                  <span className="flex items-center gap-1.5">
                    <Power className="w-4 h-4 text-emerald-400" />
                    {t.online}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <PowerOff className="w-4 h-4" />
                    {t.offline}
                  </span>
                )}
              </h1>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-text-muted">
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-brand-yellow-400 text-brand-yellow-400" />
                  <span className="font-bold text-brand-yellow-400">{rating.toFixed(1)}</span>
                </span>
                <span>·</span>
                <span className="font-bold">{totalDeliveries} {t.deliveries}</span>
              </div>
            </div>
          </div>

          {/* Online toggle (large) */}
          <button
            type="button"
            disabled={pending}
            onClick={() => handleToggle(!optimisticOnline)}
            className={cn(
              'relative inline-flex items-center justify-center gap-2 h-12 px-5 sm:px-6 rounded-2xl font-extrabold text-sm transition-all duration-300 active:scale-[0.97]',
              optimisticOnline
                ? 'bg-emerald-500/15 text-emerald-400 border-2 border-emerald-500/40 hover:bg-emerald-500/25'
                : 'bg-brand-gradient text-white shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5',
              pending && 'opacity-70 cursor-wait',
            )}
            aria-pressed={optimisticOnline}
          >
            {pending ? (
              <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : optimisticOnline ? (
              <PowerOff className="w-4 h-4" />
            ) : (
              <Power className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {optimisticOnline ? t.goOffline : t.goOnline}
            </span>
          </button>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Today's earnings */}
          <div className="rounded-2xl bg-ink-700/60 backdrop-blur-sm border border-edge-light p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
              <Wallet className="w-3 h-3" />
              {t.today}
            </div>
            <p className="text-lg sm:text-2xl font-black text-white tabular-nums leading-none">
              {formatEUR(todayEarnings)}
            </p>
            <p className="text-[10px] text-text-secondary font-medium">
              {todayDeliveries} {t.deliveries}
            </p>
          </div>

          {/* Week's earnings */}
          <div className="rounded-2xl bg-ink-700/60 backdrop-blur-sm border border-edge-light p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
              <TrendingUp className="w-3 h-3" />
              {t.week}
            </div>
            <p className="text-lg sm:text-2xl font-black text-white tabular-nums leading-none">
              {formatEUR(weekEarnings)}
            </p>
            <p className="text-[10px] text-text-secondary font-medium">
              {t.earnings2}
            </p>
          </div>

          {/* Rating */}
          <div className="rounded-2xl bg-ink-700/60 backdrop-blur-sm border border-edge-light p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-extrabold uppercase tracking-wider">
              <Star className="w-3 h-3 fill-brand-yellow-400 text-brand-yellow-400" />
              {t.avg}
            </div>
            <p className="text-lg sm:text-2xl font-black text-brand-yellow-400 tabular-nums leading-none">
              {rating.toFixed(1)}
            </p>
            <p className="text-[10px] text-text-secondary font-medium">
              ★★★★★
            </p>
          </div>
        </div>

        {/* Quick action links */}
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/driver/orders"
            className="group flex items-center justify-between gap-2 h-11 px-4 rounded-2xl bg-surface-elevated border border-edge hover:border-edge-strong transition-all"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Truck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span className="text-sm font-extrabold text-white truncate">{t.history}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-brand-500 flex-shrink-0 rtl:rotate-180" />
          </Link>
          <Link
            href="/driver/earnings"
            className="group flex items-center justify-between gap-2 h-11 px-4 rounded-2xl bg-surface-elevated border border-edge hover:border-edge-strong transition-all"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Wallet className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-sm font-extrabold text-white truncate">{t.earnings}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-brand-500 flex-shrink-0 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </header>
  );
}
