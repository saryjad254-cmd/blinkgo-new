'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * ════════════════════════════════════════════════════════════════════════
 *  BlinkButton — Official BlinkGo Button
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Variants:
 *    - primary    Red CTA — most important action
 *    - secondary  Black solid — secondary action
 *    - accent     Yellow solid — highlight/attention
 *    - outlined   Border only — tertiary action
 *    - ghost      No border, no fill — low-emphasis
 *    - danger     Red for destructive actions
 *    - success    Green for positive confirmation
 *
 *  Sizes:
 *    xs · sm · md · lg · xl · icon
 *
 *  Features:
 *    - Loading state with spinner
 *    - Icon support (left/right)
 *    - Full width option
 *    - Disabled state with proper visual treatment
 *    - Tactile press effect
 *    - Brand-consistent focus ring
 *    - WCAG AA contrast in both light + dark mode
 */

type Variant = 'primary' | 'secondary' | 'accent' | 'outlined' | 'ghost' | 'danger' | 'success' | 'glass';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon';

interface BlinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-brand-red text-white border-brand-red shadow-brand-red ' +
    'hover:bg-brand-red-hover hover:border-brand-red-hover ' +
    'active:bg-brand-red-active ' +
    'focus-visible:ring-brand-red/40',
  secondary:
    'bg-brand-black text-white border-brand-black shadow-brand-black ' +
    'hover:bg-brand-black-hover ' +
    'active:bg-brand-black-active ' +
    'focus-visible:ring-brand-black/40',
  accent:
    'bg-brand-yellow text-brand-black border-brand-yellow shadow-brand-yellow ' +
    'hover:bg-brand-yellow-hover ' +
    'active:bg-brand-yellow-active ' +
    'focus-visible:ring-brand-yellow/40',
  outlined:
    'bg-transparent text-text-primary border-edge-strong ' +
    'hover:bg-surface-light hover:border-brand-red hover:text-brand-red ' +
    'active:bg-surface ' +
    'focus-visible:ring-brand-red/40',
  ghost:
    'bg-transparent text-text-primary border-transparent ' +
    'hover:bg-surface-light ' +
    'active:bg-surface ' +
    'focus-visible:ring-brand-red/40',
  danger:
    'bg-brand-red text-white border-brand-red shadow-brand-red ' +
    'hover:bg-brand-red-hover ' +
    'active:bg-brand-red-active ' +
    'focus-visible:ring-brand-red/40',
  success:
    'bg-emerald-500 text-white border-emerald-500 ' +
    'hover:bg-emerald-600 ' +
    'active:bg-emerald-700 ' +
    'focus-visible:ring-emerald-500/40',
  glass:
    'bg-white/10 backdrop-blur-xl text-text-primary border-white/20 ' +
    'hover:bg-white/20 ' +
    'active:bg-white/15 ' +
    'focus-visible:ring-white/30',
};

const sizeStyles: Record<Size, string> = {
  xs:  'h-7  px-2.5 text-xs gap-1.5',
  sm:  'h-9  px-3.5 text-sm gap-2',
  md:  'h-11 px-5 text-base gap-2',
  lg:  'h-13 px-6 text-md gap-2.5',
  xl:  'h-15 px-8 text-lg gap-3',
  icon: 'h-11 w-11 p-0',
};

const radiusStyles = {
  sm: 'rounded-md',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
  full: 'rounded-full',
};

export const BlinkButton = forwardRef<HTMLButtonElement, BlinkButtonProps>(function BlinkButton(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    fullWidth = false,
    rounded = 'md',
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        // Base
        'relative inline-flex items-center justify-center font-bold whitespace-nowrap select-none',
        'border outline-none',
        'transition-all duration-150 ease-silk',
        'focus-visible:ring-4',
        // Tactile press
        'active:scale-[0.98] active:shadow-none',
        // Disabled
        'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
        // Variants + sizes + radius
        variantStyles[variant],
        sizeStyles[size],
        radiusStyles[rounded],
        // Full width
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          <span className="sr-only">Loading</span>
        </>
      ) : icon ? (
        <span className="flex-shrink-0" aria-hidden>{icon}</span>
      ) : null}
      {children && <span className={cn('flex-1 min-w-0 truncate')}>{children}</span>}
      {!loading && iconRight && <span className="flex-shrink-0" aria-hidden>{iconRight}</span>}
    </button>
  );
});
