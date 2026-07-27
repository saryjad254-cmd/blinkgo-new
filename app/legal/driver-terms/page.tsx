/**
 * Driver Contractual Information
 * ──────────────────────────────
 * DRAFT — placeholder for driver contract area. Real driver
 * contracts are signed per-individual and out of scope of
 * public website.
 */

import { LegalBanner } from '@/components/legal/LegalBanner';
import { getDisplayCompanyInfo } from '@/lib/legal/company-info';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default function DriverTermsPage() {
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale = getServerLocale(cookieHeader) as 'de' | 'ar' | 'en';
  const c = getDisplayCompanyInfo();
  const isDraft = c.legalReviewStatus !== 'APPROVED';

  return (
    <article>
      {isDraft && <LegalBanner />}
      <h1 className="text-3xl font-bold mb-4">
        {locale === 'ar' ? 'معلومات عقد السائق' : locale === 'en' ? 'Driver Contractual Information' : 'Fahrer-Vertragsinformationen'}
      </h1>
      <p className="text-sm mb-4">
        {locale === 'ar'
          ? 'يتم إبرام عقود السائقين بشكل فردي خارج الموقع. هذه الصفحة توفر معلومات عامة عن العلاقة التعاقدية.'
          : locale === 'en'
          ? 'Driver contracts are concluded individually outside the website. This page provides general information about the contractual relationship.'
          : 'Fahrerverträge werden individuell außerhalb der Website geschlossen. Diese Seite bietet allgemeine Informationen zum Vertragsverhältnis.'}
      </p>

      <div className="text-sm space-y-3">
        <h2 className="text-lg font-semibold">{locale === 'ar' ? 'حالة التوظيف' : locale === 'en' ? 'Employment status' : 'Beschäftigungsstatus'}</h2>
        <p>
          {locale === 'ar'
            ? 'يعمل السائقون في BlinkGo كمقاولين مستقلين (Freelancer) أو كعمال بأجر حسب الترتيب الفردي. لا تنشئ هذه المنصة تلقائياً علاقة عمل.'
            : locale === 'en'
            ? 'Drivers on BlinkGo work as independent contractors (Freelancer) or as employees, depending on the individual arrangement. This platform does not automatically create an employment relationship.'
            : 'Fahrer bei BlinkGo arbeiten als selbständige Auftragnehmer (Freelancer) oder als Arbeitnehmer, je nach individueller Vereinbarung. Diese Plattform begründet nicht automatisch ein Arbeitsverhältnis.'}
        </p>

        <h2 className="text-lg font-semibold">{locale === 'ar' ? 'هيكل الأجر' : locale === 'en' ? 'Compensation structure' : 'Vergütungsstruktur'}</h2>
        <ul className="list-disc ps-5 space-y-1">
          <li>{locale === 'ar' ? 'رسوم توصيل لكل طلب' : locale === 'en' ? 'Per-order delivery fee' : 'Liefergebühr pro Bestellung'}</li>
          <li>{locale === 'ar' ? 'إكراميات العميل (100% للسائق)' : locale === 'en' ? 'Customer tips (100% to driver)' : 'Kundentrinkgelder (100 % an Fahrer)'}</li>
          <li>{locale === 'ar' ? 'مكافآت الأداء' : locale === 'en' ? 'Performance bonuses' : 'Leistungsboni'}</li>
        </ul>

        <h2 className="text-lg font-semibold">{locale === 'ar' ? 'معالجة البيانات' : locale === 'en' ? 'Data processing' : 'Datenverarbeitung'}</h2>
        <p>
          {locale === 'ar'
            ? 'تتم معالجة بيانات الموقع المباشر فقط عندما يكون السائق في حالة "متصل" وقبوله طلباً. راجع /legal/datenschutz للتفاصيل.'
            : locale === 'en'
            ? 'Live location is processed only when the driver is in "online" state and has accepted an order. See /legal/datenschutz for details.'
            : 'Live-Standortdaten werden nur verarbeitet, wenn sich der Fahrer im Status "online" befindet und eine Bestellung angenommen hat. Details unter /legal/datenschutz.'}
        </p>

        <p className="italic text-gray-600 mt-4">
          {locale === 'ar'
            ? 'للاستفسار عن عقد السائق: ' + c.legalEmail
            : locale === 'en'
            ? 'For driver contract inquiries: ' + c.legalEmail
            : 'Für Fahrer-Vertragsanfragen: ' + c.legalEmail}
        </p>
      </div>
    </article>
  );
}
