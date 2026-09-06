'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/I18nProvider';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';
import Mail from 'lucide-react/dist/esm/icons/mail';
import Inbox from 'lucide-react/dist/esm/icons/inbox';
import HelpCircle from 'lucide-react/dist/esm/icons/help-circle';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';

const COPY = {
  de: {
    title: 'Hilfe & Support',
    subtitle: 'Wir sind für dich da. Wähle einen Weg, uns zu erreichen.',
    chat: 'Live-Chat',
    chatDesc: 'Sichere Nachrichten direkt in der App',
    email: 'E-Mail',
    emailDesc: 'Sende uns eine ausführliche Nachricht',
    requests: 'Meine Anfragen',
    requestsDesc: 'Status und Antworten des Support-Teams',
    faq: 'Häufige Fragen',
    faqDesc: 'Schnelle Antworten auf typische Fragen',
    report: 'Problem melden',
    reportDesc: 'Etwas funktioniert nicht? Sag uns Bescheid.',
    back: 'Zurück',
    legal: 'Rechtliches', legalDesc: 'Impressum, Datenschutz und Bedingungen',
  },
  ar: {
    title: 'المساعدة والدعم',
    subtitle: 'نحن هنا من أجلك. اختر طريقة التواصل معنا.',
    chat: 'الدردشة المباشرة',
    chatDesc: 'رسائل آمنة مباشرة داخل التطبيق',
    email: 'البريد الإلكتروني',
    emailDesc: 'أرسل لنا رسالة مفصّلة',
    requests: 'طلباتي',
    requestsDesc: 'حالة الطلبات وردود فريق الدعم',
    faq: 'الأسئلة الشائعة',
    faqDesc: 'إجابات سريعة على الأسئلة الشائعة',
    report: 'الإبلاغ عن مشكلة',
    reportDesc: 'شيء لا يعمل؟ أخبرنا.',
    back: 'رجوع',
    legal: 'المعلومات القانونية', legalDesc: 'الخصوصية والشروط وبيانات الشركة',
  },
  en: {
    title: 'Help & Support',
    subtitle: "We're here for you. Choose how to reach us.",
    chat: 'Live chat',
    chatDesc: 'Secure messages directly in the app',
    email: 'Email',
    emailDesc: 'Send us a detailed message',
    requests: 'My requests',
    requestsDesc: 'Status and replies from the support team',
    faq: 'FAQ',
    faqDesc: 'Quick answers to common questions',
    report: 'Report a problem',
    reportDesc: "Something not working? Let us know.",
    back: 'Back',
    legal: 'Legal', legalDesc: 'Imprint, privacy and terms',
  },
};

export default function HelpPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order');
  const { locale } = useI18n();

  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const orderQuery = orderId ? `?order=${encodeURIComponent(orderId)}` : '';
  const reportQuery = orderId ? `?order=${encodeURIComponent(orderId)}&new=1` : '?new=1';
  const backHref = orderId ? `/orders/${encodeURIComponent(orderId)}` : '/home';
  const options = [
    { icon: MessageCircle, title: t.chat, desc: t.chatDesc, href: `/help/chat${orderQuery}`, accent: 'from-brand-red-500/20 to-brand-red-500/0' },
    { icon: Mail, title: t.email, desc: t.emailDesc, href: 'mailto:support@blinkgo.de', accent: 'from-brand-yellow-500/20 to-brand-yellow-500/0' },
    { icon: Inbox, title: t.requests, desc: t.requestsDesc, href: '/customer/support', accent: 'from-success/20 to-success/0' },
    { icon: HelpCircle, title: t.faq, desc: t.faqDesc, href: '/help/faq', accent: 'from-info/20 to-info/0' },
    { icon: AlertTriangle, title: t.report, desc: t.reportDesc, href: `/customer/support${reportQuery}`, accent: 'from-warning/20 to-warning/0' },
    { icon: FileText, title: t.legal, desc: t.legalDesc, href: '/legal/impressum', accent: 'from-text-muted/20 to-text-muted/0' },
  ];

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden" dir={dir}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-brand-red-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-brand-yellow-500/10 blur-[100px]" />
      </div>
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-red-600 via-accent-500 to-brand-red-600 z-50" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-text-muted hover:text-text mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          {t.back}
        </Link>

        <div className="text-center mb-8">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full bg-brand-red-500/20 blur-xl" />
            <div className="relative w-full h-full rounded-full bg-brand-red-500/10 border-2 border-brand-red-500/30 flex items-center justify-center">
              <HelpCircle className="w-8 h-8 text-brand" strokeWidth={2} />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-text mb-2">{t.title}</h1>
          <p className="text-text-secondary text-sm">{t.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {options.map((opt) => {
            const Icon = opt.icon;
            return (
              <Link
                key={opt.href}
                href={opt.href}
                className="group relative card-glass p-5 overflow-hidden hover:border-edge-strong transition-all duration-300 ease-silk hover:-translate-y-0.5"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${opt.accent} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className="relative flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-red-500/15 to-brand-yellow-500/10 border border-brand-red-500/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-brand-red-500" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-extrabold text-text mb-0.5">{opt.title}</h3>
                    <p className="text-xs text-text-secondary leading-relaxed">{opt.desc}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
