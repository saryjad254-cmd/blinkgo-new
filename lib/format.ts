/**
 * German market formatting helpers
 * - Currency: Euro (€) with German format (12,99 €)
 * - Date/time: de-DE locale
 * - Phone: +49 prefix
 */

/**
 * formatEUR — German price format (e.g. "12,99 €")
 * Uses comma as decimal separator per German convention.
 */
export function formatEUR(amount: number | string | null | undefined, withSymbol = true): string {
  const num = Number(amount ?? 0);
  if (Number.isNaN(num)) return withSymbol ? '0,00 €' : '0,00';
  // German format: comma decimal, period thousand
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
  // Strip non-digits
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('49')) return `+${digits}`;
  if (digits.startsWith('0')) return `+49 ${digits.slice(1)}`;
  return `+49 ${digits}`;
}

/**
 * German cities used for sample data
 */
export const GERMAN_CITIES = [
  'Bonn',
  'Köln',
  'Berlin',
  'Hamburg',
  'München',
  'Düsseldorf',
  'Frankfurt',
] as const;

/**
 * German street examples (used as placeholders)
 */
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