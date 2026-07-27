/**
 * Datenschutzerklärung (Privacy Policy)
 * ─────────────────────────────────────
 *
 * DRAFT — generated based on the actual data processing found in
 * the BlinkGo source code. Requires review and approval by a
 * Datenschutzbeauftragter or specialized German lawyer before
 * commercial launch.
 *
 * Sections reflect the actual integrations in the codebase:
 *   - Supabase (PostgreSQL, Auth, Realtime, Storage) — Frankfurt or
 *     other EU region, depending on tenant configuration
 *   - Resend (transactional email, only when RESEND_API_KEY set)
 *   - Google Maps (only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set)
 *   - Stripe (only when STRIPE_SECRET_KEY set)
 *
 * Driver live-location and customer delivery address processing
 * is explicitly documented with legal-basis candidate, retention,
 * and purpose limitation.
 */

import { getDisplayCompanyInfo } from '@/lib/legal/company-info';
import { LegalBanner } from '@/components/legal/LegalBanner';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const SECTION_TITLES = {
  de: {
    intro: '1. Überblick',
    controller: '2. Verantwortlicher',
    dpo: '3. Datenschutzbeauftragter',
    purposes: '4. Zwecke und Rechtsgrundlagen',
    dataCategories: '5. Kategorien personenbezogener Daten',
    recipients: '6. Empfänger und Auftragsverarbeiter',
    transfers: '7. Internationale Datenübermittlungen',
    retention: '8. Speicherdauer',
    rights: '9. Ihre Rechte als Betroffener',
    security: '10. Sicherheitsmaßnahmen',
    automated: '11. Automatisierte Entscheidungsfindung und Profiling',
    cookies: '12. Cookies und ähnliche Technologien',
    changes: '13. Änderungen dieser Datenschutzerklärung',
    requiredOptional: '14. Pflichtangaben und freiwillige Angaben',
    driverLocation: '15. Standortdaten der Fahrer',
    customerLocation: '16. Lieferadressen der Kunden',
  },
  en: {
    intro: '1. Overview',
    controller: '2. Data Controller',
    dpo: '3. Data Protection Officer',
    purposes: '4. Purposes and legal bases',
    dataCategories: '5. Categories of personal data',
    recipients: '6. Recipients and processors',
    transfers: '7. International data transfers',
    retention: '8. Retention period',
    rights: '9. Your rights as a data subject',
    security: '10. Security measures',
    automated: '11. Automated decision-making and profiling',
    cookies: '12. Cookies and similar technologies',
    changes: '13. Changes to this privacy policy',
    requiredOptional: '14. Required and voluntary data',
    driverLocation: '15. Driver location data',
    customerLocation: '16. Customer delivery addresses',
  },
  ar: {
    intro: '1. نظرة عامة',
    controller: '2. مسؤول البيانات',
    dpo: '3. مسؤول حماية البيانات',
    purposes: '4. الأغراض والأسس القانونية',
    dataCategories: '5. فئات البيانات الشخصية',
    recipients: '6. المستلمون والمعالجون',
    transfers: '7. نقل البيانات دولياً',
    retention: '8. مدة الاحتفاظ',
    rights: '9. حقوقك كصاحب بيانات',
    security: '10. الإجراءات الأمنية',
    automated: '11. اتخاذ القرار الآلي',
    cookies: '12. ملفات تعريف الارتباط',
    changes: '13. التغييرات في سياسة الخصوصية',
    requiredOptional: '14. البيانات الإلزامية والطوعية',
    driverLocation: '15. بيانات موقع السائقين',
    customerLocation: '16. عناوين توصيل العملاء',
  },
} as const;

