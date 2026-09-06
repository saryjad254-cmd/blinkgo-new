'use client';

/**
 * HeroBanner — EXACT VISUAL (v4)
 *
 * Big hero promo card matching the reference image:
 * - Red gradient background with subtle red sheen
 * - "LIVE NOW" red pill badge
 * - "Fast. Fresh." white + "At Your Door." yellow split headline
 * - Real-time tracking + lightning fast delivery subtext
 * - "Order Now" red CTA button
 * - BlinkGoRider illustration (large) on the right
 * - 5-dot carousel indicator
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { useI18n, type Locale } from '@/lib/i18n/I18nProvider';

export interface HeroSlide {
  id: string;
  badge: string;
  titleWhite: string;
  titleYellow: string;
  subtitle: string;
  cta: string;
}

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: 'live-now',
    badge: 'LIVE NOW',
    titleWhite: 'Fast. Fresh.',
    titleYellow: 'At Your Door.',
    subtitle: 'Real-time tracking.\nLightning fast delivery.',
    cta: 'Order Now',
  },
  {
    id: 'new',
    badge: 'CLEAR PRICING',
    titleWhite: 'Know the total',
    titleYellow: 'before you order.',
    subtitle: 'Items, fees and discounts\nshown before confirmation.',
    cta: 'Browse menus',
  },
  {
    id: 'explore',
    badge: 'EXPLORE',
    titleWhite: 'Discover local',
    titleYellow: 'favorites.',
    subtitle: 'Browse menus, prices and\navailability near you.',
    cta: 'Browse Now',
  },
  {
    id: 'availability',
    badge: 'OPEN NOW',
    titleWhite: 'See what is open',
    titleYellow: 'near you.',
    subtitle: 'Live partner availability\nfor informed choices.',
    cta: 'Explore now',
  },
  {
    id: 'groceries',
    badge: 'GROCERIES',
    titleWhite: 'Skip the trip.',
    titleYellow: 'We deliver.',
    subtitle: 'Fresh produce, drinks,\nhousehold essentials.',
    cta: 'Start Shopping',
  },
];

const AR_SLIDES: HeroSlide[] = [
  { id: 'live-now', badge: 'مباشر الآن', titleWhite: 'سريع. طازج.', titleYellow: 'حتى بابك.', subtitle: 'تتبّع مباشر لطلبك.\nتوصيل سريع وآمن.', cta: 'اطلب الآن' },
  { id: 'new', badge: 'سعر واضح', titleWhite: 'اعرف الإجمالي', titleYellow: 'قبل تأكيد الطلب.', subtitle: 'المنتجات والرسوم والخصومات\nتظهر قبل التأكيد.', cta: 'تصفح القوائم' },
  { id: 'explore', badge: 'اكتشف', titleWhite: 'اكتشف خيارات', titleYellow: 'قريبة منك.', subtitle: 'قارن القوائم والأسعار\nوالتوفر في منطقتك.', cta: 'تصفح المطاعم' },
  { id: 'availability', badge: 'مفتوح الآن', titleWhite: 'اعرف ما هو متاح', titleYellow: 'بالقرب منك.', subtitle: 'حالة توفر الشركاء مباشرة\nلاختيار أفضل.', cta: 'اكتشف الآن' },
  { id: 'groceries', badge: 'البقالة', titleWhite: 'وفّر مشوارك.', titleYellow: 'نحن نوصّل.', subtitle: 'منتجات طازجة ومشروبات\nواحتياجات المنزل.', cta: 'ابدأ التسوق' },
];

const DE_SLIDES: HeroSlide[] = [
  { id: 'live-now', badge: 'JETZT LIVE', titleWhite: 'Schnell. Frisch.', titleYellow: 'Bis zu deiner Tür.', subtitle: 'Live-Tracking deiner Bestellung.\nSchnelle, sichere Lieferung.', cta: 'Jetzt bestellen' },
  { id: 'new', badge: 'KLARE PREISE', titleWhite: 'Kenne den Gesamtpreis', titleYellow: 'vor der Bestellung.', subtitle: 'Artikel, Gebühren und Rabatte\nvor der Bestätigung sehen.', cta: 'Menüs ansehen' },
  { id: 'explore', badge: 'ENTDECKEN', titleWhite: 'Lokale Angebote', titleYellow: 'in deiner Nähe.', subtitle: 'Menüs, Preise und Verfügbarkeit\nin Ruhe vergleichen.', cta: 'Restaurants ansehen' },
  { id: 'availability', badge: 'JETZT GEÖFFNET', titleWhite: 'Sieh, was gerade', titleYellow: 'in deiner Nähe offen ist.', subtitle: 'Aktuelle Partner-Verfügbarkeit\nfür eine informierte Auswahl.', cta: 'Jetzt entdecken' },
  { id: 'groceries', badge: 'LEBENSMITTEL', titleWhite: 'Spare dir den Weg.', titleYellow: 'Wir liefern.', subtitle: 'Frische Produkte, Getränke\nund Haushaltsbedarf.', cta: 'Einkauf starten' },
];

const LOCALIZED_SLIDES: Record<Locale, HeroSlide[]> = { ar: AR_SLIDES, de: DE_SLIDES, en: DEFAULT_SLIDES };

interface HeroBannerProps {
  slides?: HeroSlide[];
  onCtaClick?: (slide: HeroSlide) => void;
}

export function HeroBanner({ slides, onCtaClick }: HeroBannerProps) {
  const { locale } = useI18n();
  const resolvedSlides = slides ?? LOCALIZED_SLIDES[locale];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const t = setInterval(() => {
      setActive((a) => (a + 1) % resolvedSlides.length);
    }, 5000);
    return () => clearInterval(t);
  }, [paused, reducedMotion, resolvedSlides.length]);

  const slide = resolvedSlides[active] ?? resolvedSlides[0];

  return (
    <section
      className="relative mx-4 mt-4 min-h-[270px] overflow-hidden rounded-[26px] border border-white/10 bg-[#0d0d0d] shadow-[0_24px_70px_rgba(0,0,0,0.48)] sm:min-h-[330px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label={locale === 'ar' ? 'عروض بلينك جو' : locale === 'de' ? 'BlinkGo Angebote' : 'BlinkGo offers'}
    >
      <Image src="/brand/blinkgo-discovery-hero-v2.webp" alt="" fill priority sizes="(max-width: 768px) calc(100vw - 32px), 788px" className="object-cover object-[68%_center]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,.99)_0%,rgba(5,5,5,.94)_34%,rgba(5,5,5,.66)_55%,rgba(5,5,5,.08)_88%)] rtl:bg-[linear-gradient(270deg,rgba(5,5,5,.99)_0%,rgba(5,5,5,.94)_34%,rgba(5,5,5,.66)_55%,rgba(5,5,5,.08)_88%)]" aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_48%,rgba(225,6,0,.16),transparent_46%)]" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-yellow/70 to-transparent" aria-hidden />

      <div className="relative flex items-stretch">
        {/* Left: copy */}
        <div className="relative z-10 flex min-h-[270px] w-[70%] flex-col justify-center gap-2.5 p-5 pb-12 sm:min-h-[330px] sm:w-[60%] sm:gap-3 sm:p-8 sm:pb-14">
          {/* LIVE NOW badge */}
          <span
            className="inline-flex min-h-7 items-center self-start rounded-full border border-white/15 bg-brand/95 px-3 text-[10px] font-black uppercase tracking-[.13em] text-white shadow-[0_0_24px_rgba(225,6,0,.4)]"
            aria-label={slide.badge}
          >
            {slide.badge}
          </span>

          {/* Headline (split white / yellow) */}
          <h2 aria-live="polite" className="text-[27px] font-black leading-[1.02] tracking-[-0.045em] sm:text-[42px]">
            <span className="text-white italic">{slide.titleWhite}</span>
            <br />
            <span className="text-brand-yellow italic">{slide.titleYellow}</span>
          </h2>

          {/* Subtitle */}
          <p className="max-w-[32ch] whitespace-pre-line text-[12px] font-medium leading-[1.45] text-white/78 sm:text-[14px]">
            {slide.subtitle}
          </p>

          {/* CTA */}
          <button
            type="button"
            onClick={() => onCtaClick?.(slide)}
            className="mt-1 inline-flex min-h-11 self-start items-center gap-2 rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_10px_28px_rgba(225,6,0,.34)] transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[.98] motion-reduce:transform-none"
          >
            {slide.cta}
            <svg className="rtl:rotate-180" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        </div>

      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-3 start-1/2 z-10 flex -translate-x-1/2 items-center justify-center gap-1.5" role="tablist" aria-label="Hero slides">
        {resolvedSlides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`${locale === 'ar' ? 'الشريحة' : locale === 'de' ? 'Folie' : 'Slide'} ${i + 1}: ${s.badge}`}
            onClick={() => { setActive(i); setPaused(true); }}
            className="grid h-6 w-6 place-items-center rounded-full focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <span className={cn('block h-1.5 rounded-full transition-all', i === active ? 'w-5 bg-brand' : 'w-1.5 bg-white/35')} />
          </button>
        ))}
      </div>
    </section>
  );
}
