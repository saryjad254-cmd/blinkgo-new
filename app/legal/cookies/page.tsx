/**
 * Cookies & Tracking Inventory
 * ─────────────────────────────
 *
 * DRAFT — list of every cookie, localStorage key, and
 * third-party tracker used by BlinkGo. Honest classification:
 * no fake marketing, no real tracking in current build.
 *
 * If a non-essential tracker is later added (e.g. analytics),
 * this page MUST be updated and a proper consent banner
 * implemented (see /api/consent/).
 */

import { getDisplayCompanyInfo } from '@/lib/legal/company-info';
import { LegalBanner } from '@/components/legal/LegalBanner';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface CookieEntry {
  name: string;
  type: 'cookie' | 'localStorage' | 'sessionStorage' | 'third-party-script';
  category: 'strictly_necessary' | 'preferences' | 'analytics' | 'marketing' | 'unknown';
  purpose: string;
  retention: string;
  setBy: 'BlinkGo' | string;
}

const COOKIES: CookieEntry[] = [
  // Strictly necessary
  { name: 'blinkgo-session', type: 'cookie', category: 'strictly_necessary', purpose: 'Session token for authenticated users (Supabase auth)', retention: '30 days', setBy: 'BlinkGo' },
  { name: 'sb-rhdaffhlrglyknxtucux-auth-token', type: 'cookie', category: 'strictly_necessary', purpose: 'Supabase auth cookie (JWT)', retention: 'Until logout or 30 days', setBy: 'Supabase' },
  { name: 'blinkgo-welcome-seen', type: 'cookie', category: 'strictly_necessary', purpose: 'Tracks first-time visitors to show /welcome once', retention: '1 year', setBy: 'BlinkGo' },
  { name: 'blinkgo-locale', type: 'cookie', category: 'preferences', purpose: 'Selected UI language (de/ar/en)', retention: '1 year', setBy: 'BlinkGo' },

  // localStorage — preferences only, no tracking
  { name: 'blinkgo-theme', type: 'localStorage', category: 'preferences', purpose: 'Theme preference (light/dark/system)', retention: 'Until cleared', setBy: 'BlinkGo' },
  { name: 'blinkgo-cart', type: 'localStorage', category: 'strictly_necessary', purpose: 'Cart contents', retention: 'Until cleared', setBy: 'BlinkGo' },
  { name: 'blinkgo-sound-enabled', type: 'localStorage', category: 'preferences', purpose: 'Sound notification preference', retention: 'Until cleared', setBy: 'BlinkGo' },
  { name: 'blinkgo-search-history', type: 'localStorage', category: 'preferences', purpose: 'Recent search queries', retention: 'Until cleared', setBy: 'BlinkGo' },
  { name: 'push-dismissed', type: 'localStorage', category: 'preferences', purpose: 'Push opt-in dismissed state', retention: 'Until cleared', setBy: 'BlinkGo' },

  // No analytics, no marketing scripts in current build
  { name: '—', type: 'third-party-script', category: 'analytics', purpose: 'Kein Analyse-Tracking aktiv (kein Google Analytics, kein Matomo, kein Plausible)', retention: '—', setBy: '—' },
  { name: '—', type: 'third-party-script', category: 'marketing', purpose: 'Kein Marketing-Tracking aktiv (kein Facebook Pixel, kein Google Ads)', retention: '—', setBy: '—' },
];

const CATEGORY_LABELS = {
  de: {
    strictly_necessary: 'Technisch notwendig',
    preferences: 'Präferenzen',
    analytics: 'Statistik',
    marketing: 'Marketing',
    unknown: 'Unbekannt (wird blockiert)',
    title: 'Cookies und Tracking',
    intro: 'Diese Seite listet alle Cookies, localStorage-Einträge und Tracking-Skripte auf, die in der aktuellen Version von BlinkGo verwendet werden.',
    note: 'BlinkGo setzt in der aktuellen Version KEINE Tracking- oder Analyse-Tools ein. Daher ist keine Einwilligungs-Banner-Funktion erforderlich. Sollte sich dies ändern, wird diese Seite aktualisiert und ein DSGVO-konformes Einwilligungs-System implementiert.',
  },
  en: {
    strictly_necessary: 'Strictly necessary',
    preferences: 'Preferences',
    analytics: 'Analytics',
    marketing: 'Marketing',
    unknown: 'Unknown (blocked)',
    title: 'Cookies and Tracking',
    intro: 'This page lists every cookie, localStorage entry, and tracking script used by the current version of BlinkGo.',
    note: 'BlinkGo does NOT use any tracking or analytics tools in the current version. Therefore, no consent banner is required. If this changes, this page will be updated and a GDPR-compliant consent system will be implemented.',
  },
  ar: {
    strictly_necessary: 'ضروري تقنياً',
    preferences: 'تفضيلات',
    analytics: 'إحصائيات',
    marketing: 'تسويق',
    unknown: 'غير معروف (محظور)',
    title: 'ملفات تعريف الارتباط والتتبع',
    intro: 'تسرد هذه الصفحة جميع ملفات تعريف الارتباط وإدخالات localStorage وسكربتات التتبع المستخدمة في الإصدار الحالي من BlinkGo.',
    note: 'لا تستخدم BlinkGo في الإصدار الحالي أي أدوات تتبع أو تحليل. لذلك لا يلزم وجود شريط موافقة.',
  },
} as const;

export default function CookiesPage() {
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale = getServerLocale(cookieHeader) as 'de' | 'ar' | 'en';
  const c = getDisplayCompanyInfo();
  const labels = CATEGORY_LABELS[locale] || CATEGORY_LABELS.de;
  const isDraft = c.legalReviewStatus !== 'APPROVED';

  return (
    <article>
      {isDraft && <LegalBanner />}
      <h1 className="text-3xl font-bold mb-4">{labels.title}</h1>
      <p className="text-sm mb-4">{labels.intro}</p>
      <p className="text-sm italic text-gray-600 mb-6">{labels.note}</p>

      <table className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
        <thead className="bg-gray-100 dark:bg-gray-900">
          <tr>
            <th className="text-start p-2">Name</th>
            <th className="text-start p-2">Typ</th>
            <th className="text-start p-2">Kategorie</th>
            <th className="text-start p-2">Zweck</th>
            <th className="text-start p-2">Speicherdauer</th>
            <th className="text-start p-2">Gesetzt von</th>
          </tr>
        </thead>
        <tbody>
          {COOKIES.map((entry, i) => (
            <tr key={i} className="border-t border-gray-200 dark:border-gray-800">
              <td className="p-2 font-mono text-xs">{entry.name}</td>
              <td className="p-2">{entry.type}</td>
              <td className="p-2">{labels[entry.category]}</td>
              <td className="p-2">{entry.purpose}</td>
              <td className="p-2 text-xs">{entry.retention}</td>
              <td className="p-2 text-xs">{entry.setBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
