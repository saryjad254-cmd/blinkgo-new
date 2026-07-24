/**
 * Widerrufsbelehrung (Right of Withdrawal)
 * ────────────────────────────────────────
 *
 * DRAFT — requires review by a German Rechtsanwalt specialized
 * in e-commerce/consumer law before production launch.
 *
 * Note: For perishable food deliveries, the right of withdrawal
 * is typically EXCLUDED per § 312g Abs. 2 Nr. 2 BGB. This page
 * makes that explicit, as required by German law.
 */

import { getDisplayCompanyInfo } from '@/lib/legal/company-info';
import { LegalBanner } from '@/components/legal/LegalBanner';
import { getServerLocale } from '@/lib/i18n/server-translations';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default function WiderrufPage() {
  const cookieHeader = cookies().getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const locale = getServerLocale(cookieHeader) as 'de' | 'ar' | 'en';
  const c = getDisplayCompanyInfo();
  const isDraft = c.legalReviewStatus !== 'APPROVED';

  if (locale === 'ar') {
    return (
      <article>
        {isDraft && <LegalBanner />}
        <h1 className="text-3xl font-bold mb-4">حق الانسحاب</h1>
        <Section title="حق الانسحاب">
          <p className="text-sm">يحق لك الانسحاب من هذا العقد خلال 14 يوماً دون إبداء أسباب.</p>
        </Section>
        <Section title="استثناءات">
          <p className="text-sm">لا ينطبق حق الانسحاب على العقود المتعلقة بتسليم الأغذية القابلة للتلف (§ 312g Abs. 2 Nr. 2 BGB). ينطبق هذا على معظم طلبات المطاعم.</p>
        </Section>
        <Section title="للاتصال بنا">
          <p className="text-sm">{c.dataControllerName}, {c.streetAddress}, {c.postalCode} {c.city}</p>
          <p className="text-sm">E-Mail: {c.supportEmail}</p>
        </Section>
      </article>
    );
  }

  if (locale === 'en') {
    return (
      <article>
        {isDraft && <LegalBanner />}
        <h1 className="text-3xl font-bold mb-4">Right of Withdrawal</h1>
        <Section title="Right of withdrawal">
          <p className="text-sm">You have the right to withdraw from this contract within 14 days without giving any reason.</p>
        </Section>
        <Section title="Exceptions">
          <p className="text-sm">The right of withdrawal does not apply to contracts for the delivery of perishable foodstuffs (§ 312g (2) No. 2 BGB). This applies to most restaurant orders.</p>
        </Section>
        <Section title="Contact">
          <p className="text-sm">{c.dataControllerName}, {c.streetAddress}, {c.postalCode} {c.city}</p>
          <p className="text-sm">E-Mail: {c.supportEmail}</p>
        </Section>
      </article>
    );
  }

  return (
    <article>
      {isDraft && <LegalBanner />}
      <h1 className="text-3xl font-bold mb-4">Widerrufsbelehrung</h1>

      <Section title="Widerrufsrecht">
        <p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.</p>
        <p>Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw. hat.</p>
        <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns ({c.dataControllerName}, {c.streetAddress}, {c.postalCode} {c.city}, E-Mail: {c.supportEmail}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.</p>
      </Section>

      <Section title="Folgen des Widerrufs">
        <p>Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist.</p>
      </Section>

      <Section title="Ausschluss des Widerrufsrechts">
        <p className="font-semibold">Das Widerrufsrecht besteht nicht bei Verträgen zur Lieferung von Waren, die schnell verderben können oder deren Verfallsdatum schnell überschritten würde (§ 312g Abs. 2 Nr. 2 BGB).</p>
        <p className="mt-2">Dies betrifft die überwiegende Mehrheit der über die BlinkGo-Plattform vermittelten Restaurantbestellungen (zubereitete Speisen und Getränke). Das Widerrufsrecht kann daher für diese Bestellungen vollständig ausgeschlossen sein.</p>
        <p className="mt-2">Für nicht verderbliche Waren (z. B. Apothekenprodukte, Supermarktartikel mit langer Haltbarkeit) gilt das Widerrufsrecht grundsätzlich, sofern die Ware nicht entsiegelt wurde.</p>
      </Section>

      <Section title="Muster-Widerrufsformular">
        <p className="italic text-sm">
          (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)
        </p>
        <div className="border border-gray-300 dark:border-gray-700 rounded p-3 mt-2 text-sm">
          <p>An: {c.dataControllerName}, {c.streetAddress}, {c.postalCode} {c.city}, {c.supportEmail}</p>
          <p className="mt-2">Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)</p>
          <p className="mt-2">Bestellt am (*)/erhalten am (*):</p>
          <p className="mt-2">Name des/der Verbraucher(s):</p>
          <p className="mt-2">Anschrift des/der Verbraucher(s):</p>
          <p className="mt-2">Datum:</p>
          <p className="mt-2">Unterschrift (nur bei Mitteilung auf Papier):</p>
          <p className="mt-2 text-xs text-gray-500">(*) Unzutreffendes streichen.</p>
        </div>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      <div className="text-sm space-y-2">{children}</div>
    </section>
  );
}
