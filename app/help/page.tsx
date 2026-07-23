'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, MessageCircle, Mail, Phone, HelpCircle, FileText, AlertTriangle } from 'lucide-react';

const COPY = {
  de: {
    title: 'Hilfe & Support',
    subtitle: 'Wir sind für dich da. Wähle einen Weg, uns zu erreichen.',
    chat: 'Live-Chat',
    chatDesc: 'Sofortige Antworten, rund um die Uhr',
    email: 'E-Mail',
    emailDesc: 'Antwort innerhalb von 24 Stunden',
    phone: 'Telefon',
    phoneDesc: 'Mo–Fr 9–18 Uhr',
    faq: 'Häufige Fragen',
    faqDesc: 'Schnelle Antworten auf typische Fragen',
    report: 'Problem melden',
    reportDesc: 'Etwas funktioniert nicht? Sag uns Bescheid.',
    back: 'Zurück',
  },
  ar: {
    title: 'المساعدة والدعم',
    subtitle: 'نحن هنا من أجلك. اختر طريقة التواصل معنا.',
    chat: 'الدردشة المباشرة',
    chatDesc: 'إجابات فورية، على مدار الساعة',
    email: 'البريد الإلكتروني',
    emailDesc: 'الرد خلال 24 ساعة',
    phone: 'الهاتف',
    phoneDesc: 'الإثنين–الجمعة 9–18',
    faq: 'الأسئلة الشائعة',
    faqDesc: 'إجابات سريعة على الأسئلة الشائعة',
    report: 'الإبلاغ عن مشكلة',
    reportDesc: 'شيء لا يعمل؟ أخبرنا.',
    back: 'رجوع',
  },
  en: {
    title: 'Help & Support',
    subtitle: "We're here for you. Choose how to reach us.",
    chat: 'Live chat',
    chatDesc: 'Instant answers, 24/7',
    email: 'Email',
    emailDesc: 'Response within 24 hours',
    phone: 'Phone',
    phoneDesc: 'Mon–Fri 9–18',
    faq: 'FAQ',
    faqDesc: 'Quick answers to common questions',
    report: 'Report a problem',
    reportDesc: "Something not working? Let us know.",
    back: 'Back',
  },
};

export default function HelpPage() {
  const [locale, setLocale] = useState<'de' | 'ar' | 'en'>('de');

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const m = document.cookie.split(';').find((c) => c.trim().startsWith('blinkgo-locale='));
      const v = m?.split('=')[1]?.trim();
      if (v === 'ar' || v === 'en' || v === 'de') setLocale(v);
    }
  }, []);

  const t = COPY[locale];
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const options = [
    { icon: MessageCircle, title: t.chat, desc: t.chatDesc, href: '/help/chat', accent: 'from-brand-red-500/20 to-brand-red-500/0' },
    { icon: Mail, title: t.email, desc: t.emailDesc, href: 'mailto:support@blinkgo.de', accent: 'from-brand-yellow-500/20 to-brand-yellow-500/0' },
    { icon: Phone, title: t.phone, desc: t.phoneDesc, href: 'tel:+4920000000000', accent: 'from-success/20 to-success/0' },
    { icon: HelpCircle, title: t.faq, desc: t.faqDesc, href: '/help/faq', accent: 'from-info/20 to-info/0' },
    { icon: AlertTriangle, title: t.report, desc: t.reportDesc, href: '/help/report', accent: 'from-warning/20 to-warning/0' },
    { icon: FileText, title: 'Legal', desc: 'Imprint, Privacy, Terms', href: '/legal/impressum', accent: 'from-text-muted/20 to-text-muted/0' },
  ];

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden" dir={dir}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-brand-red-500/10 blur-[120px]" />
        <div className="absolute bottom-0 end-0 w-[500px] h-[500px] rounded-full bg-brand-yellow-500/10 blur-[100px]" />
      </div>
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-red-600 via-accent-500 to-brand-red-600 z-50" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-text-muted hover:text-text mb-6 transition-colors">
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
