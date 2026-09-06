import crypto from 'node:crypto';

export type EmailLocale = 'de' | 'ar' | 'en';

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function normalizeEmailLocale(locale?: string): EmailLocale {
  return locale === 'ar' || locale === 'en' ? locale : 'de';
}

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function assertEmailAddress(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Error('Invalid email address');
  }
  return email;
}

export function assertEmailAddresses(value: string | string[]): string[] {
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0 || values.length > 50) throw new Error('Invalid recipient count');
  return [...new Set(values.map(assertEmailAddress))];
}

export function assertTrustedEmailUrl(value: string): string {
  const url = new URL(value);
  const allowed = new Set(
    [
      'https://blinkgo.de',
      'https://www.blinkgo.de',
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.APP_URL,
      process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined,
    ].filter((entry): entry is string => Boolean(entry)),
  );
  const origin = url.origin.toLowerCase();
  if (![...allowed].some((entry) => {
    try { return new URL(entry).origin.toLowerCase() === origin; } catch { return false; }
  })) {
    throw new Error('Untrusted email action URL');
  }
  return url.toString();
}

export function emailIdempotencyKey(type: string, discriminator: string): string {
  const digest = crypto.createHash('sha256').update(discriminator).digest('hex').slice(0, 32);
  return `blinkgo-${type.replace(/[^a-z0-9_-]/gi, '-').slice(0, 32)}-${digest}`;
}
