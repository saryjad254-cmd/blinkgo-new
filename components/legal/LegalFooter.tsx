'use client';

/**
 * Legal footer — present on every legal page.
 * Lists required legal links, version, and last-updated date.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tr, useI18n } from '@/lib/i18n/I18nProvider';

const FALLBACK_LINKS = {
  de: {
    impressum: 'Impressum',
    datenschutz: 'Datenschutzerklärung',
    agb: 'AGB',
    widerruf: 'Widerrufsbelehrung',
    cookies: 'Cookies',
    dataRequest: 'Datenschutz-Anfrage',
    rightsReserved: 'Alle Rechte vorbehalten.',
    draft: 'Dieser Text ist ein Entwurf und bedarf der Prüfung durch einen spezialisierten Rechtsanwalt.',
  },
  en: {
    impressum: 'Legal Notice',
    datenschutz: 'Privacy Policy',
    agb: 'Terms & Conditions',
    widerruf: 'Right of Withdrawal',
    cookies: 'Cookies',
    dataRequest: 'Data Subject Request',
    rightsReserved: 'All rights reserved.',
    draft: 'This text is a draft and awaits review by a specialized lawyer.',
  },
  ar: {
    impressum: 'بيانات الناشر',
    datenschutz: 'سياسة الخصوصية',
    agb: 'الشروط والأحكام',
    widerruf: 'حق الانسحاب',
    cookies: 'ملفات تعريف الارتباط',
    dataRequest: 'طلب خصوصية البيانات',
    rightsReserved: 'جميع الحقوق محفوظة.',
    draft: 'هذا النص مسودة وينتظر المراجعة من قبل محامٍ متخصص.',
  },
};

export function LegalFooter({ locale = 'de' }: { locale?: 'de' | 'ar' | 'en' }) {
  const { locale: contextLocale, t } = useI18n();
  const detected = contextLocale || locale;
  const fb: typeof FALLBACK_LINKS.de = FALLBACK_LINKS[detected] || FALLBACK_LINKS.de;
  const translated = (path: string, fallback: string) => {
    const value = tr(t, path);
    return value === path ? fallback : value;
  };
  const labels = {
    impressum: translated('legal.link.impressum', fb.impressum),
    datenschutz: translated('legal.link.datenschutz', fb.datenschutz),
    agb: translated('legal.link.agb', fb.agb),
    widerruf: translated('legal.link.widerruf', fb.widerruf),
    cookies: translated('legal.link.cookies', fb.cookies),
    dataRequest: translated('legal.link.dataRequest', fb.dataRequest),
    rightsReserved: fb.rightsReserved,
    draft: fb.draft,
  };

  // v82: avoid hydration mismatch from server vs client time skew by reading the
  // year on the client. We render a stable placeholder on the server and swap
  // it in via a small effect — the user never sees a flicker because we mount
  // before paint and the text is identical for the first frame.
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setYear(new Date().getFullYear()); });
    return () => { cancelled = true; };
  }, []);
  const links = [
    { href: '/legal/impressum', label: labels.impressum },
    { href: '/legal/datenschutz', label: labels.datenschutz },
    { href: '/legal/agb', label: labels.agb },
    { href: '/legal/widerruf', label: labels.widerruf },
    { href: '/legal/cookies', label: labels.cookies },
    { href: '/legal/data-request', label: labels.dataRequest },
  ];

  return (
    <footer
      role="contentinfo"
      className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 mt-12"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <nav aria-label={detected === 'ar' ? 'الإشعارات القانونية' : detected === 'en' ? 'Legal notices' : 'Rechtliche Hinweise'} className="mb-6">
          <h2 className="sr-only">{detected === 'ar' ? 'الإشعارات القانونية' : detected === 'en' ? 'Legal notices' : 'Rechtliche Hinweise'}</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-gray-700 dark:text-gray-300 hover:text-brand-red underline-offset-2 hover:underline focus:underline focus:outline-none"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
          <p>© {year ?? ''}{year ? ' ' : ''}BlinkGo. {labels.rightsReserved}</p>
          <p className="italic">{labels.draft}</p>
        </div>
      </div>
    </footer>
  );
}
