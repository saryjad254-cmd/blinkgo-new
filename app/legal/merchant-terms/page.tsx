/**
 * Merchant / Restaurant Partner Terms
 * ──────────────────────────────────
 * DRAFT — requires lawyer review.
 */

import { LegalBanner } from '@/components/legal/LegalBanner';
import { getDisplayCompanyInfo } from '@/lib/legal/company-info';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default function MerchantTermsPage() {
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale = getServerLocale(cookieHeader) as 'de' | 'ar' | 'en';
  const c = getDisplayCompanyInfo();
  const isDraft = c.legalReviewStatus !== 'APPROVED';

  return (
    <article>
      {isDraft && <LegalBanner />}
      <h1 className="text-3xl font-bold mb-4">
        {locale === 'ar' ? 'شروط شراكة التاجر / المطعم' : locale === 'en' ? 'Merchant / Restaurant Partner Terms' : 'Händler- / Restaurant-Partner-AGB'}
      </h1>
      <p className="text-sm mb-4">
        {locale === 'ar'
          ? 'تحكم هذه الشروط العلاقة بين BlinkGo والشركاء من المطاعم/التجار. (مسودة - بانتظار المراجعة القانونية)'
          : locale === 'en'
          ? 'These terms govern the relationship between BlinkGo and merchant/restaurant partners. (Draft — awaiting legal review)'
          : 'Diese Bedingungen regeln die Beziehung zwischen BlinkGo und Restaurant-/Händler-Partnern. (Entwurf — Prüfung ausstehend)'}
      </p>
      <div className="text-sm space-y-3">
        <p>{locale === 'ar' ? 'المسودة ستتضمن البنود التالية بعد المراجعة:' : locale === 'en' ? 'The draft will include the following clauses after review:' : 'Der Entwurf wird nach Prüfung folgende Klauseln enthalten:'}</p>
        <ul className="list-disc ps-5 space-y-1">
          <li>{locale === 'ar' ? 'نطاق الخدمات والمسؤوليات' : locale === 'en' ? 'Scope of services and responsibilities' : 'Leistungsumfang und Pflichten'}</li>
          <li>{locale === 'ar' ? 'هيكل العمولة والمدفوعات' : locale === 'en' ? 'Commission and payment structure' : 'Provisionen und Abrechnung'}</li>
          <li>{locale === 'ar' ? 'معالجة الطلبات وأوقات التحضير' : locale === 'en' ? 'Order processing and prep times' : 'Bestellannahme und Zubereitungszeiten'}</li>
          <li>{locale === 'ar' ? 'متطلبات سلامة الأغذية' : locale === 'en' ? 'Food safety requirements' : 'Lebensmittelsicherheit'}</li>
          <li>{locale === 'ar' ? 'توفير المعلومات (الحساسية، المكونات)' : locale === 'en' ? 'Disclosure of ingredients (allergens)' : 'Kennzeichnung (Allergene, Zusatzstoffe)'}</li>
          <li>{locale === 'ar' ? 'ملكية القائمة والتسعير' : locale === 'en' ? 'Menu ownership and pricing' : 'Menü-Eigentum und Preisgestaltung'}</li>
          <li>{locale === 'ar' ? 'التسويق والترويج' : locale === 'en' ? 'Marketing and promotion' : 'Marketing und Werbung'}</li>
          <li>{locale === 'ar' ? 'حماية البيانات (الفواتير، بيانات العملاء)' : locale === 'en' ? 'Data protection (invoices, customer data)' : 'Datenschutz (Rechnungen, Kundendaten)'}</li>
          <li>{locale === 'ar' ? 'مدة العقد وإنهاؤه' : locale === 'en' ? 'Contract duration and termination' : 'Vertragslaufzeit und Kündigung'}</li>
          <li>{locale === 'ar' ? 'القانون المعمول به والاختصاص القضائي' : locale === 'en' ? 'Governing law and jurisdiction' : 'Anwendbares Recht und Gerichtsstand'}</li>
        </ul>
        <p className="italic text-gray-600">
          {locale === 'ar'
            ? 'للوصول إلى النسخة الكاملة: اتصل على ' + c.legalEmail
            : locale === 'en'
            ? 'For the full version, contact: ' + c.legalEmail
            : 'Für die vollständige Version kontaktieren Sie: ' + c.legalEmail}
        </p>
      </div>
    </article>
  );
}
