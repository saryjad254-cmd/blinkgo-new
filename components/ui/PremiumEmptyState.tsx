'use client';

/**
 * PremiumEmptyState — world-class empty state component.
 *
 * Inspired by Stripe / Linear / Notion:
 *   - Centered icon in a soft gradient bubble
 *   - Title + description with hierarchy
 *   - Primary + secondary action buttons
 *   - Optional illustration
 *   - Optional "next steps" chips
 */

import { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface PremiumEmptyStateProps {
  icon?: LucideIcon;
  /** Icon name (Lucide) — used when icon not provided */
  iconName?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Decorative illustration node (custom React) */
  illustration?: ReactNode;
  /** Decorative tone for the icon bubble */
  tone?: 'brand' | 'success' | 'warning' | 'info' | 'violet' | 'neutral';
  /** Quick-action chips */
  suggestions?: Array<{ label: string; href: string; icon?: LucideIcon }>;
  className?: string;
  children?: ReactNode;
}

const TONE_MAP = {
  brand: 'from-red-500/20 to-amber-500/10 text-red-400',
  success: 'from-emerald-500/20 to-cyan-500/10 text-emerald-400',
  warning: 'from-amber-500/20 to-orange-500/10 text-amber-400',
  info: 'from-cyan-500/20 to-blue-500/10 text-cyan-400',
  violet: 'from-violet-500/20 to-pink-500/10 text-violet-400',
  neutral: 'from-white/[0.06] to-white/[0.02] text-text-muted',
};

export function PremiumEmptyState({
  icon: Icon,
  iconName,
  title,
  description,
  action,
  secondaryAction,
  illustration,
  tone = 'brand',
  suggestions,
  className,
  children,
}: PremiumEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center px-4 py-12 sm:py-16', className)}>
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative mb-6"
      >
        {illustration ? (
          illustration
        ) : (
          <div className={cn(
            'h-24 w-24 sm:h-32 sm:w-32 rounded-full grid place-items-center',
            'bg-gradient-to-br',
            TONE_MAP[tone],
            'shadow-premium',
          )}>
            {Icon && <Icon className="h-12 w-12 sm:h-14 sm:w-14" strokeWidth={1.5} />}
            {!Icon && iconName && <span className="text-4xl">{iconName}</span>}
          </div>
        )}
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="text-xl sm:text-2xl font-bold text-text-primary max-w-md"
      >
        {title}
      </motion.h3>

      {description && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="text-sm sm:text-base text-text-secondary mt-2 max-w-md leading-relaxed"
        >
          {description}
        </motion.p>
      )}

      {(action || secondaryAction) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="mt-6 flex flex-col sm:flex-row items-center gap-3"
        >
          {action && (
            action.href ? (
              <Link
                href={action.href}
                className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-brand-gradient text-white font-semibold shadow-glow hover:shadow-glow-strong active:scale-95 transition-all"
              >
                {action.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-brand-gradient text-white font-semibold shadow-glow hover:shadow-glow-strong active:scale-95 transition-all"
              >
                {action.label}
              </button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-white/[0.06] border border-white/[0.08] text-text-primary font-medium hover:bg-white/[0.1] active:scale-95 transition-all"
              >
                {secondaryAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-white/[0.06] border border-white/[0.08] text-text-primary font-medium hover:bg-white/[0.1] active:scale-95 transition-all"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </motion.div>
      )}

      {suggestions && suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-2"
        >
          {suggestions.map((s, i) => {
            const SugIcon = s.icon;
            return (
              <Link
                key={i}
                href={s.href}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/[0.04] border border-white/[0.06] text-sm text-text-secondary hover:bg-white/[0.08] hover:text-text-primary active:scale-95 transition-all"
              >
                {SugIcon && <SugIcon className="h-3.5 w-3.5" />}
                {s.label}
              </Link>
            );
          })}
        </motion.div>
      )}

      {children}
    </div>
  );
}
