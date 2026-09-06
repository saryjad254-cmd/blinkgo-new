'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { BlinkLogo } from './BlinkLogo';

interface BlinkSplashProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export function BlinkSplash({ message, fullScreen = true, className }: BlinkSplashProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden bg-bg',
        fullScreen ? 'fixed inset-0 z-overlay' : 'min-h-[200px] w-full p-8',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={message || 'BlinkGo wird geladen'}
    >
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-brand-red/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-brand-yellow/20 blur-3xl" />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center gap-6"
      >
        <motion.div
          animate={reduceMotion ? undefined : { scale: [1, 1.035, 1] }}
          transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BlinkLogo variant="full" size="xl" className="drop-shadow-2xl" />
        </motion.div>

        <div className="flex items-center gap-2" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              className="h-2.5 w-2.5 rounded-full bg-brand-red"
              animate={reduceMotion ? undefined : { y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
              transition={reduceMotion ? undefined : { duration: 0.9, repeat: Infinity, delay: index * 0.15 }}
            />
          ))}
        </div>

        {message && <p className="mt-2 text-sm font-medium text-text-secondary">{message}</p>}
      </motion.div>
    </div>
  );
}

export function BlinkSpinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' };
  return (
    <span
      className={cn('inline-block animate-spin rounded-full border-brand-red/20 border-t-brand-red motion-reduce:animate-none', sizes[size], className)}
      role="status"
      aria-label="Wird geladen"
    />
  );
}
