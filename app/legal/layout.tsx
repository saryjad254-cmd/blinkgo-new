import { getServerLocale } from '@/lib/i18n/server-translations';
import { LegalFooter } from '@/components/legal/LegalFooter';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const cookieHeader = require('next/headers').cookies().getAll().map((c: any) => `${c.name}=${c.value}`).join('; ');
  const locale = getServerLocale(cookieHeader);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-gray-700 dark:text-gray-300 hover:text-brand-red inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-brand-red rounded px-2 py-1"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            {locale === 'ar' ? 'العودة' : locale === 'en' ? 'Back to BlinkGo' : 'Zurück zu BlinkGo'}
          </Link>
          <h1 className="text-base font-semibold">
            {locale === 'ar' ? 'المركز القانوني' : locale === 'en' ? 'Legal Center' : 'Rechtliches'}
          </h1>
          <div className="w-20" /> {/* spacer */}
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">{children}</div>
      </main>

      <LegalFooter locale={locale} />
    </div>
  );
}
