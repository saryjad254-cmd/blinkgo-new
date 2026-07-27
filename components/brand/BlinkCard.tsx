'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkCard — Official BlinkGo Card
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Variants:
 *    - default    Subtle border + background
 *    - elevated   More shadow, no border
 *    - brand      Red accent on top
 *    - dark       Dark premium surface
 *    - outline    Just a border
 *    - glass      Frosted glass with blur
 *    - flat       No shadow, no border
 *
 *  All cards:
 *    - WCAG AA contrast in both themes
 *    - 16px (lg) border radius by default
 *    - Soft depth shadow
 *    - Hoverable option with smooth lift
 */

type Variant = 'default' | 'elevated' | 'brand' | 'dark' | 'outline' | 'glass' | 'flat';
type Padding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

interface BlinkCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: Padding;
  hoverable?: boolean;
  rounded?: 'md' | 'lg' | 'xl' | '2xl';
  brandAccent?: 'red' | 'yellow' | 'black';
}

const variantStyles: Record<Variant, string> = {
  default:
    'bg-surface border border-edge shadow-sm ' +
    'dark:bg-bg-elevated dark:border-edge',
  elevated:
    'bg-surface border border-edge-light shadow-lg ' +
    'dark:bg-bg-elevated',
  brand:
    'bg-surface border border-edge shadow-md ' +
    'before:absolute before:top-0 before:inset-x-0 before:h-1 before:bg-brand-red before:rounded-t-2xl ' +
    'relative',
  dark:
    'bg-brand-black border border-brand-black/40 shadow-brand-black text-white',
  outline:
    'bg-transparent border-2 border-edge-strong',
  glass:
    'bg-white/5 backdrop-blur-2xl border border-white/10 shadow-xl',
  flat:
    'bg-surface-light border-0',
};

const paddingStyles: Record<Padding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
  xl: 'p-6 sm:p-8',
};

const radiusStyles = {
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
  '2xl': 'rounded-[2rem]',
};

const accentStyles = {
  red: 'before:bg-brand-red',
  yellow: 'before:bg-brand-yellow',
  black: 'before:bg-brand-black',
};

export function BlinkCard({
  variant = 'default',
  padding = 'md',
  hoverable = false,
  rounded = 'lg',
  brandAccent = 'red',
  className,
  children,
  ...rest
}: BlinkCardProps) {
  return (
    <div
      className={cn(
        'relative',
        radiusStyles[rounded],
        variantStyles[variant],
        variant === 'brand' && accentStyles[brandAccent],
        paddingStyles[padding],
        hoverable &&
          'transition-all duration-200 ease-silk cursor-pointer ' +
            'hover:-translate-y-1 hover:shadow-xl active:translate-y-0 active:shadow-md',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Subcomponents for structured cards */
export function BlinkCardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-3', className)} {...rest}>
      {children}
    </div>
  );
}

export function BlinkCardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-extrabold text-text-primary leading-tight', className)} {...rest}>
      {children}
    </h3>
  );
}

export function BlinkCardDescription({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-text-secondary leading-relaxed', className)} {...rest}>
      {children}
    </p>
  );
}

export function BlinkCardContent({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('text-text-primary', className)} {...rest}>
      {children}
    </div>
  );
}

export function BlinkCardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 mt-4 pt-4 border-t border-edge',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
