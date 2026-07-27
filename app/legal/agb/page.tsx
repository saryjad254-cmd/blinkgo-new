/**
 * AGB — Allgemeine Geschäftsbedingungen (Customer Terms)
 * ──────────────────────────────────────────────────────
 *
 * DRAFT — requires review by a German Rechtsanwalt specialized
 * in e-commerce law before production launch.
 *
 * The terms clearly distinguish the BlinkGo business model:
 * BlinkGo operates as a DELIVERY INTERMEDIARY — restaurants /
 * merchants remain the principal sellers of food/products;
 * BlinkGo mediates orders and arranges delivery.
 *
 * Mandatory consumer rights (Widerrufsrecht, etc.) are NOT
 * excluded.
 */

import { getDisplayCompanyInfo } from '@/lib/legal/company-info';
import { LegalBanner } from '@/components/legal/LegalBanner';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const T = {
  de: {
    title: 'Allgemeine Geschäftsbedingungen (AGB)',
    intro: 'Diese AGB gelten für die Nutzung der BlinkGo-Plattform durch Endkunden (Verbraucher).',
    s1: '§ 1 Geltungsbereich und Vertragspartner',
    s2: '§ 2 Vertragsschluss',
    s3: '§ 3 Lieferung und Verfügbarkeit',
    s4: '§ 4 Preise, Liefergebühren und Mindestbestellwert',
    s5: '§ 5 Zahlung',
    s6: '§ 6 Stornierung und Widerruf',
    s7: '§ 7 Reklamationen, fehlende oder beschädigte Ware',
    s8: '§ 8 Haftung',
    s9: '§ 9 Höhere Gewalt',
    s10: '§ 10 Verbotene Nutzung',
    s11: '§ 11 Sperrung und Kündigung des Kontos',
    s12: '§ 12 Anwendbares Recht und Gerichtsstand',
    s13: '§ 13 Verbraucherrechte und Streitbeilegung',
    s14: '§ 14 Schlussbestimmungen',
  },
  en: {
    title: 'General Terms and Conditions',
    intro: 'These T&Cs apply to the use of the BlinkGo platform by end customers (consumers).',
    s1: '§ 1 Scope and contracting parties',
    s2: '§ 2 Conclusion of contract',
    s3: '§ 3 Delivery and availability',
    s4: '§ 4 Prices, delivery fees, and minimum order value',
    s5: '§ 5 Payment',
    s6: '§ 6 Cancellation and withdrawal',
    s7: '§ 7 Complaints, missing or damaged goods',
    s8: '§ 8 Liability',
    s9: '§ 9 Force majeure',
    s10: '§ 10 Prohibited use',
    s11: '§ 11 Account suspension and termination',
    s12: '§ 12 Governing law and jurisdiction',
    s13: '§ 13 Consumer rights and dispute resolution',
    s14: '§ 14 Final provisions',
  },
  ar: {
    title: 'الشروط والأحكام العامة',
    intro: 'تنطبق هذه الشروط على استخدام منصة BlinkGo من قبل العملاء النهائيين (المستهلكين).',
    s1: '§ 1 النطاق والأطراف المتعاقدة',
    s2: '§ 2 إبرام العقد',
    s3: '§ 3 التسليم والتوافر',
    s4: '§ 4 الأسعار ورسوم التوصيل والحد الأدنى للطلب',
    s5: '§ 5 الدفع',
    s6: '§ 6 الإلغاء وحق الانسحاب',
    s7: '§ 7 الشكاوى والبضائع المفقودة أو التالفة',
    s8: '§ 8 المسؤولية',
    s9: '§ 9 القوة القاهرة',
    s10: '§ 10 الاستخدام المحظور',
    s11: '§ 11 تعليق الحساب وإنهاؤه',
    s12: '§ 12 القانون المعمول به والاختصاص القضائي',
    s13: '§ 13 حقوق المستهلك وحل النزاعات',
    s14: '§ 14 أحكام ختامية',
  },
} as const;

