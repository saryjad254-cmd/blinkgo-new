/**
 * Impressum (§ 5 DDG, German Digital Services Act)
 * ──────────────────────────────────────────
 *
 * DRAFT — requires review and approval by a German Rechtsanwalt
 * specialized in IT/E-commerce law before production launch.
 *
 * Required fields come from lib/legal/company-info.ts which reads
 * from environment variables. Missing fields are displayed as
 * placeholders that make the missing state obvious.
 *
 * The check `LEGAL_REVIEW_STATUS=APPROVED` must be set in env
 * before this page is allowed to be served in production without
 * the draft banner.
 */

import { getDisplayCompanyInfo } from '@/lib/legal/company-info';
import { LegalBanner } from '@/components/legal/LegalBanner';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const COPY = {
  de: {
    title: 'Impressum',
    subtitle: 'Angaben gemäß § 5 DDG',
    sections: {
      company: 'Anbieter und verantwortlich für den Inhalt',
      contact: 'Kontakt',
      register: 'Registereintrag',
      vat: 'Umsatzsteuer-Identifikationsnummer',
      tax: 'Steuernummer',
      editorial: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV',
      supervisory: 'Zuständige Aufsichtsbehörde',
      service: 'Dienstleistungsbeschreibung',
      area: 'Tätigkeitsgebiet',
      hours: 'Erreichbarkeit',
      dispute: 'Streitschlichtung',
      eu: 'Verbraucherstreitbeilegung',
      arbitration: 'Bereitschaft zur Verbraucherschlichtung',
      liability: 'Haftung für Inhalte',
      links: 'Haftung für Links',
      copyright: 'Urheberrecht',
      contract: 'Vertragspartner',
    },
    notes: {
      liability:
        'Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.',
      links:
        'Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.',
      copyright:
        'Die durch den Anbieter erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.',
      eu:
        'Die frühere EU-Plattform zur Online-Streitbeilegung wurde zum 20. Juli 2025 eingestellt. Angaben zur Teilnahme an einem Verfahren vor einer Verbraucherschlichtungsstelle richten sich nach dem Verbraucherstreitbeilegungsgesetz und der unten genannten Erklärung.',
    },
  },
  en: {
    title: 'Legal Notice (Impressum)',
    subtitle: 'Information pursuant to § 5 DDG (German Digital Services Act)',
    sections: {
      company: 'Service provider and content responsible',
      contact: 'Contact',
      register: 'Commercial register entry',
      vat: 'VAT identification number',
      tax: 'Tax number',
      editorial: 'Editorial responsibility (§ 18 (2) MStV)',
      supervisory: 'Supervisory authority',
      service: 'Service description',
      area: 'Operating area',
      hours: 'Availability',
      dispute: 'Dispute resolution',
      eu: 'Consumer dispute resolution',
      arbitration: 'Consumer arbitration',
      liability: 'Liability for content',
      links: 'Liability for links',
      copyright: 'Copyright',
      contract: 'Contractual partner',
    },
    notes: {
      liability: '[Translation] The contents of our pages were created with great care. However, we cannot guarantee the accuracy, completeness, or timeliness of the content.',
      links: '[Translation] Our website contains links to external third-party websites whose content is beyond our control.',
      copyright: '[Translation] The content and works on these pages are subject to German copyright law.',
      eu: '[Translation] The former EU Online Dispute Resolution platform was discontinued on 20 July 2025. Participation in consumer arbitration follows the German Consumer Dispute Resolution Act and the statement below.',
    },
  },
  ar: {
    title: 'بيانات الناشر (Impressum)',
    subtitle: 'معلومات وفق § 5 من قانون DDG الألماني',
    sections: {
      company: 'مقدم الخدمة والمسؤول عن المحتوى',
      contact: 'بيانات الاتصال',
      register: 'السجل التجاري',
      vat: 'رقم ضريبة القيمة المضافة',
      tax: 'الرقم الضريبي',
      editorial: 'المسؤولية التحريرية (§ 18 MStV)',
      supervisory: 'الجهة الرقابية المختصة',
      service: 'وصف الخدمة',
      area: 'منطقة الخدمة',
      hours: 'ساعات العمل',
      dispute: 'حل النزاعات',
      eu: 'تسوية نزاعات المستهلكين',
      arbitration: 'التحكيم الاستهلاكي',
      liability: 'المسؤولية عن المحتوى',
      links: 'المسؤولية عن الروابط',
      copyright: 'حقوق النشر',
      contract: 'الشريك التعاقدي',
    },
    notes: {
      liability: '[ترجمة] تم إعداد محتوى صفحاتنا بعناية فائقة، لكننا لا نضمن دقتها أو اكتمالها أو حداثتها.',
      links: '[ترجمة] يحتوي موقعنا على روابط لمواقع أطراف ثالثة لا نتحكم في محتواها.',
      copyright: '[ترجمة] تخضع المحتويات والأعمال في هذه الصفحات لقانون حقوق النشر الألماني.',
      eu: '[ترجمة] أُوقفت منصة الاتحاد الأوروبي السابقة لتسوية النزاعات عبر الإنترنت في 20 يوليو 2025. تخضع المشاركة في التحكيم الاستهلاكي للقانون الألماني وللبيان أدناه.',
    },
  },
} as const;

