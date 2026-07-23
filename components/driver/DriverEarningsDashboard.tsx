'use client';

import { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Truck,
  Flame,
  CheckCircle2,
  ArrowUpRight,
  Clock,
  Award,
  Star,
  Zap,
  Target,
  ChevronRight,
  MapPin,
} from 'lucide-react';
import Link from 'next/link';
import { BarChart, LineChart, ProgressBar, SparkLine } from '@/components/charts/Charts';
import { cn } from '@/lib/cn';
import { formatEUR } from '@/lib/format';

export interface DeliveryEarning {
  id: string;
  order_id: string;
  order_number: string;
  amount: number;
  tip: number;
  distance_km: number;
  duration_min: number;
  delivered_at: string;
  restaurant_name?: string;
  customer_name?: string;
}

interface DriverEarningsDashboardProps {
  earnings: DeliveryEarning[];
  todayTotal: number;
  todayCount: number;
  weekTotal: number;
  weekCount: number;
  monthTotal: number;
  monthCount: number;
  allTimeTotal: number;
  allTimeCount: number;
  weeklyGoal: number;
  recentDeliveries: DeliveryEarning[];
  weeklyEarnings: { day: string; amount: number; count: number }[];
  hourlyEarnings: { hour: number; amount: number; count: number }[];
  monthlyEarnings: { day: string; amount: number; count: number }[];
  weekTrendPct?: number;
  peakHours?: number[];
  avgTime?: number;
  avgEarnings?: number;
  locale: 'de' | 'ar' | 'en';
}

const LOCALE_LABELS = {
  de: {
    title: 'Verdienst',
    subtitle: 'Deine Einnahmen-Übersicht',
    today: 'Heute',
    week: 'Diese Woche',
    month: 'Diesen Monat',
    allTime: 'Insgesamt',
    deliveries: 'Lieferungen',
    deliveriesCount: (n: number) => `${n} Lieferungen`,
    earnings: 'Verdienst',
    avgPerDelivery: 'Ø pro Lieferung',
    weeklyGoal: 'Wochenziel',
    goalReached: 'Ziel erreicht! 🎉',
    hoursDriven: 'Gefahrene Std.',
    peakHours: 'Stoßzeiten',
    topDays: 'Beste Tage',
    recentDeliveries: 'Letzte Lieferungen',
    thisHour: 'Diese Stunde',
    weekChartTitle: 'Verdienst nach Wochentag',
    hourChartTitle: 'Verdienst nach Stunde',
    monthChartTitle: 'Letzte 30 Tage',
    empty: 'Noch keine Lieferungen',
    emptyDesc: 'Sobald Sie Ihre erste Bestellung abschließt, erscheint sie hier.',
    distance: 'Entfernung',
    duration: 'Dauer',
    avgTime: 'Ø Zeit',
    startDriving: 'Jetzt loslegen',
    yourRank: 'Ihr Rang',
    rankTop: 'Top 10%',
    rankMid: 'Top 25%',
    rankAll: 'Top 50%',
    moreDeliveries: 'Weitere Lieferungen',
    vsLastWeek: 'vs. letzte Woche',
    vsLastMonth: 'vs. letzten Monat',
    todayGoal: 'Tagesziel',
    bonusUnlocked: 'Bonus freigeschaltet!',
    bonusLocked: 'Noch {remaining} € bis zum Bonus',
    keepItUp: 'Weiter so!',
  },
  ar: {
    title: 'الأرباح',
    subtitle: 'ملخص دخلك',
    today: 'اليوم',
    week: 'هذا الأسبوع',
    month: 'هذا الشهر',
    allTime: 'الإجمالي',
    deliveries: 'التوصيلات',
    deliveriesCount: (n: number) => `${n} توصيلة`,
    earnings: 'الأرباح',
    avgPerDelivery: 'المتوسط لكل توصيلة',
    weeklyGoal: 'هدف الأسبوع',
    goalReached: 'تم تحقيق الهدف! 🎉',
    hoursDriven: 'ساعات القيادة',
    peakHours: 'ساعات الذروة',
    topDays: 'أفضل الأيام',
    recentDeliveries: 'آخر التوصيلات',
    thisHour: 'هذه الساعة',
    weekChartTitle: 'الأرباح حسب يوم الأسبوع',
    hourChartTitle: 'الأرباح حسب الساعة',
    monthChartTitle: 'آخر 30 يوم',
    empty: 'لا توجد توصيلات',
    emptyDesc: 'بمجرد إكمال أول طلب، سيظهر هنا',
    distance: 'المسافة',
    duration: 'المدة',
    avgTime: 'المتوسط',
    startDriving: 'ابدأ الآن',
    yourRank: 'ترتيبك',
    rankTop: 'أعلى 10٪',
    rankMid: 'أعلى 25٪',
    rankAll: 'أعلى 50٪',
    moreDeliveries: 'توصيلات أخرى',
    vsLastWeek: 'مقارنة بالأسبوع الماضي',
    vsLastMonth: 'مقارنة بالشهر الماضي',
    todayGoal: 'هدف اليوم',
    bonusUnlocked: 'تم فتح المكافأة!',
    bonusLocked: 'باقي {remaining} € للمكافأة',
    keepItUp: 'استمر!',
  },
  en: {
    title: 'Earnings',
    subtitle: 'Your income overview',
    today: 'Today',
    week: 'This week',
    month: 'This month',
    allTime: 'All time',
    deliveries: 'Deliveries',
    deliveriesCount: (n: number) => `${n} deliveries`,
    earnings: 'Earnings',
    avgPerDelivery: 'Avg per delivery',
    weeklyGoal: 'Weekly goal',
    goalReached: 'Goal reached! 🎉',
    hoursDriven: 'Hours driven',
    peakHours: 'Peak hours',
    topDays: 'Top days',
    recentDeliveries: 'Recent deliveries',
    thisHour: 'This hour',
    weekChartTitle: 'Earnings by weekday',
    hourChartTitle: 'Earnings by hour',
    monthChartTitle: 'Last 30 days',
    empty: 'No deliveries yet',
    emptyDesc: 'Once you complete your first order, it will appear here.',
    distance: 'Distance',
    duration: 'Duration',
    avgTime: 'Avg time',
    startDriving: 'Start driving',
    yourRank: 'Your rank',
    rankTop: 'Top 10%',
    rankMid: 'Top 25%',
    rankAll: 'Top 50%',
    moreDeliveries: 'More deliveries',
    vsLastWeek: 'vs. last week',
    vsLastMonth: 'vs. last month',
    todayGoal: 'Today goal',
    bonusUnlocked: 'Bonus unlocked!',
    bonusLocked: '{remaining} € to bonus',
    keepItUp: 'Keep it up!',
  },
} as const;

