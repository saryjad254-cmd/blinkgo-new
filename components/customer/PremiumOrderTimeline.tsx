'use client';

/**
 * PremiumOrderTimeline — world-class order tracking timeline.
 *
 * Inspired by Uber Eats / Wolt / DoorDash:
 *   - Vertical timeline with animated progress line
 *   - Each step has icon, title, ETA, and progress indicator
 *   - Active step pulses with brand color
 *   - Completed steps get a checkmark
 *   - Smooth transitions between states
 *   - Real-time ETA countdown
 *   - Premium glassmorphism on the step cards
 */

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Check from 'lucide-react/dist/esm/icons/check';
import ChefHat from 'lucide-react/dist/esm/icons/chef-hat';
import Store from 'lucide-react/dist/esm/icons/store';
import Truck from 'lucide-react/dist/esm/icons/truck';
import Home from 'lucide-react/dist/esm/icons/home';
import Package from 'lucide-react/dist/esm/icons/package';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import type { LucideIcon } from 'lucide-react';
import { useTranslations as useT } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/cn';

interface Step {
  key: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  eta?: number; // minutes
}

const STEPS: Step[] = [
  { key: 'pending', icon: Package, titleKey: 'tracking.step.placed', descKey: 'tracking.step.placed.desc' },
  { key: 'confirmed', icon: Store, titleKey: 'tracking.step.confirmed', descKey: 'tracking.step.confirmed.desc' },
  { key: 'preparing', icon: ChefHat, titleKey: 'tracking.step.preparing', descKey: 'tracking.step.preparing.desc' },
  { key: 'ready', icon: Sparkles, titleKey: 'tracking.step.ready', descKey: 'tracking.step.ready.desc' },
  { key: 'picked_up', icon: Truck, titleKey: 'tracking.step.delivering', descKey: 'tracking.step.delivering.desc' },
  { key: 'delivered', icon: Home, titleKey: 'tracking.step.delivered', descKey: 'tracking.step.delivered.desc' },
];

interface PremiumOrderTimelineProps {
  status: string;
  estimatedArrival?: Date;
  className?: string;
}

function getStepIndex(status: string): number {
  switch (status) {
    case 'pending': return 0;
    case 'confirmed': return 1;
    case 'preparing': return 2;
    case 'ready':
    case 'assigned': return 3;
    case 'picked_up':
    case 'on_the_way':
    case 'delivering': return 4;
    case 'delivered': return 5;
    default: return 0;
  }
}

function PremiumOrderTimelineImpl({ status, estimatedArrival, className }: PremiumOrderTimelineProps) {
  const t = useT();
  const activeIndex = getStepIndex(status);
  const isComplete = status === 'delivered';

  return (
    <div className={cn('relative', className)}>
      {/* Background line */}
      <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-white/[0.08] rounded-full" aria-hidden="true" />
      {/* Animated progress line */}
      <motion.div
        className="absolute left-[19px] top-6 w-0.5 bg-gradient-to-b from-red-500 via-amber-500 to-emerald-500 rounded-full"
        initial={{ height: 0 }}
        animate={{ height: `${(activeIndex / (STEPS.length - 1)) * 100}%` }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        aria-hidden="true"
        style={{ maxHeight: 'calc(100% - 48px)' }}
      />

      <ul className="space-y-4">
        {STEPS.map((step, index) => {
          const isActive = index === activeIndex && !isComplete;
          const isDone = index < activeIndex || isComplete;
          const Icon = step.icon;
          const isLast = index === STEPS.length - 1;

          return (
            <motion.li
              key={step.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.06, duration: 0.3 }}
              className="relative flex items-start gap-4"
            >
              {/* Step circle */}
              <div className="relative flex-shrink-0">
                <motion.div
                  className={cn(
                    'relative h-10 w-10 rounded-full grid place-items-center border-2',
                    isDone && 'bg-emerald-500/20 border-emerald-500 text-emerald-400',
                    isActive && 'bg-red-500/20 border-red-500 text-red-400',
                    !isDone && !isActive && 'bg-bg-card border-white/[0.08] text-text-muted',
                  )}
                  animate={isActive ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                  transition={isActive ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : {}}
                >
                  {isDone ? <Check className="h-5 w-5" strokeWidth={3} /> : <Icon className="h-5 w-5" />}
                </motion.div>
                {isActive && (
                  <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" aria-hidden="true" />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pt-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      'font-semibold text-sm',
                      (isDone || isActive) ? 'text-text-primary' : 'text-text-muted',
                    )}
                  >
                    {t(step.titleKey)}
                  </p>
                  {isActive && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 animate-pulse">
                      {t('tracking.active')}
                    </span>
                  )}
                </div>
                <p className={cn('text-xs mt-0.5', (isDone || isActive) ? 'text-text-secondary' : 'text-text-muted')}>
                  {t(step.descKey)}
                </p>
                {isLast && estimatedArrival && !isComplete && (
                  <p className="text-xs mt-1.5 text-red-300 font-medium">
                    <EtaCountdown eta={estimatedArrival} />
                  </p>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Live ETA countdown ──────────────────────────────────
function EtaCountdown({ eta }: { eta: Date }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, Math.round((eta.getTime() - now) / 60_000));
  return <span>{t('tracking.etaIn', `Arrives in ${diff} min`)}</span>;
}

export const PremiumOrderTimeline = memo(PremiumOrderTimelineImpl);