export default function DatenschutzPage() {
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale = getServerLocale(cookieHeader) as 'de' | 'ar' | 'en';
  const c = getDisplayCompanyInfo();
  const t = SECTION_TITLES[locale] || SECTION_TITLES.de;
  const isDraft = c.legalReviewStatus !== 'APPROVED';

  // Detect actual integrations
  const hasStripe = !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_REPLACE_ME';
  const hasMaps = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const hasEmail = !!process.env.RESEND_API_KEY;

  return (
    <article>
      {isDraft && <LegalBanner />}

      <header className="mb-8">
        <h1 className="text-3xl font-bold">
          {locale === 'ar' ? 'سياسة الخصوصية' : locale === 'en' ? 'Privacy Policy' : 'Datenschutzerklärung'}
        </h1>
        {c.lastUpdatedISO && (
          <p className="text-xs text-gray-500 mt-2">
            {locale === 'ar' ? 'آخر تحديث' : locale === 'en' ? 'Last updated' : 'Stand'}: {c.lastUpdatedISO}
          </p>
        )}
      </header>

      <Section title={t.intro}>
        <p className="text-sm">
          {locale === 'ar'
            ? 'تحترم BlinkGo خصوصيتك. توضح هذه السياسة البيانات الشخصية التي نجمعها، وأغراضها، وأسسها القانونية، وحقوقك.'
            : locale === 'en'
            ? 'BlinkGo respects your privacy. This policy describes what personal data we collect, for what purposes, on what legal basis, and what rights you have.'
            : 'BlinkGo nimmt den Schutz deiner persönlichen Daten sehr ernst. Diese Erklärung beschreibt, welche personenbezogenen Daten wir erheben, zu welchen Zwecken, auf welcher Rechtsgrundlage und welche Rechte du als Betroffener hast.'}
        </p>
      </Section>

      <Section title={t.controller}>
        <p className="text-sm">
          {locale === 'ar' ? 'الجهة المسؤولة' : locale === 'en' ? 'Data controller' : 'Verantwortlicher'}: {c.dataControllerName}
        </p>
        <p className="text-sm">{c.streetAddress}, {c.postalCode} {c.city}, {c.country}</p>
        <p className="text-sm">E-Mail: <a href={`mailto:${c.legalEmail || c.supportEmail}`} className="text-brand-red underline">{c.legalEmail || c.supportEmail}</a></p>
      </Section>

      {c.dataProtectionContact && (
        <Section title={t.dpo}>
          <p className="text-sm">{c.dataProtectionContact}</p>
        </Section>
      )}

      <Section title={t.purposes}>
        <ul className="list-disc ps-5 text-sm space-y-1">
          <li>{locale === 'ar' ? 'معالجة الطلبات وتنفيذها' : locale === 'en' ? 'Processing and fulfilling orders' : 'Verarbeitung und Erfüllung von Bestellungen'} <em>(Art. 6(1)(b) DSGVO — Vertragserfüllung)</em></li>
          <li>{locale === 'ar' ? 'إدارة الحساب والمصادقة' : locale === 'en' ? 'Account management and authentication' : 'Kontoverwaltung und Authentifizierung'} <em>(Art. 6(1)(b)/(f) DSGVO)</em></li>
          <li>{locale === 'ar' ? 'تتبع التسليم في الوقت الحقيقي' : locale === 'en' ? 'Real-time delivery tracking' : 'Echtzeit-Lieferverfolgung'} <em>(Art. 6(1)(b) DSGVO)</em></li>
          <li>{locale === 'ar' ? 'الدفع ومعالجة المبالغ المستردة' : locale === 'en' ? 'Payment and refund processing' : 'Zahlung und Rückerstattung'} <em>(Art. 6(1)(b) DSGVO)</em></li>
          <li>{locale === 'ar' ? 'حماية من الاحتيال وضمان السلامة' : locale === 'en' ? 'Fraud prevention and safety' : 'Betrugsprävention und Sicherheit'} <em>(Art. 6(1)(f) DSGVO — berechtigtes Interesse)</em></li>
          <li>{locale === 'ar' ? 'الامتثال للالتزامات القانونية (مثل الاحتفاظ بالفواتير)' : locale === 'en' ? 'Legal compliance (e.g. invoice retention)' : 'Erfüllung gesetzlicher Pflichten (z.B. Rechnungsaufbewahrung)'} <em>(Art. 6(1)(c) DSGVO)</em></li>
        </ul>
      </Section>

      <Section title={t.dataCategories}>
        <p className="text-sm">
          {locale === 'ar'
            ? 'تشمل البيانات التي نعالجها ما يلي: الاسم، البريد الإلكتروني، رقم الهاتف، عنوان التسليم، بيانات اعتماد المصادقة (تجزئات كلمات المرور)، سجل الطلبات، تفضيلات النظام الغذائي، بيانات الفواتير (عند استخدام الدفع الإلكتروني)، مراجع الدفع، بيانات الموقع المباشر للسائقين (عند العمل)، توكنات الإشعارات، رسائل الدعم، وسجلات الوصول/الأمان.'
            : locale === 'en'
            ? 'Data we process includes: name, email, phone, delivery address, authentication credentials (password hashes), order history, dietary preferences, billing data (for online payments), payment references, live location of drivers while on shift, notification tokens, support messages, and security/access logs.'
            : 'Zu den verarbeiteten Daten gehören: Name, E-Mail, Telefonnummer, Lieferadresse, Authentifizierungsdaten (Passwort-Hashes), Bestellverlauf, Ernährungspräferenzen, Rechnungsdaten (bei Online-Zahlung), Zahlungsreferenzen, Live-Standort der Fahrer während der Schicht, Benachrichtigungs-Tokens, Support-Nachrichten sowie Sicherheits-/Zugriffsprotokolle.'}
        </p>
      </Section>

      <Section title={t.recipients}>
        <ul className="list-disc ps-5 text-sm space-y-1">
          <li><strong>Supabase (PostgreSQL, Auth, Realtime, Storage)</strong> — {locale === 'ar' ? 'مضيف قاعدة البيانات والمصادقة' : locale === 'en' ? 'Database and authentication host' : 'Datenbank- und Authentifizierungs-Hoster'}</li>
          <li><strong>Stripe</strong> — {locale === 'ar' ? 'معالجة الدفع (عند التكامل)' : locale === 'en' ? 'Payment processor (when wired)' : 'Zahlungsabwickler (sofern integriert)'}{hasStripe ? '' : ` (${locale === 'ar' ? 'غير مفعل' : locale === 'en' ? 'not active' : 'nicht aktiv'})`}</li>
          <li><strong>Google Maps Platform</strong> — {locale === 'ar' ? 'الترميز الجغرافي وعرض الخرائط' : locale === 'en' ? 'Geocoding and map display' : 'Geocoding und Kartendarstellung'}{hasMaps ? '' : ` (${locale === 'ar' ? 'غير مفعل' : locale === 'en' ? 'not active' : 'nicht aktiv'})`}</li>
          <li><strong>Resend</strong> — {locale === 'ar' ? 'إرسال البريد الإلكتروني' : locale === 'en' ? 'Email delivery' : 'E-Mail-Versand'}{hasEmail ? '' : ` (${locale === 'ar' ? 'غير مفعل' : locale === 'en' ? 'not active' : 'nicht aktiv'})`}</li>
          <li><strong>Cloudflare</strong> — {locale === 'ar' ? 'وكيل عكسي وحماية DDoS' : locale === 'en' ? 'Reverse proxy and DDoS protection' : 'Reverse Proxy und DDoS-Schutz'}</li>
        </ul>
        <p className="text-sm mt-2 italic text-gray-600">
          {locale === 'ar'
            ? 'مفاصيل المعالجات الكاملة متاحة في docs/compliance/VENDOR_REGISTER.md'
            : locale === 'en'
            ? 'Full processor details in docs/compliance/VENDOR_REGISTER.md'
            : 'Vollständige Auftragsverarbeiter-Details in docs/compliance/VENDOR_REGISTER.md'}
        </p>
      </Section>

      <Section title={t.transfers}>
        <p className="text-sm">
          {locale === 'ar'
            ? 'تستضيف Supabase البيانات في منطقة الاتحاد الأوروبي. قد يقوم موفرو الخدمات الآخرون (مثل Google Maps و Stripe و Resend) بنقل البيانات إلى بلدان ثالثة. في هذه الحالة نعتمد على البنود التعاقدية المعيارية (SCCs) أو قرارات الملاءمة الصادرة عن المفوضية الأوروبية. لا ندعي أن جميع البيانات تظل في الاتحاد الأوروبي أو المنطقة الاقتصادية الأوروبية دون التحقق من الاتفاقيات ذات الصلة.'
            : locale === 'en'
            ? 'Supabase hosts data in an EU region. Other service providers (such as Google Maps, Stripe, Resend) may transfer data to third countries. In these cases we rely on Standard Contractual Clauses (SCCs) or adequacy decisions issued by the European Commission. We do not claim that all data remains in the EU/EEA without verifying the relevant agreements.'
            : 'Supabase hostet Daten in einer EU-Region. Andere Dienstleister (z.B. Google Maps, Stripe, Resend) können Daten in Drittländer übermitteln. In diesen Fällen stützen wir uns auf Standardvertragsklauseln (SCC) oder Angemessenheitsbeschlüsse der Europäischen Kommission. Wir behaupten nicht, dass alle Daten in der EU/EWR verbleiben, ohne die entsprechenden Vereinbarungen zu verifizieren.'}
        </p>
      </Section>

      <Section title={t.retention}>
        <p className="text-sm">
          {locale === 'ar'
            ? 'نحتفظ بالبيانات فقط طالما كان ذلك ضرورياً للغرض المعني أو للوفاء بالالتزامات القانونية (مثلاً الاحتفاظ بالفواتير 10 سنوات وفق § 147 AO الألماني). يتم حذف بيانات الموقع المباشر للسائقين تلقائياً بعد اكتمال عملية التسليم. التفاصيل الكاملة في docs/compliance/RETENTION_MATRIX.md.'
            : locale === 'en'
            ? 'We retain data only as long as necessary for the relevant purpose or to meet legal obligations (e.g. invoice retention for 10 years under § 147 of the German Fiscal Code). Driver live location data is automatically deleted after the delivery workflow ends. Full details in docs/compliance/RETENTION_MATRIX.md.'
            : 'Wir speichern Daten nur so lange, wie es für den jeweiligen Zweck oder zur Erfüllung gesetzlicher Pflichten erforderlich ist (z.B. 10 Jahre Rechnungsaufbewahrung gem. § 147 AO). Live-Standortdaten von Fahrern werden nach Abschluss des Liefervorgangs automatisch gelöscht. Vollständige Details in docs/compliance/RETENTION_MATRIX.md.'}
        </p>
      </Section>

      <Section title={t.rights}>
        <p className="text-sm">
          {locale === 'ar'
            ? 'يحق لك: الوصول إلى بياناتك (Art. 15)، تصحيحها (Art. 16)، محوها (Art. 17)، تقييد معالجتها (Art. 18)، قابلية نقل البيانات (Art. 20)، الاعتراض على المعالجة (Art. 21)، وسحب الموافقة (Art. 7(3)). كما يحق لك تقديم شكوى إلى السلطة الإشرافية المختصة.'
            : locale === 'en'
            ? 'You have the right to: access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20), object (Art. 21), and withdraw consent (Art. 7(3)). You also have the right to lodge a complaint with the competent supervisory authority.'
            : 'Du hast das Recht auf: Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21) und Widerruf der Einwilligung (Art. 7(3)). Außerdem hast du das Recht, Beschwerde bei der zuständigen Aufsichtsbehörde einzulegen.'}
        </p>
        <p className="text-sm mt-2">
          {locale === 'ar' ? 'لممارسة حقوقك' : locale === 'en' ? 'To exercise your rights' : 'Zur Ausübung deiner Rechte'}:{' '}
          <a href="/legal/data-request" className="text-brand-red underline">
            {locale === 'ar' ? 'نموذج طلب البيانات' : locale === 'en' ? 'Data Subject Request form' : 'Antrag auf Auskunft / Löschung'}
          </a>
        </p>
      </Section>

      <Section title={t.driverLocation}>
        <p className="text-sm">
          {locale === 'ar'
            ? 'تُجمع بيانات الموقع المباشر للسائقين فقط عندما يكون السائق في حالة "متصل" وقبوله طلباً. تتوقف عملية التتبع تلقائياً بعد اكتمال التسليم. تُحفظ إحداثيات GPS الدقيقة لمدة أقصاها 24 ساعة لأغراض استكشاف الأخطاء وإصلاحها ثم يتم حذفها.'
            : locale === 'en'
            ? 'Driver live location is collected only when the driver is in the "online" state and has accepted an order. Tracking stops automatically after delivery completion. Precise GPS coordinates are retained for at most 24 hours for troubleshooting and then deleted.'
            : 'Der Live-Standort von Fahrern wird nur erfasst, wenn sich der Fahrer im Status "online" befindet und eine Bestellung angenommen hat. Die Verfolgung endet automatisch nach Abschluss der Lieferung. Präzise GPS-Koordinaten werden maximal 24 Stunden zur Fehlerbehebung gespeichert und anschließend gelöscht.'}
        </p>
      </Section>

      <Section title={t.customerLocation}>
        <p className="text-sm">
          {locale === 'ar'
            ? 'تكون عناوين التسليم للعملاء مرئية فقط للسائق المعني والمطعم المعني. لا نشاركها مع أطراف ثالثة لأغراض تسويقية. بعد اكتمال التسليم، يبقى العنوان مسجلاً في سجل الطلبات للوفاء بالتزامات الفوترة، ولكن الإحداثيات الدقيقة تُحذف.'
            : locale === 'en'
            ? 'Customer delivery addresses are visible only to the assigned driver and restaurant. We do not share them with third parties for marketing purposes. After delivery completion, the address remains in the order record for billing compliance, but precise coordinates are deleted.'
            : 'Lieferadressen von Kunden sind nur dem zugewiesenen Fahrer und dem Restaurant sichtbar. Wir teilen sie nicht zu Marketingzwecken mit Dritten. Nach Abschluss der Lieferung bleibt die Adresse im Bestelldatensatz zur Erfüllung von Abrechnungspflichten, präzise Koordinaten werden jedoch gelöscht.'}
        </p>
      </Section>

      <Section title={t.cookies}>
        <p className="text-sm">
          {locale === 'ar'
            ? 'تستخدم BlinkGo فقط ملفات تعريف الارتباط الضرورية strictly (مثل رمز الجلسة) و localStorage للتفضيلات (اللغة، السمة). لا نستخدم أدوات تتبع أو تحليلات من جهات خارجية في الإصدار الحالي. القائمة الكاملة في /legal/cookies.'
            : locale === 'en'
            ? 'BlinkGo uses only strictly necessary cookies (e.g. session token) and localStorage for preferences (language, theme). We do not use third-party tracking or analytics in the current version. Full list at /legal/cookies.'
            : 'BlinkGo verwendet nur technisch notwendige Cookies (z.B. Session-Token) und localStorage für Einstellungen (Sprache, Theme). Im aktuellen Release werden keine Drittanbieter-Tracker oder Analyse-Tools eingesetzt. Vollständige Liste unter /legal/cookies.'}
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-2 border-b border-gray-200 dark:border-gray-800 pb-1">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
