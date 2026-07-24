'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, MapPin, Clock, Shield, Sparkles, Zap, Heart, Star } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { useT, tr } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

const TRACE_TAG = '[BLINKGO_AUTH_TRACE:v77:welcome_screen]';
function clientTrace(event: string, data: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.error(TRACE_TAG, event, JSON.stringify(data));
}

interface Slide {
  icon: any;
  titleKey: string;
  descKey: string;
  bgClass: string;
  iconColor: string;
}

const SLIDES: Slide[] = [
  {
    icon: Zap,
    titleKey: 'welcome.slide1.title',
    descKey: 'welcome.slide1.desc',
    bgClass: 'from-brand-red/20 via-brand-red/5 to-transparent',
    iconColor: 'text-brand-red',
  },
  {
    icon: MapPin,
    titleKey: 'welcome.slide2.title',
    descKey: 'welcome.slide2.desc',
    bgClass: 'from-brand-yellow/30 via-brand-yellow/10 to-transparent',
    iconColor: 'text-brand-yellow',
  },
  {
    icon: Shield,
    titleKey: 'welcome.slide3.title',
    descKey: 'welcome.slide3.desc',
    bgClass: 'from-brand-black/15 via-brand-black/5 to-transparent',
    iconColor: 'text-brand-black',
  },
];

/**
 * Premium welcome / onboarding screen.
 *
 * - 3 slides with auto-advance (5s)
 * - Swipe-friendly with progress dots
 * - Skip button (top-right)
 * - Smooth transitions
 * - Localized text
 */
export function WelcomeScreen() {
  const t = useT();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (index < SLIDES.length - 1) {
        setDirection(1);
        setIndex((i) => i + 1);
      }
    }, 5500);
    return () => clearTimeout(timer);
  }, [index]);

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const Icon = slide.icon;

  const handleNext = () => {
    if (isLast) {
      // Set the welcome-seen cookie (1 year expiry)
      document.cookie = 'blinkgo-welcome-seen=1; max-age=31536000; path=/; SameSite=Lax';
      clientTrace('client_redirect_to_login', { trigger: 'handleNext_last_slide', target: '/login' });
      router.push('/login');
    } else {
      setDirection(1);
      setIndex((i) => i + 1);
    }
  };

  const handleSkip = () => {
    // Set the welcome-seen cookie (1 year expiry)
    document.cookie = 'blinkgo-welcome-seen=1; max-age=31536000; path=/; SameSite=Lax';
    clientTrace('client_redirect_to_login', { trigger: 'handleSkip', target: '/login' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg relative overflow-hidden">
      {/* Decorative background */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br transition-all duration-700',
          slide.bgClass,
        )}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(255,107,26,0.15),transparent_50%)]" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-12 pb-2 safe-top">
        <Logo size="sm" variant="mark" />
        {!isLast && (
          <button
            onClick={handleSkip}
            className="text-sm font-bold text-text-secondary hover:text-text transition-colors px-3 py-1.5 rounded-full hover:bg-surface-light"
          >
            {tr(t, 'welcome.skip')}
          </button>
        )}
      </div>

      {/* Slide content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={index}
            custom={direction}
            initial={{ opacity: 0, x: direction * 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -direction * 50 }}
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col items-center text-center max-w-md"
          >
            {/* Icon with glow */}
            <div className="relative mb-10">
              <div
                className={cn(
                  'absolute inset-0 rounded-full blur-3xl opacity-50',
                  slide.iconColor.replace('text-', 'bg-'),
                )}
              />
              <div
                className={cn(
                  'relative w-32 h-32 rounded-full flex items-center justify-center',
                  'bg-surface-elevated border border-edge shadow-speed-xl',
                )}
              >
                <Icon className={cn('w-14 h-14', slide.iconColor)} strokeWidth={1.5} />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-brand-yellow-500 flex items-center justify-center shadow-glow-accent animate-bounce-y">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-text leading-tight tracking-tight mb-3">
              {tr(t, slide.titleKey)}
            </h1>
            <p className="text-base text-text-secondary leading-relaxed max-w-sm">
              {tr(t, slide.descKey)}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 px-6 pb-10 safe-bottom">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setDirection(i > index ? 1 : -1);
                setIndex(i);
              }}
              aria-label={`Slide ${i + 1}`}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === index ? 'w-8 bg-brand-red-500' : 'w-2 bg-edge-strong hover:bg-edge-light',
              )}
            />
          ))}
        </div>

        {/* CTA */}
        <Button
          fullWidth
          size="xl"
          onClick={handleNext}
          iconRight={<ChevronRight className="w-5 h-5 rtl:rotate-180" />}
          className="mb-3"
        >
          {isLast ? tr(t, 'welcome.getStarted') : tr(t, 'welcome.next')}
        </Button>
        <p className="text-center text-xs text-text-muted">
          {tr(t, 'welcome.bySigningIn')}{' '}
          <span className="text-text-secondary font-semibold">{tr(t, 'welcome.terms')}</span>
        </p>
      </div>
    </div>
  );
}