export default function AGBPage() {
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale = getServerLocale(cookieHeader) as 'de' | 'ar' | 'en';
  const c = getDisplayCompanyInfo();
  const t = T[locale] || T.de;
  const isDraft = c.legalReviewStatus !== 'APPROVED';

  return (
    <article>
      {isDraft && <LegalBanner />}
      <header className="mb-6">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-sm text-gray-600 mt-1">{t.intro}</p>
      </header>

      <Clause title={t.s1}>
        <p>
          {locale === 'ar'
            ? 'BlinkGo هي منصة وساطة تربط بين العملاء والمطاعم/التجار والسائقين. الطرف التعاقدي للعميل فيما يتعلق بالسلع المباعة هو المطعم أو التاجر المعني. تتولى BlinkGo تشغيل المنصة وتنظيم خدمة التوصيل.'
            : locale === 'en'
            ? 'BlinkGo operates a mediation platform connecting customers with restaurants/merchants and drivers. The customer\'s contractual partner for the goods sold is the respective restaurant or merchant. BlinkGo operates the platform and arranges delivery.'
            : 'BlinkGo betreibt eine Vermittlungsplattform, die Endkunden mit Restaurants/Händlern und Fahrern verbindet. Vertragspartner des Kunden für die verkauften Waren ist das jeweilige Restaurant bzw. der jeweilige Händler. BlinkGo betreibt die Plattform und organisiert die Lieferung.'}
        </p>
      </Clause>

      <Clause title={t.s2}>
        <p>
          {locale === 'ar'
            ? 'يتم تقديم العرض من خلال المطعم. ينعقد العقد عند تأكيد المطعم للطلب. لا يحق للعميل الاعتراض على مكونات الطعام (مثل الحساسية) إلا قبل تأكيد المطعم.'
            : locale === 'en'
            ? 'The offer is made by the restaurant. The contract is concluded when the restaurant confirms the order. The customer may only object to food components (e.g. allergens) before the restaurant confirms.'
            : 'Das Angebot wird durch das Restaurant abgegeben. Der Vertrag kommt zustande, wenn das Restaurant die Bestellung bestätigt. Einwände gegen Speisekomponenten (z.B. Allergene) kann der Kunde nur vor der Restaurantbestätigung erheben.'}
        </p>
      </Clause>

      <Clause title={t.s3}>
        <p>
          {locale === 'ar'
            ? 'الوقت المتوقع للتسليم هو تقدير فقط ولا يمثل التزاماً زمنياً صارماً. يجب أن يكون العميل متاحاً في عنوان التسليم خلال نافذة التوصيل. في حالة الغياب المتكرر، يحق لـ BlinkGo فرض رسوم إضافية أو تقييد الخدمة.'
            : locale === 'en'
            ? 'The estimated delivery time is an estimate and does not constitute a strict time commitment. The customer must be available at the delivery address during the delivery window. In the event of repeated absence, BlinkGo may charge additional fees or restrict service.'
            : 'Die voraussichtliche Lieferzeit ist eine Schätzung und keine strikte Frist. Der Kunde muss während des Lieferzeitfensters an der Lieferadresse erreichbar sein. Bei wiederholter Abwesenheit kann BlinkGo Zusatzkosten erheben oder die Nutzung einschränken.'}
        </p>
      </Clause>

      <Clause title={t.s4}>
        <p>
          {locale === 'ar'
            ? 'يحدد كل مطعم أسعاره الخاصة. يطبق حد أدنى للطلب ورسوم خدمة ورسوم توصيل. جميع الأسعار تشمل ضريبة القيمة المضافة القانونية. البقشيش (الإكرامية) اختياري ويذهب بالكامل إلى السائق.'
            : locale === 'en'
            ? 'Each restaurant sets its own prices. A minimum order value, service fee, and delivery fee apply. All prices include statutory VAT. Tips are optional and go in full to the driver.'
            : 'Jedes Restaurant legt seine eigenen Preise fest. Es gelten ein Mindestbestellwert, eine Servicegebühr und eine Liefergebühr. Alle Preise enthalten die gesetzliche Mehrwertsteuer. Trinkgelder sind freiwillig und gehen vollständig an den Fahrer.'}
        </p>
      </Clause>

      <Clause title={t.s5}>
        <p>
          {locale === 'ar'
            ? 'طرق الدفع المتاحة هي الدفع نقداً عند الاستلام، أو — عند التكامل — عبر Stripe (بطاقة ائتمان). يحق لـ BlinkGo استخدام مزودي دفع معتمدين. في حالة فشل الدفع، يتم إلغاء الطلب تلقائياً.'
            : locale === 'en'
            ? 'Available payment methods are cash on delivery, or — when integrated — via Stripe (credit card). BlinkGo may use certified payment providers. If payment fails, the order is automatically cancelled.'
            : 'Verfügbare Zahlungsmethoden sind Barzahlung bei Lieferung oder — sofern integriert — über Stripe (Kreditkarte). BlinkGo kann zertifizierte Zahlungsdienstleister einsetzen. Bei Zahlungsausfall wird die Bestellung automatisch storniert.'}
        </p>
      </Clause>

      <Clause title={t.s6}>
        <p>
          {locale === 'ar'
            ? 'بالنسبة لطلبات الطعام القابل للتلف، قد لا ينطبق حق الانسحاب وفق § 312g Abs. 2 Nr. 2 BGB. يحق للعميل إلغاء الطلب قبل أن يبدأ المطعم في التحضير. يحق لـ BlinkGo خصم تكاليف الإلغاء.'
            : locale === 'en'
            ? 'For perishable food orders, the right of withdrawal may not apply pursuant to § 312g (2) No. 2 BGB. The customer may cancel the order before the restaurant begins preparation. BlinkGo may deduct cancellation costs.'
            : 'Für verderbliche Lebensmittelbestellungen kann das Widerrufsrecht gem. § 312g Abs. 2 Nr. 2 BGB ausgeschlossen sein. Der Kunde kann die Bestellung stornieren, bevor das Restaurant mit der Zubereitung beginnt. BlinkGo kann Stornierungskosten abziehen.'}
        </p>
      </Clause>

      <Clause title={t.s7}>
        <p>
          {locale === 'ar'
            ? 'في حالة وجود عناصر مفقودة أو تالفة، يجب على العميل إبلاغ BlinkGo خلال 24 ساعة عبر دعم العملاء. يحق للعميل استرداد جزئي أو كامل أو إعادة التوصيل. لا يحق للعميل خصم المبلغ بشكل ذاتي.'
            : locale === 'en'
            ? 'In case of missing or damaged items, the customer must notify BlinkGo within 24 hours via customer support. The customer is entitled to a partial or full refund or re-delivery. The customer may not unilaterally deduct the amount.'
            : 'Bei fehlenden oder beschädigten Artikeln muss der Kunde BlinkGo innerhalb von 24 Stunden über den Kundensupport informieren. Der Kunde hat Anspruch auf teilweise oder vollständige Rückerstattung oder Nachlieferung. Ein eigenmächtiger Abzug ist nicht zulässig.'}
        </p>
      </Clause>

      <Clause title={t.s8}>
        <p>
          {locale === 'ar'
            ? 'تتحمل BlinkGo المسؤولية فقط عن الأضرار الناجمة عن سلوكها المتعمد أو الإهمال الجسيم. لا تتحمل BlinkGo المسؤولية عن الأضرار غير المباشرة أو خسائر الأرباح. لا يتم استبعاد المسؤولية عن الأضرار الناتجة عن الإصابات الجسدية أو انتهاك الالتزامات التعاقدية الجوهرية.'
            : locale === 'en'
            ? 'BlinkGo is only liable for damages caused by intent or gross negligence. BlinkGo is not liable for indirect damages or lost profits. Liability for personal injury or breach of essential contractual obligations is not excluded.'
            : 'BlinkGo haftet nur für Schäden, die auf Vorsatz oder grober Fahrlässigkeit beruhen. Für indirekte Schäden oder entgangenen Gewinn haftet BlinkGo nicht. Die Haftung für Personenschäden oder die Verletzung wesentlicher Vertragspflichten ist nicht ausgeschlossen.'}
        </p>
      </Clause>

      <Clause title={t.s9}>
        <p>
          {locale === 'ar'
            ? 'في حالة القوة القاهرة (مثل الكوارث الطبيعية، الأوبئة، القرارات الحكومية)، يحق لـ BlinkGo تعليق الخدمة أو إلغائها دون تعويض.'
            : locale === 'en'
            ? 'In case of force majeure (e.g. natural disasters, pandemics, government orders), BlinkGo may suspend or terminate the service without compensation.'
            : 'Im Falle höherer Gewalt (z.B. Naturkatastrophen, Pandemien, behördliche Anordnungen) kann BlinkGo die Leistung aussetzen oder beenden, ohne Schadensersatz zu leisten.'}
        </p>
      </Clause>

      <Clause title={t.s10}>
        <p>
          {locale === 'ar'
            ? 'يحظر استخدام المنصة لأغراض غير مشروعة، أو الاحتيال، أو المضايقة، أو نشر محتوى ضار. يحق لـ BlinkGo اتخاذ الإجراءات المناسبة في حالة الانتهاك.'
            : locale === 'en'
            ? 'Use of the platform for illegal purposes, fraud, harassment, or distribution of harmful content is prohibited. BlinkGo may take appropriate action in case of violation.'
            : 'Die Nutzung der Plattform für rechtswidrige Zwecke, Betrug, Belästigung oder die Verbreitung schädlicher Inhalte ist untersagt. BlinkGo kann bei Verstößen angemessene Maßnahmen ergreifen.'}
        </p>
      </Clause>

      <Clause title={t.s11}>
        <p>
          {locale === 'ar'
            ? 'يجوز لـ BlinkGo تعليق أو إنهاء حساب العميل في حالة انتهاك هذه الشروط أو السلوك الضار. يحق للعميل إنهاء حسابه في أي وقت. لا يحق للعميل المطالبة بتعويض عن الإغلاق المشروع.'
            : locale === 'en'
            ? 'BlinkGo may suspend or terminate a customer account in case of breach of these terms or harmful behaviour. The customer may terminate their account at any time. The customer is not entitled to compensation for legitimate closure.'
            : 'BlinkGo kann das Kundenkonto bei Verstößen gegen diese AGB oder schädigendem Verhalten sperren oder kündigen. Der Kunde kann sein Konto jederzeit kündigen. Ein Anspruch auf Entschädigung bei berechtigter Schließung besteht nicht.'}
        </p>
      </Clause>

      <Clause title={t.s12}>
        <p>
          {locale === 'ar'
            ? 'يخضع هذا العقد للقانون الألماني، باستثناء قواعد تنازع القوانين. يحق للمستهلكين أيضاً الاعتماد على حماية قوانين بلد إقامتهم. مكان الاختصاص القضائي للتجار هو Wesseling.'
            : locale === 'en'
            ? 'This contract is governed by German law, excluding conflict-of-laws rules. Consumers may also rely on the protection of the laws of their country of residence. Place of jurisdiction for merchants is Wesseling.'
            : 'Dieser Vertrag unterliegt deutschem Recht unter Ausschluss des Kollisionsrechts. Verbraucher können sich auch auf den Schutz der Gesetze ihres Wohnsitzlandes berufen. Gerichtsstand für Kaufleute ist Wesseling.'}
        </p>
      </Clause>

      <Clause title={t.s13}>
        <p>
          {locale === 'ar'
            ? 'لا يتم استبعاد حقوق المستهلك الإلزامية. منصة OS للمفوضية الأوروبية متاحة على ec.europa.eu/consumers/odr. لست ملزماً بالمشاركة في إجراءات التحكيم.'
            : locale === 'en'
            ? 'Mandatory consumer rights are not excluded. The OS platform of the European Commission is available at ec.europa.eu/consumers/odr. We are not obliged to participate in arbitration proceedings.'
            : 'Zwingende Verbraucherrechte werden nicht ausgeschlossen. Die OS-Plattform der Europäischen Kommission ist unter ec.europa.eu/consumers/odr erreichbar. Wir sind nicht verpflichtet, an Schlichtungsverfahren teilzunehmen.'}
        </p>
      </Clause>

      <Clause title={t.s14}>
        <p>
          {locale === 'ar'
            ? 'إذا كان أي بند من هذه الشروط باطلاً، فإن باقي البنود تظل سارية. لا توجد اتفاقيات جانبية شفهية.'
            : locale === 'en'
            ? 'Should any provision of these terms be invalid, the remaining provisions shall remain in effect. There are no oral side agreements.'
            : 'Sollte eine Bestimmung dieser AGB unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Mündliche Nebenabreden bestehen nicht.'}
        </p>
      </Clause>
    </article>
  );
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      <div className="text-sm">{children}</div>
    </section>
  );
}