export default async function ImpressumPage() {
  const cookieHeader = (await cookies()).getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale = getServerLocale(cookieHeader) as 'de' | 'ar' | 'en';
  const c = getDisplayCompanyInfo();
  const t = COPY[locale] || COPY.de;

  const isDraft = c.legalReviewStatus !== 'APPROVED';

  return (
    <article>
      {isDraft && <LegalBanner />}

      <header className="mb-8">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t.subtitle}</p>
        {c.lastUpdatedISO && (
          <p className="text-xs text-gray-500 mt-2">
            {locale === 'ar' ? 'آخر تحديث' : locale === 'en' ? 'Last updated' : 'Stand'}: {c.lastUpdatedISO}
          </p>
        )}
      </header>

      <Section title={t.sections.company}>
        <p className="font-semibold">{c.legalName}</p>
        {c.legalForm && c.legalForm !== 'other' && (
          <p className="text-sm text-gray-600">({c.legalForm.toUpperCase()})</p>
        )}
        {c.tradeName && c.tradeName !== c.legalName && (
          <p className="text-sm">
            {locale === 'ar' ? 'العلامة التجارية' : locale === 'en' ? 'Trading as' : 'Handelnd unter'}: {c.tradeName}
          </p>
        )}
      </Section>

      <Section title={t.sections.contact}>
        <p>{c.proprietorOrDirector}</p>
        <p>{c.streetAddress}</p>
        <p>{c.postalCode} {c.city}</p>
        <p>{c.country}</p>
        {c.phone && <p>{locale === 'ar' ? 'هاتف' : locale === 'en' ? 'Phone' : 'Telefon'}: {c.phone}</p>}
        <p>
          E-Mail: <a href={`mailto:${c.supportEmail}`} className="text-brand-red underline">{c.supportEmail}</a>
        </p>
        {c.legalEmail && (
          <p>
            {locale === 'ar' ? 'البريد القانوني' : locale === 'en' ? 'Legal contact' : 'Rechtlicher Kontakt'}:{' '}
            <a href={`mailto:${c.legalEmail}`} className="text-brand-red underline">{c.legalEmail}</a>
          </p>
        )}
      </Section>

      {(c.commercialRegister || c.registerCourt || c.registrationNumber) && (
        <Section title={t.sections.register}>
          {c.registerCourt && <p>{c.registerCourt}</p>}
          {c.registrationNumber && <p>{c.registrationNumber}</p>}
          {c.commercialRegister && <p className="text-sm text-gray-600">{c.commercialRegister}</p>}
        </Section>
      )}

      {c.vatId && <Section title={t.sections.vat}><p>{c.vatId}</p></Section>}
      {c.taxNumber && <Section title={t.sections.tax}><p>{c.taxNumber}</p></Section>}

      {c.editorialResponsible && (
        <Section title={t.sections.editorial}>
          <p>{c.editorialResponsible}</p>
        </Section>
      )}

      {c.supervisoryAuthority && (
        <Section title={t.sections.supervisory}>
          <p>{c.supervisoryAuthority}</p>
        </Section>
      )}

      <Section title={t.sections.service}>
        <p>{c.serviceType}</p>
      </Section>

      {c.serviceArea && <Section title={t.sections.area}><p>{c.serviceArea}</p></Section>}

      {c.businessHours && <Section title={t.sections.hours}><p>{c.businessHours}</p></Section>}

      <Section title={t.sections.dispute}>
        <p className="text-sm">{t.notes.eu}</p>
        {c.consumerArbitration && (
          <p className="mt-1 text-sm">{c.consumerArbitration}</p>
        )}
      </Section>

      <Section title={t.sections.liability}>
        <p className="text-sm">{t.notes.liability}</p>
      </Section>

      <Section title={t.sections.links}>
        <p className="text-sm">{t.notes.links}</p>
      </Section>

      <Section title={t.sections.copyright}>
        <p className="text-sm">{t.notes.copyright}</p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-2 border-b border-gray-200 dark:border-gray-800 pb-1">{title}</h2>
      <div className="text-sm space-y-1">{children}</div>
    </section>
  );
}
