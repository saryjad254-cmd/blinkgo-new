'use client';

import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import HelpCircle from 'lucide-react/dist/esm/icons/help-circle';
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';
import Receipt from 'lucide-react/dist/esm/icons/receipt';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';

const COPY = {
  de: {
    title: 'Häufige Fragen', subtitle: 'Schnelle Hilfe zu Bestellung, Zahlung und Lieferung.', back: 'Zurück',
    orders: 'Meine Bestellungen', contact: 'Support kontaktieren',
    items: [
      ['Wo sehe ich den Status meiner Bestellung?', 'Öffne „Bestellungen“ und wähle die aktive Bestellung. Dort findest du Status, Lieferadresse und die Live-Verfolgung.'],
      ['Kann ich eine Bestellung stornieren?', 'Solange das Restaurant noch nicht mit der Zubereitung begonnen hat, erscheint in den Bestelldetails die Option zum Stornieren.'],
      ['Warum kann ich nicht zur Kasse gehen?', 'Prüfe Mindestbestellwert, Lieferadresse, Liefergebiet und erforderliche Produktoptionen. Der Warenkorb zeigt jeden fehlenden Schritt an.'],
      ['Welche Zahlungsarten werden unterstützt?', 'Je nach Restaurant und Konfiguration kannst du Barzahlung bei Lieferung oder sichere Online-Zahlung auswählen.'],
      ['Wie melde ich ein Problem mit einer Bestellung?', 'Öffne die Bestellung und wähle Support oder erstelle unter „Hilfe“ eine Anfrage mit der zugehörigen Bestellnummer.'],
      ['Wie ändere ich Sprache oder Kontodaten?', 'Sprache und Kontodaten findest du im Seitenmenü beziehungsweise im Bereich „Konto“.'],
    ],
  },
  ar: {
    title: 'الأسئلة الشائعة', subtitle: 'مساعدة سريعة حول الطلب والدفع والتوصيل.', back: 'رجوع',
    orders: 'طلباتي', contact: 'تواصل مع الدعم',
    items: [
      ['أين أرى حالة طلبي؟', 'افتح «الطلبات» واختر الطلب النشط. ستجد الحالة وعنوان التوصيل والتتبع المباشر.'],
      ['هل يمكنني إلغاء الطلب؟', 'يظهر خيار الإلغاء في تفاصيل الطلب ما دام المطعم لم يبدأ التحضير بعد.'],
      ['لماذا لا أستطيع الانتقال للدفع؟', 'تحقق من الحد الأدنى وعنوان التوصيل ونطاق الخدمة وخيارات المنتج المطلوبة. تعرض السلة كل خطوة ناقصة.'],
      ['ما طرق الدفع المتاحة؟', 'بحسب المطعم والإعدادات يمكنك اختيار الدفع نقدًا عند التوصيل أو الدفع الآمن عبر الإنترنت.'],
      ['كيف أبلغ عن مشكلة في طلب؟', 'افتح الطلب واختر الدعم، أو أنشئ طلب دعم من صفحة المساعدة مع رقم الطلب المرتبط.'],
      ['كيف أغير اللغة أو بيانات الحساب؟', 'تجد اللغة وبيانات الحساب في القائمة الجانبية أو قسم «الحساب».'],
    ],
  },
  en: {
    title: 'Frequently asked questions', subtitle: 'Quick help with ordering, payment and delivery.', back: 'Back',
    orders: 'My orders', contact: 'Contact support',
    items: [
      ['Where can I see my order status?', 'Open Orders and select the active order. You will find its status, delivery address and live tracking there.'],
      ['Can I cancel an order?', 'The cancellation option appears in order details while the restaurant has not started preparing it.'],
      ['Why can’t I proceed to checkout?', 'Check the minimum order, delivery address, service area and required product options. The cart lists every missing step.'],
      ['Which payment methods are supported?', 'Depending on the restaurant and configuration, you can choose cash on delivery or secure online payment.'],
      ['How do I report an order problem?', 'Open the order and choose Support, or create a request from Help with the related order number.'],
      ['How do I change language or account details?', 'Language and account details are available in the side menu and the Account section.'],
    ],
  },
} satisfies Record<Locale, { title: string; subtitle: string; back: string; orders: string; contact: string; items: string[][] }>;

export default function FaqPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  return <main className="min-h-screen bg-canvas px-4 py-6 text-text-primary" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <div className="mx-auto max-w-3xl">
      <Link href="/help" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-text-secondary hover:bg-surface-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ArrowLeft className={`size-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />{copy.back}</Link>
      <header className="mt-5 rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/15 via-surface-1 to-brand-yellow/10 p-6 sm:p-8">
        <div className="grid size-14 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/20"><HelpCircle className="size-7" /></div>
        <h1 className="mt-5 text-3xl font-black sm:text-4xl">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.subtitle}</p>
      </header>
      <section className="mt-5 space-y-3" aria-label={copy.title}>
        {copy.items.map(([question, answer], index) => <details key={question} className="group rounded-2xl border border-border bg-surface-1 open:border-brand/35 open:bg-surface-2"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"><span><span className="me-2 text-brand">{String(index + 1).padStart(2, '0')}</span>{question}</span><ChevronDown className="size-5 shrink-0 text-text-muted transition group-open:rotate-180" /></summary><p className="border-t border-border px-4 py-4 text-sm leading-6 text-text-secondary">{answer}</p></details>)}
      </section>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><Link href="/orders" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-surface-1 px-5 font-bold hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><Receipt className="size-5 text-brand" />{copy.orders}</Link><Link href="/customer/support?new=1" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand px-5 font-bold text-white shadow-lg shadow-brand/20 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><MessageCircle className="size-5" />{copy.contact}</Link></div>
    </div>
  </main>;
}
