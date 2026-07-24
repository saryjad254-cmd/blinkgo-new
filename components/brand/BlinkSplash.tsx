'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import Image from 'next/image';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkSplash — Official BlinkGo Loading Screen
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Uses the EXACT official logo image (not a re-interpretation).
 *  The logo is the source of truth — never redesigned.
 */

interface BlinkSplashProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export function BlinkSplash({ message, fullScreen = true, className }: BlinkSplashProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center bg-bg relative overflow-hidden',
        fullScreen ? 'fixed inset-0 z-overlay' : 'min-h-[200px] w-full p-8',
        className,
      )}
      role="status"
      aria-label={message || 'Loading BlinkGo'}
    >
      {/* Decorative orbs — brand colors */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-brand-red/15 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-brand-yellow/20 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center gap-6"
      >
        {/* THE OFFICIAL LOGO — the exact source image */}
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="relative w-48 sm:w-56"
        >
          <img
            src="/brand/blinkgo-logo.png"
            alt="BlinkGo — Schnell. Zuverlässig. Für Dich."
            className="w-full h-auto drop-shadow-2xl"
          />
        </motion.div>

        {/* Loading dots */}
        <div className="flex items-center gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-brand-red"
              animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {message && (
          <p className="text-sm text-text-secondary font-medium mt-2">{message}</p>
        )}
      </motion.div>
    </div>
  );
}

/** Inline loading spinner for small components */
export function BlinkSpinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-10 h-10 border-[3px]' };
  return (
    <span
      className={cn(
        'inline-block rounded-full border-brand-red/20 border-t-brand-red animate-spin',
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
