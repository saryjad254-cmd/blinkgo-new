/**
 * Server-side translation loader.
 * Separate file from I18nProvider.tsx (which is client-only) so that
 * getServerTranslations can be safely imported by server components.
 */
import { cookies, headers } from 'next/headers';
import de from './locales/de';
import ar from './locales/ar';
import en from './locales/en';

export type Locale = 'de' | 'ar' | 'en';

const translations: Record<Locale, typeof de> = {
  de,
  ar: ar as unknown as typeof de,
  en: en as unknown as typeof de,
};

function safeLang(s: string | null | undefined): Locale {
  if (s === 'ar' || s === 'en') return s;
  return 'de';
}

async function getLocaleFromUrl(): Promise<Locale | null> {
  try {
    const h = await headers();
    const url = h.get('x-url') || h.get('referer') || '';
    if (!url) return null;
    const u = new URL(url, 'http://placeholder.local');
    const lang = u.searchParams.get('lang');
    return lang === 'de' || lang === 'ar' || lang === 'en' ? lang : null;
  } catch {
    return null;
  }
}

async function getLocaleFromCookies(): Promise<Locale> {
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  const cookieHeader = all.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join('; ');
  const match = cookieHeader.split(';').find((c: string) => c.trim().startsWith('blinkgo-locale='));
  if (!match) return 'de';
  return safeLang(match.split('=')[1]?.trim());
}

export async function getServerTranslations(): Promise<{ locale: Locale; t: typeof de }> {
  // Priority: URL ?lang= > cookie
  const locale = (await getLocaleFromUrl()) ?? (await getLocaleFromCookies());
  return { locale, t: translations[locale] };
}

export function getServerLocale(cookieHeader?: string): Locale {
  if (!cookieHeader) return 'de';
  const match = cookieHeader.split(';').find((c) => c.trim().startsWith('blinkgo-locale='));
  if (!match) return 'de';
  return safeLang(match.split('=')[1]?.trim());
}

/**
 * Variant that ALSO reads the URL `?lang=` parameter via the
 * x-invoke-path / x-url header that Next.js sets for server components.
 * Use this in server pages that need to honor the URL param (e.g. login,
 * register, forgot-password) so the first paint is in the right language.
 */
export async function getServerLocaleFromRequest(): Promise<Locale> {
  try {
    const h = await headers();
    // Next.js 14 sets x-invoke-path and x-pathname on server components
    const pathHeader =
      h.get('x-pathname') ||
      h.get('x-invoke-path') ||
      h.get('x-url') ||
      h.get('referer') ||
      '';
    if (pathHeader) {
      // x-url or referer may be a full URL; x-pathname is just a path
      const queryStart = pathHeader.indexOf('?');
      if (queryStart >= 0) {
        const qs = pathHeader.slice(queryStart + 1);
        const params = new URLSearchParams(qs);
        const lang = params.get('lang');
        if (lang) return safeLang(lang);
      }
    }
  } catch {}
  return getLocaleFromCookies();
}
