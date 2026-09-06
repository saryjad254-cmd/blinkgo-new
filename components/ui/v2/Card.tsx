'use client';

/**
 * Premium Card — single source of truth for cards.
 *
 * Variants:
 *   - flat:    Subtle background, no shadow
 *   - raised:  Lifted with shadow
 *   - glass:   Glassmorphism with backdrop blur
 *   - outline: Border only
 *
 * Padding: none, sm, md (default), lg
 * Interactive: hover lift + press scale
 */

import { type ReactNode, forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

type Variant = 'flat' | 'raised' | 'glass' | 'outline' | 'gradient';
type Padding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  variant?: Variant;
  padding?: Padding;
  interactive?: boolean;
  glow?: 'none' | 'brand' | 'success' | 'warning' | 'error';
  children?: ReactNode;
  asChild?: boolean;
}

const variantClasses: Record<Variant, string> = {
  flat:     'bg-bg-raised',
  raised:   'bg-bg-raised shadow-premium',
  glass:    'bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]',
  outline:  'bg-transparent border border-white/[0.10]',
  gradient: 'bg-gradient-to-br from-red-500/[0.08] to-amber-500/[0.04] border border-white/[0.08]',
};

const paddingClasses: Record<Padding, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-4 sm:p-5',
  lg:   'p-5 sm:p-6',
};

const glowClasses: Record<NonNullable<CardProps['glow']>, string> = {
  none:    '',
  brand:   'shadow-[0_8px_32px_-4px_rgba(239,68,68,0.40)]',
  success: 'shadow-[0_8px_32px_-4px_rgba(16,185,129,0.40)]',
  warning: 'shadow-[0_8px_32px_-4px_rgba(245,158,11,0.40)]',
  error:   'shadow-[0_8px_32px_-4px_rgba(239,68,68,0.40)]',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant = 'raised',
    padding = 'md',
    interactive = false,
    glow = 'none',
    children,
    className,
    style,
    ...rest
  },
  ref,
) {
  if (interactive) {
    return (
      <motion.div
        ref={ref}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          'rounded-2xl cursor-pointer',
          'transition-shadow duration-200',
          variantClasses[variant],
          paddingClasses[padding],
          glowClasses[glow],
          'hover:shadow-premium-lg',
          className,
        )}
        style={style}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={cn(
        'rounded-2xl',
        variantClasses[variant],
        paddingClasses[padding],
        glowClasses[glow],
        className,
      )}
      style={style}
      {...rest}
    >
      {children}
    </motion.div>
  );
});
