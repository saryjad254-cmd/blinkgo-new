'use client';

import { motion } from 'framer-motion';
import { Zap, MapPin, Clock, Heart, Star, Truck, Shield } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import type { Locale } from '@/lib/i18n/server-translations';

interface AuthVisualPanelProps {
  locale: Locale;
}

const COPY: Record<Locale, {
  hero: string;
  subtitle: string;
  features: { icon: any; title: string; desc: string }[];
}> = {
  de: {
    hero: 'Lieferung in Minuten, nicht Stunden',
    subtitle: 'Bestelle aus deinen Lieblingsläden und erlebe Premium-Lieferung auf Knopfdruck.',
    features: [
      { icon: Zap, title: 'Blitzschnell', desc: 'Ø 28 Min Lieferzeit' },
      { icon: MapPin, title: 'Live-Tracking', desc: 'Echtzeit-Updates' },
      { icon: Shield, title: 'Sicher bezahlen', desc: 'Verschlüsselt & geschützt' },
    ],
  },
  ar: {
    hero: 'التوصيل في دقائق، وليس ساعات',
    subtitle: 'اطلب من متاجرك المفضلة واختبر التوصيل المميز بضغطة زر.',
    features: [
      { icon: Zap, title: 'سريع كالبرق', desc: 'متوسط 28 دقيقة' },
      { icon: MapPin, title: 'تتبع مباشر', desc: 'تحديثات فورية' },
      { icon: Shield, title: 'دفع آمن', desc: 'مشفر ومحمي' },
    ],
  },
  en: {
    hero: 'Delivery in minutes, not hours',
    subtitle: 'Order from your favorite stores and experience premium delivery at the tap of a button.',
    features: [
      { icon: Zap, title: 'Lightning fast', desc: 'Avg. 28 min delivery' },
      { icon: MapPin, title: 'Live tracking', desc: 'Real-time updates' },
      { icon: Shield, title: 'Secure payment', desc: 'Encrypted & protected' },
    ],
  },
};

/**
 * Premium auth visual panel — left side of login page on desktop.
 *
 * - Brand logo + tagline
 * - 3 feature highlights with icons
 * - Floating decorative elements (orbs)
 * - Subtle gradient background
 */
export function AuthVisualPanel({ locale }: AuthVisualPanelProps) {
  const t = COPY[locale] ?? COPY.de;

  return (
    <div className="relative w-full h-full flex flex-col p-12 xl:p-16">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-brand-red/20 blur-3xl"
          animate={{
            x: [0, 30, 0],
            y: [0, 20, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-brand-yellow/30 blur-3xl"
          animate={{
            x: [0, -20, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/3 left-1/3 w-72 h-72 rounded-full bg-violet/10 blur-3xl"
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Logo */}
        <div>
          <Logo size="md" variant="full" />
        </div>

        {/* Hero text */}
        <div className="mt-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl xl:text-5xl font-black text-text leading-[1.1] tracking-tight max-w-md"
          >
            {t.hero}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-base text-text-secondary mt-4 max-w-md leading-relaxed"
          >
            {t.subtitle}
          </motion.p>

          {/* Features */}
          <div className="mt-10 space-y-4">
            {t.features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-2xl bg-surface-light border border-edge flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-brand-red" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text">{feature.title}</div>
                    <div className="text-xs text-text-muted">{feature.desc}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom testimonial */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 p-4 rounded-2xl bg-surface/60 backdrop-blur-xl border border-edge"
        >
          <div className="flex items-center gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-3.5 h-3.5 text-brand-yellow fill-brand-yellow" />
            ))}
            <span className="text-xs text-text-muted ms-1.5">4.9 · 12,847 reviews</span>
          </div>
          <p className="text-sm text-text leading-relaxed">
            {locale === 'de' && '"Schnell, zuverlässig und das beste Preis-Leistungs-Verhältnis. Meine Go-to-App!"'}
            {locale === 'ar' && '"سريع وموثوق وأفضل قيمة مقابل المال. تطبيقي المفضل!"'}
            {locale === 'en' && '"Fast, reliable, and the best value. My go-to app for everything!"'}
          </p>
          <p className="text-xs text-text-muted mt-1.5">— Sarah K., Berlin</p>
        </motion.div>
      </div>
    </div>
  );
}
