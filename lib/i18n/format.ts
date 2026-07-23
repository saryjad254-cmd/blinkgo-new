/**
 * Locale-aware formatting — single source of truth (Intl APIs).
 * ─────────────────────────────────────────────────────────────
 * ar → Arabic numerals, Arabic date/time, € via ar-EG-style formatting
 * de → 1.234,56 €, DD.MM.YYYY, 24h
 * en → €1,234.56, MM/DD/YYYY, 12h
 *
 * Use these everywhere instead of `x.toFixed(2) + ' €'` or
 * `new Date().toLocaleDateString()` without a locale.
 */

export type AppLocale = 'de' | 'ar' | 'en';

const TAG: Record<AppLocale, string> = { de: 'de-DE', ar: 'ar', en: 'en-US' };

function tag(locale: string | undefined): string {
  return TAG[(locale as AppLocale) || 'de'] || 'de-DE';
}

/** €12,34 with correct separators & digit system per locale. */
export function formatCurrency(value: number | string | null | undefined, locale: string = 'de'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(tag(locale), { style: 'currency', currency: 'EUR' }).format(n);
}

/** Plain number with locale separators (and Arabic digits for ar). */
export function formatNumber(value: number | string | null | undefined, locale: string = 'de', options?: Intl.NumberFormatOptions): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(tag(locale), options).format(n);
}

/** Percentage, e.g. de "12,5 %", en "12.5%", ar with Arabic digits. */
export function formatPercent(value: number | string | null | undefined, locale: string = 'de', fractionDigits = 1): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(tag(locale), { style: 'percent', maximumFractionDigits: fractionDigits }).format(n / 100);
}

export function formatDate(value: Date | string | number | null | undefined, locale: string = 'de', options?: Intl.DateTimeFormatOptions): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(tag(locale), options ?? { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function formatTime(value: Date | string | number | null | undefined, locale: string = 'de'): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(tag(locale), { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDateTime(value: Date | string | number | null | undefined, locale: string = 'de'): string {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(tag(locale), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d);
}
