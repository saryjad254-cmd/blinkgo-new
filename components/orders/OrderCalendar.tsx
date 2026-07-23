'use client';

import { useState, useMemo, useEffect, memo, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Clock,
  CalendarDays,
  ListOrdered,
  ChevronDown,
  Check,
  X,
  CalendarRange,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/I18nProvider';
import { formatCurrency } from '@/lib/i18n/format';
import {
  type OrderForCalendar,
  type CalendarGrouping,
  type CalendarSection,
  groupOrders,
  todayKey,
  addDays,
  addMonths,
  dateKey,
  startOfWeek,
  filterByDay,
  filterByRange,
} from '@/lib/calendar-utils';

export type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

interface OrderCalendarProps<T extends OrderForCalendar> {
  orders: T[];
  /** Render a single order row */
  renderOrder: (order: T) => React.ReactNode;
  /** Default grouping */
  defaultGrouping?: CalendarGrouping;
  /** Default status filter */
  defaultStatusFilter?: StatusFilter;
  /** Show the grouping switcher (day/week/month) */
  showGrouping?: boolean;
  /** Show the status filter chips */
  showStatusFilter?: boolean;
  /** Show date range navigation */
  showDateNav?: boolean;
  /** Show count + total summary */
  showSummary?: boolean;
  /** Locale */
  locale?: 'de' | 'ar' | 'en';
  /** Empty state */
  emptyState?: React.ReactNode;
}

/**
 * OrderCalendar
 * ─────────────
 * Universal calendar / order history component.
 *
 * - Groups orders by day / week / month using the user's local timezone.
 * - Today is automatically highlighted at the top.
 * - Filters by status (all / active / completed / cancelled).
 * - Date navigation: prev/next, today shortcut, custom range.
 * - Single source of truth: every order list (customer / driver / restaurant
 *   / admin) uses this component.
 */
export function OrderCalendar<T extends OrderForCalendar>({
  orders,
  renderOrder,
  defaultGrouping = 'day',
  defaultStatusFilter = 'all',
  showGrouping = true,
  showStatusFilter = true,
  showDateNav = true,
  showSummary = true,
  locale = 'de',
  emptyState,
}: OrderCalendarProps<T>) {
  const t = useT();
  const [grouping, setGrouping] = useState<CalendarGrouping>(defaultGrouping);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(defaultStatusFilter);
  const [now, setNow] = useState<Date>(() => new Date());

  // Update "now" once a minute so day boundaries are accurate
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Filter by status first
  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders;
    if (statusFilter === 'active') {
      return orders.filter((o) =>
        ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivering'].includes(
          o.status,
        ),
      );
    }
    if (statusFilter === 'completed') {
      return orders.filter((o) => o.status === 'delivered');
    }
    if (statusFilter === 'cancelled') {
      return orders.filter((o) => o.status === 'cancelled');
    }
    return orders;
  }, [orders, statusFilter]);

  // Group filtered orders by day/week/month
  const sections = useMemo(
    () => groupOrders(filteredOrders, grouping, locale, 1, now),
    [filteredOrders, grouping, locale, now],
  );

  // 3-locale labels
  const labels = {
    title: locale === 'ar' ? 'التقويم' : locale === 'en' ? 'Calendar' : 'Kalender',
    today: locale === 'ar' ? 'اليوم' : locale === 'en' ? 'Today' : 'Heute',
    groupDay: locale === 'ar' ? 'يوم' : locale === 'en' ? 'Day' : 'Tag',
    groupWeek: locale === 'ar' ? 'أسبوع' : locale === 'en' ? 'Week' : 'Woche',
    groupMonth: locale === 'ar' ? 'شهر' : locale === 'en' ? 'Month' : 'Monat',
    filterAll: locale === 'ar' ? 'الكل' : locale === 'en' ? 'All' : 'Alle',
    filterActive: locale === 'ar' ? 'نشطة' : locale === 'en' ? 'Active' : 'Aktiv',
    filterCompleted: locale === 'ar' ? 'مكتملة' : locale === 'en' ? 'Completed' : 'Abgeschlossen',
    filterCancelled: locale === 'ar' ? 'ملغية' : locale === 'en' ? 'Cancelled' : 'Storniert',
    orders: locale === 'ar' ? 'طلبات' : locale === 'en' ? 'orders' : 'Bestellungen',
    total: locale === 'ar' ? 'الإجمالي' : locale === 'en' ? 'Total' : 'Gesamt',
    empty: locale === 'ar' ? 'لا توجد طلبات' : locale === 'en' ? 'No orders' : 'Keine Bestellungen',
    emptyDesc:
      locale === 'ar'
        ? 'ستظهر طلباتك هنا بمجرد إنشائها'
        : locale === 'en'
        ? 'Your orders will appear here'
        : 'Hier erscheinen deine Bestellungen',
  };

  // ── Section header / data
  const totalAll = filteredOrders.length;
  const sumAll = filteredOrders.reduce(
    (s, o) => s + (typeof o.total === 'number' ? o.total : 0),
    0,
  );

  return (
    <div className="space-y-3" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Controls bar */}
      {(showGrouping || showStatusFilter) && (
        <div className="rounded-2xl bg-surface-elevated border border-edge p-3 sm:p-4 space-y-3">
          {/* Grouping switcher (segmented) */}
          {showGrouping && (
            <div className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-text-muted flex-shrink-0" />
              <div className="inline-flex items-center p-1 bg-ink-900/60 rounded-2xl flex-1" role="tablist" aria-label={labels.title}>
                {(['day', 'week', 'month'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrouping(g)}
                    role="tab"
                    aria-selected={grouping === g}
                    className={cn(
                      'flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5',
                      'transition-all duration-200 ease-silk active:scale-[0.97]',
                      grouping === g
                        ? 'bg-gradient-to-br from-brand-red via-brand-red-hover to-brand-red-active text-white shadow-glow'
                        : 'text-text-secondary hover:text-white',
                    )}
                  >
                    {g === 'day' && <ListOrdered className="w-3.5 h-3.5" />}
                    {g === 'week' && <CalendarDays className="w-3.5 h-3.5" />}
                    {g === 'month' && <CalendarIcon className="w-3.5 h-3.5" />}
                    {g === 'day' ? labels.groupDay : g === 'week' ? labels.groupWeek : labels.groupMonth}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status filter chips */}
          {showStatusFilter && (
            <div className="flex flex-wrap gap-1.5">
              {([
                { v: 'all', label: labels.filterAll, color: 'bg-ink-700 text-white' },
                { v: 'active', label: labels.filterActive, color: 'bg-emerald-500/20 text-emerald-400' },
                { v: 'completed', label: labels.filterCompleted, color: 'bg-blue-500/20 text-blue-400' },
                { v: 'cancelled', label: labels.filterCancelled, color: 'bg-red-500/20 text-red-400' },
              ] as { v: StatusFilter; label: string; color: string }[]).map((f) => {
                const isActive = statusFilter === f.v;
                return (
                  <button
                    key={f.v}
                    type="button"
                    onClick={() => setStatusFilter(f.v)}
                    aria-pressed={isActive}
                    className={cn(
                      'h-8 px-3 rounded-full font-bold text-xs uppercase tracking-wider',
                      'transition-all duration-200 ease-silk active:scale-[0.97]',
                      'border',
                      isActive
                        ? cn(f.color, 'border-current/40 shadow-speed')
                        : 'bg-surface text-text-secondary border-edge hover:text-white hover:border-edge-strong',
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Summary line */}
      {showSummary && totalAll > 0 && (
        <div className="flex items-center justify-between px-2 text-xs text-text-muted">
          <span>
            <strong className="text-text font-extrabold">{totalAll}</strong> {labels.orders}
          </span>
          {sumAll > 0 && (
            <span className="tabular-nums">
              {labels.total}: <strong className="text-text font-extrabold">
                {formatCurrency(sumAll, locale)}
              </strong>
            </span>
          )}
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="rounded-2xl bg-surface-elevated border border-edge p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface mx-auto mb-3 flex items-center justify-center text-text-muted">
            <CalendarIcon className="w-7 h-7" />
          </div>
          <p className="text-sm font-extrabold text-text">{labels.empty}</p>
          <p className="text-xs text-text-muted mt-1">{labels.emptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <CalendarSectionView
              key={section.key}
              section={section}
              renderOrder={(o) => renderOrder(o as T)}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SectionProps<T> {
  section: CalendarSection;
  renderOrder: (o: T) => React.ReactNode;
  locale: 'de' | 'ar' | 'en';
}

function CalendarSectionView<T>({ section, renderOrder, locale }: SectionProps<T>) {
  // Hint-based styling
  const isToday = section.hint === 'today';
  const isThisWeek = section.hint === 'thisWeek';
  const isThisMonth = section.hint === 'thisMonth';
  const isAccent = isToday || isThisWeek || isThisMonth;

  const orderLabel = locale === 'ar' ? 'طلب' : locale === 'en' ? 'order' : 'Bestellung';
  const ordersLabel = locale === 'ar' ? 'طلبات' : locale === 'en' ? 'orders' : 'Bestellungen';

  return (
    <section className="space-y-2">
      <header
        className={cn(
          'flex items-baseline justify-between gap-3 px-2',
          'sticky top-[56px] z-10 py-1',
          'bg-bg/85 backdrop-blur-md -mx-2 px-4',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h2
            className={cn(
              'text-sm font-extrabold truncate',
              isAccent ? 'text-brand-red-500' : 'text-text-secondary',
            )}
          >
            {section.title}
          </h2>
          {isToday && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-extrabold uppercase tracking-wider">
              {locale === 'ar' ? 'الآن' : locale === 'en' ? 'LIVE' : 'LIVE'}
            </span>
          )}
        </div>
        <p className="text-[10px] text-text-muted flex-shrink-0 tabular-nums">
          {section.orders.length} {section.orders.length === 1 ? orderLabel : ordersLabel}
          {section.total > 0 && (
            <span className="ms-1.5 text-text-secondary">
              · {formatCurrency(section.total, locale)}
            </span>
          )}
        </p>
      </header>

      {section.subtitle && (
        <p className="text-[10px] text-text-muted uppercase tracking-wider px-2 -mt-1">
          {section.subtitle}
        </p>
      )}

      <div className="space-y-2">
        {section.orders.map((order) => (
          <div key={(order as any).id}>{renderOrder(order as T)}</div>
        ))}
      </div>
    </section>
  );
}

/**
 * MiniDatePicker — a compact, premium date picker for the calendar filter.
 * Shows the currently selected date and lets the user step back / forward.
 */
interface MiniDatePickerProps {
  date: Date;
  onChange: (d: Date) => void;
  locale: 'de' | 'ar' | 'en';
  weekStartsOn?: number;
}

export function MiniDatePicker({
  date,
  onChange,
  locale,
  weekStartsOn = 1,
}: MiniDatePickerProps) {
  const loc = locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = date.getTime() === today.getTime();

  const dayLabel = date.toLocaleDateString(loc, { day: '2-digit', month: 'short' });
  const weekLabel = date.toLocaleDateString(loc, { weekday: 'long' });

  const todayLabel = locale === 'ar' ? 'اليوم' : locale === 'en' ? 'Today' : 'Heute';
  const yesterdayLabel = locale === 'ar' ? 'أمس' : locale === 'en' ? 'Yesterday' : 'Gestern';

  return (
    <div className="rounded-2xl bg-surface-elevated border border-edge p-3 flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
        className="w-9 h-9 rounded-xl bg-surface border border-edge text-text-secondary hover:text-white hover:border-brand-red-500/60 active:scale-95 transition-all flex items-center justify-center"
      >
        <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
      </button>

      <div className="flex-1 text-center min-w-0">
        <p className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">
          {isToday ? todayLabel : date.getTime() === today.getTime() - 86400000 ? yesterdayLabel : weekLabel}
        </p>
        <p className="text-base font-extrabold text-white truncate">{dayLabel}</p>
      </div>

      <button
        type="button"
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
        className="w-9 h-9 rounded-xl bg-surface border border-edge text-text-secondary hover:text-white hover:border-brand-red-500/60 active:scale-95 transition-all flex items-center justify-center"
      >
        <ChevronRight className="w-4 h-4 rtl:rotate-180" />
      </button>
    </div>
  );
}

/**
 * DateRangeFilter — date-range picker with quick presets.
 */
interface DateRangeFilterProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
  locale: 'de' | 'ar' | 'en';
}

export function DateRangeFilter({ from, to, onChange, locale }: DateRangeFilterProps) {
  const t = useT();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const presets = useMemo(() => {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return [
      {
        label: locale === 'ar' ? 'اليوم' : locale === 'en' ? 'Today' : 'Heute',
        from: today,
        to: new Date(today.getTime() + 86400000 - 1),
      },
      {
        label: locale === 'ar' ? 'آخر 7 أيام' : locale === 'en' ? 'Last 7d' : '7 Tage',
        from: addDays(today, -6),
        to: new Date(today.getTime() + 86400000 - 1),
      },
      {
        label: locale === 'ar' ? 'آخر 30 يوم' : locale === 'en' ? 'Last 30d' : '30 Tage',
        from: addDays(today, -29),
        to: new Date(today.getTime() + 86400000 - 1),
      },
    ];
  }, [today, locale]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const isActive =
            from.getTime() === p.from.getTime() && to.getTime() === p.to.getTime();
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.from, p.to)}
              aria-pressed={isActive}
              className={cn(
                'h-8 px-3 rounded-full font-bold text-xs uppercase tracking-wider',
                'transition-all duration-200 ease-silk active:scale-[0.97]',
                'border',
                isActive
                  ? 'bg-brand-red-500/20 text-brand-red-500 border-brand-red-500/40'
                  : 'bg-surface text-text-secondary border-edge hover:text-white hover:border-edge-strong',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