export function DriverEarningsDashboard({
  earnings,
  todayTotal,
  todayCount,
  weekTotal,
  weekCount,
  monthTotal,
  monthCount,
  allTimeTotal,
  allTimeCount,
  weeklyGoal,
  recentDeliveries,
  hourlyEarnings,
  weeklyEarnings,
  monthlyEarnings,
  weekTrendPct: weekTrendPctProp,
  peakHours: peakHoursProp,
  avgTime: avgTimeProp,
  avgEarnings: avgEarningsProp,
  locale,
}: DriverEarningsDashboardProps) {
  const t = LOCALE_LABELS[locale] ?? LOCALE_LABELS.de;

  // Compute daily goal based on weekly goal / 7
  const dailyGoal = Math.round(weeklyGoal / 7);
  const bonusThreshold = 200;
  const bonusRemaining = Math.max(0, bonusThreshold - todayTotal);

  // Generate default weekly data if not provided
  const weeklyData = useMemo(() => {
    if (weeklyEarnings && weeklyEarnings.length > 0) {
      return weeklyEarnings.map((d) => ({
        label: d.day,
        value: d.amount,
        count: d.count,
      }));
    }
    // Last 7 days
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const today = new Date().getDay();
    return Array.from({ length: 7 }).map((_, i) => ({
      label: days[(today - 6 + i + 7) % 7],
      value: 0,
      count: 0,
    }));
  }, [weeklyEarnings]);

  // Generate hourly data
  const hourlyData = useMemo(() => {
    if (hourlyEarnings && hourlyEarnings.length > 0) {
      return hourlyEarnings;
    }
    return [];
  }, [hourlyEarnings]);

  // Generate 30-day monthly data
  const monthlyData = useMemo(() => {
    if (monthlyEarnings && monthlyEarnings.length > 0) {
      return monthlyEarnings.map((d) => ({ label: d.day, value: d.amount }));
    }
    return Array.from({ length: 30 }).map((_, i) => ({
      label: String(i + 1),
      value: 0,
    }));
  }, [monthlyEarnings]);

  // Avg per delivery
  const avgPerDelivery = weekCount > 0 ? weekTotal / weekCount : 0;
  const avgTime =
    weekCount > 0
      ? recentDeliveries
          .filter((d) => Date.now() - new Date(d.delivered_at).getTime() < 7 * 86400000)
          .reduce((s, d) => s + d.duration_min, 0) / weekCount
      : 0;

  // Trend
  // Use the real weekTrendPct from props (server-computed)
  const weekTrendPct = weekTrendPctProp ?? 0;

  return (
    <div className="space-y-4" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* HERO: Today earnings */}
      <section
        className={cn(
          'relative overflow-hidden rounded-3xl p-6 sm:p-7',
          'bg-gradient-to-br from-emerald-500 via-emerald-600 to-cyan-700',
          'shadow-glow-success',
        )}
      >
        <div className="absolute -top-12 -end-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="absolute -bottom-12 -start-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" aria-hidden />

        <div className="relative space-y-4">
          <div className="flex items-center gap-2 text-white/80">
            <Flame className="w-4 h-4" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              {t.today} · {new Date().toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
            </span>
          </div>

          <div>
            <p className="text-5xl sm:text-6xl font-black text-white tabular-nums drop-shadow-lg">
              {formatEUR(todayTotal)}
            </p>
            <p className="text-sm text-white/80 mt-1 font-medium">
              {t.deliveriesCount(todayCount)} · {t.avgPerDelivery}: {formatEUR(todayCount > 0 ? todayTotal / todayCount : 0)}
            </p>
          </div>

          {/* Daily progress + bonus */}
          <div className="space-y-2.5 pt-2">
            <ProgressBar
              value={todayTotal}
              max={dailyGoal}
              height={10}
              accent="bg-gradient-to-r from-white/40 to-white"
              showLabel={false}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/80 font-medium">
                {t.todayGoal}: {formatEUR(dailyGoal)}
              </span>
              <span className="text-white font-extrabold">
                {Math.round((todayTotal / Math.max(1, dailyGoal)) * 100)}%
              </span>
            </div>

            {bonusRemaining > 0 ? (
              <div className="px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-300 flex-shrink-0" />
                <span className="text-xs text-white font-bold">
                  {t.bonusLocked.replace('{remaining}', formatEUR(bonusRemaining))}
                </span>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-xl bg-brand-yellow-400/30 backdrop-blur-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-yellow-300 flex-shrink-0" />
                <span className="text-xs text-white font-extrabold">{t.bonusUnlocked}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Stats row: Week / Month / All time */}
      <section className="grid grid-cols-3 gap-2">
        <StatBox
          icon={<Calendar className="w-4 h-4" />}
          accent="bg-brand-gradient"
          label={t.week}
          value={formatEUR(weekTotal)}
          subValue={t.deliveriesCount(weekCount)}
          trend={weekTrendPct > 0 ? `+${weekTrendPct.toFixed(0)}%` : `${weekTrendPct.toFixed(0)}%`}
          trendPositive={weekTrendPct > 0}
        />
        <StatBox
          icon={<TrendingUp className="w-4 h-4" />}
          accent="bg-premium-gradient"
          label={t.month}
          value={formatEUR(monthTotal)}
          subValue={t.deliveriesCount(monthCount)}
        />
        <StatBox
          icon={<Truck className="w-4 h-4" />}
          accent="bg-live-gradient"
          label={t.allTime}
          value={formatEUR(allTimeTotal)}
          subValue={t.deliveriesCount(allTimeCount)}
        />
      </section>

      {/* Weekly chart */}
      <section className="rounded-2xl bg-surface-elevated border border-edge p-4 sm:p-5 space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand-500" />
              {t.weekChartTitle}
            </h3>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">
              {t.week} · {formatEUR(weekTotal)}
            </p>
          </div>
          <Link
            href="/driver/orders"
            className="text-[10px] font-bold text-brand-500 hover:text-brand-400 flex items-center gap-1 uppercase tracking-wider"
          >
            {t.moreDeliveries}
            <ChevronRight className="w-3 h-3" />
          </Link>
        </header>
        <BarChart
          data={weeklyData.map((d) => ({ label: d.label, value: d.value }))}
          height={140}
          showValues
          formatValue={(v) => formatEUR(v)}
          accent="bg-brand-gradient"
        />
      </section>

      {/* Hourly chart */}
      {hourlyData.length > 0 && (
        <section className="rounded-2xl bg-surface-elevated border border-edge p-4 sm:p-5 space-y-3">
          <header>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-500" />
              {t.hourChartTitle}
            </h3>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">
              {t.peakHours}
            </p>
          </header>
          <LineChart
            data={hourlyData.map((d) => ({ label: `${d.hour}`, value: d.amount }))}
            height={120}
            accent="#F5B819"
            fill
          />
          <div className="grid grid-cols-3 gap-2 pt-2">
            <PeakBadge
              label={t.peakHours}
              top={hourlyData.slice().sort((a, b) => b.amount - a.amount)[0]}
            />
            <div className="text-center px-3 py-2 rounded-xl bg-surface border border-edge">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                {t.thisHour}
              </p>
              <p className="text-base font-extrabold text-white tabular-nums mt-0.5">
                {hourlyData.find((d) => d.hour === new Date().getHours())?.amount.toFixed(2) ?? '0.00'} €
              </p>
            </div>
            <div className="text-center px-3 py-2 rounded-xl bg-surface border border-edge">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                {t.avgTime}
              </p>
              <p className="text-base font-extrabold text-white tabular-nums mt-0.5">
                {avgTime > 0 ? `${avgTime.toFixed(0)} min` : '—'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Recent deliveries */}
      {recentDeliveries.length > 0 && (
        <section className="rounded-2xl bg-surface-elevated border border-edge p-4 sm:p-5 space-y-3">
          <header>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t.recentDeliveries}
            </h3>
          </header>
          <div className="space-y-2">
            {recentDeliveries.slice(0, 6).map((d) => (
              <DeliveryRow key={d.id} d={d} locale={locale} t={t} />
            ))}
          </div>
        </section>
      )}

      {recentDeliveries.length === 0 && earnings.length === 0 && (
        <section className="rounded-2xl bg-surface-elevated border border-edge p-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-surface mx-auto flex items-center justify-center text-text-muted">
            <Truck className="w-8 h-8" />
          </div>
          <p className="text-base font-extrabold text-white">{t.empty}</p>
          <p className="text-sm text-text-secondary">{t.emptyDesc}</p>
          <Link
            href="/driver/orders/available"
            className="inline-flex h-11 px-5 rounded-2xl bg-brand-gradient text-white font-extrabold text-sm shadow-glow hover:shadow-glow-strong hover:-translate-y-0.5 active:scale-[0.97] transition-all items-center gap-2"
          >
            <Truck className="w-4 h-4" />
            {t.startDriving}
          </Link>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function BarChart3(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function StatBox({
  icon,
  accent,
  label,
  value,
  subValue,
  trend,
  trendPositive,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  subValue: string;
  trend?: string;
  trendPositive?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-speed',
            accent,
          )}
        >
          {icon}
        </div>
        {trend && (
          <span
            className={cn(
              'text-[10px] font-extrabold tabular-nums',
              trendPositive ? 'text-emerald-400' : 'text-danger',
            )}
          >
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</p>
        <p className="text-lg sm:text-xl font-extrabold text-white tabular-nums leading-tight mt-0.5">
          {value}
        </p>
        <p className="text-[10px] text-text-secondary mt-0.5">{subValue}</p>
      </div>
    </div>
  );
}

function PeakBadge({
  label,
  top,
}: {
  label: string;
  top?: { hour: number; amount: number; count: number };
}) {
  if (!top) {
    return <div className="text-center px-3 py-2 rounded-xl bg-surface border border-edge" />;
  }
  return (
    <div className="text-center px-3 py-2 rounded-xl bg-surface border border-edge">
      <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
        {label}
      </p>
      <p className="text-sm font-extrabold text-accent-400 mt-0.5">
        {top.hour}:00
      </p>
      <p className="text-[10px] text-text-secondary">{top.amount.toFixed(0)} €</p>
    </div>
  );
}

function DeliveryRow({
  d,
  locale,
  t,
}: {
  d: DeliveryEarning;
  locale: 'de' | 'ar' | 'en';
  t: any;
}) {
  const dateLocale = locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE';
  const dateStr = new Date(d.delivered_at).toLocaleString(dateLocale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Link
      href={`/driver/orders/${d.order_id}`}
      className="group block rounded-xl bg-surface border border-edge hover:border-edge-strong p-3 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-tip-gradient flex items-center justify-center text-white flex-shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-text truncate">
              {d.restaurant_name ?? `#${d.order_number}`}
            </p>
            <p className="text-sm font-extrabold text-emerald-400 tabular-nums flex-shrink-0">
              +{formatEUR(d.amount + (d.tip || 0))}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-[10px] text-text-muted">{dateStr}</p>
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <span className="flex items-center gap-0.5">
                <MapPin className="w-2.5 h-2.5" />
                {d.distance_km.toFixed(1)} km
              </span>
              <span className="flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {d.duration_min.toFixed(0)} min
              </span>
              {d.tip > 0 && (
                <span className="text-accent-400 font-extrabold flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-accent-400" />
                  {formatEUR(d.tip)}
                </span>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-brand-500 flex-shrink-0" />
      </div>
    </Link>
  );
}
