/**
 * Foundation: Date/Time utilities
 * ─────────────────────────────
 * Locale-aware formatting. Always use these — never `new Date().toLocaleString()`.
 */

import { DEFAULT_LOCALE, type Locale } from './types';

const BCP47: Record<Locale, string> = {
  de: 'de-DE',
  ar: 'ar-SA',
  en: 'en-US',
};

function isRTLLocale(locale: Locale): boolean {
  return locale === 'ar';
}

export function isRTL(locale: Locale): boolean {
  return isRTLLocale(locale);
}

export function formatDate(d: Date | string | number, locale: Locale = DEFAULT_LOCALE): string {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(BCP47[locale], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

export function formatTime(d: Date | string | number, locale: Locale = DEFAULT_LOCALE): string {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(BCP47[locale], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateTime(d: Date | string | number, locale: Locale = DEFAULT_LOCALE): string {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(BCP47[locale], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function relativeTime(d: Date | string | number, locale: Locale = DEFAULT_LOCALE): string {
  const date = d instanceof Date ? d : new Date(d);
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(BCP47[locale], { numeric: 'auto' });
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  if (Math.abs(diffSec) < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (Math.abs(diffSec) < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

export function startOfDay(d: Date = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function startOfWeek(d: Date = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - 7);
  return x.getTime();
}

export function startOfMonth(d: Date = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(1);
  return x.getTime();
}

// ── German market-specific formatters ──────────────────────────

/**
 * formatEUR — German price format (e.g. "12,99 €")
 * Uses comma as decimal separator per German convention.
 */
export function formatEUR(amount: number | string | null | undefined, withSymbol = true): string {
  const num = Number(amount ?? 0);
  if (Number.isNaN(num)) return withSymbol ? '0,00 €' : '0,00';
  const formatted = num.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `${formatted} €` : formatted;
}

/**
 * formatEURShort — short format without trailing zeros (e.g. "12 €" or "12,99 €")
 */
export function formatEURShort(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  if (Number.isNaN(num)) return '0 €';
  if (Number.isInteger(num)) return `${num} €`;
  return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * formatDateDE — German date format (dd.MM.yyyy)
 */
export function formatDateDE(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * formatDateTimeDE — German datetime format (dd.MM.yyyy, HH:mm)
 */
export function formatDateTimeDE(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * formatTimeDE — German time format (HH:mm)
 */
export function formatTimeDE(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * formatGermanPhone — Format German phone (+49 XXX XXXXXXX)
 */
export function formatGermanPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('49')) return `+${digits}`;
  if (digits.startsWith('0')) return `+49 ${digits.slice(1)}`;
  return `+49 ${digits}`;
}

export const GERMAN_CITIES = [
  'Bonn',
  'Köln',
  'Berlin',
  'Hamburg',
  'München',
  'Düsseldorf',
  'Frankfurt',
] as const;

export const GERMAN_STREETS = [
  'Königstraße 12',
  'Hauptbahnhof 5',
  'Friedrichstraße 24',
  'Bahnhofstraße 8',
  'Marktplatz 3',
  'Schloßstraße 17',
  'Domplatz 1',
] as const;

export type GermanCity = (typeof GERMAN_CITIES)[number];
