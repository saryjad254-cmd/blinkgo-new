'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import de, { type Translations } from './locales/de';
import ar, { type Translations as ArTranslations } from './locales/ar';
import en, { type Translations as EnTranslations } from './locales/en';

export type Locale = 'de' | 'ar' | 'en';

// IMPORTANT: getServerLocale MUST be imported directly from server-translations
// in server components. Re-exporting it here pulls next/headers into the client
// bundle. Server components should import from './server-translations' directly.

const translations: Record<Locale, Translations> = {
  de,
  ar: ar as unknown as Translations,
  en: en as unknown as Translations,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
  isRTL: boolean;
  dir: 'ltr' | 'rtl';
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'blinkgo-locale';
const COOKIE_KEY = 'blinkgo-locale';

// Synchronously read locale from cookie on the client (avoids the AR/DE flicker
// that happens when the cookie says "ar" but the React state initializes as "de").
// This is critical for the user requirement: every screen must load in a single
// language from the FIRST render.
function readCookieLocale(): Locale | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.split(';').find((c) => c.trim().startsWith(`${COOKIE_KEY}=`));
  if (!m) return null;
  const v = m.split('=')[1]?.trim();
  if (v === 'ar' || v === 'en' || v === 'de') return v;
  return null;
}

function readStorageLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'de' || saved === 'ar' || saved === 'en') return saved;
  } catch {}
  return null;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  // CRITICAL: Initialize locale from the server-provided `initialLocale` only.
  // Reading from cookie/storage here causes a React hydration mismatch
  // (server renders one locale, client renders another) which produces:
  //   "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
  // We sync from cookie/storage in a useEffect AFTER hydration.
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? 'de');
  const [hydrated, setHydrated] = useState(false);

  // Sync document dir/lang on locale change (the user-visible attribute: dir, lang).
  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  // AFTER hydration: sync from URL ?lang= / cookie / storage / browser.
  // Order: URL > cookie > localStorage > navigator.language.
  // This runs once on the client, after the first render is committed.
  useEffect(() => {
    setHydrated(true);
    if (typeof window === 'undefined') return;

    // 1) URL ?lang= (highest priority — emails + OAuth land here)
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    const fromUrl = urlLang === 'ar' || urlLang === 'en' || urlLang === 'de' ? urlLang : null;

    // 2) Cookie
    const cookieLocale = readCookieLocale();
    // 3) localStorage
    const storageLocale = readStorageLocale();
    // 4) Navigator language (German-first unless browser is clearly ar/en)
    const browserLocale =
      typeof navigator !== 'undefined' && navigator.language
        ? navigator.language.slice(0, 2)
        : null;
    const browser = browserLocale === 'ar' || browserLocale === 'en' ? browserLocale : null;

    const next = fromUrl ?? cookieLocale ?? storageLocale ?? browser ?? 'de';
    if (next !== initialLocale) {
      setLocaleState(next as Locale);
    }
    if (fromUrl && fromUrl !== cookieLocale) {
      // Persist URL-sourced locale so a page refresh sticks
      try {
        document.cookie = `${COOKIE_KEY}=${fromUrl};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
        localStorage.setItem(STORAGE_KEY, fromUrl);
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
      document.cookie = `${COOKIE_KEY}=${l};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    } catch {}
    applyDocumentLocale(l);
  }, []);

  // Memoize the context value to prevent consumers from re-rendering on
  // every parent re-render (major perf win when t is passed to many components).
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: translations[locale],
      isRTL: locale === 'ar',
      dir: locale === 'ar' ? 'rtl' : 'ltr',
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

export function useT(): Translations {
  return useI18n().t;
}

/**
 * useTranslations — returns a `t(path, fallback)` function that walks a
 * dotted path in the current locale and gracefully falls back to:
 *   1. The English translation (en) when the current locale is missing
 *      a key (so the UI never goes blank for AR/DE users when EN has the key)
 *   2. The literal key path (last resort)
 *
 * Example:
 *   const t = useTranslations();
 *   t('nav.home', 'Home');          // returns "Startseite" for DE
 *   t('cart.empty.title');         // returns the key if neither locale has it
 */
export function useTranslations(): (path: string, fallback?: string) => string {
  const { locale, t } = useI18n();
  return (path: string, fallback?: string) => {
    const cur = lookupPath(t, path);
    if (cur !== undefined) return cur;
    if (locale !== 'en') {
      const en = lookupPath(translations.en, path);
      if (en !== undefined) return en;
    }
    return fallback ?? path;
  };
}

function lookupPath(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Helper to translate a key path like "nav.home"
 */
export function tr(t: Translations, path: string): string {
  const parts = path.split('.');
  let cur: any = t;
  for (const p of parts) {
    if (cur == null) return path;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : path;
}

function applyDocumentLocale(l: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
}

export const localeOptions: { code: Locale; name: string; flag: string }[] = [
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
];

/**
 * safeT — access translation with optional fallback (avoids TS errors when
 * a key isn't present in a translation file).
 */
export function safeT(t: any, path: string, fallback: string): string {
  const parts = path.split('.');
  let cur: any = t;
  for (const p of parts) {
    if (cur == null) return fallback;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : fallback;
}
