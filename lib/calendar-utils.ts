/**
 * Calendar utilities for grouping orders by day / week / month.
 * All date math is timezone-aware via the browser's local timezone.
 *
 * Returns ISO date keys (YYYY-MM-DD) that are stable across clients when
 * the client timezone matches the server one — but for the UI grouping we
 * use the browser's local time, which is the correct UX behavior.
 */

export type CalendarGrouping = 'day' | 'week' | 'month';

export interface OrderForCalendar {
  id: string;
  created_at: string; // ISO
  status: string;
  [k: string]: any;
}

export interface CalendarSection {
  /** Stable key for React keys */
  key: string;
  /** Section title (already localized) */
  title: string;
  /** Section subtitle (date range or day-of-week) */
  subtitle: string;
  /** Section icon hint */
  hint: 'today' | 'yesterday' | 'past' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'older';
  /** Orders in this section */
  orders: OrderForCalendar[];
  /** Total $ for the section (if available) */
  total: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date, weekStartsOn = 1): Date {
  // weekStartsOn: 0 = Sunday, 1 = Monday
  const x = startOfDay(d);
  const dow = x.getDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isInRange(d: Date, start: Date, end: Date): boolean {
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
}

export function dateKey(d: Date): string {
  // Stable YYYY-MM-DD key
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekKey(d: Date, weekStartsOn = 1): string {
  const s = startOfWeek(d, weekStartsOn);
  return `W${dateKey(s)}`;
}

function monthKey(d: Date): string {
  return `M${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Group orders by day / week / month, using the browser's local timezone.
 * Sections are returned in DESCENDING order (most recent first).
 */
export function groupOrders(
  orders: OrderForCalendar[],
  grouping: CalendarGrouping,
  locale: 'de' | 'ar' | 'en' = 'de',
  weekStartsOn = 1,
  now: Date = new Date(),
): CalendarSection[] {
  if (orders.length === 0) return [];

  // Group by key
  const buckets = new Map<string, { section: CalendarSection; orderDate: Date }>();

  for (const o of orders) {
    const d = new Date(o.created_at);
    let key: string;
    let sectionDate: Date;

    if (grouping === 'day') {
      sectionDate = startOfDay(d);
      key = dateKey(sectionDate);
    } else if (grouping === 'week') {
      sectionDate = startOfWeek(d, weekStartsOn);
      key = weekKey(d, weekStartsOn);
    } else {
      sectionDate = startOfMonth(d);
      key = monthKey(d);
    }

    if (!buckets.has(key)) {
      buckets.set(key, {
        section: emptySection(key),
        orderDate: sectionDate,
      });
    }
    const bucket = buckets.get(key)!;
    bucket.section.orders.push(o);
    if (typeof o.total === 'number') {
      bucket.section.total += o.total;
    }
  }

  // Sort buckets by date DESC
  const sorted = Array.from(buckets.entries()).sort(
    (a, b) => b[1].orderDate.getTime() - a[1].orderDate.getTime(),
  );

  // Build section titles
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = startOfWeek(now, weekStartsOn);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = thisWeekStart;
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = new Date(thisMonthStart);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

  for (const [key, { section, orderDate }] of sorted) {
    const title = formatSectionTitle(orderDate, grouping, locale, now);
    const subtitle = formatSectionSubtitle(orderDate, grouping, locale, now);
    section.key = key;
    section.title = title;
    section.subtitle = subtitle;
    section.orders.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    if (grouping === 'day') {
      if (isSameDay(orderDate, today)) section.hint = 'today';
      else if (isSameDay(orderDate, yesterday)) section.hint = 'yesterday';
      else if (orderDate.getTime() < yesterday.getTime()) section.hint = 'past';
    } else if (grouping === 'week') {
      if (isInRange(orderDate, thisWeekStart, new Date(thisWeekStart.getTime() + 7 * DAY_MS))) {
        section.hint = 'thisWeek';
      } else if (isInRange(orderDate, lastWeekStart, lastWeekEnd)) {
        section.hint = 'lastWeek';
      } else {
        section.hint = 'past';
      }
    } else {
      if (isSameDay(orderDate, thisMonthStart)) section.hint = 'thisMonth';
      else if (isSameDay(orderDate, lastMonthStart)) section.hint = 'older';
      else section.hint = 'older';
    }
  }

  return sorted.map(([, v]) => v.section);
}

function emptySection(key: string): CalendarSection {
  return { key, title: '', subtitle: '', hint: 'past', orders: [], total: 0 };
}

function formatSectionTitle(
  d: Date,
  grouping: CalendarGrouping,
  locale: 'de' | 'ar' | 'en',
  now: Date,
): string {
  const loc = locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE';
  if (grouping === 'day') {
    // Special cases
    if (isSameDay(d, startOfDay(now))) {
      return locale === 'ar' ? 'اليوم' : locale === 'en' ? 'Today' : 'Heute';
    }
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (isSameDay(d, y)) {
      return locale === 'ar' ? 'أمس' : locale === 'en' ? 'Yesterday' : 'Gestern';
    }
    return d.toLocaleDateString(loc, { weekday: 'long', day: '2-digit', month: 'short' });
  }
  if (grouping === 'week') {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const startStr = d.toLocaleDateString(loc, { day: '2-digit', month: 'short' });
    const endStr = end.toLocaleDateString(loc, { day: '2-digit', month: 'short' });
    return `${startStr} – ${endStr}`;
  }
  // month
  return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
}

function formatSectionSubtitle(
  d: Date,
  grouping: CalendarGrouping,
  locale: 'de' | 'ar' | 'en',
  now: Date,
): string {
  if (grouping === 'day') {
    if (isSameDay(d, startOfDay(now))) {
      return locale === 'ar' ? 'الطلبات اليوم' : locale === 'en' ? 'Today\'s orders' : 'Heutige Bestellungen';
    }
    return d.toLocaleDateString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
  if (grouping === 'week') {
    return locale === 'ar'
      ? `الأسبوع ${getWeekNumber(d)}`
      : locale === 'en'
      ? `Week ${getWeekNumber(d)}`
      : `KW ${getWeekNumber(d)}`;
  }
  // month
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return locale === 'ar' ? `${days} يوماً` : locale === 'en' ? `${days} days` : `${days} Tage`;
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Returns the YYYY-MM-DD for today in the browser's local timezone.
 * This is the key to keeping dates correct across devices — the user
 * always sees their own local "today" rather than UTC.
 */
export function todayKey(now: Date = new Date()): string {
  return dateKey(now);
}

/**
 * Day navigation helpers.
 */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/**
 * Filter orders to a specific day (browser local timezone).
 */
export function filterByDay(orders: OrderForCalendar[], day: Date): OrderForCalendar[] {
  const start = startOfDay(day);
  const end = new Date(start.getTime() + DAY_MS);
  return orders.filter((o) => {
    const d = new Date(o.created_at);
    return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
  });
}

/**
 * Filter orders to a date range (browser local timezone).
 */
export function filterByRange(
  orders: OrderForCalendar[],
  from: Date,
  to: Date,
): OrderForCalendar[] {
  return orders.filter((o) => {
    const d = new Date(o.created_at);
    return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  });
}
